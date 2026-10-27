-- ============================================================================
-- 0044_agenda_contract_bridge.sql
-- CRM Thermikhaus | Bloque D | Puente definitivo de contrato de Agenda
-- Fecha: 2026-10-27
-- Revision final: respeta tasks_completed_at_status_chk y corrige consulta final
--
-- OBJETIVO
--   1. Respaldar el estado actual de public.tasks.
--   2. Reconciliar contrato historico (espanol) y contrato nuevo (ingles).
--   3. Mantener ambos contratos sincronizados durante la transicion.
--   4. Unificar campos de Google Calendar.
--   5. Eliminar solamente las cuatro politicas RLS abiertas de 0042.
--
-- IMPORTANTE
--   - No elimina columnas ni tareas.
--   - No vuelve a ejecutar 0042 ni 0043.
--   - El contrato nuevo queda como fuente preferente cuando ambos lados
--     contienen valores distintos; si el lado nuevo esta vacio, se recupera
--     el valor historico.
-- ============================================================================

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- --------------------------------------------------------------------------
-- 1. PRECONDICIONES
-- --------------------------------------------------------------------------
do $migration$
begin
  if to_regclass('public.tasks') is null then
    raise exception '0044: no existe public.tasks';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception '0044: no existe public.profiles';
  end if;

  if to_regclass('public.cotizaciones') is null then
    raise exception '0044: no existe public.cotizaciones';
  end if;
end
$migration$;

-- --------------------------------------------------------------------------
-- 2. RESPALDO INMUTABLE PREVIO A 0044
-- Se guarda fuera de public para no exponerlo por la API de Supabase.
-- --------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.tasks_backup_0044
as table public.tasks with no data;

alter table private.tasks_backup_0044
  add column if not exists backup_0044_at timestamptz;

insert into private.tasks_backup_0044
select t.*, now() as backup_0044_at
from public.tasks t
where not exists (
  select 1
  from private.tasks_backup_0044 b
  where b.id = t.id
);

revoke all on table private.tasks_backup_0044 from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. FUNCIONES DE MAPEO
-- Conservan valores no reconocidos para evitar perdida de informacion.
-- --------------------------------------------------------------------------
create or replace function public.agenda_status_to_new(p_value text)
returns text
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_value, '')))
    when 'pendiente' then 'pending'
    when 'en_curso' then 'in_progress'
    when 'en curso' then 'in_progress'
    when 'en_progreso' then 'in_progress'
    when 'en progreso' then 'in_progress'
    when 'completada' then 'completed'
    when 'completado' then 'completed'
    when 'finalizada' then 'completed'
    when 'finalizado' then 'completed'
    when 'cancelada' then 'cancelled'
    when 'cancelado' then 'cancelled'
    when 'superseded' then 'cancelled'
    when 'reemplazada' then 'cancelled'
    when '' then null
    else lower(btrim(p_value))
  end
$function$;

create or replace function public.agenda_status_to_legacy(p_value text)
returns text
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_value, '')))
    when 'pending' then 'pendiente'
    when 'in_progress' then 'en_curso'
    when 'completed' then 'completada'
    when 'cancelled' then 'cancelada'
    when '' then null
    else lower(btrim(p_value))
  end
$function$;

create or replace function public.agenda_priority_to_new(p_value text)
returns text
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_value, '')))
    when 'baja' then 'low'
    when 'media' then 'medium'
    when 'alta' then 'high'
    when 'urgente' then 'urgent'
    when '' then null
    else lower(btrim(p_value))
  end
$function$;

create or replace function public.agenda_priority_to_legacy(p_value text)
returns text
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_value, '')))
    when 'low' then 'baja'
    when 'medium' then 'media'
    when 'high' then 'alta'
    when 'urgent' then 'urgente'
    when '' then null
    else lower(btrim(p_value))
  end
$function$;

create or replace function public.agenda_type_to_new(p_value text)
returns text
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_value, '')))
    when 'seguimiento' then 'follow_up'
    when 'followup' then 'follow_up'
    when 'follow-up' then 'follow_up'
    when 'llamada' then 'call'
    when 'reunion' then 'meeting'
    when 'reunión' then 'meeting'
    when 'correo' then 'email'
    when 'email' then 'email'
    when 'whatsapp' then 'whatsapp'
    when 'tarea' then 'task'
    when 'otro' then 'other'
    when '' then null
    else lower(btrim(p_value))
  end
$function$;

