-- C8: consolidacion final del Bloque C - Oportunidades
-- SOLO LECTURA. No crea, modifica ni elimina datos.

-- ============================================================
-- RESULTADO 1: RESUMEN GENERAL
-- ============================================================
select
  count(*) filter (where deleted_at is null) as oportunidades_activas,
  count(*) filter (where deleted_at is null and estado = 'abierta') as abiertas,
  count(*) filter (where deleted_at is null and estado = 'postergada') as postergadas,
  count(*) filter (where deleted_at is null and estado = 'ganada') as ganadas,
  count(*) filter (where deleted_at is null and estado = 'perdida') as perdidas,
  count(*) filter (where deleted_at is null and estado = 'cancelada') as canceladas,
  coalesce(sum(monto_estimado) filter (
    where deleted_at is null and estado in ('abierta', 'postergada')
  ), 0) as pipeline_total,
  coalesce(round(sum(
    coalesce(monto_estimado, 0) * coalesce(probabilidad_cierre, 0) / 100.0
  ) filter (
    where deleted_at is null and estado in ('abierta', 'postergada')
  ), 0), 0) as pipeline_ponderado
from public.oportunidades;

-- ============================================================
-- RESULTADO 2: FUNCIONES Y TABLAS DEL BLOQUE C
-- ============================================================
select
  'FUNCTION'::text as object_type,
  p.proname as object_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_opportunity_catalogs',
    'find_opportunity_matches',
    'change_opportunity_stage',
    'get_opportunity_360',
    'update_opportunity',
    'close_opportunity',
    'reopen_opportunity',
    'get_opportunity_outcomes',
    'get_opportunity_forecast'
  )

union all

select
  'TABLE',
  t.table_name,
  null
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name = 'opportunity_outcomes'
order by object_type, object_name;

-- ============================================================
-- RESULTADO 3: DATOS OBLIGATORIOS INVALIDOS
-- Debe devolver cero filas.
-- ============================================================
select
  o.id,
  o.nombre,
  o.estado,
  o.etapa_comercial,
  case
    when nullif(trim(coalesce(o.nombre, '')), '') is null then 'SIN_NOMBRE'
    when o.monto_estimado is not null and o.monto_estimado < 0 then 'MONTO_NEGATIVO'
    when o.contacto_id is null then 'SIN_CONTACTO'
    when o.proyecto_id is null then 'SIN_PROYECTO'
    when o.prioridad not in ('Baja', 'Media', 'Alta', 'Crítica') then 'PRIORIDAD_INVALIDA'
    when o.temperatura not in ('Fría', 'Tibia', 'Caliente') then 'TEMPERATURA_INVALIDA'
    when o.probabilidad_cierre < 0 or o.probabilidad_cierre > 100 then 'PROBABILIDAD_INVALIDA'
    when o.estado in ('abierta', 'postergada')
      and nullif(trim(coalesce(o.proxima_accion, '')), '') is null
      then 'SIN_PROXIMA_ACCION'
    when o.estado in ('abierta', 'postergada')
      and o.fecha_proxima_accion is null
      then 'SIN_FECHA_PROXIMA_ACCION'
    else 'OK'
  end as problema
from public.oportunidades o
where o.deleted_at is null
  and (
    nullif(trim(coalesce(o.nombre, '')), '') is null
    or (o.monto_estimado is not null and o.monto_estimado < 0)
    or o.contacto_id is null
    or o.proyecto_id is null
    or o.prioridad not in ('Baja', 'Media', 'Alta', 'Crítica')
    or o.temperatura not in ('Fría', 'Tibia', 'Caliente')
    or o.probabilidad_cierre < 0
    or o.probabilidad_cierre > 100
    or (
      o.estado in ('abierta', 'postergada')
      and (
        nullif(trim(coalesce(o.proxima_accion, '')), '') is null
        or o.fecha_proxima_accion is null
      )
    )
  )
order by o.nombre;

