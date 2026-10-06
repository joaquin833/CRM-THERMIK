begin;

-- =========================================================
-- 0011 - FUNCIONES SEGURAS PARA SEGUIMIENTO DE COTIZACIONES
-- Requiere la migracion 0010.
-- No modifica importes, items ni documentos oficiales.
-- =========================================================

-- ---------------------------------------------------------
-- 1. PROTEGER DATOS OFICIALES DE LA COTIZACION
-- Los usuarios autenticados no pueden alterar los datos
-- economicos o documentales recibidos del sistema externo.
-- ---------------------------------------------------------

create or replace function public.protect_external_quote_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.role() = 'authenticated' and (
    old.numero_cotizacion is distinct from new.numero_cotizacion
    or old.numero_cotizacion_normalizado is distinct from new.numero_cotizacion_normalizado
    or old.fecha_emision is distinct from new.fecha_emision
    or old.fecha_validez is distinct from new.fecha_validez
    or old.subtotal_neto is distinct from new.subtotal_neto
    or old.descuento_total is distinct from new.descuento_total
    or old.neto_afecto is distinct from new.neto_afecto
    or old.neto_exento is distinct from new.neto_exento
    or old.iva is distinct from new.iva
    or old.total is distinct from new.total
    or old.moneda is distinct from new.moneda
    or old.archivo_pdf_url is distinct from new.archivo_pdf_url
    or old.external_source_id is distinct from new.external_source_id
    or old.external_id is distinct from new.external_id
    or old.sistema_origen is distinct from new.sistema_origen
    or old.hash_documento is distinct from new.hash_documento
  ) then
    raise exception 'Los datos oficiales de la cotizacion son de solo lectura en el CRM';
  end if;

  return new;
end;
$function$;

revoke all on function public.protect_external_quote_fields() from public;

drop trigger if exists protect_external_quote_fields on public.cotizaciones;
create trigger protect_external_quote_fields
before update on public.cotizaciones
for each row execute function public.protect_external_quote_fields();

-- ---------------------------------------------------------
-- 2. ASIGNAR RESPONSABLE A UNA COTIZACION
-- ---------------------------------------------------------

