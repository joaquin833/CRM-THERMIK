-- ============================================================================
-- 0043_agenda_quotes_integration.sql
-- Revision 4: compatibilidad completa con columnas NOT NULL historicas
-- Mapea simultaneamente el esquema historico y el esquema nuevo de Agenda
-- CRM Thermikhaus - Bloque D7
-- Integracion bidireccional operativa: Cotizaciones -> Agenda comercial
-- ============================================================================
-- OBJETIVO
--   1. Llevar a public.tasks las proximas acciones y seguimientos existentes
--      de public.cotizaciones.
--   2. Mantener sincronizada una unica actividad de Agenda por cotizacion.
--   3. Vincular oportunidad, proyecto, contacto, empresa y responsable.
--   4. Evitar duplicados aun cuando la migracion se ejecute nuevamente.
--   5. Mantener numeros, items y valores oficiales de cotizacion en solo lectura.
--
-- MAPEO CONFIRMADO POR D7.11
--   cotizaciones.id                         -> tasks.quote_id
--   cotizaciones.oportunidad_id             -> tasks.opportunity_id
--   cotizaciones.proyecto_id                -> tasks.project_id
--   cotizaciones.contacto_id                -> tasks.contact_id
--   cotizaciones.empresa_id                 -> tasks.company_id
--   cotizaciones.organization_id             -> tasks.organization_id
--   cotizaciones.ejecutivo_responsable_id   -> tasks.responsable_id / assigned_to
--   cotizaciones.fecha_proximo_seguimiento  -> tasks.fecha_hora_vencimiento / due_at
--   cotizaciones.proxima_accion             -> tasks.titulo / title / description
--   cotizaciones.deleted_at                 -> cancelacion controlada
--
-- COMPORTAMIENTO
--   - Si una cotizacion activa tiene accion o fecha, crea/actualiza su tarea.
--   - Si se eliminan accion y fecha, cancela la tarea sincronizada.
--   - Si la cotizacion se archiva mediante deleted_at, cancela la tarea.
--   - Si la informacion reaparece, reactiva la misma tarea, sin duplicarla.
--   - No modifica public.cotizaciones.
-- ============================================================================

begin;

-- Evita dos ejecuciones simultaneas de esta migracion.
select pg_advisory_xact_lock(hashtext('0043_agenda_quotes_integration'));

-- ----------------------------------------------------------------------------
-- 1. Validaciones estructurales antes de escribir
-- ----------------------------------------------------------------------------
do $$
declare
  missing_columns text;
begin
  if to_regclass('public.cotizaciones') is null then
    raise exception '0043: no existe public.cotizaciones';
  end if;

  if to_regclass('public.tasks') is null then
    raise exception '0043: no existe public.tasks. Ejecuta primero 0042.';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
  into missing_columns
  from (
    values
      ('id'),
      ('organization_id'),
      ('oportunidad_id'),
      ('proyecto_id'),
      ('contacto_id'),
      ('empresa_id'),
      ('ejecutivo_responsable_id'),
      ('fecha_proximo_seguimiento'),
      ('proxima_accion'),
      ('deleted_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'cotizaciones'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception '0043: faltan columnas en public.cotizaciones: %', missing_columns;
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
  into missing_columns
  from (
    values
      ('id'), ('titulo'), ('title'), ('description'), ('tipo'), ('task_type'), ('estado'), ('status'),
      ('prioridad'), ('priority'), ('fecha_hora_vencimiento'), ('due_at'), ('completed_at'), ('organization_id'), ('contacto_id'), ('responsable_id'), ('idempotency_key'), ('assigned_to'),
      ('contact_id'), ('company_id'), ('project_id'), ('opportunity_id'),
      ('quote_id'), ('metadata'), ('created_at'), ('updated_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'tasks'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception '0043: faltan columnas en public.tasks: %', missing_columns;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'titulo'
      and data_type = 'text'
  ) then
    raise exception '0043: tasks.titulo no existe o no es text';
  end if;

  if exists (
    select 1
    from (values
      ('contacto_id', 'uuid'),
      ('responsable_id', 'uuid'),
      ('tipo', 'text'),
      ('fecha_hora_vencimiento', 'timestamptz'),
      ('idempotency_key', 'text')
    ) required(column_name, udt_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'tasks'
        and c.column_name = required.column_name
        and c.udt_name = required.udt_name
    )
  ) then
    raise exception '0043: faltan columnas historicas obligatorias o tienen tipo incompatible';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cotizaciones'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) then
    raise exception '0043: cotizaciones.id no es uuid';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'quote_id'
      and udt_name = 'uuid'
  ) then
    raise exception '0043: tasks.quote_id no es uuid';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cotizaciones'
      and column_name = 'organization_id'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'organization_id'
      and udt_name = 'uuid'
  ) then
    raise exception '0043: organization_id debe ser uuid en cotizaciones y tasks';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Normalizacion preventiva de duplicados sincronizados antiguos
--    Conserva el registro mas reciente y cancela los adicionales.
-- ----------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by quote_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.tasks
  where quote_id is not null
    and metadata ->> 'source' = 'cotizaciones'
), duplicates as (
  select id
  from ranked
  where duplicate_rank > 1
)
update public.tasks t
set
  status = 'cancelled',
  completed_at = null,
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'sync_state', 'duplicate_cancelled',
    'sync_version', '0043',
    'cancelled_at', now()
  ),
  updated_at = now()