-- ============================================================
-- RESULTADO 4: RELACIONES INVALIDAS O INCONSISTENTES
-- Debe devolver cero filas.
-- ============================================================
select
  o.id,
  o.nombre,
  o.contacto_id,
  o.proyecto_id,
  o.empresa_id,
  p.empresa_id as empresa_proyecto,
  case
    when c.id is null then 'CONTACTO_INVALIDO'
    when p.id is null then 'PROYECTO_INVALIDO'
    when o.empresa_id is not null and e.id is null then 'EMPRESA_INVALIDA'
    when o.empresa_id is distinct from p.empresa_id then 'EMPRESA_DIFERENTE_AL_PROYECTO'
    else 'OK'
  end as problema
from public.oportunidades o
left join public.contactos c
  on c.id = o.contacto_id
 and c.organization_id = o.organization_id
 and c.deleted_at is null
left join public.proyectos p
  on p.id = o.proyecto_id
 and p.organization_id = o.organization_id
 and p.deleted_at is null
left join public.empresas e
  on e.id = o.empresa_id
 and e.organization_id = o.organization_id
 and e.deleted_at is null
where o.deleted_at is null
  and (
    c.id is null
    or p.id is null
    or (o.empresa_id is not null and e.id is null)
    or o.empresa_id is distinct from p.empresa_id
  )
order by o.nombre;

-- ============================================================
-- RESULTADO 5: ETAPA, ESTADO Y PROBABILIDAD INCOHERENTES
-- Debe devolver cero filas.
-- ============================================================
select
  o.id,
  o.nombre,
  o.etapa_comercial,
  o.estado,
  o.probabilidad_cierre,
  case
    when o.etapa_comercial = 'Aprobada'
      and (o.estado <> 'ganada' or o.probabilidad_cierre <> 100)
      then 'APROBADA_INCOHERENTE'
    when o.etapa_comercial = 'Perdida'
      and (o.estado <> 'perdida' or o.probabilidad_cierre <> 0)
      then 'PERDIDA_INCOHERENTE'
    when o.etapa_comercial = 'Cancelada'
      and (o.estado <> 'cancelada' or o.probabilidad_cierre <> 0)
      then 'CANCELADA_INCOHERENTE'
    when o.etapa_comercial = 'Postergada'
      and (o.estado <> 'postergada' or o.probabilidad_cierre <> 30)
      then 'POSTERGADA_INCOHERENTE'
    when o.etapa_comercial in (
      'Cotización emitida',
      'Cotización enviada',
      'Recibida por el cliente',
      'En evaluación',
      'Negociación'
    ) and o.estado <> 'abierta'
      then 'ETAPA_ABIERTA_INCOHERENTE'
    else 'OK'
  end as problema
from public.oportunidades o
where o.deleted_at is null
  and (
    (o.etapa_comercial = 'Aprobada' and (o.estado <> 'ganada' or o.probabilidad_cierre <> 100))
    or (o.etapa_comercial = 'Perdida' and (o.estado <> 'perdida' or o.probabilidad_cierre <> 0))
    or (o.etapa_comercial = 'Cancelada' and (o.estado <> 'cancelada' or o.probabilidad_cierre <> 0))
    or (o.etapa_comercial = 'Postergada' and (o.estado <> 'postergada' or o.probabilidad_cierre <> 30))
    or (
      o.etapa_comercial in (
        'Cotización emitida',
        'Cotización enviada',
        'Recibida por el cliente',
        'En evaluación',
        'Negociación'
      )
      and o.estado <> 'abierta'
    )
  )
order by o.nombre;