create or replace function public.assign_quote_owner(
  p_quote_id uuid,
  p_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
  v_owner public.profiles%rowtype;
begin
  if public.app_current_role() not in ('admin', 'jefatura_comercial') then
    raise exception 'Solo administracion o jefatura puede reasignar cotizaciones';
  end if;

  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then
    raise exception 'Cotizacion no encontrada o no autorizada';
  end if;

  select * into v_owner
  from public.profiles
  where id = p_owner_id
    and organization_id = public.current_org()
    and estado = 'activo';

  if v_owner.id is null then
    raise exception 'Responsable no encontrado, inactivo o de otra organizacion';
  end if;

  if v_owner.rol = 'consulta' then
    raise exception 'Un usuario de consulta no puede ser responsable comercial';
  end if;

  update public.cotizaciones
  set ejecutivo_responsable_id = v_owner.id,
      updated_at = now()
  where id = v_quote.id;
end;
$function$;

revoke all on function public.assign_quote_owner(uuid, uuid) from public;
grant execute on function public.assign_quote_owner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------
-- 3. MARCAR ENVIO DE COTIZACION AL CLIENTE
-- ---------------------------------------------------------

create or replace function public.mark_quote_sent(
  p_quote_id uuid,
  p_sent_at timestamptz default now(),
  p_next_action text default null,
  p_next_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
begin
  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then
    raise exception 'Cotizacion no encontrada o no autorizada';
  end if;

  if not public.can_write_owner(v_quote.ejecutivo_responsable_id) then
    raise exception 'No esta autorizado para gestionar esta cotizacion';
  end if;

  if coalesce(trim(p_next_action), '') = '' or p_next_at is null then
    raise exception 'Al marcar una cotizacion como enviada debe registrar la proxima accion y su fecha';
  end if;

  if p_next_at <= now() then
    raise exception 'La fecha del proximo seguimiento debe ser futura';
  end if;

  update public.cotizaciones
  set estado_comercial = 'Enviada',
      fecha_envio_cliente = coalesce(p_sent_at, now()),
      proxima_accion = trim(p_next_action),
      fecha_proximo_seguimiento = p_next_at,
      updated_at = now()
  where id = v_quote.id;

  insert into public.tasks (
    organization_id, titulo, descripcion, contacto_id, empresa_id,
    oportunidad_id, proyecto_id, cotizacion_id, responsable_id,
    tipo, prioridad, fecha_hora_vencimiento, estado,
    idempotency_key, origen_registro
  ) values (
    v_quote.organization_id,
    'Seguimiento Cotizacion N.º ' || v_quote.numero_cotizacion,
    trim(p_next_action),
    v_quote.contacto_id, v_quote.empresa_id, v_quote.oportunidad_id,
    v_quote.proyecto_id, v_quote.id, v_quote.ejecutivo_responsable_id,
    'Seguimiento de cotizacion', 'alta', p_next_at, 'pendiente',
    'quote-sent:' || v_quote.id::text || ':' || p_next_at::text,
    'automatico'
  )
  on conflict (idempotency_key) do nothing;
end;
$function$;

revoke all on function public.mark_quote_sent(uuid, timestamptz, text, timestamptz) from public;
grant execute on function public.mark_quote_sent(uuid, timestamptz, text, timestamptz) to authenticated;

-- ---------------------------------------------------------
-- 4. CONFIRMAR RECEPCION DEL CLIENTE
-- ---------------------------------------------------------

create or replace function public.confirm_quote_received(
  p_quote_id uuid,
  p_received_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
begin
  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then
    raise exception 'Cotizacion no encontrada o no autorizada';
  end if;

  if not public.can_write_owner(v_quote.ejecutivo_responsable_id) then
    raise exception 'No esta autorizado para gestionar esta cotizacion';
  end if;

  update public.cotizaciones
  set estado_comercial = 'Recibida por el cliente',
      fecha_confirmacion_recepcion = coalesce(p_received_at, now()),
      updated_at = now()
  where id = v_quote.id;
end;
$function$;

revoke all on function public.confirm_quote_received(uuid, timestamptz) from public;
grant execute on function public.confirm_quote_received(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------
-- 5. REGISTRAR CONTACTO Y CREAR PROXIMO SEGUIMIENTO
-- ---------------------------------------------------------

create or replace function public.record_quote_followup(
  p_quote_id uuid,
  p_activity_type text,
  p_result_code text,
  p_comment text default null,
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
  v_result public.activity_results%rowtype;
  v_activity_id uuid;
  v_task_id uuid;
  v_new_status text;
begin
  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then
    raise exception 'Cotizacion no encontrada o no autorizada';
  end if;

  if not public.can_write_owner(v_quote.ejecutivo_responsable_id) then
    raise exception 'No esta autorizado para gestionar esta cotizacion';
  end if;

  if p_activity_type not in ('Llamada', 'WhatsApp', 'Correo', 'Reunion', 'Visita', 'Nota') then
    raise exception 'Tipo de actividad no valido';
  end if;

  if p_priority not in ('baja', 'media', 'alta', 'urgente') then
    raise exception 'Prioridad no valida';
  end if;

  select * into v_result
  from public.activity_results
  where organization_id = v_quote.organization_id
    and codigo = upper(trim(p_result_code))
    and estado = 'activo';

  if v_result.id is null then
    raise exception 'Resultado de seguimiento no valido';
  end if;

  if v_result.requiere_comentario and coalesce(trim(p_comment), '') = '' then
    raise exception 'Este resultado requiere un comentario';
  end if;

  if v_result.requiere_proxima_accion and coalesce(trim(p_next_action), '') = '' then
    raise exception 'Este resultado requiere una proxima accion';
  end if;

  if v_result.requiere_fecha and p_next_at is null then
    raise exception 'Este resultado requiere una fecha de seguimiento';
  end if;

  if p_next_at is not null and p_next_at <= now() then
    raise exception 'La fecha del proximo seguimiento debe ser futura';
  end if;

  insert into public.activities (
    organization_id, contacto_id, empresa_id, oportunidad_id,
    proyecto_id, cotizacion_id, tipo_actividad, fecha_hora_inicio,
    estado, resultado, resultado_id, descripcion, proxima_accion,
    fecha_proxima_accion, ejecutivo_responsable_id,
    origen_registro, created_by
  ) values (
    v_quote.organization_id, v_quote.contacto_id, v_quote.empresa_id,
    v_quote.oportunidad_id, v_quote.proyecto_id, v_quote.id,
    p_activity_type, now(), 'completada', v_result.nombre,
    v_result.id, nullif(trim(p_comment), ''),
    nullif(trim(p_next_action), ''), p_next_at,
    v_quote.ejecutivo_responsable_id, 'manual', auth.uid()
  ) returning id into v_activity_id;

  v_new_status := case v_result.codigo
    when 'NO_RESPONDIO' then 'Contacto intentado'
    when 'MENSAJE_ENVIADO' then 'Contacto intentado'
    when 'CONFIRMO_RECEPCION' then 'Recibida por el cliente'
    when 'ESTA_EVALUANDO' then 'En evaluacion'
    when 'SOLICITA_ACLARACION' then 'Requiere aclaracion'
    when 'SOLICITA_VISITA' then 'En evaluacion'
    when 'SOLICITA_NUEVA_COTIZACION' then 'Requiere nueva cotizacion'
    when 'PROYECTO_POSTERGADO' then 'Postergada'
    when 'ACEPTO_PROPUESTA' then 'Aprobada'
    when 'ELIGIO_COMPETIDOR' then 'Perdida'
    when 'DESISTIO' then 'Perdida'
    else v_quote.estado_comercial
  end;

  update public.cotizaciones
  set estado_comercial = v_new_status,
      ultima_actividad_at = now(),
      proxima_accion = case
        when p_next_action is not null then nullif(trim(p_next_action), '')
        else proxima_accion
      end,
      fecha_proximo_seguimiento = coalesce(p_next_at, fecha_proximo_seguimiento),
      fecha_confirmacion_recepcion = case
        when v_result.codigo = 'CONFIRMO_RECEPCION'
          then coalesce(fecha_confirmacion_recepcion, now())
        else fecha_confirmacion_recepcion
      end,
      updated_at = now()
  where id = v_quote.id;

  if p_next_at is not null then
    insert into public.tasks (
      organization_id, titulo, descripcion, contacto_id, empresa_id,
      oportunidad_id, proyecto_id, cotizacion_id, responsable_id,
      tipo, prioridad, fecha_hora_vencimiento, estado,
      idempotency_key, origen_registro
    ) values (
      v_quote.organization_id,
      trim(p_next_action) || ' - Cotizacion N.º ' || v_quote.numero_cotizacion,
      nullif(trim(p_comment), ''),
      v_quote.contacto_id, v_quote.empresa_id, v_quote.oportunidad_id,
      v_quote.proyecto_id, v_quote.id, v_quote.ejecutivo_responsable_id,
      'Seguimiento de cotizacion', p_priority, p_next_at, 'pendiente',
      'quote-followup:' || v_activity_id::text || ':' || p_next_at::text,
      'automatico'
    )
    on conflict (idempotency_key) do update
      set titulo = excluded.titulo,
          descripcion = excluded.descripcion,
          prioridad = excluded.prioridad,
          fecha_hora_vencimiento = excluded.fecha_hora_vencimiento,
          updated_at = now()
    returning id into v_task_id;
  end if;

  return jsonb_build_object(
    'activity_id', v_activity_id,
    'task_id', v_task_id,
    'quote_status', v_new_status,
    'result', v_result.nombre
  );
end;
$function$;

revoke all on function public.record_quote_followup(uuid, text, text, text, text, timestamptz, text) from public;
grant execute on function public.record_quote_followup(uuid, text, text, text, text, timestamptz, text) to authenticated;

-- ---------------------------------------------------------
-- 6. CERRAR COMERCIALMENTE UNA COTIZACION
-- ---------------------------------------------------------

create or replace function public.close_quote_commercially(
  p_quote_id uuid,
  p_result text,
  p_comment text default null,
  p_loss_reason_id uuid default null,
  p_competitor text default null,
  p_approved_amount bigint default null
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
begin
  select * into v_quote
  from public.cotizaciones
  where id = p_quote_id
    and organization_id = public.current_org()
    and deleted_at is null
  for update;

  if v_quote.id is null then
    raise exception 'Cotizacion no encontrada o no autorizada';
  end if;

  if not public.can_write_owner(v_quote.ejecutivo_responsable_id) then
    raise exception 'No esta autorizado para cerrar esta cotizacion';
  end if;

  if p_result not in ('ganada', 'perdida', 'postergada', 'cancelada') then
    raise exception 'Resultado de cierre no valido';
  end if;

  if p_result = 'ganada' and coalesce(p_approved_amount, 0) <= 0 then
    raise exception 'Una cotizacion aprobada requiere un monto aprobado mayor que cero';
  end if;

  if p_result = 'perdida' then
    if p_loss_reason_id is null then
      raise exception 'Una cotizacion perdida requiere un motivo de perdida';
    end if;

    select * into v_loss_reason
    from public.loss_reasons
    where id = p_loss_reason_id
      and organization_id = v_quote.organization_id
      and estado = 'activo';

    if v_loss_reason.id is null then
      raise exception 'Motivo de perdida no valido';
    end if;

    if v_loss_reason.requiere_comentario and coalesce(trim(p_comment), '') = '' then
      raise exception 'El motivo seleccionado requiere un comentario';
    end if;
  end if;

  v_status := case p_result
    when 'ganada' then 'Aprobada'
    when 'perdida' then 'Perdida'
    when 'postergada' then 'Postergada'
    else 'Anulada externamente'
  end;

  update public.cotizaciones
  set estado_comercial = v_status,
      motivo_perdida_id = case when p_result = 'perdida' then p_loss_reason_id else null end,
      motivo_rechazo = case when p_result = 'perdida' then trim(p_comment) else motivo_rechazo end,
      competidor = case when p_result = 'perdida' then nullif(trim(p_competitor), '') else competidor end,
      monto_aprobado = case when p_result = 'ganada' then p_approved_amount else monto_aprobado end,
      fecha_aprobacion = case when p_result = 'ganada' then now() else fecha_aprobacion end,
      comentario_resultado = nullif(trim(p_comment), ''),
      proxima_accion = case when p_result in ('ganada','perdida','cancelada') then null else proxima_accion end,
      fecha_proximo_seguimiento = case when p_result in ('ganada','perdida','cancelada') then null else fecha_proximo_seguimiento end,
      updated_at = now()
  where id = v_quote.id;

  insert into public.commercial_closures (
    organization_id, oportunidad_id, cotizacion_ganadora_id,
    resultado, fecha_cierre, monto_cierre, motivo_perdida_id,
    competidor, comentario, cerrado_por
  ) values (
    v_quote.organization_id,
    v_quote.oportunidad_id,
    case when p_result = 'ganada' then v_quote.id else null end,
    p_result,
    now(),
    case when p_result = 'ganada' then p_approved_amount else null end,
    case when p_result = 'perdida' then p_loss_reason_id else null end,
    nullif(trim(p_competitor), ''),
    nullif(trim(p_comment), ''),
    auth.uid()
  ) returning id into v_closure_id;

  update public.oportunidades
  set estado = case
        when p_result in ('ganada','perdida','cancelada') then 'cerrada'
        else estado
      end,
      etapa_comercial = v_status,
      motivo_perdida = case when p_result = 'perdida' then trim(p_comment) else motivo_perdida end,
      competidor = case when p_result = 'perdida' then nullif(trim(p_competitor), '') else competidor end,
      closed_at = case when p_result in ('ganada','perdida','cancelada') then now() else closed_at end,
      updated_at = now()
  where id = v_quote.oportunidad_id
    and organization_id = v_quote.organization_id;

  update public.tasks
  set estado = 'cancelada',
      updated_at = now()
  where cotizacion_id = v_quote.id
    and estado = 'pendiente'
    and p_result in ('ganada','perdida','cancelada');

  return jsonb_build_object(
    'closure_id', v_closure_id,
    'quote_status', v_status,
    'result', p_result
  );
end;
$function$;

revoke all on function public.close_quote_commercially(uuid, text, text, uuid, text, bigint) from public;
grant execute on function public.close_quote_commercially(uuid, text, text, uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------
-- 7. INDICES DE TRABAJO DIARIO
-- ---------------------------------------------------------

create index if not exists cotizaciones_last_activity_idx
on public.cotizaciones (organization_id, ultima_actividad_at)
where deleted_at is null;

create index if not exists commercial_closures_quote_idx
on public.commercial_closures (organization_id, cotizacion_ganadora_id, fecha_cierre desc);

commit;