create or replace function public.agenda_type_to_legacy(p_value text)
returns text
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_value, '')))
    when 'follow_up' then 'seguimiento'
    when 'call' then 'llamada'
    when 'meeting' then 'reunion'
    when 'email' then 'correo'
    when 'whatsapp' then 'whatsapp'
    when 'task' then 'tarea'
    when 'other' then 'otro'
    when '' then null
    else lower(btrim(p_value))
  end
$function$;

-- --------------------------------------------------------------------------
-- 4. NORMALIZACION DE LOS 15 REGISTROS EXISTENTES
-- Regla: lado nuevo preferente si tiene valor; si no, recuperar lado historico.
-- --------------------------------------------------------------------------
update public.tasks t
set
  title = coalesce(nullif(btrim(t.title), ''), t.titulo),
  titulo = coalesce(nullif(btrim(t.title), ''), t.titulo),

  description = coalesce(t.description, t.descripcion),
  descripcion = coalesce(t.description, t.descripcion),

  task_type = coalesce(
    nullif(btrim(t.task_type), ''),
    public.agenda_type_to_new(t.tipo),
    'follow_up'
  ),
  tipo = public.agenda_type_to_legacy(coalesce(
    nullif(btrim(t.task_type), ''),
    public.agenda_type_to_new(t.tipo),
    'follow_up'
  )),

  status = coalesce(
    nullif(btrim(t.status), ''),
    public.agenda_status_to_new(t.estado),
    'pending'
  ),
  estado = public.agenda_status_to_legacy(coalesce(
    nullif(btrim(t.status), ''),
    public.agenda_status_to_new(t.estado),
    'pending'
  )),

  priority = coalesce(
    nullif(btrim(t.priority), ''),
    public.agenda_priority_to_new(t.prioridad),
    'medium'
  ),
  prioridad = public.agenda_priority_to_legacy(coalesce(
    nullif(btrim(t.priority), ''),
    public.agenda_priority_to_new(t.prioridad),
    'medium'
  )),

  start_at = coalesce(t.start_at, t.fecha_inicio),
  fecha_inicio = coalesce(t.start_at, t.fecha_inicio),
  due_at = coalesce(t.due_at, t.fecha_hora_vencimiento),
  fecha_hora_vencimiento = coalesce(t.due_at, t.fecha_hora_vencimiento),
  completed_at = case
    when coalesce(nullif(btrim(t.status), ''), public.agenda_status_to_new(t.estado), 'pending') = 'completed'
      then coalesce(t.completed_at, t.fecha_finalizacion, now())
    else null
  end,
  fecha_finalizacion = case
    when coalesce(nullif(btrim(t.status), ''), public.agenda_status_to_new(t.estado), 'pending') = 'completed'
      then coalesce(t.completed_at, t.fecha_finalizacion, now())
    else null
  end,

  assigned_to = coalesce(t.assigned_to, t.responsable_id),
  responsable_id = coalesce(t.assigned_to, t.responsable_id),
  contact_id = coalesce(t.contact_id, t.contacto_id),
  contacto_id = coalesce(t.contact_id, t.contacto_id),
  company_id = coalesce(t.company_id, t.empresa_id),
  empresa_id = coalesce(t.company_id, t.empresa_id),
  project_id = coalesce(t.project_id, t.proyecto_id),
  proyecto_id = coalesce(t.project_id, t.proyecto_id),
  opportunity_id = coalesce(t.opportunity_id, t.oportunidad_id),
  oportunidad_id = coalesce(t.opportunity_id, t.oportunidad_id),
  quote_id = coalesce(t.quote_id, t.cotizacion_id),
  cotizacion_id = coalesce(t.quote_id, t.cotizacion_id),

  google_synced_at = coalesce(t.google_synced_at, t.google_last_sync_at),
  google_last_sync_at = coalesce(t.google_synced_at, t.google_last_sync_at),
  sincronizado_google = case
    when t.google_event_id is not null
     and coalesce(t.google_sync_status, '') in ('synced', 'success') then true
    else coalesce(t.sincronizado_google, false)
  end,

  idempotency_key = coalesce(
    nullif(btrim(t.idempotency_key), ''),
    'agenda:' || t.id::text
  ),
  origen_registro = coalesce(nullif(btrim(t.origen_registro), ''), 'manual'),
  metadata = coalesce(t.metadata, '{}'::jsonb),
  updated_at = now();

-- El contrato nuevo permite tareas sin contacto. Se conserva la FK, pero se
-- elimina solo la obligatoriedad historica para que la Agenda manual funcione.
alter table public.tasks alter column contacto_id drop not null;

