begin;

-- =========================================================
-- 0025 - ACTUALIZACION CONTROLADA DE CONTACTOS
-- Permite completar y corregir datos comerciales del contacto.
-- No modifica datos oficiales de cotizaciones externas.
-- =========================================================

create or replace function public.update_contact(
  p_contact_id uuid,
  p_nombre text,
  p_apellido text default null,
  p_cargo text default null,
  p_telefono text default null,
  p_whatsapp text default null,
  p_correo text default null,
  p_direccion text default null,
  p_comuna text default null,
  p_ciudad text default null,
  p_region text default null,
  p_tipo_contacto text default null,
  p_preferencia_contacto text default null,
  p_origen text default null,
  p_estado text default 'activo',
  p_empresa_id uuid default null,
  p_consentimiento_comunicaciones boolean default false,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_contact public.contactos%rowtype;
  v_profile public.profiles%rowtype;
  v_company_exists boolean := false;
  v_phone_matches jsonb := '[]'::jsonb;
  v_name_matches jsonb := '[]'::jsonb;
  v_updated public.contactos%rowtype;
begin
  -- Usuario autenticado y perfil activo de la organizacion actual.
  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org()
    and estado = 'activo';

  if v_profile.id is null then
    raise exception 'Usuario no autorizado o sin perfil activo';
  end if;

  if v_profile.rol not in (
    'admin',
    'jefatura_comercial',
    'ejecutivo_comercial'
  ) then
    raise exception 'No está autorizado para editar contactos';
  end if;

  -- Bloquea el contacto durante la actualizacion.
  select * into v_contact
  from public.contactos
  where id = p_contact_id
    and organization_id = public.current_org()
  for update;

  if v_contact.id is null then
    raise exception 'Contacto no encontrado o no autorizado';
  end if;

  if v_contact.deleted_at is not null then
    raise exception 'No se puede editar un contacto archivado';
  end if;

  -- Un ejecutivo solo puede editar contactos propios o sin responsable.
  if v_profile.rol = 'ejecutivo_comercial'
     and v_contact.ejecutivo_responsable_id is not null
     and v_contact.ejecutivo_responsable_id <> v_profile.id then
    raise exception 'No está autorizado para editar un contacto asignado a otro ejecutivo';
  end if;

  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El nombre del contacto es obligatorio';
  end if;

  if public.normalize_contact_email(p_correo) is null
     and public.normalize_contact_phone(p_telefono) is null
     and public.normalize_contact_phone(p_whatsapp) is null then
    raise exception 'Debe registrar al menos un correo, teléfono o WhatsApp';
  end if;

  if p_estado not in ('activo', 'inactivo', 'no_contactar') then
    raise exception 'Estado de contacto no válido';
  end if;

  if p_tipo_contacto is not null
     and p_tipo_contacto not in (
       'Cliente particular',
       'Contacto de empresa',
       'Profesional independiente',
       'Otro'
     ) then
    raise exception 'Tipo de contacto no válido';
  end if;

  if p_preferencia_contacto is not null
     and p_preferencia_contacto not in (
       'WhatsApp',
       'Correo',
       'Telefono',
       'Sin preferencia'
     ) then
    raise exception 'Preferencia de contacto no válida';
  end if;

  if p_origen is not null
     and p_origen not in (
       'Cotizacion PDF',
       'Carga manual',
       'Referido',
       'Cliente existente',
       'Otro'
     ) then
    raise exception 'Origen de contacto no válido';
  end if;

  if p_tipo_contacto = 'Contacto de empresa' and p_empresa_id is null then
    raise exception 'Debe seleccionar una empresa para un contacto de empresa';
  end if;

  if p_empresa_id is not null then
    select exists (
      select 1
      from public.empresas e
      where e.id = p_empresa_id
        and e.organization_id = v_contact.organization_id
    ) into v_company_exists;

    if not v_company_exists then
      raise exception 'Empresa no encontrada o no autorizada';
    end if;
  end if;

  -- El trigger de 0021 bloquea correos duplicados activos.
  -- Estas coincidencias son solo advertencias y no bloquean el guardado.
  select coalesce(jsonb_agg(jsonb_build_object(
    'contact_id', m.contact_id,
    'nombre_completo', m.nombre_completo,
    'telefono', m.telefono,
    'nivel', m.nivel_coincidencia
  )), '[]'::jsonb)
  into v_phone_matches
  from public.find_contact_matches(
    p_email := null,
    p_phone := p_telefono,
    p_nombre := null,
    p_apellido := null,
    p_empresa_id := p_empresa_id,
    p_exclude_contact_id := p_contact_id
  ) m
  where m.coincidencia_telefono;

  select coalesce(jsonb_agg(jsonb_build_object(
    'contact_id', m.contact_id,
    'nombre_completo', m.nombre_completo,
    'correo', m.correo,
    'nivel', m.nivel_coincidencia
  )), '[]'::jsonb)
  into v_name_matches
  from public.find_contact_matches(
    p_email := null,
    p_phone := null,
    p_nombre := p_nombre,
    p_apellido := p_apellido,
    p_empresa_id := p_empresa_id,
    p_exclude_contact_id := p_contact_id
  ) m
  where m.coincidencia_nombre;

  update public.contactos
  set nombre = p_nombre,
      apellido = p_apellido,
      cargo = p_cargo,
      telefono = p_telefono,
      whatsapp = p_whatsapp,
      correo = p_correo,
      direccion = p_direccion,
      comuna = p_comuna,
      ciudad = p_ciudad,
      region = p_region,
      tipo_contacto = p_tipo_contacto,
      preferencia_contacto = p_preferencia_contacto,
      origen = p_origen,
      estado = p_estado,
      empresa_id = p_empresa_id,
      consentimiento_comunicaciones = p_consentimiento_comunicaciones,
      observaciones = p_observaciones,
      ejecutivo_responsable_id = coalesce(
        v_contact.ejecutivo_responsable_id,
        v_profile.id
      ),
      updated_at = now()
  where id = v_contact.id
  returning * into v_updated;

  return jsonb_build_object(
    'success', true,
    'contact', jsonb_build_object(
      'id', v_updated.id,
      'nombre', v_updated.nombre,
      'apellido', v_updated.apellido,
      'correo', v_updated.correo,
      'correo_normalizado', v_updated.correo_normalizado,
      'telefono', v_updated.telefono,
      'telefono_normalizado', v_updated.telefono_normalizado,
      'whatsapp', v_updated.whatsapp,
      'tipo_contacto', v_updated.tipo_contacto,
      'preferencia_contacto', v_updated.preferencia_contacto,
      'origen', v_updated.origen,
      'estado', v_updated.estado,
      'empresa_id', v_updated.empresa_id,
      'updated_at', v_updated.updated_at
    ),
    'warnings', jsonb_build_object(
      'phone_matches', v_phone_matches,
      'name_matches', v_name_matches
    )
  );
end;
$function$;

revoke all on function public.update_contact(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  text
) from public;

grant execute on function public.update_contact(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  text
) to authenticated;

comment on function public.update_contact(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  text
) is
  'Actualiza de forma controlada los datos comerciales de un contacto y devuelve advertencias de coincidencias.';

commit;
