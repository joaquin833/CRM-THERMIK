begin;

-- =========================================================
-- 0023 - FICHA 360 DE CONTACTOS
-- Contactos como soporte de Cotizaciones, Proyectos y Oportunidades.
-- Solo lectura: no incorpora prospeccion ni modifica datos oficiales.
-- =========================================================

create or replace function public.get_contact_360(p_contact_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_contact public.contactos%rowtype;
  v_result jsonb;
begin
  select * into v_contact
  from public.contactos
  where id = p_contact_id
    and organization_id = public.current_org();

  if v_contact.id is null then
    raise exception 'Contacto no encontrado o no autorizado';
  end if;

  select jsonb_build_object(
    'contact', jsonb_build_object(
      'id', c.id,
      'nombre', c.nombre,
      'apellido', c.apellido,
      'nombre_completo', nullif(trim(concat_ws(' ', c.nombre, c.apellido)), ''),
      'cargo', c.cargo,
      'telefono', c.telefono,
      'telefono_normalizado', c.telefono_normalizado,
      'whatsapp', c.whatsapp,
      'correo', c.correo,
      'correo_normalizado', c.correo_normalizado,
      'direccion', c.direccion,
      'comuna', c.comuna,
      'ciudad', c.ciudad,
      'region', c.region,
      'tipo_contacto', c.tipo_contacto,
      'preferencia_contacto', c.preferencia_contacto,
      'origen', c.origen,
      'estado', c.estado,
      'consentimiento_comunicaciones', c.consentimiento_comunicaciones,
      'observaciones', c.observaciones,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'deleted_at', c.deleted_at
    ),
    'company', case
      when e.id is null then null
      else jsonb_build_object(
        'id', e.id,
        'razon_social', e.razon_social,
        'rut', e.rut,
        'telefono', e.telefono,
        'correo', e.correo,
        'estado', e.estado
      )
    end,
    'responsible', case
      when pr.id is null then null
      else jsonb_build_object(
        'id', pr.id,
        'nombre', pr.nombre,
        'apellido', pr.apellido,
        'nombre_completo', nullif(trim(concat_ws(' ', pr.nombre, pr.apellido)), ''),
        'correo', pr.correo,
        'cargo', pr.cargo
      )
    end,
    'summary', jsonb_build_object(
      'projects', (
        select count(*)
        from public.proyectos p
        where p.organization_id = c.organization_id
          and p.contacto_principal_id = c.id
      ),
      'opportunities', (
        select count(*)
        from public.oportunidades o
        where o.organization_id = c.organization_id
          and o.contacto_id = c.id
      ),
      'quotes', (
        select count(*)
        from public.cotizaciones q
        where q.organization_id = c.organization_id
          and q.contacto_id = c.id
          and q.deleted_at is null
      ),
      'activities', (
        select count(*)
        from public.activities a
        where a.organization_id = c.organization_id
          and a.contacto_id = c.id
      ),
      'active_tasks', (
        select count(*)
        from public.tasks t
        where t.organization_id = c.organization_id
          and t.contacto_id = c.id
          and t.estado in ('pendiente', 'en_curso')
      ),
      'overdue_tasks', (
        select count(*)
        from public.tasks t
        where t.organization_id = c.organization_id
          and t.contacto_id = c.id
          and t.estado in ('pendiente', 'en_curso')
          and t.fecha_hora_vencimiento < now()
      )
    ),
    'projects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nombre', p.nombre,
          'estado', p.estado,
          'empresa_id', p.empresa_id,
          'created_at', p.created_at,
          'updated_at', p.updated_at
        )
        order by p.updated_at desc nulls last, p.created_at desc
      )
      from public.proyectos p
      where p.organization_id = c.organization_id
        and p.contacto_principal_id = c.id
    ), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'nombre', o.nombre,
          'etapa_comercial', o.etapa_comercial,
          'estado', o.estado,
          'monto_estimado', o.monto_estimado,
          'probabilidad', o.probabilidad,
          'proxima_accion', o.proxima_accion,
          'fecha_proxima_accion', o.fecha_proxima_accion,
          'proyecto_id', o.proyecto_id,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        )
        order by o.updated_at desc nulls last, o.created_at desc
      )
      from public.oportunidades o
      where o.organization_id = c.organization_id
        and o.contacto_id = c.id
    ), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'numero_cotizacion', q.numero_cotizacion,
          'fecha_emision', q.fecha_emision,
          'total', q.total,
          'moneda', q.moneda,
          'estado_documental', coalesce(q.estado_documental_externo, q.estado),
          'estado_comercial', q.estado_comercial,
          'proxima_accion', q.proxima_accion,
          'fecha_proximo_seguimiento', q.fecha_proximo_seguimiento,
          'proyecto_id', q.proyecto_id,
          'oportunidad_id', q.oportunidad_id,
          'ultima_actividad_at', q.ultima_actividad_at,
          'created_at', q.created_at
        )
        order by q.fecha_emision desc nulls last, q.created_at desc
      )
      from public.cotizaciones q
      where q.organization_id = c.organization_id
        and q.contacto_id = c.id
        and q.deleted_at is null
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'tipo_actividad', a.tipo_actividad,
          'fecha_hora_inicio', a.fecha_hora_inicio,
          'estado', a.estado,
          'resultado', a.resultado,
          'descripcion', a.descripcion,
          'proxima_accion', a.proxima_accion,
          'fecha_proxima_accion', a.fecha_proxima_accion,
          'cotizacion_id', a.cotizacion_id,
          'oportunidad_id', a.oportunidad_id,
          'proyecto_id', a.proyecto_id,
          'created_at', a.created_at
        )
        order by coalesce(a.fecha_hora_inicio, a.created_at) desc
      )
      from public.activities a
      where a.organization_id = c.organization_id
        and a.contacto_id = c.id
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
          'cotizacion_id', t.cotizacion_id,
          'oportunidad_id', t.oportunidad_id,
          'proyecto_id', t.proyecto_id,
          'created_at', t.created_at,
          'updated_at', t.updated_at
        )
        order by
          case when t.estado in ('pendiente', 'en_curso') then 0 else 1 end,
          t.fecha_hora_vencimiento asc nulls last,
          t.updated_at desc
      )
      from public.tasks t
      where t.organization_id = c.organization_id
        and t.contacto_id = c.id
    ), '[]'::jsonb),
    'catalogs', public.get_contact_catalogs()
  ) into v_result
  from public.contactos c
  left join public.empresas e
    on e.id = c.empresa_id
   and e.organization_id = c.organization_id
  left join public.profiles pr
    on pr.id = c.ejecutivo_responsable_id
   and pr.organization_id = c.organization_id
  where c.id = v_contact.id;

  return v_result;
end;
$function$;

revoke all on function public.get_contact_360(uuid) from public;
grant execute on function public.get_contact_360(uuid) to authenticated;

comment on function public.get_contact_360(uuid) is
  'Devuelve la ficha 360 de un contacto con empresa, responsable, proyectos, oportunidades, cotizaciones, actividades, tareas y catálogos.';

commit;