-- Endurece campos centrales del contrato nuevo despues del backfill.
alter table public.tasks alter column due_at set not null;
alter table public.tasks alter column assigned_to set not null;

-- --------------------------------------------------------------------------
-- 5. TRIGGER PUENTE BIDIRECCIONAL
-- En UPDATE detecta que lado cambio y replica ese lado. Si ambos cambiaron,
-- el contrato nuevo tiene precedencia. En INSERT completa ambos contratos.
-- --------------------------------------------------------------------------
create or replace function public.bridge_agenda_task_contracts()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid;
  v_org uuid;
begin
  v_user := auth.uid();

  if tg_op = 'INSERT' then
    new.id := coalesce(new.id, gen_random_uuid());
    new.created_by := coalesce(new.created_by, v_user);
    new.assigned_to := coalesce(new.assigned_to, new.responsable_id, v_user);
    new.responsable_id := coalesce(new.assigned_to, new.responsable_id, v_user);

    if new.organization_id is null then
      begin
        v_org := public.current_org();
      exception when others then
        v_org := null;
      end;
      new.organization_id := v_org;
    end if;

    new.title := coalesce(nullif(btrim(new.title), ''), nullif(btrim(new.titulo), ''));
    new.titulo := new.title;
    new.description := coalesce(new.description, new.descripcion);
    new.descripcion := new.description;

    new.task_type := coalesce(
      nullif(btrim(new.task_type), ''),
      public.agenda_type_to_new(new.tipo),
      'follow_up'
    );
    new.tipo := public.agenda_type_to_legacy(new.task_type);

    new.status := coalesce(
      nullif(btrim(new.status), ''),
      public.agenda_status_to_new(new.estado),
      'pending'
    );
    new.estado := public.agenda_status_to_legacy(new.status);

    new.priority := coalesce(
      nullif(btrim(new.priority), ''),
      public.agenda_priority_to_new(new.prioridad),
      'medium'
    );
    new.prioridad := public.agenda_priority_to_legacy(new.priority);

    new.start_at := coalesce(new.start_at, new.fecha_inicio);
    new.fecha_inicio := new.start_at;
    new.due_at := coalesce(new.due_at, new.fecha_hora_vencimiento);
    new.fecha_hora_vencimiento := new.due_at;
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, new.fecha_finalizacion, now());
      new.fecha_finalizacion := new.completed_at;
    else
      new.completed_at := null;
      new.fecha_finalizacion := null;
    end if;

    new.contact_id := coalesce(new.contact_id, new.contacto_id);
    new.contacto_id := new.contact_id;
    new.company_id := coalesce(new.company_id, new.empresa_id);
    new.empresa_id := new.company_id;
    new.project_id := coalesce(new.project_id, new.proyecto_id);
    new.proyecto_id := new.project_id;
    new.opportunity_id := coalesce(new.opportunity_id, new.oportunidad_id);
    new.oportunidad_id := new.opportunity_id;
    new.quote_id := coalesce(new.quote_id, new.cotizacion_id);
    new.cotizacion_id := new.quote_id;

    new.google_synced_at := coalesce(new.google_synced_at, new.google_last_sync_at);
    new.google_last_sync_at := new.google_synced_at;
    new.sincronizado_google := coalesce(new.sincronizado_google, false)
      or (new.google_event_id is not null
          and coalesce(new.google_sync_status, '') in ('synced', 'success'));

    new.idempotency_key := coalesce(
      nullif(btrim(new.idempotency_key), ''),
      'agenda:' || new.id::text
    );
    new.origen_registro := coalesce(nullif(btrim(new.origen_registro), ''), 'manual');
    new.metadata := coalesce(new.metadata, '{}'::jsonb);

  else
    -- Texto principal.
    if new.title is distinct from old.title then
      new.titulo := new.title;
    elsif new.titulo is distinct from old.titulo then
      new.title := new.titulo;
    end if;

    if new.description is distinct from old.description then
      new.descripcion := new.description;
    elsif new.descripcion is distinct from old.descripcion then
      new.description := new.descripcion;
    end if;

    -- Clasificaciones.
    if new.task_type is distinct from old.task_type then
      new.tipo := public.agenda_type_to_legacy(new.task_type);
    elsif new.tipo is distinct from old.tipo then
      new.task_type := public.agenda_type_to_new(new.tipo);
    end if;

    if new.status is distinct from old.status then
      new.estado := public.agenda_status_to_legacy(new.status);
    elsif new.estado is distinct from old.estado then
      new.status := public.agenda_status_to_new(new.estado);
    end if;

    if new.priority is distinct from old.priority then
      new.prioridad := public.agenda_priority_to_legacy(new.priority);
    elsif new.prioridad is distinct from old.prioridad then
      new.priority := public.agenda_priority_to_new(new.prioridad);
    end if;

    -- Fechas.
    if new.start_at is distinct from old.start_at then
      new.fecha_inicio := new.start_at;
    elsif new.fecha_inicio is distinct from old.fecha_inicio then
      new.start_at := new.fecha_inicio;
    end if;

    if new.due_at is distinct from old.due_at then
      new.fecha_hora_vencimiento := new.due_at;
    elsif new.fecha_hora_vencimiento is distinct from old.fecha_hora_vencimiento then
      new.due_at := new.fecha_hora_vencimiento;
    end if;

    if new.status = 'completed' then
      if new.completed_at is distinct from old.completed_at then
        new.fecha_finalizacion := new.completed_at;
      elsif new.fecha_finalizacion is distinct from old.fecha_finalizacion then
        new.completed_at := new.fecha_finalizacion;
      end if;
      new.completed_at := coalesce(new.completed_at, new.fecha_finalizacion, now());
      new.fecha_finalizacion := new.completed_at;
    else
      new.completed_at := null;
      new.fecha_finalizacion := null;
    end if;

    -- Relaciones.
    if new.assigned_to is distinct from old.assigned_to then
      new.responsable_id := new.assigned_to;
    elsif new.responsable_id is distinct from old.responsable_id then
      new.assigned_to := new.responsable_id;
    end if;

    if new.contact_id is distinct from old.contact_id then
      new.contacto_id := new.contact_id;
    elsif new.contacto_id is distinct from old.contacto_id then
      new.contact_id := new.contacto_id;
    end if;

    if new.company_id is distinct from old.company_id then
      new.empresa_id := new.company_id;
    elsif new.empresa_id is distinct from old.empresa_id then
      new.company_id := new.empresa_id;
    end if;

    if new.project_id is distinct from old.project_id then
      new.proyecto_id := new.project_id;
    elsif new.proyecto_id is distinct from old.proyecto_id then
      new.project_id := new.proyecto_id;
    end if;

    if new.opportunity_id is distinct from old.opportunity_id then
      new.oportunidad_id := new.opportunity_id;
    elsif new.oportunidad_id is distinct from old.oportunidad_id then
      new.opportunity_id := new.oportunidad_id;
    end if;

    if new.quote_id is distinct from old.quote_id then
      new.cotizacion_id := new.quote_id;
    elsif new.cotizacion_id is distinct from old.cotizacion_id then
      new.quote_id := new.cotizacion_id;
    end if;

    -- Google Calendar.
    if new.google_synced_at is distinct from old.google_synced_at then
      new.google_last_sync_at := new.google_synced_at;
    elsif new.google_last_sync_at is distinct from old.google_last_sync_at then
      new.google_synced_at := new.google_last_sync_at;
    end if;

    if new.google_event_id is null then
      new.sincronizado_google := false;
      if new.google_sync_status in ('synced', 'success') then
        new.google_sync_status := 'not_synced';
      end if;
    elsif new.google_sync_status in ('synced', 'success') then
      new.sincronizado_google := true;
    end if;
  end if;

  if new.title is null or btrim(new.title) = '' then
    raise exception '0044: title/titulo es obligatorio';
  end if;
  if new.due_at is null then
    raise exception '0044: due_at/fecha_hora_vencimiento es obligatorio';
  end if;
  if new.assigned_to is null then
    raise exception '0044: assigned_to/responsable_id es obligatorio';
  end if;
  if new.organization_id is null then
    raise exception '0044: organization_id es obligatorio';
  end if;

  return new;
