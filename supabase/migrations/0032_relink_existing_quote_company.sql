begin;

-- 0032_relink_existing_quote_company.sql
-- Permite regularizar cotizaciones ya importadas:
--   existing   -> vincular una empresa existente
--   new        -> crear y vincular una empresa nueva
--   individual -> dejar la operacion como cliente particular, sin empresa
--
-- Sincroniza empresa_id en cotizacion, proyecto, oportunidad y staging.
-- El contacto se actualiza solo cuando p_link_contact = true.

create or replace function public.relink_existing_quote_company(
  p_quote_id uuid,
  p_company_mode text,
  p_existing_company_id uuid default null,
  p_company_legal_name text default null,
  p_company_trade_name text default null,
  p_company_rut text default null,
  p_company_business_activity text default null,
  p_company_website text default null,
  p_company_address text default null,
  p_company_commune text default null,
  p_company_city text default null,
  p_company_region text default null,
  p_company_segment text default 'Otro',
  p_company_origin text default 'Cotizacion PDF',
  p_company_notes text default null,
  p_link_contact boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_quote public.cotizaciones%rowtype;
  v_contact public.contactos%rowtype;
  v_company public.empresas%rowtype;
  v_previous_company_id uuid;
  v_mode text := lower(trim(coalesce(p_company_mode, '')));
  v_legal_name text := nullif(trim(p_company_legal_name), '');
  v_trade_name text := nullif(trim(p_company_trade_name), '');
  v_rut text := nullif(trim(p_company_rut), '');
  v_rut_normalized text;
  v_company_created boolean := false;
  v_contact_linked boolean := false;
  v_import_id uuid;
  v_import_updated boolean := false;
begin
  if v_user_id is null then
    raise exception 'Debe iniciar sesion para modificar la empresa de una cotizacion.';
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
    raise exception 'No esta autorizado para modificar la empresa de una cotizacion.';
  end if;

  if v_mode not in ('existing', 'new', 'individual') then
    raise exception 'Seleccione empresa existente, empresa nueva o cliente particular.';
  end if;

  select *
  into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = v_profile.organization_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'No se encontro la cotizacion o no pertenece a su organizacion.';
  end if;

  if v_profile.rol = 'ejecutivo_comercial'
     and v_quote.ejecutivo_responsable_id is not null
     and v_quote.ejecutivo_responsable_id <> v_user_id then
    raise exception 'Solo puede modificar cotizaciones asignadas a su usuario.';
  end if;

  v_previous_company_id := v_quote.empresa_id;

  if v_quote.contacto_id is not null then
    select *
    into v_contact
    from public.contactos
    where id = v_quote.contacto_id
      and organization_id = v_profile.organization_id
    for update;
  end if;

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
    if v_legal_name is null then
      raise exception 'La razon social es obligatoria para crear una empresa.';
    end if;

    if v_rut is not null then
      v_rut_normalized := public.normalize_company_rut(v_rut);

      if not public.is_valid_chilean_rut(v_rut) then
        raise exception 'El RUT de la empresa no es valido.';
      end if;

      select *
      into v_company
      from public.empresas
      where organization_id = v_profile.organization_id
        and deleted_at is null
        and rut_normalizado = v_rut_normalized
      limit 1
      for share;

      if found then
        raise exception 'Ya existe una empresa activa con este RUT. Seleccione la empresa existente.';
      end if;
    end if;

    insert into public.empresas (
      organization_id,
      razon_social,
      nombre_fantasia,
      rut,
      giro,
      pagina_web,
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
      nullif(trim(p_company_website), ''),
      nullif(trim(p_company_address), ''),
      nullif(trim(p_company_commune), ''),
      nullif(trim(p_company_city), ''),
      nullif(trim(p_company_region), ''),
      coalesce(nullif(trim(p_company_segment), ''), 'Otro'),
      coalesce(nullif(trim(p_company_origin), ''), 'Cotizacion PDF'),
      coalesce(v_quote.ejecutivo_responsable_id, v_profile.id),
      'activo',
      coalesce(
        nullif(trim(p_company_notes), ''),
        'Empresa creada al regularizar la cotizacion ' || v_quote.numero_cotizacion
      )
    )
    returning * into v_company;

    v_company_created := true;
  end if;

  if v_mode in ('existing', 'new') then
    update public.cotizaciones
    set
      empresa_id = v_company.id,
      updated_at = now()
    where id = v_quote.id;

    if v_quote.proyecto_id is not null then
      update public.proyectos
      set
        empresa_id = v_company.id,
        updated_at = now()
      where id = v_quote.proyecto_id
        and organization_id = v_profile.organization_id;
    end if;

    if v_quote.oportunidad_id is not null then
      update public.oportunidades
      set
        empresa_id = v_company.id,
        updated_at = now()
      where id = v_quote.oportunidad_id
        and organization_id = v_profile.organization_id;
    end if;

    if p_link_contact and v_quote.contacto_id is not null then
      update public.contactos
      set
        empresa_id = v_company.id,
        tipo_contacto = 'Contacto de empresa',
        updated_at = now()
      where id = v_quote.contacto_id
        and organization_id = v_profile.organization_id
        and deleted_at is null;

      v_contact_linked := found;
    end if;

    update public.quote_pdf_imports
    set
      matched_company_id = v_company.id,
      updated_at = now()
    where organization_id = v_profile.organization_id
      and imported_quote_id = v_quote.id
    returning id into v_import_id;

    v_import_updated := found;

  else
    update public.cotizaciones
    set
      empresa_id = null,
      updated_at = now()
    where id = v_quote.id;

    if v_quote.proyecto_id is not null then
      update public.proyectos
      set
        empresa_id = null,
        updated_at = now()
      where id = v_quote.proyecto_id
        and organization_id = v_profile.organization_id;
    end if;

    if v_quote.oportunidad_id is not null then
      update public.oportunidades
      set
        empresa_id = null,
        updated_at = now()
      where id = v_quote.oportunidad_id
        and organization_id = v_profile.organization_id;
    end if;

    if p_link_contact and v_quote.contacto_id is not null then
      update public.contactos
      set
        empresa_id = null,
        tipo_contacto = case
          when tipo_contacto = 'Contacto de empresa' then 'Cliente particular'
          else tipo_contacto
        end,
        updated_at = now()
      where id = v_quote.contacto_id
        and organization_id = v_profile.organization_id
        and deleted_at is null;

      v_contact_linked := found;
    end if;

    update public.quote_pdf_imports
    set
      matched_company_id = null,
      updated_at = now()
    where organization_id = v_profile.organization_id
      and imported_quote_id = v_quote.id
    returning id into v_import_id;

    v_import_updated := found;
  end if;

  return jsonb_build_object(
    'success', true,
    'quote_id', v_quote.id,
    'quote_number', v_quote.numero_cotizacion,
    'company_mode', v_mode,
    'previous_company_id', v_previous_company_id,
    'company_id', case when v_mode = 'individual' then null else v_company.id end,
    'company_created', v_company_created,
    'contact_id', v_quote.contacto_id,
    'contact_linked', v_contact_linked,
    'project_id', v_quote.proyecto_id,
    'opportunity_id', v_quote.oportunidad_id,
    'import_id', v_import_id,
    'import_updated', v_import_updated
  );
end;
$$;

revoke all on function public.relink_existing_quote_company(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean
) from public;

grant execute on function public.relink_existing_quote_company(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean
) to authenticated;

comment on function public.relink_existing_quote_company(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean
) is
'Regulariza la empresa de una cotizacion existente y sincroniza proyecto, oportunidad, staging y opcionalmente contacto.';

commit;
