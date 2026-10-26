-- ============================================================================
-- 0042_agenda_foundation.sql
-- CRM Thermikhaus - Bloque D / D1-D2: Fundacion de Agenda
--
-- Objetivo:
--   1. Reutilizar public.tasks si ya existe.
--   2. Crear public.tasks si aun no existe.
--   3. Agregar de forma idempotente las columnas necesarias para Agenda.
--   4. Evitar el error anterior cuando task_type no existe.
--   5. Incorporar indices, actualizacion automatica de updated_at y RLS.
--
-- Importante:
--   - No elimina tareas ni modifica cotizaciones.
--   - Puede ejecutarse nuevamente sin duplicar objetos.
--   - Los vinculos comerciales son opcionales y no alteran sus tablas origen.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Funcion comun para mantener updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Tabla base. Si public.tasks ya existe, esta sentencia no la reemplaza.
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Evolucion no destructiva de public.tasks
--    Cada columna se agrega solo cuando falta.
-- ----------------------------------------------------------------------------
alter table public.tasks
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists task_type text,
  add column if not exists status text,
  add column if not exists priority text,
  add column if not exists start_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists all_day boolean,
  add column if not exists assigned_to uuid,
  add column if not exists created_by uuid,
  add column if not exists contact_id uuid,
  add column if not exists company_id uuid,
  add column if not exists project_id uuid,
  add column if not exists opportunity_id uuid,
  add column if not exists quote_id uuid,
  add column if not exists google_event_id text,
  add column if not exists google_calendar_id text,
  add column if not exists google_sync_status text,
  add column if not exists google_synced_at timestamptz,
  add column if not exists reminder_at timestamptz,
  add column if not exists notes text,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- Valores por defecto para filas nuevas. No se sobrescriben datos existentes.
alter table public.tasks alter column task_type set default 'follow_up';
alter table public.tasks alter column status set default 'pending';
alter table public.tasks alter column priority set default 'medium';
alter table public.tasks alter column all_day set default false;
alter table public.tasks alter column google_sync_status set default 'not_synced';
alter table public.tasks alter column metadata set default '{}'::jsonb;
alter table public.tasks alter column created_at set default now();
alter table public.tasks alter column updated_at set default now();

-- Completa unicamente valores nulos requeridos por la nueva Agenda.
update public.tasks
set
  title = coalesce(nullif(btrim(title), ''), 'Tarea sin titulo'),
  task_type = coalesce(nullif(btrim(task_type), ''), 'follow_up'),
  status = coalesce(nullif(btrim(status), ''), 'pending'),
  priority = coalesce(nullif(btrim(priority), ''), 'medium'),
  all_day = coalesce(all_day, false),
  google_sync_status = coalesce(nullif(btrim(google_sync_status), ''), 'not_synced'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now())
where
  title is null or btrim(title) = ''
  or task_type is null or btrim(task_type) = ''
  or status is null or btrim(status) = ''
  or priority is null or btrim(priority) = ''
  or all_day is null
  or google_sync_status is null or btrim(google_sync_status) = ''
  or metadata is null
  or created_at is null
  or updated_at is null;

-- Las columnas esenciales quedan protegidas una vez saneados los nulos.
alter table public.tasks alter column title set not null;
alter table public.tasks alter column task_type set not null;
alter table public.tasks alter column status set not null;
alter table public.tasks alter column priority set not null;
alter table public.tasks alter column all_day set not null;
alter table public.tasks alter column google_sync_status set not null;
alter table public.tasks alter column metadata set not null;
alter table public.tasks alter column created_at set not null;
alter table public.tasks alter column updated_at set not null;

comment on column public.tasks.task_type is
  'Valores UI sugeridos: follow_up, call, meeting, email, visit, quote_review, other.';
comment on column public.tasks.status is
  'Valores UI sugeridos: pending, in_progress, completed, cancelled.';
comment on column public.tasks.priority is
  'Valores UI sugeridos: low, medium, high, urgent.';
comment on column public.tasks.google_sync_status is
  'Valores UI sugeridos: not_synced, pending, synced, error.';
comment on column public.tasks.quote_id is
  'Vinculo opcional con cotizacion importada. La cotizacion permanece en solo lectura.';