end
$function$;

-- El trigger debe ejecutarse antes del trigger historico de seguimiento.
-- El prefijo alfabetico 0044 garantiza el orden entre triggers BEFORE.
drop trigger if exists trg_0044_bridge_agenda_contracts on public.tasks;
create trigger trg_0044_bridge_agenda_contracts
before insert or update on public.tasks
for each row
execute function public.bridge_agenda_task_contracts();

-- --------------------------------------------------------------------------
-- 6. INDICES PARA EL CONTRATO NUEVO
-- --------------------------------------------------------------------------
create index if not exists idx_tasks_assigned_to_due_at
  on public.tasks (assigned_to, due_at);

create index if not exists idx_tasks_status_due_at
  on public.tasks (status, due_at);

create index if not exists idx_tasks_quote_id
  on public.tasks (quote_id)
  where quote_id is not null;

create unique index if not exists uq_tasks_google_event_bridge
  on public.tasks (google_calendar_id, google_event_id)
  where google_event_id is not null;

-- --------------------------------------------------------------------------
-- 7. RLS: ELIMINAR SOLO POLITICAS ABIERTAS
-- Se conservan tasks_read, tasks_insert, tasks_update y tasks_delete.
-- --------------------------------------------------------------------------
drop policy if exists tasks_authenticated_select on public.tasks;
drop policy if exists tasks_authenticated_insert on public.tasks;
drop policy if exists tasks_authenticated_update on public.tasks;
drop policy if exists tasks_authenticated_delete on public.tasks;

