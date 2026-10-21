begin;

-- ============================================================
-- C2: fundacion controlada de Oportunidades
-- ============================================================

alter table public.oportunidades
  add column if not exists nombre_normalizado text,
  add column if not exists observaciones text,
  add column if not exists deleted_at timestamptz;

-- ============================================================
-- NORMALIZACION
-- ============================================================

create or replace function public.normalize_opportunity_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(
      regexp_replace(
        translate(
          trim(coalesce(p_value, '')),
          'ÁÉÍÓÚÜÑáéíóúüñ',
          'AEIOUUNaeiouun'
        ),
        '[^a-zA-Z0-9]+',
        '',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.opportunity_stage_probability(p_stage text)
returns integer
language sql
immutable
as $$
  select case trim(coalesce(p_stage, ''))
    when 'Cotización emitida' then 20
    when 'Cotización enviada' then 30
    when 'Recibida por el cliente' then 40
    when 'En evaluación' then 55
    when 'Negociación' then 70
    when 'Postergada' then 30
    when 'Aprobada' then 100
    when 'Perdida' then 0
    when 'Cancelada' then 0
    else 20
  end;
$$;

create or replace function public.prepare_opportunity_data()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_stage text;
begin
  if tg_op = 'UPDATE' then
    v_old_stage := old.etapa_comercial;
  end if;

  new.nombre := nullif(trim(new.nombre), '');
  new.nombre_normalizado := public.normalize_opportunity_text(new.nombre);
  new.etapa_comercial := nullif(trim(new.etapa_comercial), '');
  new.estado := nullif(trim(new.estado), '');
  new.prioridad := nullif(trim(new.prioridad), '');
  new.temperatura := nullif(trim(new.temperatura), '');
  new.proxima_accion := nullif(trim(new.proxima_accion), '');
  new.observaciones := nullif(trim(new.observaciones), '');
  new.updated_at := now();

  if new.nombre is null then
    raise exception 'El nombre de la oportunidad es obligatorio.';
  end if;

  if new.contacto_id is null then
    raise exception 'La oportunidad debe tener un contacto.';
  end if;

  if new.proyecto_id is null then
    raise exception 'La oportunidad debe tener un proyecto.';
  end if;

  if new.monto_estimado is not null and new.monto_estimado < 0 then
    raise exception 'El monto estimado no puede ser negativo.';
  end if;

  if new.etapa_comercial is null then
    new.etapa_comercial := 'Cotización emitida';
  end if;

  if new.etapa_comercial not in (
    'Cotización emitida',
    'Cotización enviada',
    'Recibida por el cliente',
    'En evaluación',
    'Negociación',
    'Postergada',
    'Aprobada',
    'Perdida',
    'Cancelada'
  ) then
    raise exception 'Etapa comercial no válida.';
  end if;

  if new.estado is null then
    new.estado := 'abierta';
  end if;

  if new.estado not in (
    'abierta',
    'ganada',
    'perdida',
    'postergada',
    'cancelada'
  ) then
    raise exception 'Estado de oportunidad no válido.';
  end if;

  if new.prioridad is null then
    new.prioridad := 'Media';
  end if;

  if new.prioridad not in ('Baja', 'Media', 'Alta', 'Crítica') then
    raise exception 'Prioridad no válida.';
  end if;

  if new.temperatura is null then
    new.temperatura := 'Tibia';
  end if;

  if new.temperatura not in ('Fría', 'Tibia', 'Caliente') then
    raise exception 'Temperatura no válida.';
  end if;

  if new.probabilidad_cierre is null
     or (tg_op = 'UPDATE' and new.etapa_comercial is distinct from v_old_stage) then
    new.probabilidad_cierre := public.opportunity_stage_probability(
      new.etapa_comercial
    );
  end if;

  if new.probabilidad_cierre < 0 or new.probabilidad_cierre > 100 then
    raise exception 'La probabilidad de cierre debe estar entre 0 y 100.';
  end if;

  if new.etapa_comercial = 'Aprobada' then
    new.estado := 'ganada';
    new.probabilidad_cierre := 100;
  elsif new.etapa_comercial = 'Perdida' then
    new.estado := 'perdida';
    new.probabilidad_cierre := 0;
  elsif new.etapa_comercial = 'Postergada' then
    new.estado := 'postergada';
  elsif new.etapa_comercial = 'Cancelada' then
    new.estado := 'cancelada';
    new.probabilidad_cierre := 0;
  elsif new.estado in ('ganada', 'perdida', 'postergada', 'cancelada') then
    new.estado := 'abierta';
  end if;

  if not exists (
    select 1
    from public.contactos c
    where c.id = new.contacto_id
      and c.organization_id = new.organization_id
      and c.deleted_at is null
  ) then
    raise exception 'El contacto no pertenece a la organización o está archivado.';
  end if;

  if not exists (
    select 1
    from public.proyectos p
    where p.id = new.proyecto_id
      and p.organization_id = new.organization_id
      and p.deleted_at is null
  ) then
    raise exception 'El proyecto no pertenece a la organización o está archivado.';
  end if;

  if new.empresa_id is not null and not exists (
    select 1
    from public.empresas e
    where e.id = new.empresa_id
      and e.organization_id = new.organization_id
      and e.deleted_at is null
  ) then
    raise exception 'La empresa no pertenece a la organización o está archivada.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_opportunity_data on public.oportunidades;
create trigger trg_prepare_opportunity_data
before insert or update on public.oportunidades
for each row
execute function public.prepare_opportunity_data();

-- ============================================================
-- REGULARIZACION SEGURA DE REGISTROS EXISTENTES
-- No reemplaza probabilidades ya registradas.
-- ============================================================

update public.oportunidades
set
  nombre = nombre,
  updated_at = coalesce(updated_at, now());

-- ============================================================
-- INDICES PARA PIPELINE, SEGUIMIENTO Y FORECAST
-- ============================================================

create index if not exists idx_oportunidades_org_pipeline
  on public.oportunidades (
    organization_id,
    etapa_comercial,
    estado,
    updated_at desc
  )
  where deleted_at is null;

create index if not exists idx_oportunidades_org_proxima_accion
  on public.oportunidades (
    organization_id,
    fecha_proxima_accion
  )
  where deleted_at is null
    and estado in ('abierta', 'postergada');

create index if not exists idx_oportunidades_org_fecha_cierre
  on public.oportunidades (
    organization_id,
    fecha_estimada_cierre
  )
  where deleted_at is null
    and estado in ('abierta', 'postergada');

create index if not exists idx_oportunidades_org_nombre_normalizado
  on public.oportunidades (
    organization_id,
    nombre_normalizado
  )
  where deleted_at is null;

create index if not exists idx_oportunidades_proyecto
  on public.oportunidades (
    organization_id,
    proyecto_id
  )
  where deleted_at is null;

create index if not exists idx_oportunidades_contacto
  on public.oportunidades (
    organization_id,
    contacto_id
  )
  where deleted_at is null;

create index if not exists idx_oportunidades_empresa
  on public.oportunidades (
    organization_id,
    empresa_id
  )
  where deleted_at is null;

-- ============================================================
-- CATALOGOS PARA LA INTERFAZ
-- ============================================================

create or replace function public.get_opportunity_catalogs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'etapas', jsonb_build_array(
      jsonb_build_object(
        'value', 'Cotización emitida',
        'label', 'Cotización emitida',
        'order', 10,
        'probability', 20
      ),
      jsonb_build_object(
        'value', 'Cotización enviada',
        'label', 'Cotización enviada',
        'order', 20,
        'probability', 30
      ),
      jsonb_build_object(
        'value', 'Recibida por el cliente',
        'label', 'Recibida por el cliente',
        'order', 30,
        'probability', 40
      ),
      jsonb_build_object(
        'value', 'En evaluación',
        'label', 'En evaluación',
        'order', 40,
        'probability', 55
      ),
      jsonb_build_object(
        'value', 'Negociación',
        'label', 'Negociación',
        'order', 50,
        'probability', 70
      ),
      jsonb_build_object(
        'value', 'Postergada',
        'label', 'Postergada',
        'order', 60,
        'probability', 30
      ),
      jsonb_build_object(
        'value', 'Aprobada',
        'label', 'Aprobada',
        'order', 70,
        'probability', 100
      ),
      jsonb_build_object(
        'value', 'Perdida',
        'label', 'Perdida',
        'order', 80,
        'probability', 0
      ),
      jsonb_build_object(
        'value', 'Cancelada',
        'label', 'Cancelada',
        'order', 90,
        'probability', 0
      )
    ),
    'estados', jsonb_build_array(
      jsonb_build_object('value', 'abierta', 'label', 'Abierta'),
      jsonb_build_object('value', 'ganada', 'label', 'Ganada'),
      jsonb_build_object('value', 'perdida', 'label', 'Perdida'),
      jsonb_build_object('value', 'postergada', 'label', 'Postergada'),
      jsonb_build_object('value', 'cancelada', 'label', 'Cancelada')
    ),
    'prioridades', jsonb_build_array(
      jsonb_build_object('value', 'Baja', 'label', 'Baja'),
      jsonb_build_object('value', 'Media', 'label', 'Media'),
      jsonb_build_object('value', 'Alta', 'label', 'Alta'),
      jsonb_build_object('value', 'Crítica', 'label', 'Crítica')
    ),
    'temperaturas', jsonb_build_array(
      jsonb_build_object('value', 'Fría', 'label', 'Fría'),
      jsonb_build_object('value', 'Tibia', 'label', 'Tibia'),
      jsonb_build_object('value', 'Caliente', 'label', 'Caliente')
    )
  );
$$;

-- ============================================================
-- COINCIDENCIAS PREVENTIVAS
-- ============================================================

create or replace function public.find_opportunity_matches(
  p_nombre text,
  p_proyecto_id uuid default null,
  p_contacto_id uuid default null,
  p_exclude_opportunity_id uuid default null
)
returns table (
  opportunity_id uuid,
  nombre text,
  proyecto_id uuid,
  contacto_id uuid,
  empresa_id uuid,
  etapa_comercial text,
  estado text,
  coincidence_type text,
  coincidence_level text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.nombre,
    o.proyecto_id,
    o.contacto_id,
    o.empresa_id,
    o.etapa_comercial,
    o.estado,
    case
      when o.nombre_normalizado = public.normalize_opportunity_text(p_nombre)
       and o.proyecto_id is not distinct from p_proyecto_id
       and p_proyecto_id is not null
        then 'nombre_proyecto'
      when o.nombre_normalizado = public.normalize_opportunity_text(p_nombre)
       and o.contacto_id is not distinct from p_contacto_id
       and p_contacto_id is not null
        then 'nombre_contacto'
      else 'nombre'
    end,
    case
      when o.nombre_normalizado = public.normalize_opportunity_text(p_nombre)
       and (
         (o.proyecto_id is not distinct from p_proyecto_id and p_proyecto_id is not null)
         or (o.contacto_id is not distinct from p_contacto_id and p_contacto_id is not null)
       ) then 'alta'
      else 'media'
    end
  from public.oportunidades o
  where o.organization_id = public.current_org()
    and o.deleted_at is null
    and o.id is distinct from p_exclude_opportunity_id
    and o.nombre_normalizado = public.normalize_opportunity_text(p_nombre)
  order by
    case
      when o.proyecto_id is not distinct from p_proyecto_id
       and p_proyecto_id is not null then 1
      when o.contacto_id is not distinct from p_contacto_id
       and p_contacto_id is not null then 2
      else 3
    end,
    o.updated_at desc;
$$;

-- ============================================================
-- CAMBIO CONTROLADO DE ETAPA
-- ============================================================

create or replace function public.change_opportunity_stage(
  p_opportunity_id uuid,
  p_stage text,
  p_next_action text default null,
  p_next_at timestamptz default null,
  p_priority text default null,
  p_temperature text default null,
  p_estimated_close_date date default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.oportunidades%rowtype;
  v_role text;
  v_probability integer;
begin
  if auth.uid() is null or public.current_org() is null then
    raise exception 'Debe iniciar sesión para actualizar la oportunidad.';
  end if;

  select *
  into v_opportunity
  from public.oportunidades
  where id = p_opportunity_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Oportunidad no encontrada o no autorizada.';
  end if;

  select rol
  into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No está autorizado para cambiar la etapa.';
  end if;

  if trim(coalesce(p_stage, '')) not in (
    'Cotización emitida',
    'Cotización enviada',
    'Recibida por el cliente',
    'En evaluación',
    'Negociación',
    'Postergada',
    'Aprobada',
    'Perdida',
    'Cancelada'
  ) then
    raise exception 'Etapa comercial no válida.';
  end if;

  if p_stage in ('Cotización emitida', 'Cotización enviada', 'Recibida por el cliente', 'En evaluación', 'Negociación', 'Postergada')
     and (
       nullif(trim(coalesce(p_next_action, '')), '') is null
       or p_next_at is null
     ) then
    raise exception 'Las oportunidades abiertas deben tener próxima acción y fecha.';
  end if;

  v_probability := public.opportunity_stage_probability(p_stage);

  update public.oportunidades
  set
    etapa_comercial = p_stage,
    probabilidad_cierre = v_probability,
    proxima_accion = p_next_action,
    fecha_proxima_accion = p_next_at,
    prioridad = coalesce(p_priority, prioridad),
    temperatura = coalesce(p_temperature, temperatura),
    fecha_estimada_cierre = coalesce(
      p_estimated_close_date,
      fecha_estimada_cierre
    ),
    observaciones = case
      when nullif(trim(coalesce(p_comment, '')), '') is null
        then observaciones
      when nullif(trim(coalesce(observaciones, '')), '') is null
        then trim(p_comment)
      else concat(observaciones, E'\n', trim(p_comment))
    end,
    updated_at = now()
  where id = p_opportunity_id;

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'stage', p_stage,
    'probability', v_probability,
    'status', case
      when p_stage = 'Aprobada' then 'ganada'
      when p_stage = 'Perdida' then 'perdida'
      when p_stage = 'Postergada' then 'postergada'
      when p_stage = 'Cancelada' then 'cancelada'
      else 'abierta'
    end
  );
end;
$$;

-- ============================================================
-- ARCHIVO Y RESTAURACION
-- ============================================================

create or replace function public.deactivate_opportunity(
  p_opportunity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null or public.current_org() is null then
    raise exception 'Debe iniciar sesión.';
  end if;

  select rol
  into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial') then
    raise exception 'Solo administración o jefatura puede archivar oportunidades.';
  end if;

  update public.oportunidades
  set
    estado = 'cancelada',
    etapa_comercial = 'Cancelada',
    probabilidad_cierre = 0,
    deleted_at = now(),
    updated_at = now()
  where id = p_opportunity_id
    and organization_id = public.current_org()
    and deleted_at is null;

  if not found then
    raise exception 'Oportunidad no encontrada o ya archivada.';
  end if;
end;
$$;

create or replace function public.restore_opportunity(
  p_opportunity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null or public.current_org() is null then
    raise exception 'Debe iniciar sesión.';
  end if;

  select rol
  into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial') then
    raise exception 'Solo administración o jefatura puede restaurar oportunidades.';
  end if;

  update public.oportunidades
  set
    estado = 'abierta',
    etapa_comercial = 'Cotización emitida',
    probabilidad_cierre = 20,
    deleted_at = null,
    updated_at = now()
  where id = p_opportunity_id
    and organization_id = public.current_org()
    and deleted_at is not null;

  if not found then
    raise exception 'Oportunidad no encontrada o no está archivada.';
  end if;
end;
$$;

-- ============================================================
-- PERMISOS
-- ============================================================

revoke all on function public.get_opportunity_catalogs() from public;
revoke all on function public.find_opportunity_matches(text, uuid, uuid, uuid) from public;
revoke all on function public.change_opportunity_stage(uuid, text, text, timestamptz, text, text, date, text) from public;
revoke all on function public.deactivate_opportunity(uuid) from public;
revoke all on function public.restore_opportunity(uuid) from public;

grant execute on function public.get_opportunity_catalogs() to authenticated;
grant execute on function public.find_opportunity_matches(text, uuid, uuid, uuid) to authenticated;
grant execute on function public.change_opportunity_stage(uuid, text, text, timestamptz, text, text, date, text) to authenticated;
grant execute on function public.deactivate_opportunity(uuid) to authenticated;
grant execute on function public.restore_opportunity(uuid) to authenticated;

commit;
