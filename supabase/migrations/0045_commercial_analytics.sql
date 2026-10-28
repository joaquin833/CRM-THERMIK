-- ============================================================================
-- 0045_commercial_analytics.sql
-- CRM Thermikhaus | Bloque E | Fuente analitica para Dashboard y Reportes
-- Fecha: 2026-10-28
-- Revision 3: corrige total agrupado del pipeline y mantiene verificacion compatible con SQL Editor
--
-- Crea una unica funcion JSON para:
--   - indicadores principales y comparacion con periodo anterior
--   - pipeline por etapa
--   - evolucion mensual
--   - agenda y alertas
--   - oportunidades prioritarias
--   - clientes con mayor actividad
--   - ejecutivos disponibles
--
-- No modifica datos comerciales existentes.
-- ============================================================================

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create or replace function public.commercial_dashboard(
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_org uuid;
  v_from date;
  v_to date;
  v_days integer;
  v_prev_from date;
  v_prev_to date;
  v_now timestamptz := now();
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'commercial_dashboard: usuario no autenticado';
  end if;

  select p.organization_id
  into v_org
  from public.profiles p
  where p.id = auth.uid()
    and p.estado = 'activo';

  if v_org is null then
    raise exception 'commercial_dashboard: perfil activo no encontrado';
  end if;

  v_from := coalesce(p_from, date_trunc('month', current_date)::date);
  v_to := coalesce(p_to, current_date);

  if v_to < v_from then
    raise exception 'commercial_dashboard: p_to no puede ser anterior a p_from';
  end if;

  v_days := (v_to - v_from) + 1;
  v_prev_to := v_from - 1;
  v_prev_from := v_prev_to - (v_days - 1);

  with
  current_quotes as (
    select c.*
    from public.cotizaciones c
    where c.organization_id = v_org
      and c.deleted_at is null
      and c.fecha_emision between v_from and v_to
      and (p_user_id is null or c.ejecutivo_responsable_id = p_user_id)
  ),
  previous_quotes as (
    select c.*
    from public.cotizaciones c
    where c.organization_id = v_org
      and c.deleted_at is null
      and c.fecha_emision between v_prev_from and v_prev_to
      and (p_user_id is null or c.ejecutivo_responsable_id = p_user_id)
  ),
  current_opportunities as (
    select o.*
    from public.oportunidades o
    where o.organization_id = v_org
      and o.deleted_at is null
      and o.created_at::date between v_from and v_to
      and (p_user_id is null or o.ejecutivo_responsable_id = p_user_id)
  ),
  previous_opportunities as (
    select o.*
    from public.oportunidades o
    where o.organization_id = v_org
      and o.deleted_at is null
      and o.created_at::date between v_prev_from and v_prev_to
      and (p_user_id is null or o.ejecutivo_responsable_id = p_user_id)
  ),
  active_pipeline as (
    select o.*
    from public.oportunidades o
    where o.organization_id = v_org
      and o.deleted_at is null
      and o.estado in ('abierta', 'postergada')
      and (p_user_id is null or o.ejecutivo_responsable_id = p_user_id)
  ),
  all_period_opportunities as (
    select o.*
    from public.oportunidades o
    where o.organization_id = v_org
      and o.deleted_at is null
      and coalesce(o.closed_at::date, o.updated_at::date, o.created_at::date)
          between v_from and v_to
      and (p_user_id is null or o.ejecutivo_responsable_id = p_user_id)
  ),
  current_tasks as (
    select t.*
    from public.tasks t
    where t.organization_id = v_org
      and (p_user_id is null or t.assigned_to = p_user_id)
  ),
  quote_metrics as (
    select
      count(*)::bigint as count_current,
      coalesce(sum(total), 0)::numeric as amount_current
    from current_quotes
  ),
  quote_previous_metrics as (
    select
      count(*)::bigint as count_previous,
      coalesce(sum(total), 0)::numeric as amount_previous
    from previous_quotes
  ),
  opportunity_metrics as (
    select
      count(*)::bigint as created_current,
      count(*) filter (where estado = 'ganada')::bigint as won_current
    from current_opportunities
  ),
  opportunity_previous_metrics as (
    select
      count(*)::bigint as created_previous,
      count(*) filter (where estado = 'ganada')::bigint as won_previous
    from previous_opportunities
  ),
  pipeline_metrics as (
    select
      count(*)::bigint as open_count,
      coalesce(sum(monto_estimado), 0)::numeric as gross_amount,
      coalesce(sum(
        monto_estimado::numeric
        * greatest(least(coalesce(probabilidad_cierre, 0), 100), 0)
        / 100.0
      ), 0)::numeric as weighted_amount,
      count(*) filter (
        where proxima_accion is null
           or btrim(proxima_accion) = ''
           or fecha_proxima_accion is null
      )::bigint as without_next_action
    from active_pipeline
  ),
  period_results as (
    select
      count(*) filter (where estado = 'ganada')::bigint as won,
      count(*) filter (where estado = 'perdida')::bigint as lost,
      count(*)::bigint as total
    from all_period_opportunities
  ),
  task_metrics as (
    select
      count(*) filter (where status in ('pending', 'in_progress'))::bigint as pending,
      count(*) filter (
        where status in ('pending', 'in_progress') and due_at < v_now
      )::bigint as overdue,
      count(*) filter (
        where status in ('pending', 'in_progress')
          and due_at >= v_now
          and due_at < v_now + interval '7 days'
      )::bigint as next_seven_days
    from current_tasks
  ),
  pipeline_by_stage as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage', stage,
        'count', opportunity_count,
        'amount', amount,
        'weighted_amount', weighted_amount,
        'share', case when total_amount = 0 then 0
          else round((amount / total_amount) * 100, 1) end
      ) order by stage_order, stage
    ), '[]'::jsonb) as data
    from (
      select
        etapa_comercial as stage,
        count(*)::bigint as opportunity_count,
        coalesce(sum(monto_estimado), 0)::numeric as amount,
        coalesce(sum(
          monto_estimado::numeric
          * greatest(least(coalesce(probabilidad_cierre, 0), 100), 0)
          / 100.0
        ), 0)::numeric as weighted_amount,
        sum(sum(coalesce(monto_estimado, 0))) over ()::numeric as total_amount,
        case lower(etapa_comercial)
          when 'prospección' then 10
          when 'calificación' then 20
          when 'cotización emitida' then 30
          when 'cotización enviada' then 40
          when 'recibida por el cliente' then 50
          when 'negociación' then 60
          when 'aprobada' then 70
          else 99
        end as stage_order
      from active_pipeline
      group by etapa_comercial
    ) s
  ),
  months as (
    select generate_series(
      date_trunc('month', v_to::timestamp) - interval '5 months',
      date_trunc('month', v_to::timestamp),
      interval '1 month'
    )::date as month_start
  ),
  monthly_evolution as (
    select jsonb_agg(
      jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'quoted_amount', coalesce(q.amount, 0),
        'quote_count', coalesce(q.quantity, 0),
        'opportunity_count', coalesce(o.quantity, 0),
        'won_amount', coalesce(w.amount, 0)
      ) order by m.month_start
    ) as data
    from months m
    left join lateral (
      select sum(c.total)::numeric as amount, count(*)::bigint as quantity
      from public.cotizaciones c
      where c.organization_id = v_org
        and c.deleted_at is null
        and c.fecha_emision >= m.month_start
        and c.fecha_emision < (m.month_start + interval '1 month')::date
        and (p_user_id is null or c.ejecutivo_responsable_id = p_user_id)
    ) q on true
    left join lateral (
      select count(*)::bigint as quantity
      from public.oportunidades o
      where o.organization_id = v_org
        and o.deleted_at is null
        and o.created_at >= m.month_start
        and o.created_at < m.month_start + interval '1 month'
        and (p_user_id is null or o.ejecutivo_responsable_id = p_user_id)
    ) o on true
    left join lateral (
      select sum(coalesce(cc.monto_cierre, 0))::numeric as amount
      from public.commercial_closures cc
      where cc.organization_id = v_org
        and cc.resultado = 'ganada'
        and cc.fecha_cierre >= m.month_start
        and cc.fecha_cierre < m.month_start + interval '1 month'
        and (
          p_user_id is null
          or exists (
            select 1 from public.oportunidades ox
            where ox.id = cc.oportunidad_id
              and ox.ejecutivo_responsable_id = p_user_id
          )
        )
    ) w on true
  ),
  upcoming_tasks as (
    select coalesce(jsonb_agg(row_data order by due_at) filter (where row_data is not null), '[]'::jsonb) as data
    from (
      select
        t.due_at,
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'type', t.task_type,
          'priority', t.priority,
          'status', t.status,
          'due_at', t.due_at,
          'is_overdue', t.due_at < v_now,
          'contact_id', t.contact_id,
          'contact_name', nullif(concat_ws(' ', c.nombre, c.apellido), ''),
          'quote_id', t.quote_id,
          'quote_number', q.numero_cotizacion
        ) as row_data
      from current_tasks t
      left join public.contactos c on c.id = t.contact_id and c.deleted_at is null
      left join public.cotizaciones q on q.id = t.quote_id and q.deleted_at is null
      where t.status in ('pending', 'in_progress')
      order by (t.due_at < v_now) desc, t.due_at
      limit 10
    ) x
  ),
  priority_opportunities as (
    select coalesce(jsonb_agg(row_data order by score desc, amount desc), '[]'::jsonb) as data
    from (
      select
        coalesce(o.monto_estimado, 0)::numeric as amount,
        (
          coalesce(o.probabilidad_cierre, 0)
          + case lower(coalesce(o.prioridad, ''))
              when 'urgente' then 30 when 'alta' then 20 when 'media' then 10 else 0 end
          + case lower(coalesce(o.temperatura, ''))
              when 'caliente' then 20 when 'tibia' then 10 else 0 end
          - case when o.fecha_proxima_accion is null then 20
                 when o.fecha_proxima_accion < v_now then 15 else 0 end
        )::numeric as score,
        jsonb_build_object(
          'id', o.id,
          'name', o.nombre,
          'stage', o.etapa_comercial,
          'status', o.estado,
          'amount', o.monto_estimado,
          'probability', o.probabilidad_cierre,
          'priority', o.prioridad,
          'temperature', o.temperatura,
          'estimated_close_date', o.fecha_estimada_cierre,
          'next_action', o.proxima_accion,
          'next_action_at', o.fecha_proxima_accion,
          'contact_name', nullif(concat_ws(' ', c.nombre, c.apellido), ''),
          'company_name', coalesce(e.nombre_fantasia, e.razon_social),
          'project_name', p.nombre
        ) as row_data
      from active_pipeline o
      left join public.contactos c on c.id = o.contacto_id and c.deleted_at is null
      left join public.empresas e on e.id = o.empresa_id and e.deleted_at is null
      left join public.proyectos p on p.id = o.proyecto_id and p.deleted_at is null
      order by score desc, amount desc
      limit 8
    ) x
  ),
  top_clients as (
    select coalesce(jsonb_agg(row_data order by active_amount desc), '[]'::jsonb) as data
    from (
      select
        sum(coalesce(c.total, 0))::numeric as active_amount,
        jsonb_build_object(
          'contact_id', con.id,
          'contact_name', nullif(concat_ws(' ', con.nombre, con.apellido), ''),
          'company_name', coalesce(e.nombre_fantasia, e.razon_social),
          'quote_count', count(distinct c.id),
          'opportunity_count', count(distinct o.id),
          'active_amount', sum(coalesce(c.total, 0)),
          'last_activity_at', max(coalesce(c.ultima_actividad_at, c.updated_at))
        ) as row_data
      from public.contactos con
      left join public.empresas e on e.id = con.empresa_id and e.deleted_at is null
      join public.cotizaciones c
        on c.contacto_id = con.id
       and c.organization_id = v_org
       and c.deleted_at is null
      left join public.oportunidades o
        on o.contacto_id = con.id
       and o.organization_id = v_org
       and o.deleted_at is null
      where con.organization_id = v_org
        and con.deleted_at is null
        and (p_user_id is null or c.ejecutivo_responsable_id = p_user_id)
      group by con.id, con.nombre, con.apellido, e.nombre_fantasia, e.razon_social
      order by active_amount desc
      limit 8
    ) x
  ),
  executives as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', concat_ws(' ', p.nombre, p.apellido),
        'role', p.rol,
        'active', p.estado = 'activo'
      ) order by p.nombre, p.apellido
    ), '[]'::jsonb) as data
    from public.profiles p
    where p.organization_id = v_org
      and p.estado = 'activo'
      and p.rol in ('admin', 'jefatura_comercial', 'ejecutivo_comercial')
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'previous_from', v_prev_from,
      'previous_to', v_prev_to,
      'user_id', p_user_id,
      'generated_at', v_now
    ),
    'kpis', jsonb_build_object(
      'quoted_amount', jsonb_build_object(
        'value', qm.amount_current,
        'count', qm.count_current,
        'previous', qpm.amount_previous,
        'change_pct', case when qpm.amount_previous = 0 then null
          else round(((qm.amount_current - qpm.amount_previous) / qpm.amount_previous) * 100, 1) end
      ),
      'open_opportunities', jsonb_build_object(
        'value', pm.open_count,
        'gross_amount', pm.gross_amount
      ),
      'weighted_pipeline', jsonb_build_object(
        'value', pm.weighted_amount,
        'gross_amount', pm.gross_amount
      ),
      'commercial_progress', jsonb_build_object(
        'won', pr.won,
        'lost', pr.lost,
        'total', pr.total,
        'rate', case when pr.total = 0 then 0
          else round((pr.won::numeric / pr.total::numeric) * 100, 1) end
      ),
      'pending_tasks', jsonb_build_object(
        'value', tm.pending,
        'next_seven_days', tm.next_seven_days
      ),
      'overdue_tasks', jsonb_build_object(
        'value', tm.overdue,
        'share', case when tm.pending = 0 then 0
          else round((tm.overdue::numeric / tm.pending::numeric) * 100, 1) end
      ),
      'opportunities_created', jsonb_build_object(
        'value', om.created_current,
        'previous', opm.created_previous
      ),
      'opportunities_without_next_action', pm.without_next_action
    ),
    'pipeline', pbs.data,
    'monthly_evolution', me.data,
    'upcoming_tasks', ut.data,
    'priority_opportunities', po.data,
    'top_clients', tc.data,
    'executives', ex.data,
    'data_quality', jsonb_build_object(
      'quotes_without_company', (
        select count(*) from public.cotizaciones c
        where c.organization_id = v_org and c.deleted_at is null and c.empresa_id is null
      ),
      'formal_closures', (
        select count(*) from public.commercial_closures cc where cc.organization_id = v_org
      )
    )
  )
  into v_result
  from quote_metrics qm
  cross join quote_previous_metrics qpm
  cross join opportunity_metrics om
  cross join opportunity_previous_metrics opm
  cross join pipeline_metrics pm
  cross join period_results pr
  cross join task_metrics tm
  cross join pipeline_by_stage pbs
  cross join monthly_evolution me
  cross join upcoming_tasks ut
  cross join priority_opportunities po
  cross join top_clients tc
  cross join executives ex;

  return v_result;
