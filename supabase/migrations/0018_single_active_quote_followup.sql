begin;

-- =========================================================
-- 0018 - UNA SOLA PROXIMA TAREA COMERCIAL POR COTIZACION
-- Mantiene muchas actividades historicas, pero solo una tarea activa.
-- =========================================================

create or replace function public.is_quote_followup_task(p_type text)
returns boolean
language sql
immutable
as $function$
  select lower(trim(coalesce(p_type, ''))) in (
    'seguimiento de cotizacion',
    'seguimiento_comercial'
  );
$function$;

create or replace function public.supersede_active_quote_followups()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.cotizacion_id is null
     or new.estado not in ('pendiente', 'en_curso')
     or not public.is_quote_followup_task(new.tipo) then
    return new;
  end if;

  update public.tasks
  set estado = 'cancelada',
      descripcion = concat_ws(
        E'\n',
        nullif(trim(descripcion), ''),
        'Reemplazada automáticamente por una nueva próxima acción comercial.'
      ),
      fecha_finalizacion = coalesce(fecha_finalizacion, now()),
      google_sync_status = case
        when google_event_id is not null then 'pendiente_cancelacion'
        else google_sync_status
      end,
      sincronizado_google = false,
      updated_at = now()
  where cotizacion_id = new.cotizacion_id
    and organization_id = new.organization_id
    and id <> new.id
    and estado in ('pendiente', 'en_curso')
    and public.is_quote_followup_task(tipo);

  return new;
end;
$function$;

drop trigger if exists trg_single_active_quote_followup on public.tasks;

create trigger trg_single_active_quote_followup
before insert or update of estado, fecha_hora_vencimiento, cotizacion_id
on public.tasks
for each row
execute function public.supersede_active_quote_followups();

-- Normaliza duplicados existentes. Conserva la tarea que mejor coincide con
-- la fecha vigente de la cotizacion; en empate, conserva la mas actualizada.
with ranked as (
  select
    t.id,
    row_number() over (
      partition by t.organization_id, t.cotizacion_id
      order by
        case
          when c.fecha_proximo_seguimiento is not null
           and abs(extract(epoch from (
             t.fecha_hora_vencimiento - c.fecha_proximo_seguimiento
           ))) < 60
          then 0
          else 1
        end,
        t.updated_at desc,
        t.created_at desc
    ) as position
  from public.tasks t
  join public.cotizaciones c
    on c.id = t.cotizacion_id
   and c.organization_id = t.organization_id
  where t.cotizacion_id is not null
    and t.estado in ('pendiente', 'en_curso')
    and public.is_quote_followup_task(t.tipo)
)
update public.tasks t
set estado = 'cancelada',
    descripcion = concat_ws(
      E'\n',
      nullif(trim(t.descripcion), ''),
      'Cancelada durante la normalización: existía otra próxima acción activa.'
    ),
    fecha_finalizacion = coalesce(t.fecha_finalizacion, now()),
    google_sync_status = case
      when t.google_event_id is not null then 'pendiente_cancelacion'
      else t.google_sync_status
    end,
    sincronizado_google = false,
    updated_at = now()
from ranked r
where r.id = t.id
  and r.position > 1;

-- Refuerzo a nivel de base de datos. Impide que una operación futura,
-- incluso fuera del CRM, deje dos seguimientos comerciales activos.
create unique index if not exists tasks_one_active_quote_followup_idx
on public.tasks (organization_id, cotizacion_id)
where cotizacion_id is not null
  and estado in ('pendiente', 'en_curso')
  and lower(trim(tipo)) in (
    'seguimiento de cotizacion',
    'seguimiento_comercial'
  );

comment on index public.tasks_one_active_quote_followup_idx is
  'Garantiza una sola proxima tarea comercial activa por cotizacion.';

commit;
