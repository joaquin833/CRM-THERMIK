begin;

-- ============================================================
-- C5: edicion controlada de Oportunidades
-- La etapa, el estado y la probabilidad se administran exclusivamente
-- mediante public.change_opportunity_stage(...).
-- ============================================================

create or replace function public.update_opportunity(
  p_opportunity_id uuid,
  p_nombre text,
  p_monto_estimado numeric default null,
  p_contacto_id uuid default null,
  p_empresa_id uuid default null,
  p_proyecto_id uuid default null,
  p_prioridad text default 'Media',
  p_temperatura text default 'Tibia',
  p_fecha_estimada_cierre date default null,
  p_proxima_accion text default null,
  p_fecha_proxima_accion timestamptz default null,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.oportunidades%rowtype;
  v_role text;
  v_project public.proyectos%rowtype;
  v_matches jsonb;
  v_result jsonb;
begin
  if auth.uid() is null or public.current_org() is null then
    raise exception 'Debe iniciar sesión para editar la oportunidad.';
  end if;

  select o.*
  into v_opportunity
  from public.oportunidades o
  where o.id = p_opportunity_id
    and o.organization_id = public.current_org()
  for update;

  if not found then
    raise exception 'Oportunidad no encontrada o no autorizada.';
  end if;

  if v_opportunity.deleted_at is not null then
    raise exception 'Una oportunidad archivada no puede editarse.';
  end if;

  select pr.rol
  into v_role
  from public.profiles pr
  where pr.id = auth.uid()
    and pr.organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No está autorizado para editar oportunidades.';
  end if;

  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El nombre de la oportunidad es obligatorio.';
  end if;

  if p_monto_estimado is not null and p_monto_estimado < 0 then
    raise exception 'El monto estimado no puede ser negativo.';
  end if;

  if p_contacto_id is null then
    raise exception 'La oportunidad debe tener un contacto.';
  end if;

  if p_proyecto_id is null then
    raise exception 'La oportunidad debe tener un proyecto.';
  end if;

  if p_prioridad not in ('Baja', 'Media', 'Alta', 'Crítica') then
    raise exception 'Prioridad no válida.';
  end if;

  if p_temperatura not in ('Fría', 'Tibia', 'Caliente') then
    raise exception 'Temperatura no válida.';
  end if;

  if not exists (
    select 1
    from public.contactos c
    where c.id = p_contacto_id
      and c.organization_id = public.current_org()
      and c.deleted_at is null
  ) then
    raise exception 'El contacto seleccionado no es válido.';
  end if;

  select p.*
  into v_project
  from public.proyectos p
  where p.id = p_proyecto_id
    and p.organization_id = public.current_org()
    and p.deleted_at is null;

  if not found then
    raise exception 'El proyecto seleccionado no es válido.';
  end if;

  if p_empresa_id is not null and not exists (
    select 1
    from public.empresas e
    where e.id = p_empresa_id
      and e.organization_id = public.current_org()
      and e.deleted_at is null
  ) then
    raise exception 'La empresa seleccionada no es válida.';
  end if;

  if p_empresa_id is distinct from v_project.empresa_id then
    raise exception 'La empresa de la oportunidad debe coincidir con la empresa del proyecto.';
  end if;

  if v_opportunity.estado in ('abierta', 'postergada')
     and (
       nullif(trim(coalesce(p_proxima_accion, '')), '') is null
       or p_fecha_proxima_accion is null
     ) then
    raise exception 'Las oportunidades abiertas deben tener próxima acción y fecha.';
  end if;

  update public.oportunidades
  set
    nombre = p_nombre,
    monto_estimado = p_monto_estimado,
    contacto_id = p_contacto_id,
    empresa_id = p_empresa_id,
    proyecto_id = p_proyecto_id,
    prioridad = p_prioridad,
    temperatura = p_temperatura,
    fecha_estimada_cierre = p_fecha_estimada_cierre,
    proxima_accion = p_proxima_accion,
    fecha_proxima_accion = p_fecha_proxima_accion,
    observaciones = p_observaciones,
    updated_at = now()
  where id = p_opportunity_id;

  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
  into v_matches
  from public.find_opportunity_matches(
    p_nombre,
    p_proyecto_id,
    p_contacto_id,
    p_opportunity_id
  ) m;

  select jsonb_build_object(
    'opportunity_id', o.id,
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
    'contacto_id', o.contacto_id,
    'empresa_id', o.empresa_id,
    'proyecto_id', o.proyecto_id,
    'matches', v_matches
  )
  into v_result
  from public.oportunidades o
  where o.id = p_opportunity_id;

  return v_result;
end;
$$;

revoke all on function public.update_opportunity(
  uuid,
  text,
  numeric,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  text,
  timestamptz,
  text
) from public;

grant execute on function public.update_opportunity(
  uuid,
  text,
  numeric,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  text,
  timestamptz,
  text
) to authenticated;

commit;
