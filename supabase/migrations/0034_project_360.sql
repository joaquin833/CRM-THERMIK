begin;

create or replace function public.get_project_360(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_project public.proyectos%rowtype;
  v_result jsonb;
begin
  v_org_id := public.current_org();

  if auth.uid() is null or v_org_id is null then
    raise exception 'Debe iniciar sesión para consultar el proyecto.';
  end if;

  select p.*
  into v_project
  from public.proyectos p
  where p.id = p_project_id
    and p.organization_id = v_org_id
    and p.deleted_at is null;

  if not found then
    raise exception 'Proyecto no encontrado o no autorizado.';
  end if;

  select jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id,
      'organization_id', p.organization_id,
      'nombre', p.nombre,
      'nombre_normalizado', p.nombre_normalizado,
      'direccion', p.direccion,
      'direccion_normalizada', p.direccion_normalizada,
      'comuna', p.comuna,
      'ciudad', p.ciudad,
      'region', p.region,
      'tipo_proyecto', p.tipo_proyecto,
      'tipo_obra', p.tipo_obra,
      'metros_cuadrados_estimados', p.metros_cuadrados_estimados,
      'estado', p.estado,
      'observaciones', p.observaciones,
      'contacto_principal_id', p.contacto_principal_id,
      'empresa_id', p.empresa_id,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ),
    'contact', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'apellido', c.apellido,
        'nombre_completo', nullif(trim(concat_ws(' ', c.nombre, c.apellido)), ''),
        'cargo', c.cargo,
        'telefono', c.telefono,
        'whatsapp', c.whatsapp,
        'correo', c.correo,
        'preferencia_contacto', c.preferencia_contacto,
        'tipo_contacto', c.tipo_contacto,
        'estado', c.estado
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
        'segmento', e.segmento,
        'estado', e.estado
      )
    end,
    'summary', jsonb_build_object(
      'oportunidades', (
        select count(*)
        from public.oportunidades o
        where o.organization_id = v_org_id
          and o.proyecto_id = p.id
      ),
      'cotizaciones_activas', (
        select count(*)
        from public.cotizaciones q
        where q.organization_id = v_org_id
          and q.proyecto_id = p.id
          and q.deleted_at is null
      ),
      'monto_total_cotizado', (
        select coalesce(sum(q.total), 0)
        from public.cotizaciones q
        where q.organization_id = v_org_id
          and q.proyecto_id = p.id
          and q.deleted_at is null
      ),
      'actividades', (
        select count(*)
        from public.activities a
        where a.organization_id = v_org_id
          and a.proyecto_id = p.id
      ),
      'tareas_activas', (
        select count(*)
        from public.tasks t
        where t.organization_id = v_org_id
          and t.proyecto_id = p.id
          and t.estado in ('pendiente', 'en_curso')
      ),
      'tareas_atrasadas', (
        select count(*)
        from public.tasks t
        where t.organization_id = v_org_id
          and t.proyecto_id = p.id
          and t.estado in ('pendiente', 'en_curso')
          and t.fecha_hora_vencimiento < now()
      ),
      'ultima_cotizacion_at', (
        select max(q.fecha_emision)
        from public.cotizaciones q
        where q.organization_id = v_org_id
          and q.proyecto_id = p.id
          and q.deleted_at is null
      ),
      'ultima_actividad_at', (
        select max(a.fecha_hora_inicio)
        from public.activities a
        where a.organization_id = v_org_id
          and a.proyecto_id = p.id
      )
    ),
    'opportunities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'nombre', o.nombre,
          'monto_estimado', o.monto_estimado,
          'etapa_comercial', o.etapa_comercial,
          'estado', o.estado,
          'probabilidad_cierre', o.probabilidad_cierre,
          'prioridad', o.prioridad,
          'temperatura', o.temperatura,
          'fecha_estimada_cierre', o.fecha_estimada_cierre,
          'proxima_accion', o.proxima_accion,
          'fecha_proxima_accion', o.fecha_proxima_accion,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        )
        order by o.updated_at desc nulls last, o.created_at desc
      )
      from public.oportunidades o
      where o.organization_id = v_org_id
        and o.proyecto_id = p.id
    ), '[]'::jsonb),
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
          'created_at', q.created_at,
          'updated_at', q.updated_at
        )
        order by q.fecha_emision desc nulls last, q.created_at desc
      )
      from public.cotizaciones q
      where q.organization_id = v_org_id
        and q.proyecto_id = p.id
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
          'responsable', nullif(trim(concat_ws(' ', ap.nombre, ap.apellido)), ''),
          'created_at', a.created_at
        )
        order by a.fecha_hora_inicio desc nulls last, a.created_at desc
      )
      from public.activities a
      left join public.profiles ap
        on ap.id = a.ejecutivo_responsable_id
       and ap.organization_id = v_org_id
      where a.organization_id = v_org_id
        and a.proyecto_id = p.id
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
          'responsable', nullif(trim(concat_ws(' ', tp.nombre, tp.apellido)), ''),
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
        and t.proyecto_id = p.id
    ), '[]'::jsonb),
    'catalogs', public.get_project_catalogs()
  )
  into v_result
  from public.proyectos p
  left join public.contactos c
    on c.id = p.contacto_principal_id
   and c.organization_id = p.organization_id
   and c.deleted_at is null
  left join public.empresas e
    on e.id = p.empresa_id
   and e.organization_id = p.organization_id
   and e.deleted_at is null
  where p.id = v_project.id;

  return v_result;
end;
$$;

revoke all on function public.get_project_360(uuid) from public;
grant execute on function public.get_project_360(uuid) to authenticated;

commit;
