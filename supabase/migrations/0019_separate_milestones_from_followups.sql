begin;

-- A4 - Separar hitos formales de la programacion de seguimientos.

create or replace function public.mark_quote_sent_milestone(
  p_quote_id uuid,
  p_channel text,
  p_sent_at timestamptz,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
  v_activity_id uuid;
  v_channel text;
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

  v_channel := trim(coalesce(p_channel, ''));
  if v_channel not in (
    'Correo', 'WhatsApp', 'Entrega personal', 'Portal externo', 'Otro'
  ) then
    raise exception 'Canal de envio no valido';
  end if;

  update public.cotizaciones
  set estado_comercial = 'Enviada',
      fecha_envio_cliente = coalesce(p_sent_at, now()),
      ultima_actividad_at = now(),
      updated_at = now()
  where id = v_quote.id;

  update public.oportunidades
  set etapa_comercial = 'Cotizacion enviada',
      ultima_actividad_at = now(),
      updated_at = now()
  where id = v_quote.oportunidad_id
    and organization_id = v_quote.organization_id;

  insert into public.activities (
    organization_id, contacto_id, empresa_id, oportunidad_id, proyecto_id,
    cotizacion_id, tipo_actividad, fecha_hora_inicio, estado, resultado,
    descripcion, ejecutivo_responsable_id, origen_registro, created_by
  ) values (
    v_quote.organization_id,
    v_quote.contacto_id,
    v_quote.empresa_id,
    v_quote.oportunidad_id,
    v_quote.proyecto_id,
    v_quote.id,
    case
      when v_channel = 'Correo' then 'Correo'
      when v_channel = 'WhatsApp' then 'WhatsApp'
      else 'Nota'
    end,
    coalesce(p_sent_at, now()),
    'completada',
    'Cotizacion enviada',
    concat(
      'Canal: ', v_channel,
      case
        when nullif(trim(p_comment), '') is not null
          then E'\n' || trim(p_comment)
        else ''
      end
    ),
    v_quote.ejecutivo_responsable_id,
    'manual',
    auth.uid()
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'success', true,
    'activity_id', v_activity_id,
    'quote_status', 'Enviada'
  );
end;
$function$;

create or replace function public.confirm_quote_received_milestone(
  p_quote_id uuid,
  p_channel text,
  p_received_at timestamptz,
  p_confirmed_by text default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote public.cotizaciones%rowtype;
  v_activity_id uuid;
  v_result_id uuid;
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

  if trim(coalesce(p_channel, '')) not in (
    'Llamada', 'WhatsApp', 'Correo', 'Reunion', 'Otro'
  ) then
    raise exception 'Canal de confirmacion no valido';
  end if;

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
      updated_at = now()
  where id = v_quote.id;

  update public.oportunidades
  set etapa_comercial = 'Recibida por el cliente',
      ultima_actividad_at = now(),
      updated_at = now()
  where id = v_quote.oportunidad_id
    and organization_id = v_quote.organization_id;

  insert into public.activities (
    organization_id, contacto_id, empresa_id, oportunidad_id, proyecto_id,
    cotizacion_id, tipo_actividad, fecha_hora_inicio, estado, resultado,
    resultado_id, descripcion, ejecutivo_responsable_id,
    origen_registro, created_by
  ) values (
    v_quote.organization_id,
    v_quote.contacto_id,
    v_quote.empresa_id,
    v_quote.oportunidad_id,
    v_quote.proyecto_id,
    v_quote.id,
    case
      when p_channel in ('Llamada', 'WhatsApp', 'Correo', 'Reunion')
        then p_channel
      else 'Nota'
    end,
    coalesce(p_received_at, now()),
    'completada',
    'Confirmo recepcion',
    v_result_id,
    concat(
      'Canal: ', trim(p_channel),
      case
        when nullif(trim(p_confirmed_by), '') is not null
          then E'\nConfirmo: ' || trim(p_confirmed_by)
        else ''
      end,
      case
        when nullif(trim(p_comment), '') is not null
          then E'\n' || trim(p_comment)
        else ''
      end
    ),
    v_quote.ejecutivo_responsable_id,
    'manual',
    auth.uid()
  ) returning id into v_activity_id;

  return jsonb_build_object(
    'success', true,
    'activity_id', v_activity_id,
    'quote_status', 'Recibida por el cliente'
  );
end;
$function$;

revoke all on function public.mark_quote_sent_milestone(
  uuid, text, timestamptz, text
) from public;
revoke all on function public.confirm_quote_received_milestone(
  uuid, text, timestamptz, text, text
) from public;

grant execute on function public.mark_quote_sent_milestone(
  uuid, text, timestamptz, text
) to authenticated;
grant execute on function public.confirm_quote_received_milestone(
  uuid, text, timestamptz, text, text
) to authenticated;

commit;