from duplicates d
where t.id = d.id;

-- Los duplicados cancelados dejan de pertenecer al origen sincronizado para
-- permitir un indice unico por cotizacion sin eliminar historial.
update public.tasks
set
  metadata = coalesce(metadata, '{}'::jsonb)
    - 'source'
    || jsonb_build_object('previous_source', 'cotizaciones'),
  updated_at = now()
where metadata ->> 'sync_state' = 'duplicate_cancelled'
  and metadata ->> 'source' = 'cotizaciones';

-- Una sola actividad administrada por sincronizacion para cada cotizacion.
create unique index if not exists ux_tasks_cotizaciones_sync_quote
  on public.tasks (quote_id)
  where quote_id is not null
    and metadata ->> 'source' = 'cotizaciones';

comment on index public.ux_tasks_cotizaciones_sync_quote is
  '0043: impide duplicar la actividad sincronizada desde una cotizacion.';

-- ----------------------------------------------------------------------------
-- 3. Funcion central de sincronizacion por cotizacion
-- ----------------------------------------------------------------------------
create or replace function public.sync_quote_to_agenda(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q public.cotizaciones%rowtype;
  existing_task_id uuid;
  result_task_id uuid;
  normalized_action text;
  should_sync boolean;
  desired_status text;
begin
  select *
  into q
  from public.cotizaciones
  where id = p_quote_id;

  -- Si la fila fue eliminada fisicamente, no se crea una actividad nueva.
  if not found then
    update public.tasks
    set
      status = 'cancelled',
      completed_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'sync_state', 'source_deleted',
        'sync_version', '0043',
        'synced_at', now()
      ),
      updated_at = now()
    where quote_id = p_quote_id
      and metadata ->> 'source' = 'cotizaciones'
    returning id into result_task_id;

    return result_task_id;
  end if;

  normalized_action := nullif(btrim(coalesce(q.proxima_accion, '')), '');
  should_sync := q.deleted_at is null
    and (normalized_action is not null or q.fecha_proximo_seguimiento is not null);

  select id
  into existing_task_id
  from public.tasks
  where quote_id = q.id
    and metadata ->> 'source' = 'cotizaciones'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  -- Si ya no existe una proxima accion util, se conserva historial y se cancela.
  if not should_sync then
    if existing_task_id is not null then
      update public.tasks
      set
        status = 'cancelled',
        completed_at = null,
        organization_id = q.organization_id,
        contacto_id = q.contacto_id,
        responsable_id = q.ejecutivo_responsable_id,
        fecha_hora_vencimiento = coalesce(q.fecha_proximo_seguimiento, created_at, now()),
        assigned_to = q.ejecutivo_responsable_id,
        contact_id = q.contacto_id,
        company_id = q.empresa_id,
        project_id = q.proyecto_id,
        opportunity_id = q.oportunidad_id,
        due_at = q.fecha_proximo_seguimiento,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'cotizaciones',
          'source_id', q.id,
          'source_field', 'proxima_accion',
          'sync_version', '0043',
          'sync_state', case
            when q.deleted_at is not null then 'source_archived'
            else 'no_next_action'
          end,
          'synced_at', now()
        ),
        updated_at = now()
      where id = existing_task_id
      returning id into result_task_id;
    end if;

    return result_task_id;
  end if;

  -- Una actividad cancelada por sincronizacion vuelve a pendiente cuando la
  -- cotizacion recupera accion o fecha. Los estados gestionados manualmente se
  -- respetan, salvo cancelaciones originadas por la propia sincronizacion.
  desired_status := 'pending';

  if existing_task_id is not null then
    update public.tasks
    set
      titulo = coalesce(normalized_action, 'Seguimiento de cotizacion'),
      title = coalesce(normalized_action, 'Seguimiento de cotizacion'),
      tipo = 'seguimiento',
      prioridad = 'media',
      fecha_hora_vencimiento = coalesce(q.fecha_proximo_seguimiento, fecha_hora_vencimiento, now()),
      contacto_id = q.contacto_id,
      responsable_id = q.ejecutivo_responsable_id,
      idempotency_key = 'quote-followup:' || q.id::text,
      description = case
        when normalized_action is not null
          then 'Proxima accion de la cotizacion: ' || normalized_action
        else 'Seguimiento comercial asociado a la cotizacion.'
      end,
      task_type = 'quote_review',
      status = case
        when status = 'cancelled'
          and coalesce(metadata ->> 'sync_state', '') in (
            'source_archived', 'source_deleted', 'no_next_action'
          ) then desired_status
        else status
      end,
      completed_at = case
        when status = 'cancelled'
          and coalesce(metadata ->> 'sync_state', '') in (
            'source_archived', 'source_deleted', 'no_next_action'
          ) then null
        else completed_at
      end,
      organization_id = q.organization_id,
      assigned_to = q.ejecutivo_responsable_id,
      contact_id = q.contacto_id,
      company_id = q.empresa_id,
      project_id = q.proyecto_id,
      opportunity_id = q.oportunidad_id,
      quote_id = q.id,
      due_at = q.fecha_proximo_seguimiento,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'cotizaciones',
        'source_id', q.id,
        'source_field', 'proxima_accion',
        'sync_version', '0043',
        'sync_state', 'active',
        'synced_at', now()
      ),
      updated_at = now()
    where id = existing_task_id
    returning id into result_task_id;

    return result_task_id;
  end if;

  insert into public.tasks (
    titulo,
    title,
    tipo,
    prioridad,
    fecha_hora_vencimiento,
    contacto_id,
    responsable_id,
    idempotency_key,
    description,
    task_type,
    status,
    priority,
    due_at,
    organization_id,
    assigned_to,
    contact_id,
    company_id,
    project_id,
    opportunity_id,
    quote_id,
    metadata
  )
  values (
    coalesce(normalized_action, 'Seguimiento de cotizacion'),
    coalesce(normalized_action, 'Seguimiento de cotizacion'),
    'seguimiento',
    'media',
    coalesce(q.fecha_proximo_seguimiento, now()),
    q.contacto_id,
    q.ejecutivo_responsable_id,
    'quote-followup:' || q.id::text,
    case
      when normalized_action is not null
        then 'Proxima accion de la cotizacion: ' || normalized_action
      else 'Seguimiento comercial asociado a la cotizacion.'
    end,
    'quote_review',
    desired_status,
    'medium',
    q.fecha_proximo_seguimiento,
    q.organization_id,
    q.ejecutivo_responsable_id,
    q.contacto_id,
    q.empresa_id,
    q.proyecto_id,
    q.oportunidad_id,
    q.id,
    jsonb_build_object(
      'source', 'cotizaciones',
      'source_id', q.id,
      'source_field', 'proxima_accion',
      'sync_version', '0043',
      'sync_state', 'active',
      'schema_compatibility', 'historico_v4',
      'synced_at', now()
    )
  )
  on conflict (quote_id)
    where quote_id is not null
      and metadata ->> 'source' = 'cotizaciones'
  do update set
    titulo = excluded.titulo,
    title = excluded.title,
    tipo = excluded.tipo,
    prioridad = excluded.prioridad,
    fecha_hora_vencimiento = excluded.fecha_hora_vencimiento,
    contacto_id = excluded.contacto_id,
    responsable_id = excluded.responsable_id,
    idempotency_key = excluded.idempotency_key,
    description = excluded.description,
    task_type = excluded.task_type,
    due_at = excluded.due_at,
    organization_id = excluded.organization_id,
    assigned_to = excluded.assigned_to,
    contact_id = excluded.contact_id,
    company_id = excluded.company_id,
    project_id = excluded.project_id,
    opportunity_id = excluded.opportunity_id,
    metadata = coalesce(public.tasks.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now()
  returning id into result_task_id;

  return result_task_id;
end;
$$;

comment on function public.sync_quote_to_agenda(uuid) is
  '0043: crea o actualiza una actividad de Agenda desde la proxima accion de una cotizacion.';

-- Uso interno desde trigger y administracion. No se expone al rol anon.
revoke all on function public.sync_quote_to_agenda(uuid) from public;
grant execute on function public.sync_quote_to_agenda(uuid) to authenticated;
grant execute on function public.sync_quote_to_agenda(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Funcion trigger para sincronizacion futura
-- ----------------------------------------------------------------------------
create or replace function public.trg_sync_quote_to_agenda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    update public.tasks
    set
      status = 'cancelled',
      completed_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'cotizaciones',
        'source_id', old.id,
        'source_field', 'proxima_accion',
        'sync_version', '0043',
        'sync_state', 'source_deleted',
        'synced_at', now()
      ),
      updated_at = now()
    where quote_id = old.id
      and metadata ->> 'source' = 'cotizaciones';

    return old;
  end if;

  perform public.sync_quote_to_agenda(new.id);
  return new;
end;
$$;

comment on function public.trg_sync_quote_to_agenda() is
  '0043: trigger de sincronizacion Cotizaciones -> Agenda.';

revoke all on function public.trg_sync_quote_to_agenda() from public;

-- El trigger solo escucha columnas que afectan Agenda. No se dispara por
-- cambios de items, valores, estado documental u otros datos oficiales.
drop trigger if exists trg_0043_sync_quote_to_agenda on public.cotizaciones;
create trigger trg_0043_sync_quote_to_agenda
after insert or update of
  proxima_accion,
  fecha_proximo_seguimiento,
  ejecutivo_responsable_id,
  contacto_id,
  empresa_id,
  proyecto_id,
  oportunidad_id,
  deleted_at
or delete
on public.cotizaciones
for each row
execute function public.trg_sync_quote_to_agenda();

-- ----------------------------------------------------------------------------
-- 5. Migracion inicial de cotizaciones activas existentes
--    La funcion es idempotente: actualiza o crea una sola tarea por cotizacion.
-- ----------------------------------------------------------------------------
do $$
declare
  quote_record record;
begin
  for quote_record in
    select id
    from public.cotizaciones
    where deleted_at is null
      and (
        nullif(btrim(coalesce(proxima_accion, '')), '') is not null
        or fecha_proximo_seguimiento is not null
      )
    order by id
  loop
    perform public.sync_quote_to_agenda(quote_record.id);
  end loop;
end;
$$;

-- Cancela tareas sincronizadas cuyo origen ya no califica o fue archivado.
update public.tasks t
set
  status = 'cancelled',
  completed_at = null,
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'sync_version', '0043',
    'sync_state', case
      when q.id is null then 'source_deleted'
      when q.deleted_at is not null then 'source_archived'
      else 'no_next_action'
    end,
    'synced_at', now()
  ),
  updated_at = now()
