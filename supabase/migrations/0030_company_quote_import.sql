begin;

-- 0030_company_quote_import.sql
-- Integra Empresas en la confirmacion transaccional de cotizaciones PDF.
-- Opciones soportadas:
--   existing   -> vincula una empresa activa existente
--   new        -> crea una empresa validada y la vincula
--   individual -> confirma como cliente particular, sin empresa en la operacion

create or replace function public.confirm_quote_pdf_import_with_company(
  p_import_id uuid,
  p_company_mode text,
  p_existing_company_id uuid default null,
  p_company_legal_name text default null,
  p_company_trade_name text default null,
  p_company_rut text default null,
  p_company_business_activity text default null,
  p_company_address text default null,
  p_company_commune text default null,
  p_company_city text default null,
  p_company_region text default null,
  p_company_segment text default 'Otro',
  p_company_origin text default 'Cotizacion PDF',
  p_next_action text default null,
  p_next_at timestamptz default null,
  p_priority text default 'alta',
  p_reminder_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_import public.quote_pdf_imports%rowtype;
  v_company public.empresas%rowtype;
  v_base_result jsonb;
  v_quote_id uuid;
  v_contact_id uuid;
  v_project_id uuid;
  v_opportunity_id uuid;
  v_mode text := lower(trim(coalesce(p_company_mode, '')));
  v_legal_name text := nullif(trim(p_company_legal_name), '');
  v_trade_name text := nullif(trim(p_company_trade_name), '');
  v_rut text := nullif(trim(p_company_rut), '');
  v_rut_normalized text;
  v_created_company boolean := false;
  v_parsed_client text;
begin
  if v_user_id is null then
    raise exception 'Debe iniciar sesion para confirmar la importacion.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
    and estado = 'activo'
  for share;

  if not found then
    raise exception 'No existe un perfil activo para el usuario autenticado.';
  end if;

  if v_profile.rol not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No esta autorizado para confirmar cotizaciones.';
  end if;

  if v_mode not in ('existing', 'new', 'individual') then
    raise exception 'Seleccione una opcion valida: empresa existente, empresa nueva o cliente particular.';
  end if;

  select *
  into v_import
  from public.quote_pdf_imports
  where id = p_import_id
    and organization_id = v_profile.organization_id
  for update;

  if not found then
    raise exception 'No se encontro la importacion o no pertenece a su organizacion.';
  end if;

  if v_import.status = 'confirmed' and v_import.imported_quote_id is not null then
    return jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'quote_id', v_import.imported_quote_id,
      'company_id', v_import.matched_company_id,
      'company_mode', v_mode
    );
  end if;

  if v_import.status not in ('ready', 'review') then
    raise exception 'La importacion debe estar lista o revisada antes de confirmarse.';
  end if;

  if coalesce(jsonb_array_length(v_import.validation_errors), 0) > 0 then
    raise exception 'La importacion contiene errores de validacion pendientes.';
  end if;

  -- Resolver empresa antes de confirmar la cotizacion.
  if v_mode = 'existing' then
    if p_existing_company_id is null then
      raise exception 'Debe seleccionar una empresa existente.';
    end if;

    select *
    into v_company
    from public.empresas
    where id = p_existing_company_id
      and organization_id = v_profile.organization_id
      and deleted_at is null
    for share;

    if not found then
      raise exception 'La empresa seleccionada no existe, esta archivada o pertenece a otra organizacion.';
    end if;

  elsif v_mode = 'new' then
    v_parsed_client := nullif(trim(v_import.parsed_data ->> 'cliente'), '');
    v_legal_name := coalesce(v_legal_name, v_parsed_client);
    v_rut := coalesce(v_rut, nullif(trim(v_import.parsed_data ->> 'rut_cliente'), ''));

    if v_legal_name is null then
      raise exception 'La razon social es obligatoria para crear una empresa.';
    end if;

    if v_rut is not null then
      v_rut_normalized := public.normalize_company_rut(v_rut);

      if not public.is_valid_chilean_rut(v_rut) then
        raise exception 'El RUT de la empresa no es valido.';
      end if;

      if exists (
        select 1
        from public.empresas e
        where e.organization_id = v_profile.organization_id
          and e.deleted_at is null
          and e.rut_normalizado = v_rut_normalized
      ) then
        raise exception 'Ya existe una empresa activa con este RUT. Seleccione la empresa existente.';
      end if;
    end if;

    insert into public.empresas (
      organization_id,
      razon_social,
      nombre_fantasia,
      rut,
      giro,
      direccion,
      comuna,
      ciudad,
      region,
      segmento,
      origen,
      ejecutivo_responsable_id,
      estado,
      observaciones
    )
    values (
      v_profile.organization_id,
      v_legal_name,
      v_trade_name,
      v_rut,
      nullif(trim(p_company_business_activity), ''),
      coalesce(nullif(trim(p_company_address), ''), nullif(trim(v_import.parsed_data ->> 'direccion_proyecto'), '')),
      nullif(trim(p_company_commune), ''),
      nullif(trim(p_company_city), ''),
      nullif(trim(p_company_region), ''),
      coalesce(nullif(trim(p_company_segment), ''), 'Otro'),
      coalesce(nullif(trim(p_company_origin), ''), 'Cotizacion PDF'),
      v_profile.id,
      'activo',
      'Empresa creada al confirmar la importacion PDF ' || v_import.file_name
    )
    returning * into v_company;

    v_created_company := true;
  end if;

  -- Guardar la seleccion en staging antes de invocar el flujo existente.
  update public.quote_pdf_imports
  set
    matched_company_id = case when v_mode = 'individual' then null else v_company.id end,
    updated_at = now()
  where id = v_import.id;

  -- Reutilizar el flujo transaccional existente de confirmacion + seguimiento.
  v_base_result := public.confirm_quote_pdf_import_with_followup(
    p_import_id := p_import_id,
    p_next_action := p_next_action,
    p_next_at := p_next_at,
    p_priority := p_priority,
    p_reminder_minutes := p_reminder_minutes
  );

  -- La fuente de verdad del ID creado es el staging confirmado.
  select
    imported_quote_id,
    matched_contact_id,
    matched_project_id,
    matched_opportunity_id
  into
    v_quote_id,
    v_contact_id,
    v_project_id,
    v_opportunity_id
  from public.quote_pdf_imports
  where id = p_import_id
    and organization_id = v_profile.organization_id;

  if v_quote_id is null then
    -- Compatibilidad con posibles claves del JSON de funciones anteriores.
    v_quote_id := coalesce(
      nullif(v_base_result ->> 'quote_id', '')::uuid,
      nullif(v_base_result ->> 'cotizacion_id', '')::uuid,
      nullif(v_base_result ->> 'id', '')::uuid
    );
  end if;

  if v_quote_id is null then
    raise exception 'La confirmacion no devolvio una cotizacion valida.';
  end if;

  -- Aplicar la empresa de forma consistente a todas las entidades creadas.
  if v_mode in ('existing', 'new') then
    if v_contact_id is not null then
      update public.contactos
      set
        empresa_id = v_company.id,
        tipo_contacto = 'Contacto de empresa',
        updated_at = now()
      where id = v_contact_id
        and organization_id = v_profile.organization_id;
    end if;

    update public.proyectos
    set
      empresa_id = v_company.id,
      updated_at = now()
    where id = v_project_id
      and organization_id = v_profile.organization_id;

    update public.oportunidades
    set
      empresa_id = v_company.id,
      updated_at = now()
    where id = v_opportunity_id
      and organization_id = v_profile.organization_id;

    update public.cotizaciones
    set
      empresa_id = v_company.id,
      updated_at = now()
    where id = v_quote_id
      and organization_id = v_profile.organization_id;

    update public.quote_pdf_imports
    set
      matched_company_id = v_company.id,
      updated_at = now()
    where id = p_import_id;
  else
    -- Cliente particular: la operacion comercial queda sin empresa.
    update public.proyectos
    set empresa_id = null, updated_at = now()
    where id = v_project_id
      and organization_id = v_profile.organization_id;

    update public.oportunidades
    set empresa_id = null, updated_at = now()
    where id = v_opportunity_id
      and organization_id = v_profile.organization_id;

    update public.cotizaciones
    set empresa_id = null, updated_at = now()
    where id = v_quote_id
      and organization_id = v_profile.organization_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'quote_id', v_quote_id,
    'contact_id', v_contact_id,
    'project_id', v_project_id,
    'opportunity_id', v_opportunity_id,
    'company_id', case when v_mode = 'individual' then null else v_company.id end,
    'company_mode', v_mode,
    'company_created', v_created_company,
    'base_result', v_base_result
  );
end;
$$;

revoke all on function public.confirm_quote_pdf_import_with_company(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text,
  text, timestamptz, text, integer
) from public;

grant execute on function public.confirm_quote_pdf_import_with_company(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text,
  text, timestamptz, text, integer
) to authenticated;

comment on function public.confirm_quote_pdf_import_with_company(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text,
  text, timestamptz, text, integer
) is
'Confirma una importacion PDF con seguimiento inicial y resuelve la empresa como existente, nueva o cliente particular.';

commit;