alter table public.tasks enable row level security;

-- --------------------------------------------------------------------------
-- 8. COMENTARIOS DE CONTRATO
-- --------------------------------------------------------------------------
comment on function public.bridge_agenda_task_contracts() is
  '0044: sincroniza el contrato nuevo e historico de public.tasks';
comment on column public.tasks.title is
  'Fuente principal de titulo; sincronizada con titulo por 0044';
comment on column public.tasks.due_at is
  'Fuente principal de vencimiento; sincronizada con fecha_hora_vencimiento por 0044';
comment on column public.tasks.assigned_to is
  'Fuente principal de responsable; sincronizada con responsable_id por 0044';
comment on column public.tasks.quote_id is
  'Fuente principal de cotizacion; sincronizada con cotizacion_id por 0044';
comment on column public.tasks.google_synced_at is
  'Fecha principal de sincronizacion; sincronizada con google_last_sync_at por 0044';

-- --------------------------------------------------------------------------
-- 9. VERIFICACIONES BLOQUEANTES ANTES DEL COMMIT
-- Si alguna falla, PostgreSQL revierte toda la migracion.
-- --------------------------------------------------------------------------
do $verify$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.tasks
  where title is distinct from titulo;
  if v_count <> 0 then
    raise exception '0044: quedan % diferencias title/titulo', v_count;
  end if;

  select count(*) into v_count
  from public.tasks
  where due_at is distinct from fecha_hora_vencimiento;
  if v_count <> 0 then
    raise exception '0044: quedan % diferencias due_at/fecha_hora_vencimiento', v_count;
  end if;

  select count(*) into v_count
  from public.tasks
  where assigned_to is distinct from responsable_id;
  if v_count <> 0 then
    raise exception '0044: quedan % diferencias assigned_to/responsable_id', v_count;
  end if;

  select count(*) into v_count
  from public.tasks
  where contact_id is distinct from contacto_id;
  if v_count <> 0 then
    raise exception '0044: quedan % diferencias contact_id/contacto_id', v_count;
  end if;

  select count(*) into v_count
  from public.tasks
  where quote_id is distinct from cotizacion_id;
  if v_count <> 0 then
    raise exception '0044: quedan % diferencias quote_id/cotizacion_id', v_count;
  end if;

  select count(*) into v_count
  from public.tasks
  where google_synced_at is distinct from google_last_sync_at;
  if v_count <> 0 then
    raise exception '0044: quedan % diferencias de fecha Google', v_count;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname in (
        'tasks_authenticated_select',
        'tasks_authenticated_insert',
        'tasks_authenticated_update',
        'tasks_authenticated_delete'
      )
  ) then
    raise exception '0044: aun existen politicas RLS abiertas';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.tasks'::regclass
      and tgname = 'trg_0044_bridge_agenda_contracts'
      and not tgisinternal
  ) then
    raise exception '0044: no se creo el trigger puente';
  end if;
end
$verify$;

commit;

-- --------------------------------------------------------------------------
-- 10. RESULTADO FINAL DE LA MIGRACION
-- --------------------------------------------------------------------------
select
  '0044_agenda_contract_bridge' as migration,
  count(*) as total_tasks,
  count(*) filter (where title is distinct from titulo) as diff_title,
  count(*) filter (where due_at is distinct from fecha_hora_vencimiento) as diff_due_at,
  count(*) filter (where assigned_to is distinct from responsable_id) as diff_assigned_to,
  count(*) filter (where contact_id is distinct from contacto_id) as diff_contact_id,
  count(*) filter (where quote_id is distinct from cotizacion_id) as diff_quote_id,
  count(*) filter (where google_synced_at is distinct from google_last_sync_at) as diff_google_sync,
  (select count(*) from private.tasks_backup_0044) as backup_rows,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.tasks'::regclass
      and tgname = 'trg_0044_bridge_agenda_contracts'
      and not tgisinternal
  ) as bridge_trigger_ok
from public.tasks;
