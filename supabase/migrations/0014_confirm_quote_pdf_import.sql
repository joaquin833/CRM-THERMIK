begin;

-- =========================================================
-- 0014 - CONFIRMACION TRANSACCIONAL DE COTIZACIONES PDF
-- Busca o crea contacto, proyecto, oportunidad, cotizacion e items.
-- =========================================================

create or replace function public.confirm_quote_pdf_import(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org uuid;
  v_user uuid;
  v_role text;
  v_import public.quote_pdf_imports%rowtype;
  v_data jsonb;

  v_quote_number text;
  v_quote_number_normalized text;
  v_contact_name text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_email_normalized text;
  v_phone text;
  v_phone_normalized text;
  v_project_name text;

  v_contact_id uuid;
  v_company_id uuid;
  v_project_id uuid;
  v_opportunity_id uuid;
  v_quote_id uuid;
  v_external_source_id uuid;

  v_fecha_emision date;
  v_fecha_validez date;
  v_neto_afecto bigint;
  v_neto_exento bigint;
  v_iva bigint;
  v_total bigint;
  v_items_total bigint;
  v_item jsonb;
  v_position integer := 0;
  v_quantity numeric;
  v_unit_value bigint;
  v_subtotal bigint;
  v_description text;
begin
  v_org := public.current_org();
  v_user := auth.uid();
  v_role := public.app_current_role();

  if v_org is null or v_user is null then
    raise exception 'Sesion no valida';
  end if;

  if v_role not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No esta autorizado para confirmar importaciones';
  end if;

  select *
  into v_import
  from public.quote_pdf_imports
  where id = p_import_id
    and organization_id = v_org
  for update;

  if v_import.id is null then
    raise exception 'Importacion no encontrada';
  end if;

  if v_import.status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'quote_id', v_import.imported_quote_id
    );
  end if;

  if v_import.status <> 'ready' then
    raise exception 'La importacion debe estar lista para vincular antes de confirmarse';
  end if;

  if jsonb_array_length(v_import.validation_errors) > 0 then
    raise exception 'La importacion contiene errores de validacion pendientes';
  end if;

  v_data := v_import.parsed_data;
  v_quote_number := nullif(trim(v_data ->> 'numero_cotizacion'), '');
  v_quote_number_normalized := upper(
    regexp_replace(
      translate(coalesce(v_quote_number, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'),
      '[^A-Za-z0-9]',
      '',
      'g'
    )
  );

  if v_quote_number is null or v_quote_number_normalized = '' then
    raise exception 'Falta el numero de cotizacion';
  end if;

  if exists (
    select 1
    from public.cotizaciones
    where organization_id = v_org
      and numero_cotizacion_normalizado = v_quote_number_normalized
      and deleted_at is null
  ) then
    raise exception 'La cotizacion N.º % ya existe en el CRM', v_quote_number;
  end if;

  v_contact_name := coalesce(
    nullif(trim(v_data ->> 'nombre_contacto'), ''),
    nullif(trim(v_data ->> 'cliente'), ''),
    'Contacto sin nombre'
  );
  v_first_name := split_part(v_contact_name, ' ', 1);
  v_last_name := nullif(trim(substr(v_contact_name, length(v_first_name) + 1)), '');

  v_email := nullif(lower(trim(v_data ->> 'correo_contacto')), '');
  v_email_normalized := v_email;
  v_phone := nullif(trim(v_data ->> 'telefono_contacto'), '');
  v_phone_normalized := nullif(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g'), '');
  v_project_name := coalesce(
    nullif(trim(v_data ->> 'proyecto'), ''),
    'Proyecto Cotizacion ' || v_quote_number
  );

  -- Busca primero por correo, luego por telefono normalizado.
  if v_email_normalized is not null then
    select id, empresa_id
    into v_contact_id, v_company_id
    from public.contactos
    where organization_id = v_org
      and deleted_at is null
      and correo_normalizado = v_email_normalized
    order by created_at
    limit 1;
  end if;

  if v_contact_id is null and v_phone_normalized is not null then
    select id, empresa_id
    into v_contact_id, v_company_id
    from public.contactos
    where organization_id = v_org
      and deleted_at is null
      and telefono_normalizado = v_phone_normalized
    order by created_at
    limit 1;
  end if;

  if v_contact_id is null then
    insert into public.contactos (
      organization_id,
      nombre,
      apellido,
      telefono,
      telefono_normalizado,
      whatsapp,
      correo,
      correo_normalizado,
      tipo_contacto,
      preferencia_contacto,
      origen,
      estado,
      ejecutivo_responsable_id,
      consentimiento_comunicaciones,
      observaciones
    ) values (
      v_org,
      v_first_name,
      v_last_name,
      v_phone,
      v_phone_normalized,
      v_phone,
      v_email,
      v_email_normalized,
      'Cliente particular',
      case
        when v_phone is not null then 'WhatsApp'
        when v_email is not null then 'Correo'
        else null
      end,
      'Cotizacion PDF',
      'activo',
      v_user,
      false,
      case
        when nullif(trim(v_data ->> 'rut_cliente'), '') is not null
          then 'RUT informado en cotizacion: ' || trim(v_data ->> 'rut_cliente')
        else null
      end
    )
    returning id into v_contact_id;
  end if;

  -- Reutiliza un proyecto con el mismo nombre para el mismo contacto.
  select id
  into v_project_id
  from public.proyectos
  where organization_id = v_org
    and contacto_principal_id = v_contact_id
    and lower(trim(nombre)) = lower(trim(v_project_name))
  order by created_at
  limit 1;

  if v_project_id is null then
    insert into public.proyectos (
      organization_id,
      nombre,
      empresa_id,
      contacto_principal_id,
      direccion,
      metros_cuadrados_estimados,
      descripcion,
      estado,
      ejecutivo_responsable_id
    ) values (
      v_org,
      v_project_name,
      v_company_id,
      v_contact_id,
      nullif(trim(v_data ->> 'direccion_proyecto'), ''),
      case
        when coalesce(v_data ->> 'metros_cuadrados', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (v_data ->> 'metros_cuadrados')::numeric
        else null
      end,
      'Proyecto creado desde importacion PDF de la Cotizacion N.º ' || v_quote_number,
      'activo',
      v_user
    )
    returning id into v_project_id;
  end if;

  v_total := coalesce(nullif(v_data ->> 'total', '')::numeric, 0)::bigint;

  insert into public.oportunidades (
    organization_id,
    contacto_id,
    empresa_id,
    proyecto_id,
    nombre,
    ubicacion_proyecto,
    metros_cuadrados,
    monto_estimado,
    probabilidad_cierre,
    etapa_comercial,
    temperatura,
    prioridad,
    ejecutivo_responsable_id,
    proxima_accion,
    estado
  ) values (
    v_org,
    v_contact_id,
    v_company_id,
    v_project_id,
    'Seguimiento Cotizacion N.º ' || v_quote_number || ' - ' || v_project_name,
    nullif(trim(v_data ->> 'direccion_proyecto'), ''),
    case
      when coalesce(v_data ->> 'metros_cuadrados', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (v_data ->> 'metros_cuadrados')::numeric
      else null
    end,
    v_total,
    40,
    'Cotizacion emitida',
    'Tibia',
    'Media',
    v_user,
    'Realizar primer seguimiento de la cotizacion',
    'abierta'
  )
  returning id into v_opportunity_id;

  select id
  into v_external_source_id
  from public.external_sources
  where organization_id = v_org
    and codigo = 'SISTEMA_COTIZACIONES'
  limit 1;

  v_fecha_emision := coalesce(nullif(v_data ->> 'fecha_emision', '')::date, current_date);
  v_fecha_validez := nullif(v_data ->> 'fecha_validez', '')::date;
  v_neto_afecto := coalesce(nullif(v_data ->> 'neto_afecto', '')::numeric, 0)::bigint;
  v_neto_exento := coalesce(nullif(v_data ->> 'neto_exento', '')::numeric, 0)::bigint;
  v_iva := coalesce(nullif(v_data ->> 'iva', '')::numeric, 0)::bigint;

  select coalesce(sum(coalesce(nullif(item ->> 'subtotal', '')::numeric, 0)), 0)::bigint
  into v_items_total
  from jsonb_array_elements(coalesce(v_data -> 'items', '[]'::jsonb)) as item;

  insert into public.cotizaciones (
    organization_id,
    numero_cotizacion,
    numero_cotizacion_normalizado,
    oportunidad_id,
    proyecto_id,
    contacto_id,
    empresa_id,
    fecha_emision,
    fecha_validez,
    estado,
    subtotal_neto,
    descuento_total,
    neto_afecto,
    neto_exento,
    iva,
    total,
    moneda,
    archivo_pdf_url,
    ejecutivo_responsable_id,
    proxima_accion,
    nota_comercial,
    origen_registro,
    created_by,
    external_source_id,
    external_id,
    sistema_origen,
    estado_documental_externo,
    hash_documento,
    fecha_ultima_sincronizacion,
    estado_comercial,
    probabilidad_cierre
  ) values (
    v_org,
    v_quote_number,
    v_quote_number_normalized,
    v_opportunity_id,
    v_project_id,
    v_contact_id,
    v_company_id,
    v_fecha_emision,
    v_fecha_validez,
    'Importada',
    case when v_items_total > 0 then v_items_total else v_neto_afecto + v_neto_exento end,
    0,
    v_neto_afecto,
    v_neto_exento,
    v_iva,
    v_total,
    coalesce(nullif(trim(v_data ->> 'moneda'), ''), 'CLP'),
    v_import.storage_path,
    v_user,
    'Realizar primer seguimiento de la cotizacion',
    'Importada desde PDF oficial: ' || v_import.file_name,
    'pdf_import',
    v_user,
    coalesce(v_import.external_source_id, v_external_source_id),
    v_import.id::text,
    'SISTEMA_COTIZACIONES',
    'Importada desde PDF',
    v_import.file_hash,
    now(),
    'Importada',
    40
  )
  returning id into v_quote_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_data -> 'items', '[]'::jsonb))
  loop
    v_position := v_position + 1;
    v_description := coalesce(nullif(trim(v_item ->> 'descripcion'), ''), 'Item sin descripcion');
    v_quantity := case
      when coalesce(v_item ->> 'cantidad', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (v_item ->> 'cantidad')::numeric
      else 1
    end;
    v_unit_value := coalesce(nullif(v_item ->> 'valor_unitario', '')::numeric, 0)::bigint;
    v_subtotal := coalesce(nullif(v_item ->> 'subtotal', '')::numeric, 0)::bigint;

    if v_subtotal = 0 and v_quantity > 0 and v_unit_value > 0 then
      v_subtotal := round(v_quantity * v_unit_value)::bigint;
    end if;

    if v_unit_value = 0 and v_quantity > 0 and v_subtotal > 0 then
      v_unit_value := round(v_subtotal / v_quantity)::bigint;
    end if;

    insert into public.quote_items (
      organization_id,
      cotizacion_id,
      posicion,
      descripcion,
      cantidad,
      unidad,
      valor_unitario_original,
      porcentaje_descuento,
      valor_descuento,
      valor_unitario_final,
      subtotal_neto,
      afecto_iva
    ) values (
      v_org,
      v_quote_id,
      v_position,
      v_description,
      v_quantity,
      coalesce(nullif(trim(v_item ->> 'unidad'), ''), 'unidad'),
      v_unit_value,
      0,
      0,
      v_unit_value,
      v_subtotal,
      true
    );
  end loop;

  update public.quote_pdf_imports
  set status = 'confirmed',
      matched_contact_id = v_contact_id,
      matched_company_id = v_company_id,
      matched_project_id = v_project_id,
      matched_opportunity_id = v_opportunity_id,
      imported_quote_id = v_quote_id,
      confirmed_at = now(),
      confirmed_by = v_user,
      error_message = null,
      updated_at = now()
  where id = v_import.id;

  return jsonb_build_object(
    'success', true,
    'already_confirmed', false,
    'contact_id', v_contact_id,
    'company_id', v_company_id,
    'project_id', v_project_id,
    'opportunity_id', v_opportunity_id,
    'quote_id', v_quote_id,
    'quote_number', v_quote_number
  );
end;
$function$;

revoke all on function public.confirm_quote_pdf_import(uuid) from public;
grant execute on function public.confirm_quote_pdf_import(uuid) to authenticated;

commit;
