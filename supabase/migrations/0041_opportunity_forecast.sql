begin;

-- ============================================================
-- C7: Forecast comercial de Oportunidades
-- Genera indicadores, escenarios, proyeccion mensual, etapas,
-- principales oportunidades y riesgos comerciales.
-- ============================================================

create or replace function public.get_opportunity_forecast(
  p_start_date date default current_date,
  p_months integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_start_month date;
  v_end_month date;
  v_result jsonb;
begin
  v_org_id := public.current_org();

  if auth.uid() is null or v_org_id is null then
    raise exception 'Debe iniciar sesión para consultar el forecast.';
  end if;

  if p_start_date is null then
    raise exception 'La fecha inicial es obligatoria.';
  end if;

  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'La cantidad de meses debe estar entre 1 y 24.';
  end if;

  v_start_month := date_trunc('month', p_start_date)::date;
  v_end_month := (v_start_month + make_interval(months => p_months))::date;

  with active_opportunities as (
    select
      o.*,
      coalesce(o.monto_estimado, 0)::numeric as amount,
      coalesce(o.probabilidad_cierre, 0)::numeric as probability,
      round(
        coalesce(o.monto_estimado, 0)
        * coalesce(o.probabilidad_cierre, 0)
        / 100.0,
        0
      ) as weighted_amount
    from public.oportunidades o
    where o.organization_id = v_org_id
      and o.deleted_at is null
      and o.estado in ('abierta', 'postergada')
  ),
  period_outcomes as (
    select oo.*
    from public.opportunity_outcomes oo
    where oo.organization_id = v_org_id
      and oo.effective_at >= v_start_month
      and oo.effective_at < v_end_month
  ),
  months as (
    select
      generate_series(
        v_start_month::timestamp,
        (v_end_month - interval '1 month')::timestamp,
        interval '1 month'
      )::date as month_start
  )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'start_month', v_start_month,
      'end_month_exclusive', v_end_month,
      'months', p_months,
      'generated_at', now()
    ),
    'summary', jsonb_build_object(
      'active_opportunities', (
        select count(*) from active_opportunities
      ),
      'pipeline_total', (
        select coalesce(sum(amount), 0) from active_opportunities
      ),
      'pipeline_weighted', (
        select coalesce(sum(weighted_amount), 0) from active_opportunities
      ),
      'scenario_conservative', (
        select coalesce(round(sum(weighted_amount * 0.70), 0), 0)
        from active_opportunities
      ),
      'scenario_probable', (
        select coalesce(sum(weighted_amount), 0)
        from active_opportunities
      ),
      'scenario_potential', (
        select coalesce(sum(amount), 0)
        from active_opportunities
      ),
      'won_amount_period', (
        select coalesce(sum(closed_amount), 0)
        from period_outcomes
        where outcome_type = 'ganada'
      ),
      'won_count_period', (
        select count(*)
        from period_outcomes
        where outcome_type = 'ganada'
      ),
      'lost_count_period', (
        select count(*)
        from period_outcomes
        where outcome_type = 'perdida'
      ),
      'postponed_count_period', (
        select count(*)
        from period_outcomes
        where outcome_type = 'postergada'
      ),
      'overdue_followups', (
        select count(*)
        from active_opportunities
        where fecha_proxima_accion is null
           or fecha_proxima_accion < now()
      ),
      'without_estimated_close_date', (
        select count(*)
        from active_opportunities
        where fecha_estimada_cierre is null
      ),
      'high_value_opportunities', (
        select count(*)
        from active_opportunities
        where amount >= 10000000
      )
    ),
    'monthly_forecast', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'month', m.month_start,
          'label', to_char(m.month_start, 'YYYY-MM'),
          'opportunities', (
            select count(*)
            from active_opportunities ao
            where ao.fecha_estimada_cierre >= m.month_start
              and ao.fecha_estimada_cierre < (m.month_start + interval '1 month')
          ),
          'pipeline_total', (
            select coalesce(sum(ao.amount), 0)
            from active_opportunities ao
            where ao.fecha_estimada_cierre >= m.month_start
              and ao.fecha_estimada_cierre < (m.month_start + interval '1 month')
          ),
          'scenario_conservative', (
            select coalesce(round(sum(ao.weighted_amount * 0.70), 0), 0)
            from active_opportunities ao
            where ao.fecha_estimada_cierre >= m.month_start
              and ao.fecha_estimada_cierre < (m.month_start + interval '1 month')
          ),
          'scenario_probable', (
            select coalesce(sum(ao.weighted_amount), 0)
            from active_opportunities ao
            where ao.fecha_estimada_cierre >= m.month_start
              and ao.fecha_estimada_cierre < (m.month_start + interval '1 month')
          ),
          'scenario_potential', (
            select coalesce(sum(ao.amount), 0)
            from active_opportunities ao
            where ao.fecha_estimada_cierre >= m.month_start
              and ao.fecha_estimada_cierre < (m.month_start + interval '1 month')
          ),
          'won_amount', (
            select coalesce(sum(po.closed_amount), 0)
            from period_outcomes po
            where po.outcome_type = 'ganada'
              and po.effective_at >= m.month_start
              and po.effective_at < (m.month_start + interval '1 month')
          ),
          'won_count', (
            select count(*)
            from period_outcomes po
            where po.outcome_type = 'ganada'
              and po.effective_at >= m.month_start
              and po.effective_at < (m.month_start + interval '1 month')
          ),
          'lost_count', (
            select count(*)
            from period_outcomes po
            where po.outcome_type = 'perdida'
              and po.effective_at >= m.month_start
              and po.effective_at < (m.month_start + interval '1 month')
          )
        )
        order by m.month_start
      )
      from months m
    ), '[]'::jsonb),
    'by_stage', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage', grouped.etapa_comercial,
          'opportunities', grouped.opportunities,
          'pipeline_total', grouped.pipeline_total,
          'pipeline_weighted', grouped.pipeline_weighted,
          'probability_average', grouped.probability_average
        )
        order by grouped.stage_order, grouped.etapa_comercial
      )
      from (
        select
          ao.etapa_comercial,
          count(*) as opportunities,
          coalesce(sum(ao.amount), 0) as pipeline_total,
          coalesce(sum(ao.weighted_amount), 0) as pipeline_weighted,
          coalesce(round(avg(ao.probability), 2), 0) as probability_average,
          case ao.etapa_comercial
            when 'Cotización emitida' then 10
            when 'Cotización enviada' then 20
            when 'Recibida por el cliente' then 30
            when 'En evaluación' then 40
            when 'Negociación' then 50
            when 'Postergada' then 60
            else 99
          end as stage_order
        from active_opportunities ao
        group by ao.etapa_comercial
      ) grouped
    ), '[]'::jsonb),
    'top_opportunities', coalesce((
      select jsonb_agg(to_jsonb(top_rows) order by top_rows.amount desc)
      from (
        select
          ao.id,
          ao.nombre,
          ao.etapa_comercial,
          ao.estado,
          ao.amount,
          ao.probability,
          ao.weighted_amount,
          ao.prioridad,
          ao.temperatura,
          ao.fecha_estimada_cierre,
          ao.proxima_accion,
          ao.fecha_proxima_accion,
          p.nombre as proyecto,
          c.nombre as contacto_nombre,
          c.apellido as contacto_apellido,
          e.razon_social as empresa
        from active_opportunities ao
        left join public.proyectos p
          on p.id = ao.proyecto_id
         and p.organization_id = ao.organization_id
        left join public.contactos c
          on c.id = ao.contacto_id
         and c.organization_id = ao.organization_id
        left join public.empresas e
          on e.id = ao.empresa_id
         and e.organization_id = ao.organization_id
        order by ao.amount desc, ao.updated_at desc
        limit 10
      ) top_rows
    ), '[]'::jsonb),
    'risks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ao.id,
          'nombre', ao.nombre,
          'amount', ao.amount,
          'stage', ao.etapa_comercial,
          'priority', ao.prioridad,
          'temperature', ao.temperatura,
          'next_action', ao.proxima_accion,
          'next_action_at', ao.fecha_proxima_accion,
          'estimated_close_date', ao.fecha_estimada_cierre,
          'risk_type', case
            when ao.fecha_proxima_accion is null then 'SIN_FECHA_PROXIMA_ACCION'
            when ao.fecha_proxima_accion < now() then 'SEGUIMIENTO_ATRASADO'
            when ao.fecha_estimada_cierre is null then 'SIN_FECHA_ESTIMADA_CIERRE'
            when ao.fecha_estimada_cierre < current_date then 'CIERRE_ESTIMADO_VENCIDO'
            else 'REVISAR'
          end
        )
        order by
          case
            when ao.fecha_proxima_accion is null then 1
            when ao.fecha_proxima_accion < now() then 2
            when ao.fecha_estimada_cierre is null then 3
            when ao.fecha_estimada_cierre < current_date then 4
            else 5
          end,
          ao.amount desc
      )
      from active_opportunities ao
      where ao.fecha_proxima_accion is null
         or ao.fecha_proxima_accion < now()
         or ao.fecha_estimada_cierre is null
         or ao.fecha_estimada_cierre < current_date
    ), '[]'::jsonb),
    'loss_reasons', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'reason', grouped.loss_reason,
          'opportunities', grouped.opportunities
        )
        order by grouped.opportunities desc, grouped.loss_reason
      )
      from (
        select
          coalesce(nullif(trim(po.loss_reason), ''), 'Sin motivo') as loss_reason,
          count(*) as opportunities
        from period_outcomes po
        where po.outcome_type = 'perdida'
        group by coalesce(nullif(trim(po.loss_reason), ''), 'Sin motivo')
      ) grouped
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_opportunity_forecast(date, integer) from public;
grant execute on function public.get_opportunity_forecast(date, integer) to authenticated;

commit;