-- ============================================================
-- RESULTADO 6: RESULTADOS COMERCIALES INVALIDOS
-- Debe devolver cero filas.
-- ============================================================
select
  oo.id,
  oo.opportunity_id,
  oo.outcome_type,
  case
    when oo.outcome_type = 'ganada'
      and (oo.closed_amount is null or oo.closed_amount < 0)
      then 'GANADA_SIN_MONTO'
    when oo.outcome_type = 'perdida'
      and nullif(trim(coalesce(oo.loss_reason, '')), '') is null
      then 'PERDIDA_SIN_MOTIVO'
    when oo.outcome_type = 'postergada'
      and (
        nullif(trim(coalesce(oo.postponement_reason, '')), '') is null
        or oo.reactivation_at is null
        or oo.reactivation_at <= oo.effective_at
      ) then 'POSTERGADA_INVALIDA'
    when oo.outcome_type = 'cancelada'
      and nullif(trim(coalesce(oo.comment, '')), '') is null
      then 'CANCELADA_SIN_MOTIVO'
    else 'OK'
  end as problema
from public.opportunity_outcomes oo
where
  (oo.outcome_type = 'ganada' and (oo.closed_amount is null or oo.closed_amount < 0))
  or (oo.outcome_type = 'perdida' and nullif(trim(coalesce(oo.loss_reason, '')), '') is null)
  or (
    oo.outcome_type = 'postergada'
    and (
      nullif(trim(coalesce(oo.postponement_reason, '')), '') is null
      or oo.reactivation_at is null
      or oo.reactivation_at <= oo.effective_at
    )
  )
  or (oo.outcome_type = 'cancelada' and nullif(trim(coalesce(oo.comment, '')), '') is null)
order by oo.created_at;

-- ============================================================
-- RESULTADO 7: ULTIMO RESULTADO VERSUS OPORTUNIDAD
-- Debe devolver cero filas.
-- ============================================================
with latest_outcome as (
  select distinct on (oo.opportunity_id)
    oo.*
  from public.opportunity_outcomes oo
  order by oo.opportunity_id, oo.effective_at desc, oo.created_at desc
)
select
  o.id,
  o.nombre,
  o.etapa_comercial,
  o.estado,
  o.probabilidad_cierre,
  lo.outcome_type,
  lo.new_stage,
  lo.new_status
from latest_outcome lo
join public.oportunidades o on o.id = lo.opportunity_id
where
  (lo.outcome_type = 'ganada' and (o.etapa_comercial <> 'Aprobada' or o.estado <> 'ganada' or o.probabilidad_cierre <> 100))
  or (lo.outcome_type = 'perdida' and (o.etapa_comercial <> 'Perdida' or o.estado <> 'perdida' or o.probabilidad_cierre <> 0))
  or (lo.outcome_type = 'cancelada' and (o.etapa_comercial <> 'Cancelada' or o.estado <> 'cancelada' or o.probabilidad_cierre <> 0))
  or (lo.outcome_type = 'postergada' and (o.etapa_comercial <> 'Postergada' or o.estado <> 'postergada' or o.probabilidad_cierre <> 30))
  or (lo.outcome_type = 'reabierta' and o.estado <> 'abierta')
order by o.nombre;

-- ============================================================
-- RESULTADO 8: VALIDACION MATEMATICA DEL PIPELINE
-- Debe mostrar diferencia_total = 0 y diferencia_ponderada = 0.
-- ============================================================
with detail as (
  select
    coalesce(sum(o.monto_estimado), 0) as pipeline_total,
    coalesce(round(sum(
      coalesce(o.monto_estimado, 0) * coalesce(o.probabilidad_cierre, 0) / 100.0
    ), 0), 0) as pipeline_ponderado
  from public.oportunidades o
  where o.deleted_at is null
    and o.estado in ('abierta', 'postergada')
),
by_stage as (
  select
    coalesce(sum(stage_total), 0) as pipeline_total,
    coalesce(sum(stage_weighted), 0) as pipeline_ponderado
  from (
    select
      o.etapa_comercial,
      coalesce(sum(o.monto_estimado), 0) as stage_total,
      coalesce(round(sum(
        coalesce(o.monto_estimado, 0) * coalesce(o.probabilidad_cierre, 0) / 100.0
      ), 0), 0) as stage_weighted
    from public.oportunidades o
    where o.deleted_at is null
      and o.estado in ('abierta', 'postergada')
    group by o.etapa_comercial
  ) s
)
select
  detail.pipeline_total as total_detalle,
  by_stage.pipeline_total as total_por_etapa,
  detail.pipeline_total - by_stage.pipeline_total as diferencia_total,
  detail.pipeline_ponderado as ponderado_detalle,
  by_stage.pipeline_ponderado as ponderado_por_etapa,
  detail.pipeline_ponderado - by_stage.pipeline_ponderado as diferencia_ponderada
