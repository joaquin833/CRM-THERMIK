begin;

-- =========================================================
-- 0029 - ACTUALIZACION CONTROLADA DE EMPRESAS
-- =========================================================

create or replace function public.update_company(
  p_company_id uuid,
  p_razon_social text,
  p_nombre_fantasia text default null,
  p_rut text default null,
  p_giro text default null,
  p_pagina_web text default null,
  p_direccion text default null,
  p_comuna text default null,
  p_ciudad text default null,
  p_region text default null,
  p_segmento text default null,
  p_origen text default null,
  p_estado text default 'activo',
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company public.empresas%rowtype;
  v_profile public.profiles%rowtype;
  v_updated public.empresas%rowtype;
  v_matches jsonb := '[]'::jsonb;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org()
    and estado = 'activo';

  if v_profile.id is null then
    raise exception 'Usuario no autorizado o sin perfil activo';
  end if;

  if v_profile.rol not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No está autorizado para editar empresas';
  end if;

  select * into v_company
  from public.empresas
  where id = p_company_id
    and organization_id = public.current_org()
  for update;

  if v_company.id is null then
    raise exception 'Empresa no encontrada o no autorizada';
  end if;

  if v_company.deleted_at is not null then
    raise exception 'No se puede editar una empresa archivada';
  end if;

  if v_profile.rol = 'ejecutivo_comercial'
     and v_company.ejecutivo_responsable_id is not null
     and v_company.ejecutivo_responsable_id <> v_profile.id then
    raise exception 'No está autorizado para editar una empresa asignada a otro ejecutivo';
  end if;

  if nullif(btrim(coalesce(p_razon_social, '')), '') is null then
    raise exception 'La razón social es obligatoria';
  end if;

  if p_rut is not null and not public.is_valid_chilean_rut(p_rut) then
    raise exception 'El RUT ingresado no es válido';
  end if;

  if p_estado not in ('activo', 'inactivo') then
    raise exception 'Estado de empresa no válido';
  end if;

  if p_segmento is not null and p_segmento not in (
    'Residencial', 'Comercial', 'Industrial',
    'Construccion', 'Institucional', 'Otro'
  ) then
    raise exception 'Segmento de empresa no válido';
  end if;

  if p_origen is not null and p_origen not in (
    'Cotizacion PDF', 'Carga manual', 'Referido',
    'Cliente existente', 'Importacion historica', 'Otro'
  ) then
    raise exception 'Origen de empresa no válido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'company_id', m.company_id,
    'razon_social', m.razon_social,
    'nombre_fantasia', m.nombre_fantasia,
    'rut', m.rut,
    'nivel', m.nivel_coincidencia
  )), '[]'::jsonb)
  into v_matches
  from public.find_company_matches(
    p_rut := null,
    p_razon_social := p_razon_social,
    p_nombre_fantasia := p_nombre_fantasia,
    p_exclude_company_id := p_company_id
  ) m;

  update public.empresas
  set razon_social = p_razon_social,
      nombre_fantasia = p_nombre_fantasia,
      rut = p_rut,
      giro = p_giro,
      pagina_web = p_pagina_web,
      direccion = p_direccion,
      comuna = p_comuna,
      ciudad = p_ciudad,
      region = p_region,
      segmento = p_segmento,
      origen = p_origen,
      estado = p_estado,
      observaciones = p_observaciones,
      ejecutivo_responsable_id = coalesce(
        v_company.ejecutivo_responsable_id,
        v_profile.id
      ),
      updated_at = now()
  where id = v_company.id
  returning * into v_updated;

  return jsonb_build_object(
    'success', true,
    'company', jsonb_build_object(
      'id', v_updated.id,
      'razon_social', v_updated.razon_social,
      'nombre_fantasia', v_updated.nombre_fantasia,
      'rut', v_updated.rut,
      'rut_normalizado', v_updated.rut_normalizado,
      'giro', v_updated.giro,
      'segmento', v_updated.segmento,
      'origen', v_updated.origen,
      'estado', v_updated.estado,
      'updated_at', v_updated.updated_at
    ),
    'warnings', jsonb_build_object('matches', v_matches)
  );
exception
  when unique_violation then
    raise exception 'Ya existe otra empresa activa con el mismo RUT';
end;
$function$;

revoke all on function public.update_company(
  uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public;

grant execute on function public.update_company(
  uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to authenticated;

comment on function public.update_company(
  uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) is 'Actualiza de forma controlada los datos comerciales de una empresa.';

commit;