from (
  select existing.quote_id, c.id, c.deleted_at, c.proxima_accion,
         c.fecha_proximo_seguimiento
  from (
    select distinct quote_id
    from public.tasks
    where quote_id is not null
      and metadata ->> 'source' = 'cotizaciones'
  ) existing
  left join public.cotizaciones c on c.id = existing.quote_id
) q
where t.quote_id = q.quote_id
  and t.metadata ->> 'source' = 'cotizaciones'
  and (
    q.id is null
    or q.deleted_at is not null
    or (
      nullif(btrim(coalesce(q.proxima_accion, '')), '') is null
      and q.fecha_proximo_seguimiento is null
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Vista de verificacion operativa
-- ----------------------------------------------------------------------------
create or replace view public.agenda_quote_sync_status
with (security_invoker = true)
as
select
  c.id as quote_id,
  c.proxima_accion,
  c.fecha_proximo_seguimiento,
  c.organization_id,
  c.ejecutivo_responsable_id,
  c.contacto_id,
  c.empresa_id,
  c.proyecto_id,
  c.oportunidad_id,
  c.deleted_at,
  t.id as task_id,
  t.titulo as legacy_task_title,
  t.title as task_title,
  t.tipo as legacy_task_type,
  t.fecha_hora_vencimiento as legacy_due_at,
  t.contacto_id as legacy_contact_id,
  t.responsable_id as legacy_responsible_id,
  t.idempotency_key,
  t.status as task_status,
  t.due_at as task_due_at,
  t.metadata ->> 'sync_state' as sync_state,
  t.updated_at as task_updated_at,
  case
    when c.deleted_at is not null then 'ARCHIVED_SOURCE'
    when nullif(btrim(coalesce(c.proxima_accion, '')), '') is null
      and c.fecha_proximo_seguimiento is null then 'NO_ACTION_REQUIRED'
    when t.id is null then 'MISSING_TASK'
    when t.quote_id = c.id
      and t.organization_id is not distinct from c.organization_id
      and t.contacto_id is not distinct from c.contacto_id
      and t.responsable_id is not distinct from c.ejecutivo_responsable_id
      and t.fecha_hora_vencimiento is not null
      and t.idempotency_key = 'quote-followup:' || c.id::text
      and t.opportunity_id is not distinct from c.oportunidad_id
      and t.project_id is not distinct from c.proyecto_id
      and t.contact_id is not distinct from c.contacto_id
      and t.company_id is not distinct from c.empresa_id
      and t.assigned_to is not distinct from c.ejecutivo_responsable_id
      and t.due_at is not distinct from c.fecha_proximo_seguimiento
      then 'SYNCED'
    else 'REVIEW'
  end as sync_status
from public.cotizaciones c
left join public.tasks t
  on t.quote_id = c.id
 and t.metadata ->> 'source' = 'cotizaciones';

grant select on public.agenda_quote_sync_status to authenticated;

comment on view public.agenda_quote_sync_status is
  '0043: diagnostico de sincronizacion entre cotizaciones y actividades de Agenda.';

commit;

-- ============================================================================
-- 7. VERIFICACION FINAL - SOLO LECTURA
-- Debe devolver migration_status = OK y missing_tasks = 0.
-- ============================================================================
with source_summary as (
  select count(*)::bigint as eligible_quotes
  from public.cotizaciones
  where deleted_at is null
    and (
      nullif(btrim(coalesce(proxima_accion, '')), '') is not null
      or fecha_proximo_seguimiento is not null
    )
), task_summary as (
  select count(*)::bigint as synchronized_tasks
  from public.tasks
  where metadata ->> 'source' = 'cotizaciones'
    and coalesce(metadata ->> 'sync_state', '') = 'active'
), status_summary as (
  select count(*) filter (where sync_status = 'MISSING_TASK')::bigint as missing_tasks,
         count(*) filter (where sync_status = 'REVIEW')::bigint as review_tasks
  from public.agenda_quote_sync_status
)
select
  '0043_agenda_quotes_integration'::text as migration,
  case
    when to_regprocedure('public.sync_quote_to_agenda(uuid)') is null then 'REVISAR_FUNCION'
    when not exists (
      select 1 from pg_trigger
      where tgname = 'trg_0043_sync_quote_to_agenda'
        and not tgisinternal
    ) then 'REVISAR_TRIGGER'
    when ss.missing_tasks > 0 then 'REVISAR_TAREAS_FALTANTES'
    else 'OK'
  end as migration_status,
  src.eligible_quotes,
  ts.synchronized_tasks,
  ss.missing_tasks,
  ss.review_tasks,
  now() as verified_at
from source_summary src
cross join task_summary ts
cross join status_summary ss;

-- Detalle adicional: idealmente solo SYNCED, NO_ACTION_REQUIRED o ARCHIVED_SOURCE.
select
  sync_status,
  count(*) as records
from public.agenda_quote_sync_status
group by sync_status
order by sync_status;
