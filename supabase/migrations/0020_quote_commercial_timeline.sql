begin;

-- =========================================================
-- 0020 - HISTORIAL COMERCIAL UNIFICADO DE COTIZACIONES
-- Consolida creacion, importacion, actividades, tareas y cierres.
-- =========================================================

create or replace function public.get_quote_commercial_timeline(
  p_quote_id uuid
)
returns table (
  event_id uuid,
  event_at timestamptz,
  event_source text,
  event_type text,
  title text,
  detail text,
  status text,
  responsible_id uuid,
  responsible_name text,
  metadata jsonb
)
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
    and deleted_at is null;

  if v_quote.id is null then
    raise exception 'Cotizacion no encontrada o no autorizada';
  end if;

  return query
  with timeline as (
    -- Creacion de la cotizacion
    select
      v_quote.id as event_id,
      v_quote.created_at as event_at,
      'QUOTE'::text as event_source,
      'Cotizacion creada'::text as event_type,
      'Cotizacion N.º ' || v_quote.numero_cotizacion || ' creada en el CRM' as title,
      null::text as detail,
      'creada'::text as status,
      v_quote.created_by as responsible_id,
      jsonb_build_object(
        'numero_cotizacion', v_quote.numero_cotizacion,
        'origen_registro', v_quote.origen_registro,
        'sistema_origen', v_quote.sistema_origen
      ) as metadata

    union all

    -- Importacion de PDF
    select
      qi.id,
      coalesce(qi.confirmed_at, qi.analyzed_at, qi.created_at),
      'IMPORT'::text,
      'Importacion de PDF'::text,
      case
        when qi.confirmed_at is not null then 'Importacion confirmada'
        when qi.analyzed_at is not null then 'PDF analizado'
        else 'PDF cargado'
      end,
      concat_ws(
        E'\n',
        case
          when nullif(trim(qi.file_name), '') is not null
            then 'Archivo: ' || qi.file_name
          else null
        end,
        case
          when nullif(trim(qi.error_message), '') is not null
            then 'Error: ' || qi.error_message
          else null
        end
      ),
      qi.status,
      coalesce(qi.confirmed_by, qi.uploaded_by),
      jsonb_build_object(
        'file_name', qi.file_name,
        'analyzed_at', qi.analyzed_at,
        'confirmed_at', qi.confirmed_at
      )
    from public.quote_pdf_imports qi
    where qi.imported_quote_id = v_quote.id
      and qi.organization_id = v_quote.organization_id

    union all

    -- Actividades e hitos comerciales
    select
      a.id,
      coalesce(a.fecha_hora_inicio, a.created_at),
      'ACTIVITY'::text,
      coalesce(a.tipo_actividad, 'Actividad comercial'),
      coalesce(a.resultado, a.tipo_actividad, 'Actividad registrada'),
      concat_ws(
        E'\n',
        nullif(trim(a.descripcion), ''),
        case
          when nullif(trim(a.proxima_accion), '') is not null
            then 'Proxima accion: ' || a.proxima_accion
          else null
        end,
        case
          when a.fecha_proxima_accion is not null
            then 'Fecha proxima accion: ' || to_char(
              a.fecha_proxima_accion at time zone 'America/Santiago',
              'DD-MM-YYYY HH24:MI'
            )
          else null
        end
      ),
      a.estado,
      coalesce(a.ejecutivo_responsable_id, a.created_by),
      jsonb_build_object(
        'resultado', a.resultado,
        'origen_registro', a.origen_registro,
        'fecha_hora_fin', a.fecha_hora_fin,
        'duracion_minutos', a.duracion_minutos
      )
    from public.activities a
    where a.cotizacion_id = v_quote.id
      and a.organization_id = v_quote.organization_id

    union all

    -- Tareas y seguimientos
    select
      t.id,
      case
        when t.estado in ('completada', 'cancelada')
          then coalesce(t.fecha_finalizacion, t.updated_at, t.created_at)
        else coalesce(t.created_at, t.updated_at)
      end,
      'TASK'::text,
      coalesce(t.tipo, 'Seguimiento comercial'),
      t.titulo,
      concat_ws(
        E'\n',
        nullif(trim(t.descripcion), ''),
        case
          when t.fecha_hora_vencimiento is not null
            then 'Vencimiento: ' || to_char(
              t.fecha_hora_vencimiento at time zone 'America/Santiago',
              'DD-MM-YYYY HH24:MI'
            )
          else null
        end,
        case
          when t.prioridad is not null
            then 'Prioridad: ' || t.prioridad
          else null
        end
      ),
      t.estado,
      t.responsable_id,
      jsonb_build_object(
        'prioridad', t.prioridad,
        'fecha_hora_vencimiento', t.fecha_hora_vencimiento,
        'fecha_finalizacion', t.fecha_finalizacion,
        'origen_registro', t.origen_registro,
        'google_sync_status', t.google_sync_status
      )
    from public.tasks t
    where t.cotizacion_id = v_quote.id
      and t.organization_id = v_quote.organization_id

    union all

    -- Cierres de la oportunidad relacionada
    select
      cc.id,
      coalesce(cc.fecha_cierre, cc.created_at),
      'CLOSURE'::text,
      'Cierre comercial'::text,
      case cc.resultado
        when 'ganada' then 'Cotizacion aprobada'
        when 'perdida' then 'Cotizacion perdida'
        when 'postergada' then 'Decision postergada'
        when 'cancelada' then 'Oportunidad cancelada'
        else 'Cierre comercial: ' || coalesce(cc.resultado, 'sin resultado')
      end,
      concat_ws(
        E'\n',
        nullif(trim(cc.comentario), ''),
        case
          when cc.monto_cierre is not null
            then 'Monto de cierre: $' || cc.monto_cierre::text
          else null
        end,
        case
          when nullif(trim(cc.competidor), '') is not null
            then 'Competidor: ' || cc.competidor
          else null
        end
      ),
      cc.resultado,
      cc.cerrado_por,
      jsonb_build_object(
        'monto_cierre', cc.monto_cierre,
        'motivo_perdida_id', cc.motivo_perdida_id,
        'competidor', cc.competidor,
        'cotizacion_ganadora_id', cc.cotizacion_ganadora_id
      )
    from public.commercial_closures cc
    where cc.oportunidad_id = v_quote.oportunidad_id
      and cc.organization_id = v_quote.organization_id
      and (
        cc.cotizacion_ganadora_id = v_quote.id
        or cc.cotizacion_ganadora_id is null
      )
  )
  select
    tl.event_id,
    tl.event_at,
    tl.event_source,
    tl.event_type,
    tl.title,
    nullif(trim(tl.detail), ''),
    tl.status,
    tl.responsible_id,
    coalesce(
      nullif(trim(concat_ws(' ', p.nombre, p.apellido)), ''),
      p.correo
    ) as responsible_name,
    tl.metadata
  from timeline tl
  left join public.profiles p
    on p.id = tl.responsible_id
   and p.organization_id = v_quote.organization_id
  order by
    tl.event_at desc nulls last,
    tl.event_source,
    tl.event_id;
end;
$function$;

revoke all on function public.get_quote_commercial_timeline(uuid) from public;
grant execute on function public.get_quote_commercial_timeline(uuid) to authenticated;

comment on function public.get_quote_commercial_timeline(uuid) is
  'Devuelve el historial comercial unificado y cronologico de una cotizacion.';

commit;
