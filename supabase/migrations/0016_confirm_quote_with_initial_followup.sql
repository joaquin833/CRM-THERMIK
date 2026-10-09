begin;

-- =========================================================
-- 0016 - CONFIRMAR COTIZACION CON SEGUIMIENTO INICIAL
-- Une la confirmacion del PDF y la primera tarea en una sola transaccion.
-- Si falla el seguimiento, tambien se revierte la confirmacion.
-- =========================================================

create or replace function public.confirm_quote_pdf_import_with_followup(
  p_import_id uuid,
  p_action text,
  p_due_at timestamptz,
  p_priority text default 'alta',
  p_reminder_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_confirmation jsonb;
  v_followup jsonb;
  v_quote_id uuid;
begin
  if nullif(trim(p_action), '') is null then
    raise exception 'La primera accion es obligatoria';
  end if;

  if p_due_at is null or p_due_at <= now() then
    raise exception 'La fecha del seguimiento debe ser futura';
  end if;

  -- Confirma la importacion o devuelve la cotizacion ya confirmada.
  v_confirmation := public.confirm_quote_pdf_import(p_import_id);
  v_quote_id := nullif(v_confirmation ->> 'quote_id', '')::uuid;

  if v_quote_id is null then
    raise exception 'La confirmacion no devolvio una cotizacion';
  end if;

  -- Crea o actualiza la tarea inicial usando su clave idempotente.
  v_followup := public.create_initial_quote_followup(
    v_quote_id,
    p_action,
    p_due_at,
    p_priority,
    p_reminder_minutes
  );

  return v_confirmation || jsonb_build_object(
    'followup', v_followup,
    'initial_followup_created', true
  );
end;
$function$;

revoke all on function public.confirm_quote_pdf_import_with_followup(
  uuid,
  text,
  timestamptz,
  text,
  integer
) from public;

grant execute on function public.confirm_quote_pdf_import_with_followup(
  uuid,
  text,
  timestamptz,
  text,
  integer
) to authenticated;

commit;
