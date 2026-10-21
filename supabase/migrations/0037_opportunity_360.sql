begin;

create or replace function public.get_opportunity_360(
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_opportunity public.oportunidades%rowtype;
  v_result jsonb;
begin
  v_org_id := public.current_org();

  if auth.uid() is null or v_org_id is null then
    raise exception 'Debe iniciar sesión para consultar la oportunidad.';
  end if;

  select o.*
  into v_opportunity
  from public.oportunidades o
  where o.id = p_opportunity_id
    and o.organization_id = v_org_id
    and o.deleted_at is null;

  if not found then
    raise exception 'Oportunidad no encontrada o no autorizada.';
  end if;

  select jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', o.id,
      'organization_id', o.organization_id,
      'nombre', o.nombre,
      'nombre_normalizado', o.nombre_normalizado,
      'monto_estimado', o.monto_estimado,
      'etapa_comercial', o.etapa_comercial,
      'estado', o.estado,
      'probabilidad_cierre', o.probabilidad_cierre,
      'monto_ponderado', round(
        coalesce(o.monto_estimado, 0)
        * coalesce(o.probabilidad_cierre, 0)
        / 100.0,
        0
      ),
      'prioridad', o.prioridad,
      'temperatura', o.temperatura,
      'fecha_estimada_cierre', o.fecha_estimada_cierre,
      'proxima_accion', o.proxima_accion,
      'fecha_proxima_accion', o.fecha_proxima_accion,
      'seguimiento_atrasado', case
        when o.estado in ('abierta', 'postergada')
         and (
           o.fecha_proxima_accion is null
           or o.fecha_proxima_accion < now()
         ) then true
        else false
      end,
      'observaciones', o.observaciones,
      'contacto_id', o.contacto_id,
      'empresa_id', o.empresa_id,
      'proyecto_id', o.proyecto_id,
      'created_at', o.created_at,
      'updated_at', o.updated_at
    ),
    'contact', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'apellido', c.apellido,
        'nombre_completo', nullif(
          trim(concat_ws(' ', c.nombre, c.apellido)),
          ''
        ),
        'cargo', c.cargo,
        'telefono', c.telefono,
        'whatsapp', c.whatsapp,
        'correo', c.correo,
        'preferencia_contacto', c.preferencia_contacto,
        'tipo_contacto', c.tipo_contacto,
        'estado', c.estado,
        'empresa_id', c.empresa_id
      )
    end,
    'company', case
      when e.id is null then null
      else jsonb_build_object(
        'id', e.id,
        'razon_social', e.razon_social,
        'nombre_fantasia', e.nombre_fantasia,
        'rut', e.rut,
        'giro', e.giro,
        'direccion', e.direccion,
        'comuna', e.comuna,
        'ciudad', e.ciudad,
        'region', e.region,
        'segmento', e.segmento,
        'estado', e.estado
      )
    end,
    'project', case
      when p.id is null then null
      else jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'direccion', p.direccion,
        'comuna', p.comuna,
        'ciudad', p.ciudad,
        'region', p.region,
        'tipo_proyecto', p.tipo_proyecto,
        'tipo_obra', p.tipo_obra,
        'metros_cuadrados_estimados', p.metros_cuadrados_estimados,
        'estado', p.estado,
        'contacto_principal_id', p.contacto_principal_id,
        'empresa_id', p.empresa_id
      )
    end,
    'summary', jsonb_build_object(
      'cotizaciones_activas', (
        select count(*)
        from public.cotizaciones q
        where q.organization_id = v_org_id
          and q.oportunidad_id = o.id
          and q.deleted_at is null
      ),
      'monto_total_cotizado', (
        select coalesce(sum(q.total), 0)
        from public.cotizaciones q
        where q.organization_id = v_org_id
          and q.oportunidad_id = o.id
          and q.deleted_at is null
      ),
      'actividades', (
        select count(*)
        from public.activities a
        where a.organization_id = v_org_id
          and a.oportunidad_id = o.id
      ),
      'tareas_activas', (
        select count(*)
        from public.tasks t
        where t.organization_id = v_org_id
          and t.oportunidad_id = o.id
          and t.estado in ('pendiente', 'en_curso')
      ),
      'tareas_atrasadas', (
        select count(*)
        from public.tasks t
        where t.organization_id = v_org_id
          and t.oportunidad_id = o.id
          and t.estado in ('pendiente', 'en_curso')
          and t.fecha_hora_vencimiento < now()
      ),
      'cierres_registrados', (
        select count(*)
        from public.commercial_closures cc
        where cc.organization_id = v_org_id
          and cc.oportunidad_id = o.id
      ),
      'ultima_cotizacion_at', (
        select max(q.fecha_emision)
        from public.cotizaciones q
        where q.organization_id = v_org_id
          and q.oportunidad_id = o.id
          and q.deleted_at is null
      ),
      'ultima_actividad_at', (
        select max(a.fecha_hora_inicio)
        from public.activities a
        where a.organization_id = v_org_id
          and a.oportunidad_id = o.id
      )
    ),
    'quotes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'numero_cotizacion', q.numero_cotizacion,
          'fecha_emision', q.fecha_emision,
          'fecha_validez', q.fecha_validez,
          'total', q.total,
          'estado', q.estado,
          'estado_comercial', q.estado_comercial,
          'proxima_accion', q.proxima_accion,
          'fecha_proximo_seguimiento', q.fecha_proximo_seguimiento,
          'contacto_id', q.contacto_id,
          'empresa_id', q.empresa_id,
          'proyecto_id', q.proyecto_id,
          'archivo_pdf_url', q.archivo_pdf_url,
          'created_at', q.created_at,
          'updated_at', q.updated_at
        )
        order by q.fecha_emision desc nulls last, q.created_at desc
      )
      from public.cotizaciones q
      where q.organization_id = v_org_id
        and q.oportunidad_id = o.id
        and q.deleted_at is null
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'tipo_actividad', a.tipo_actividad,
          'fecha_hora_inicio', a.fecha_hora_inicio,
          'fecha_hora_fin', a.fecha_hora_fin,
          'estado', a.estado,
          'resultado', a.resultado,
          'descripcion', a.descripcion,
          'proxima_accion', a.proxima_accion,
          'fecha_proxima_accion', a.fecha_proxima_accion,
          'ejecutivo_responsable_id', a.ejecutivo_responsable_id,
          'responsable', nullif(
            trim(concat_ws(' ', ap.nombre, ap.apellido)),
            ''
          ),
          'created_at', a.created_at
        )
        order by a.fecha_hora_inicio desc nulls last, a.created_at desc
      )
      from public.activities a
      left join public.profiles ap
        on ap.id = a.ejecutivo_responsable_id
       and ap.organization_id = v_org_id
      where a.organization_id = v_org_id
        and a.oportunidad_id = o.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'titulo', t.titulo,
          'descripcion', t.descripcion,
          'tipo', t.tipo,
          'prioridad', t.prioridad,
          'estado', t.estado,
          'fecha_hora_vencimiento', t.fecha_hora_vencimiento,
          'fecha_finalizacion', t.fecha_finalizacion,
          'responsable_id', t.responsable_id,
          'responsable', nullif(
            trim(concat_ws(' ', tp.nombre, tp.apellido)),
            ''
          ),
          'origen_registro', t.origen_registro,
          'created_at', t.created_at,
          'updated_at', t.updated_at
        )
        order by
          case when t.estado in ('pendiente', 'en_curso') then 0 else 1 end,
          t.fecha_hora_vencimiento asc nulls last,
          t.created_at desc
      )
      from public.tasks t
      left join public.profiles tp
        on tp.id = t.responsable_id
       and tp.organization_id = v_org_id
      where t.organization_id = v_org_id
        and t.oportunidad_id = o.id
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(
        to_jsonb(cc)
        order by cc.fecha_cierre desc nulls last, cc.created_at desc
      )
      from public.commercial_closures cc
      where cc.organization_id = v_org_id
        and cc.oportunidad_id = o.id
    ), '[]'::jsonb),
    'catalogs', public.get_opportunity_catalogs()
  )
  into v_result
  from public.oportunidades o
  left join public.contactos c
    on c.id = o.contacto_id
   and c.organization_id = o.organization_id
   and c.deleted_at is null
  left join public.empresas e
    on e.id = o.empresa_id
   and e.organization_id = o.organization_id
   and e.deleted_at is null
  left join public.proyectos p
    on p.id = o.proyecto_id
   and p.organization_id = o.organization_id
   and p.deleted_at is null
  where o.id = v_opportunity.id;

  return v_result;
end;
$$;

revoke all on function public.get_opportunity_360(uuid) from public;
grant execute on function public.get_opportunity_360(uuid) to authenticated;

commit;
