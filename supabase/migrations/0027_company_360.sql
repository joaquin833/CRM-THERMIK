begin;

-- =========================================================
-- 0027 - FICHA 360 DE EMPRESAS
-- Consolida empresa, responsable, contactos, proyectos,
-- oportunidades y cotizaciones en una respuesta JSONB.
-- =========================================================

create or replace function public.get_company_360(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_company public.empresas%rowtype;
  v_result jsonb;
begin
  select e.*
  into v_company
  from public.empresas e
  where e.id = p_company_id
    and e.organization_id = public.current_org();

  if v_company.id is null then
    raise exception 'Empresa no encontrada o no autorizada';
  end if;

  select jsonb_build_object(
    'company', jsonb_build_object(
      'id', e.id,
      'organization_id', e.organization_id,
      'razon_social', e.razon_social,
      'nombre_fantasia', e.nombre_fantasia,
      'rut', e.rut,
      'rut_normalizado', e.rut_normalizado,
      'giro', e.giro,
      'pagina_web', e.pagina_web,
      'direccion', e.direccion,
      'comuna', e.comuna,
      'ciudad', e.ciudad,
      'region', e.region,
      'segmento', e.segmento,
      'origen', e.origen,
      'observaciones', e.observaciones,
      'estado', e.estado,
      'ejecutivo_responsable_id', e.ejecutivo_responsable_id,
      'created_at', e.created_at,
      'updated_at', e.updated_at,
      'deleted_at', e.deleted_at
    ),
    'responsible', case
      when pr.id is null then null
      else jsonb_build_object(
        'id', pr.id,
        'nombre', pr.nombre,
        'apellido', pr.apellido,
        'nombre_completo', nullif(btrim(concat_ws(' ', pr.nombre, pr.apellido)), ''),
        'correo', pr.correo,
        'cargo', pr.cargo,
        'estado', pr.estado
      )
    end,
    'summary', jsonb_build_object(
      'active_contacts', (
        select count(*)
        from public.contactos c
        where c.organization_id = e.organization_id
          and c.empresa_id = e.id
          and c.deleted_at is null
      ),
      'archived_contacts', (
        select count(*)
        from public.contactos c
        where c.organization_id = e.organization_id
          and c.empresa_id = e.id
          and c.deleted_at is not null
      ),
      'projects', (
        select count(*)
        from public.proyectos p
        where p.organization_id = e.organization_id
          and p.empresa_id = e.id
      ),
      'opportunities', (
        select count(*)
        from public.oportunidades o
        where o.organization_id = e.organization_id
          and o.empresa_id = e.id
      ),
      'active_quotes', (
        select count(*)
        from public.cotizaciones q
        where q.organization_id = e.organization_id
          and q.empresa_id = e.id
          and q.deleted_at is null
      ),
      'quoted_amount', coalesce((
        select sum(q.total)
        from public.cotizaciones q
        where q.organization_id = e.organization_id
          and q.empresa_id = e.id
          and q.deleted_at is null
      ), 0),
      'last_quote_at', (
        select max(coalesce(q.fecha_emision::timestamptz, q.created_at))
        from public.cotizaciones q
        where q.organization_id = e.organization_id
          and q.empresa_id = e.id
          and q.deleted_at is null
      )
    ),
    'contacts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'nombre', c.nombre,
          'apellido', c.apellido,
          'nombre_completo', nullif(btrim(concat_ws(' ', c.nombre, c.apellido)), ''),
          'cargo', c.cargo,
          'telefono', c.telefono,
          'whatsapp', c.whatsapp,
          'correo', c.correo,
          'tipo_contacto', c.tipo_contacto,
          'preferencia_contacto', c.preferencia_contacto,
          'origen', c.origen,
          'estado', c.estado,
          'ejecutivo_responsable_id', c.ejecutivo_responsable_id,
          'created_at', c.created_at,
          'updated_at', c.updated_at
        )
        order by c.updated_at desc nulls last, c.created_at desc
      )
      from public.contactos c
      where c.organization_id = e.organization_id
        and c.empresa_id = e.id
        and c.deleted_at is null
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nombre', p.nombre,
          'direccion', p.direccion,
          'comuna', p.comuna,
          'ciudad', p.ciudad,
          'region', p.region,
          'tipo_proyecto', p.tipo_proyecto,
          'tipo_obra', p.tipo_obra,
          'metros_cuadrados_estimados', p.metros_cuadrados_estimados,
          'contacto_principal_id', p.contacto_principal_id,
          'estado', p.estado,
          'created_at', p.created_at,
          'updated_at', p.updated_at
        )
        order by p.updated_at desc nulls last, p.created_at desc
      )
      from public.proyectos p
      where p.organization_id = e.organization_id
        and p.empresa_id = e.id
    ), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'nombre', o.nombre,
          'contacto_id', o.contacto_id,
          'proyecto_id', o.proyecto_id,
          'etapa_comercial', o.etapa_comercial,
          'probabilidad_cierre', o.probabilidad_cierre,
          'monto_estimado', o.monto_estimado,
          'temperatura', o.temperatura,
          'prioridad', o.prioridad,
          'fecha_estimada_cierre', o.fecha_estimada_cierre,
          'estado', o.estado,
          'proxima_accion', o.proxima_accion,
          'fecha_proxima_accion', o.fecha_proxima_accion,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        )
        order by o.updated_at desc nulls last, o.created_at desc
      )
      from public.oportunidades o
      where o.organization_id = e.organization_id
        and o.empresa_id = e.id
    ), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'numero_cotizacion', q.numero_cotizacion,
          'contacto_id', q.contacto_id,
          'proyecto_id', q.proyecto_id,
          'oportunidad_id', q.oportunidad_id,
          'fecha_emision', q.fecha_emision,
          'fecha_validez', q.fecha_validez,
          'moneda', q.moneda,
          'neto', q.neto,
          'iva', q.iva,
          'total', q.total,
          'estado_documental', coalesce(q.estado_documental_externo, q.estado),
          'estado_comercial', q.estado_comercial,
          'proxima_accion', q.proxima_accion,
          'fecha_proximo_seguimiento', q.fecha_proximo_seguimiento,
          'ultima_actividad_at', q.ultima_actividad_at,
          'created_at', q.created_at,
          'updated_at', q.updated_at
        )
        order by q.fecha_emision desc nulls last, q.created_at desc
      )
      from public.cotizaciones q
      where q.organization_id = e.organization_id
        and q.empresa_id = e.id
        and q.deleted_at is null
    ), '[]'::jsonb),
    'catalogs', public.get_company_catalogs()
  )
  into v_result
  from public.empresas e
  left join public.profiles pr
    on pr.id = e.ejecutivo_responsable_id
   and pr.organization_id = e.organization_id
  where e.id = v_company.id;

  return v_result;
end;
$function$;

revoke all on function public.get_company_360(uuid) from public;
grant execute on function public.get_company_360(uuid) to authenticated;

comment on function public.get_company_360(uuid) is
  'Devuelve la ficha 360 de una empresa con responsable, resumen, contactos, proyectos, oportunidades, cotizaciones y catalogos.';

commit;