-- ----------------------------------------------------------------------------
-- 4. Integridad segura que no depende de tablas comerciales externas
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_due_after_start_chk'
  ) then
    alter table public.tasks
      add constraint tasks_due_after_start_chk
      check (due_at is null or start_at is null or due_at >= start_at) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_completed_at_status_chk'
  ) then
    alter table public.tasks
      add constraint tasks_completed_at_status_chk
      check (status = 'completed' or completed_at is null) not valid;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Indices para agenda, ficha 360 y futuras sincronizaciones
-- ----------------------------------------------------------------------------
create index if not exists idx_tasks_due_at
  on public.tasks (due_at);
create index if not exists idx_tasks_start_at
  on public.tasks (start_at);
create index if not exists idx_tasks_status_due_at
  on public.tasks (status, due_at);
create index if not exists idx_tasks_assigned_to_status_due_at
  on public.tasks (assigned_to, status, due_at);
create index if not exists idx_tasks_opportunity_id
  on public.tasks (opportunity_id)
  where opportunity_id is not null;
create index if not exists idx_tasks_contact_id
  on public.tasks (contact_id)
  where contact_id is not null;
create index if not exists idx_tasks_company_id
  on public.tasks (company_id)
  where company_id is not null;
create index if not exists idx_tasks_project_id
  on public.tasks (project_id)
  where project_id is not null;
create index if not exists idx_tasks_quote_id
  on public.tasks (quote_id)
  where quote_id is not null;
create unique index if not exists ux_tasks_google_event
  on public.tasks (google_calendar_id, google_event_id)
  where google_calendar_id is not null and google_event_id is not null;

-- ----------------------------------------------------------------------------
-- 6. Trigger updated_at
-- ----------------------------------------------------------------------------
drop trigger if exists trg_tasks_set_updated_at on public.tasks;
create trigger trg_tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. RLS y politicas de acceso autenticado
--    Se mantienen amplias en la fundacion; la administracion granular se cierra
--    en el Bloque G segun roles definitivos.
-- ----------------------------------------------------------------------------
alter table public.tasks enable row level security;

drop policy if exists tasks_authenticated_select on public.tasks;
create policy tasks_authenticated_select
on public.tasks
for select
to authenticated
using (true);

drop policy if exists tasks_authenticated_insert on public.tasks;
create policy tasks_authenticated_insert
on public.tasks
for insert
to authenticated
with check (true);

drop policy if exists tasks_authenticated_update on public.tasks;
create policy tasks_authenticated_update
on public.tasks
for update
to authenticated
using (true)
with check (true);

drop policy if exists tasks_authenticated_delete on public.tasks;
create policy tasks_authenticated_delete
on public.tasks
for delete
to authenticated
using (true);

-- Permisos de tabla para usuarios autenticados.
grant select, insert, update, delete on public.tasks to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Vista operativa para Agenda
-- ----------------------------------------------------------------------------
create or replace view public.agenda_items
with (security_invoker = true)
as
select
  t.id,
  t.title,
  t.description,
  t.task_type,
  t.status,
  t.priority,
  t.start_at,
  t.due_at,
  t.completed_at,
  t.all_day,
  t.reminder_at,
  t.assigned_to,
  t.created_by,
  t.contact_id,
  t.company_id,
  t.project_id,
  t.opportunity_id,
  t.quote_id,
  t.google_event_id,
  t.google_calendar_id,
  t.google_sync_status,
  t.google_synced_at,
  t.notes,
  t.metadata,
  t.created_at,
  t.updated_at,
  case
    when t.status not in ('completed', 'cancelled')
      and t.due_at is not null
      and t.due_at < now()
    then true
    else false
  end as is_overdue
from public.tasks t;

grant select on public.agenda_items to authenticated;

commit;

-- ============================================================================
-- VERIFICACION FINAL (solo lectura)
-- Debe devolver una fila con migration_status = 'OK'.
-- ============================================================================
select
  case
    when to_regclass('public.tasks') is not null
     and to_regclass('public.agenda_items') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'tasks'
         and column_name = 'task_type'
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'tasks'
         and column_name = 'due_at'
     )
    then 'OK'
    else 'REVISAR'
  end as migration_status,
  to_regclass('public.tasks') as tasks_table,
  to_regclass('public.agenda_items') as agenda_view;
