begin;

-- =========================================================
-- 0015 - SEGUIMIENTO INICIAL DE COTIZACIONES
-- Crea una tarea inicial idempotente y sincroniza cotizacion/oportunidad.
-- No sincroniza todavia con Google Calendar.
-- =========================================================

create or replace function public.create_initial_quote_followup(
  p_quote_id uuid,
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
  v_org uuid;
  v_user uuid;
  v_role text;
  v_quote public.cotizaciones%rowtype;
  v_task_id uuid;
  v_idempotency_key text;
  v_action text;
  v_priority text;
begin
  v_org := public.current_org();
  v_user := auth.uid();
  v_role := public.app_current_role();

  if v_org is null or v_user is null then
    raise exception 'Sesion no valida';
  end if;

  if v_role not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No esta autorizado para programar seguimientos';
  end if;

  v_action := nullif(trim(p_action), '');

  if v_action is null then
    raise exception 'La primera accion es obligatoria';
  end if;

  if p_due_at is null or p_due_at <= now() then
    raise exception 'La fecha del seguimiento debe ser futura';
  end if;

  v_priority := lower(trim(coalesce(p_priority, 'alta')));

  if v_priority not in ('baja', 'media', 'alta', 'urgente') then
    raise exception 'Prioridad no valida';
  end if;

  if p_reminder_minutes is not null and p_reminder_minutes < 0 then
    raise exception 'El recordatorio no puede ser negativo';
  end if;

  select *
  into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = v_org
    and deleted_at is null
  for update;

  if v_quote.id is null then
    raise exception 'Cotizacion no encontrada';
  end if;

  if v_quote.contacto_id is null then
    raise exception 'La cotizacion no tiene un contacto vinculado';
  end if;

  if v_quote.ejecutivo_responsable_id is null then
    raise exception 'La cotizacion no tiene un responsable asignado';
  end if;

  v_idempotency_key := 'quote-initial-followup:' || v_quote.id::text;

  select id
  into v_task_id
  from public.tasks
  where idempotency_key = v_idempotency_key
  limit 1;

  if v_task_id is null then
    insert into public.tasks (
      organization_id,
      titulo,
      descripcion,
      contacto_id,
      empresa_id,
      oportunidad_id,
      proyecto_id,
      cotizacion_id,
      responsable_id,
      tipo,
      prioridad,
      fecha_inicio,
      fecha_hora_vencimiento,
      estado,
      recordatorio_minutos,
      sincronizado_google,
      google_sync_status,
      idempotency_key,
      origen_registro
    ) values (
      v_org,
      'Primer seguimiento Cotizacion N.º ' || v_quote.numero_cotizacion,
      v_action,
      v_quote.contacto_id,
      v_quote.empresa_id,
      v_quote.oportunidad_id,
      v_quote.proyecto_id,
      v_quote.id,
      v_quote.ejecutivo_responsable_id,
      'seguimiento_comercial',
      v_priority,
      now(),
      p_due_at,
      'pendiente',
      p_reminder_minutes,
      false,
      'pendiente',
      v_idempotency_key,
      'cotizacion_importada'
    )
    returning id into v_task_id;
  else
    update public.tasks
    set titulo = 'Primer seguimiento Cotizacion N.º ' || v_quote.numero_cotizacion,
        descripcion = v_action,
        contacto_id = v_quote.contacto_id,
        empresa_id = v_quote.empresa_id,
        oportunidad_id = v_quote.oportunidad_id,
        proyecto_id = v_quote.proyecto_id,
        cotizacion_id = v_quote.id,
        responsable_id = v_quote.ejecutivo_responsable_id,
        tipo = 'seguimiento_comercial',
        prioridad = v_priority,
        fecha_hora_vencimiento = p_due_at,
        estado = case
          when estado in ('completada', 'cancelada') then estado
          else 'pendiente'
        end,
        recordatorio_minutos = p_reminder_minutes,
        sincronizado_google = false,
        google_sync_status = 'pendiente',
        google_sync_error = null,
        updated_at = now()
    where id = v_task_id;
  end if;

  update public.cotizaciones
  set proxima_accion = v_action,
      fecha_proximo_seguimiento = p_due_at,
      updated_at = now()
  where id = v_quote.id;

  if v_quote.oportunidad_id is not null then
    update public.oportunidades
    set proxima_accion = v_action,
        fecha_proxima_accion = p_due_at,
        updated_at = now()
    where id = v_quote.oportunidad_id
      and organization_id = v_org;
  end if;

  return jsonb_build_object(
    'success', true,
    'task_id', v_task_id,
    'quote_id', v_quote.id,
    'action', v_action,
    'due_at', p_due_at,
    'priority', v_priority,
    'idempotency_key', v_idempotency_key
  );
end;
$function$;

revoke all on function public.create_initial_quote_followup(
  uuid,
  text,
  timestamptz,
  text,
  integer
) from public;

grant execute on function public.create_initial_quote_followup(
  uuid,
  text,
  timestamptz,
  text,
  integer
) to authenticated;

commit;
