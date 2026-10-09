begin;

-- =========================================================
-- 0017 - ACCIONES COMERCIALES CONTROLADAS DE COTIZACIONES
-- Envio, recepcion y cierre comercial sin modificar datos oficiales.
-- =========================================================

create or replace function public.mark_quote_sent_controlled(
  p_quote_id uuid,
  p_channel text,
  p_sent_at timestamptz,
  p_comment text,
  p_next_action text,
  p_next_at timestamptz,
  p_priority text default 'alta'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
  v_activity_id uuid;
  v_task_id uuid;
  v_channel text;
begin
  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then raise exception 'Cotizacion no encontrada o no autorizada'; end if;
  if not public.can_write_owner(v_quote.ejecutivo_responsable_id) then raise exception 'No esta autorizado para gestionar esta cotizacion'; end if;

  v_channel := trim(coalesce(p_channel, ''));
  if v_channel not in ('Correo', 'WhatsApp', 'Entrega personal', 'Portal externo', 'Otro') then raise exception 'Canal de envio no valido'; end if;
  if nullif(trim(p_next_action), '') is null or p_next_at is null then raise exception 'Debe registrar la proxima accion y su fecha'; end if;
  if p_next_at <= now() then raise exception 'La fecha del proximo seguimiento debe ser futura'; end if;
  if lower(p_priority) not in ('baja','media','alta','urgente') then raise exception 'Prioridad no valida'; end if;

  update public.cotizaciones
  set estado_comercial = 'Enviada',
      fecha_envio_cliente = coalesce(p_sent_at, now()),
      ultima_actividad_at = now(),
      proxima_accion = trim(p_next_action),
      fecha_proximo_seguimiento = p_next_at,
      updated_at = now()
  where id = v_quote.id;

  update public.oportunidades
  set etapa_comercial = 'Cotizacion enviada',
      ultima_actividad_at = now(),
      proxima_accion = trim(p_next_action),
      fecha_proxima_accion = p_next_at,
      updated_at = now()
  where id = v_quote.oportunidad_id
    and organization_id = v_quote.organization_id;

  insert into public.activities (
    organization_id, contacto_id, empresa_id, oportunidad_id, proyecto_id,
    cotizacion_id, tipo_actividad, fecha_hora_inicio, estado, resultado,
    descripcion, proxima_accion, fecha_proxima_accion,
    ejecutivo_responsable_id, origen_registro, created_by
  ) values (
    v_quote.organization_id, v_quote.contacto_id, v_quote.empresa_id,
    v_quote.oportunidad_id, v_quote.proyecto_id, v_quote.id,
    case when v_channel = 'Correo' then 'Correo' when v_channel = 'WhatsApp' then 'WhatsApp' else 'Nota' end,
    coalesce(p_sent_at, now()), 'completada', 'Cotizacion enviada',
    concat('Canal: ', v_channel, case when nullif(trim(p_comment), '') is not null then E'\n' || trim(p_comment) else '' end),
    trim(p_next_action), p_next_at, v_quote.ejecutivo_responsable_id,
    'manual', auth.uid()
  ) returning id into v_activity_id;

  insert into public.tasks (
    organization_id, titulo, descripcion, contacto_id, empresa_id,
    oportunidad_id, proyecto_id, cotizacion_id, responsable_id,
    tipo, prioridad, fecha_hora_vencimiento, estado,
    idempotency_key, origen_registro
  ) values (
    v_quote.organization_id,
    trim(p_next_action) || ' - Cotizacion N.º ' || v_quote.numero_cotizacion,
    nullif(trim(p_comment), ''), v_quote.contacto_id, v_quote.empresa_id,
    v_quote.oportunidad_id, v_quote.proyecto_id, v_quote.id,
    v_quote.ejecutivo_responsable_id, 'Seguimiento de cotizacion',
    lower(p_priority), p_next_at, 'pendiente',
    'quote-sent:' || v_quote.id::text, 'automatico'
  )
  on conflict (idempotency_key) do update
  set titulo = excluded.titulo,
      descripcion = excluded.descripcion,
      prioridad = excluded.prioridad,
      fecha_hora_vencimiento = excluded.fecha_hora_vencimiento,
      estado = 'pendiente',
      updated_at = now()
  returning id into v_task_id;

  return jsonb_build_object('success', true, 'activity_id', v_activity_id, 'task_id', v_task_id, 'quote_status', 'Enviada');
end;
$function$;

create or replace function public.confirm_quote_received_controlled(
  p_quote_id uuid,
  p_channel text,
  p_received_at timestamptz,
  p_confirmed_by text,
  p_comment text,
  p_next_action text,
  p_next_at timestamptz,
  p_priority text default 'media'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
  v_activity_id uuid;
  v_task_id uuid;
  v_result_id uuid;
begin
  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then raise exception 'Cotizacion no encontrada o no autorizada'; end if;
  if not public.can_write_owner(v_quote.ejecutivo_responsable_id) then raise exception 'No esta autorizado para gestionar esta cotizacion'; end if;
  if trim(coalesce(p_channel, '')) not in ('Llamada', 'WhatsApp', 'Correo', 'Reunion', 'Otro') then raise exception 'Canal de confirmacion no valido'; end if;
  if nullif(trim(p_next_action), '') is null or p_next_at is null then raise exception 'Debe registrar la proxima accion y su fecha'; end if;
  if p_next_at <= now() then raise exception 'La fecha del proximo seguimiento debe ser futura'; end if;
  if lower(p_priority) not in ('baja','media','alta','urgente') then raise exception 'Prioridad no valida'; end if;

  select id into v_result_id
  from public.activity_results
  where organization_id = v_quote.organization_id
    and codigo = 'CONFIRMO_RECEPCION'
    and estado = 'activo'
  limit 1;

  update public.cotizaciones
  set estado_comercial = 'Recibida por el cliente',
      fecha_confirmacion_recepcion = coalesce(p_received_at, now()),
      ultima_actividad_at = now(),
      proxima_accion = trim(p_next_action),
      fecha_proximo_seguimiento = p_next_at,
      updated_at = now()
  where id = v_quote.id;

  update public.oportunidades
  set etapa_comercial = 'Recibida por el cliente',
      ultima_actividad_at = now(),
      proxima_accion = trim(p_next_action),
      fecha_proxima_accion = p_next_at,
      updated_at = now()
  where id = v_quote.oportunidad_id
    and organization_id = v_quote.organization_id;

  insert into public.activities (
    organization_id, contacto_id, empresa_id, oportunidad_id, proyecto_id,
    cotizacion_id, tipo_actividad, fecha_hora_inicio, estado, resultado,
    resultado_id, descripcion, proxima_accion, fecha_proxima_accion,
    ejecutivo_responsable_id, origen_registro, created_by
  ) values (
    v_quote.organization_id, v_quote.contacto_id, v_quote.empresa_id,
    v_quote.oportunidad_id, v_quote.proyecto_id, v_quote.id,
    case when p_channel in ('Llamada','WhatsApp','Correo','Reunion') then p_channel else 'Nota' end,
    coalesce(p_received_at, now()), 'completada', 'Confirmo recepcion',
    v_result_id,
    concat('Canal: ', trim(p_channel), case when nullif(trim(p_confirmed_by), '') is not null then E'\nConfirmo: ' || trim(p_confirmed_by) else '' end, case when nullif(trim(p_comment), '') is not null then E'\n' || trim(p_comment) else '' end),
    trim(p_next_action), p_next_at, v_quote.ejecutivo_responsable_id,
    'manual', auth.uid()
  ) returning id into v_activity_id;

  insert into public.tasks (
    organization_id, titulo, descripcion, contacto_id, empresa_id,
    oportunidad_id, proyecto_id, cotizacion_id, responsable_id,
    tipo, prioridad, fecha_hora_vencimiento, estado,
    idempotency_key, origen_registro
  ) values (
    v_quote.organization_id,
    trim(p_next_action) || ' - Cotizacion N.º ' || v_quote.numero_cotizacion,
    nullif(trim(p_comment), ''), v_quote.contacto_id, v_quote.empresa_id,
    v_quote.oportunidad_id, v_quote.proyecto_id, v_quote.id,
    v_quote.ejecutivo_responsable_id, 'Seguimiento de cotizacion',
    lower(p_priority), p_next_at, 'pendiente',
    'quote-received:' || v_quote.id::text, 'automatico'
  )
  on conflict (idempotency_key) do update
  set titulo = excluded.titulo,
      descripcion = excluded.descripcion,
      prioridad = excluded.prioridad,
      fecha_hora_vencimiento = excluded.fecha_hora_vencimiento,
      estado = 'pendiente',
      updated_at = now()
  returning id into v_task_id;

  return jsonb_build_object('success', true, 'activity_id', v_activity_id, 'task_id', v_task_id, 'quote_status', 'Recibida por el cliente');
end;
$function$;

create or replace function public.close_quote_controlled(
  p_quote_id uuid,
  p_result text,
  p_comment text default null,
  p_loss_reason_id uuid default null,
  p_competitor text default null,
  p_approved_amount bigint default null,
  p_next_action text default null,
  p_next_at timestamptz default null,
  p_priority text default 'media'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
  v_loss_reason public.loss_reasons%rowtype;
  v_status text;
  v_closure_id uuid;
  v_task_id uuid;
begin
  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then raise exception 'Cotizacion no encontrada o no autorizada'; end if;
  if not public.can_write_owner(v_quote.ejecutivo_responsable_id) then raise exception 'No esta autorizado para cerrar esta cotizacion'; end if;
  if p_result not in ('ganada','perdida','postergada','cancelada') then raise exception 'Resultado de cierre no valido'; end if;
  if p_result = 'ganada' and coalesce(p_approved_amount, 0) <= 0 then raise exception 'Una cotizacion aprobada requiere un monto mayor que cero'; end if;

  if p_result = 'perdida' then
    if p_loss_reason_id is null then raise exception 'Una cotizacion perdida requiere un motivo'; end if;
    select * into v_loss_reason
    from public.loss_reasons
    where id = p_loss_reason_id
      and organization_id = v_quote.organization_id
      and estado = 'activo';
    if v_loss_reason.id is null then raise exception 'Motivo de perdida no valido'; end if;
    if v_loss_reason.requiere_comentario and nullif(trim(p_comment), '') is null then raise exception 'El motivo seleccionado requiere comentario'; end if;
  end if;

  if p_result = 'postergada' then
    if nullif(trim(p_comment), '') is null then raise exception 'Una postergacion requiere comentario'; end if;
    if nullif(trim(p_next_action), '') is null or p_next_at is null then raise exception 'Una postergacion requiere proxima accion y fecha'; end if;
    if p_next_at <= now() then raise exception 'La fecha de reactivacion debe ser futura'; end if;
  end if;

  v_status := case p_result when 'ganada' then 'Aprobada' when 'perdida' then 'Perdida' when 'postergada' then 'Postergada' else 'Anulada externamente' end;

  update public.cotizaciones
  set estado_comercial = v_status,
      motivo_perdida_id = case when p_result = 'perdida' then p_loss_reason_id else null end,
      fecha_aprobacion = case when p_result = 'ganada' then now() else fecha_aprobacion end,
      comentario_resultado = nullif(trim(p_comment), ''),
      probabilidad_cierre = case when p_result = 'ganada' then 100 when p_result in ('perdida','cancelada') then 0 else probabilidad_cierre end,
      proxima_accion = case when p_result = 'postergada' then trim(p_next_action) when p_result in ('ganada','perdida','cancelada') then null else proxima_accion end,
      fecha_proximo_seguimiento = case when p_result = 'postergada' then p_next_at when p_result in ('ganada','perdida','cancelada') then null else fecha_proximo_seguimiento end,
      ultima_actividad_at = now(),
      updated_at = now()
  where id = v_quote.id;

  update public.oportunidades
  set estado = case when p_result in ('ganada','perdida','cancelada') then 'cerrada' else 'abierta' end,
      etapa_comercial = v_status,
      probabilidad_cierre = case when p_result = 'ganada' then 100 when p_result in ('perdida','cancelada') then 0 else probabilidad_cierre end,
      motivo_perdida = case when p_result = 'perdida' then trim(p_comment) else motivo_perdida end,
      competidor = case when p_result = 'perdida' then nullif(trim(p_competitor), '') else competidor end,
      proxima_accion = case when p_result = 'postergada' then trim(p_next_action) when p_result in ('ganada','perdida','cancelada') then null else proxima_accion end,
      fecha_proxima_accion = case when p_result = 'postergada' then p_next_at when p_result in ('ganada','perdida','cancelada') then null else fecha_proxima_accion end,
      ultima_actividad_at = now(),
      closed_at = case when p_result in ('ganada','perdida','cancelada') then now() else null end,
      updated_at = now()
  where id = v_quote.oportunidad_id
    and organization_id = v_quote.organization_id;

  select id into v_closure_id
  from public.commercial_closures
  where organization_id = v_quote.organization_id
    and oportunidad_id = v_quote.oportunidad_id
    and resultado = p_result
  order by created_at desc
  limit 1;

  if v_closure_id is null then
    insert into public.commercial_closures (
      organization_id, oportunidad_id, cotizacion_ganadora_id,
      resultado, fecha_cierre, monto_cierre, motivo_perdida_id,
      competidor, comentario, cerrado_por
    ) values (
      v_quote.organization_id, v_quote.oportunidad_id,
      case when p_result = 'ganada' then v_quote.id else null end,
      p_result, now(), case when p_result = 'ganada' then p_approved_amount else null end,
      case when p_result = 'perdida' then p_loss_reason_id else null end,
      nullif(trim(p_competitor), ''), nullif(trim(p_comment), ''), auth.uid()
    ) returning id into v_closure_id;
  end if;

  if p_result in ('ganada','perdida','cancelada') then
    update public.tasks
    set estado = 'cancelada', updated_at = now()
    where cotizacion_id = v_quote.id
      and estado in ('pendiente','en_curso');
  else
    insert into public.tasks (
      organization_id, titulo, descripcion, contacto_id, empresa_id,
      oportunidad_id, proyecto_id, cotizacion_id, responsable_id,
      tipo, prioridad, fecha_hora_vencimiento, estado,
      idempotency_key, origen_registro
    ) values (
      v_quote.organization_id,
      trim(p_next_action) || ' - Cotizacion N.º ' || v_quote.numero_cotizacion,
      trim(p_comment), v_quote.contacto_id, v_quote.empresa_id,
      v_quote.oportunidad_id, v_quote.proyecto_id, v_quote.id,
      v_quote.ejecutivo_responsable_id, 'Seguimiento de cotizacion',
      lower(p_priority), p_next_at, 'pendiente',
      'quote-postponed:' || v_quote.id::text, 'automatico'
    )
    on conflict (idempotency_key) do update
    set titulo = excluded.titulo,
        descripcion = excluded.descripcion,
        prioridad = excluded.prioridad,
        fecha_hora_vencimiento = excluded.fecha_hora_vencimiento,
        estado = 'pendiente',
        updated_at = now()
    returning id into v_task_id;
  end if;

  return jsonb_build_object('success', true, 'closure_id', v_closure_id, 'task_id', v_task_id, 'quote_status', v_status, 'result', p_result);
end;
$function$;

revoke all on function public.mark_quote_sent_controlled(uuid,text,timestamptz,text,text,timestamptz,text) from public;
revoke all on function public.confirm_quote_received_controlled(uuid,text,timestamptz,text,text,text,timestamptz,text) from public;
revoke all on function public.close_quote_controlled(uuid,text,text,uuid,text,bigint,text,timestamptz,text) from public;

grant execute on function public.mark_quote_sent_controlled(uuid,text,timestamptz,text,text,timestamptz,text) to authenticated;
grant execute on function public.confirm_quote_received_controlled(uuid,text,timestamptz,text,text,text,timestamptz,text) to authenticated;
grant execute on function public.close_quote_controlled(uuid,text,text,uuid,text,bigint,text,timestamptz,text) to authenticated;

commit;