from detail, by_stage;

-- ============================================================
-- RESULTADO 9: RIESGOS INFORMativos DEL PIPELINE
-- No impide el cierre, pero requiere gestión comercial.
-- ============================================================
select
  o.id,
  o.nombre,
  o.monto_estimado,
  o.etapa_comercial,
  o.prioridad,
  o.fecha_estimada_cierre,
  o.proxima_accion,
  o.fecha_proxima_accion,
  case
    when o.fecha_proxima_accion is null then 'SIN_FECHA_PROXIMA_ACCION'
    when o.fecha_proxima_accion < now() then 'SEGUIMIENTO_ATRASADO'
    when o.fecha_estimada_cierre is null then 'SIN_FECHA_ESTIMADA_CIERRE'
    when o.fecha_estimada_cierre < current_date then 'CIERRE_ESTIMADO_VENCIDO'
    else 'OK'
  end as riesgo
from public.oportunidades o
where o.deleted_at is null
  and o.estado in ('abierta', 'postergada')
  and (
    o.fecha_proxima_accion is null
    or o.fecha_proxima_accion < now()
    or o.fecha_estimada_cierre is null
    or o.fecha_estimada_cierre < current_date
  )
order by o.monto_estimado desc nulls last;

-- ============================================================
-- RESULTADO 10: CONSISTENCIA FINAL AUTOMATICA
-- ============================================================
with
function_check as (
  select count(distinct p.proname) as cantidad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_opportunity_catalogs',
      'find_opportunity_matches',
      'change_opportunity_stage',
      'get_opportunity_360',
      'update_opportunity',
      'close_opportunity',
      'reopen_opportunity',
      'get_opportunity_outcomes',
      'get_opportunity_forecast'
    )
),
table_check as (
  select count(*) as cantidad
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'opportunity_outcomes'
),
invalid_data as (
  select o.id
  from public.oportunidades o
  where o.deleted_at is null
    and (
      nullif(trim(coalesce(o.nombre, '')), '') is null
      or (o.monto_estimado is not null and o.monto_estimado < 0)
      or o.contacto_id is null
      or o.proyecto_id is null
      or o.prioridad not in ('Baja', 'Media', 'Alta', 'Crítica')
      or o.temperatura not in ('Fría', 'Tibia', 'Caliente')
      or o.probabilidad_cierre < 0
      or o.probabilidad_cierre > 100
      or (
        o.estado in ('abierta', 'postergada')
        and (
          nullif(trim(coalesce(o.proxima_accion, '')), '') is null
          or o.fecha_proxima_accion is null
        )
      )
    )
),
invalid_relations as (
  select o.id
  from public.oportunidades o
  left join public.contactos c
    on c.id = o.contacto_id
   and c.organization_id = o.organization_id
   and c.deleted_at is null
  left join public.proyectos p
    on p.id = o.proyecto_id
   and p.organization_id = o.organization_id
   and p.deleted_at is null
  left join public.empresas e
    on e.id = o.empresa_id
   and e.organization_id = o.organization_id
   and e.deleted_at is null
  where o.deleted_at is null
    and (
      c.id is null
      or p.id is null
      or (o.empresa_id is not null and e.id is null)
      or o.empresa_id is distinct from p.empresa_id
    )
),
stage_mismatch as (
  select o.id
  from public.oportunidades o
  where o.deleted_at is null
    and (
      (o.etapa_comercial = 'Aprobada' and (o.estado <> 'ganada' or o.probabilidad_cierre <> 100))
      or (o.etapa_comercial = 'Perdida' and (o.estado <> 'perdida' or o.probabilidad_cierre <> 0))
      or (o.etapa_comercial = 'Cancelada' and (o.estado <> 'cancelada' or o.probabilidad_cierre <> 0))
      or (o.etapa_comercial = 'Postergada' and (o.estado <> 'postergada' or o.probabilidad_cierre <> 30))
      or (
        o.etapa_comercial in (
          'Cotización emitida',
          'Cotización enviada',
          'Recibida por el cliente',
          'En evaluación',
          'Negociación'
        )
        and o.estado <> 'abierta'
      )
    )
),
invalid_outcomes as (
  select oo.id
  from public.opportunity_outcomes oo
  where
    (oo.outcome_type = 'ganada' and (oo.closed_amount is null or oo.closed_amount < 0))
    or (oo.outcome_type = 'perdida' and nullif(trim(coalesce(oo.loss_reason, '')), '') is null)
    or (
      oo.outcome_type = 'postergada'
      and (
        nullif(trim(coalesce(oo.postponement_reason, '')), '') is null
        or oo.reactivation_at is null
        or oo.reactivation_at <= oo.effective_at
      )
    )
    or (oo.outcome_type = 'cancelada' and nullif(trim(coalesce(oo.comment, '')), '') is null)
),
latest_outcome as (
  select distinct on (oo.opportunity_id) oo.*
  from public.opportunity_outcomes oo
  order by oo.opportunity_id, oo.effective_at desc, oo.created_at desc
),
outcome_mismatch as (
  select o.id
  from latest_outcome lo
  join public.oportunidades o on o.id = lo.opportunity_id
  where
    (lo.outcome_type = 'ganada' and (o.etapa_comercial <> 'Aprobada' or o.estado <> 'ganada' or o.probabilidad_cierre <> 100))
    or (lo.outcome_type = 'perdida' and (o.etapa_comercial <> 'Perdida' or o.estado <> 'perdida' or o.probabilidad_cierre <> 0))
    or (lo.outcome_type = 'cancelada' and (o.etapa_comercial <> 'Cancelada' or o.estado <> 'cancelada' or o.probabilidad_cierre <> 0))
    or (lo.outcome_type = 'postergada' and (o.etapa_comercial <> 'Postergada' or o.estado <> 'postergada' or o.probabilidad_cierre <> 30))
    or (lo.outcome_type = 'reabierta' and o.estado <> 'abierta')
),
math_check as (
  select
    coalesce(sum(o.monto_estimado), 0) as pipeline_total,
    coalesce(round(sum(
      coalesce(o.monto_estimado, 0) * coalesce(o.probabilidad_cierre, 0) / 100.0
    ), 0), 0) as pipeline_ponderado
  from public.oportunidades o
  where o.deleted_at is null
    and o.estado in ('abierta', 'postergada')
)
select
  (select cantidad from function_check) as funciones_bloque_c,
  (select cantidad from table_check) as tablas_bloque_c,
  (select count(*) from invalid_data) as datos_invalidos,
  (select count(*) from invalid_relations) as relaciones_invalidas,
  (select count(*) from stage_mismatch) as etapas_incoherentes,
  (select count(*) from invalid_outcomes) as resultados_invalidos,
  (select count(*) from outcome_mismatch) as historial_incoherente,
  (select pipeline_total from math_check) as pipeline_total,
  (select pipeline_ponderado from math_check) as pipeline_ponderado,
  case
    when (select cantidad from function_check) = 9
     and (select cantidad from table_check) = 1
     and (select count(*) from invalid_data) = 0
     and (select count(*) from invalid_relations) = 0
     and (select count(*) from stage_mismatch) = 0
     and (select count(*) from invalid_outcomes) = 0
     and (select count(*) from outcome_mismatch) = 0
      then 'BLOQUE_C_CONSISTENTE'
    else 'BLOQUE_C_REQUIERE_REVISION'
  end as resultado_final;