end
$function$;

revoke all on function public.commercial_dashboard(date, date, uuid) from public;
grant execute on function public.commercial_dashboard(date, date, uuid) to authenticated;

comment on function public.commercial_dashboard(date, date, uuid) is
  '0045: fuente analitica JSON para Dashboard y Reportes del CRM Thermikhaus';

-- Indices complementarios, no destructivos.
create index if not exists idx_cotizaciones_dashboard_period
  on public.cotizaciones (organization_id, fecha_emision, ejecutivo_responsable_id)
  where deleted_at is null;

create index if not exists idx_oportunidades_dashboard_created
  on public.oportunidades (organization_id, created_at, ejecutivo_responsable_id)
  where deleted_at is null;

create index if not exists idx_closures_dashboard_period
  on public.commercial_closures (organization_id, fecha_cierre, resultado);

commit;

-- Verificacion estructural desde SQL Editor.
-- La previsualizacion de datos debe ejecutarse desde una sesion autenticada del CRM,
-- porque auth.uid() es nulo dentro del SQL Editor de Supabase.
select
  '0045_commercial_analytics' as migration,
  to_regprocedure('public.commercial_dashboard(date,date,uuid)') is not null as function_exists,
  has_function_privilege(
    'authenticated',
    'public.commercial_dashboard(date,date,uuid)',
    'EXECUTE'
  ) as authenticated_can_execute,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_cotizaciones_dashboard_period'
  ) as quotes_index_exists,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_oportunidades_dashboard_created'
  ) as opportunities_index_exists,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_closures_dashboard_period'
  ) as closures_index_exists;
