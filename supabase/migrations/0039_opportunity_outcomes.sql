begin;

-- C6: resultados comerciales de Oportunidades
-- Gestiona ganadas, perdidas, postergadas, canceladas y reaperturas.

create table if not exists public.opportunity_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  opportunity_id uuid not null references public.oportunidades(id),
  outcome_type text not null,
  previous_stage text,
  previous_status text,
  new_stage text not null,
  new_status text not null,
  effective_at timestamptz not null default now(),
  closed_amount numeric,
  loss_reason text,
  competitor text,
  postponement_reason text,
  reactivation_at timestamptz,
  comment text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint opportunity_outcomes_type_check check (
    outcome_type in ('ganada', 'perdida', 'postergada', 'cancelada', 'reabierta')
  ),
  constraint opportunity_outcomes_amount_check check (
    closed_amount is null or closed_amount >= 0
  ),
  constraint opportunity_outcomes_required_check check (
    (outcome_type = 'ganada' and closed_amount is not null)
    or (outcome_type = 'perdida' and nullif(trim(loss_reason), '') is not null)
    or (
      outcome_type = 'postergada'
      and nullif(trim(postponement_reason), '') is not null
      and reactivation_at is not null
    )
    or (outcome_type = 'cancelada' and nullif(trim(comment), '') is not null)
    or (outcome_type = 'reabierta')
  )
);

create index if not exists idx_opportunity_outcomes_org_opportunity
  on public.opportunity_outcomes (organization_id, opportunity_id, effective_at desc);

create index if not exists idx_opportunity_outcomes_org_type
  on public.opportunity_outcomes (organization_id, outcome_type, effective_at desc);

alter table public.opportunity_outcomes enable row level security;

drop policy if exists opportunity_outcomes_select on public.opportunity_outcomes;
create policy opportunity_outcomes_select
on public.opportunity_outcomes
for select
to authenticated
using (organization_id = public.current_org());

drop policy if exists opportunity_outcomes_insert on public.opportunity_outcomes;
create policy opportunity_outcomes_insert
on public.opportunity_outcomes
for insert
to authenticated
with check (
  organization_id = public.current_org()
  and created_by = auth.uid()
);

create or replace function public.close_opportunity(
  p_opportunity_id uuid,
  p_outcome_type text,
  p_effective_at timestamptz default now(),
  p_closed_amount numeric default null,
  p_loss_reason text default null,
  p_competitor text default null,
  p_postponement_reason text default null,
  p_reactivation_at timestamptz default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.oportunidades%rowtype;
  v_role text;
  v_stage text;
  v_status text;
  v_probability integer;
  v_history_id uuid;
begin
  if auth.uid() is null or public.current_org() is null then
    raise exception 'Debe iniciar sesión para registrar el resultado.';
  end if;

  select o.*
  into v_opportunity
  from public.oportunidades o
  where o.id = p_opportunity_id
    and o.organization_id = public.current_org()
    and o.deleted_at is null
  for update;

  if not found then
    raise exception 'Oportunidad no encontrada o no autorizada.';
  end if;

  select pr.rol
  into v_role
  from public.profiles pr
  where pr.id = auth.uid()
    and pr.organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No está autorizado para registrar resultados comerciales.';
  end if;

  if p_outcome_type not in ('ganada', 'perdida', 'postergada', 'cancelada') then
    raise exception 'Resultado comercial no válido.';
  end if;

  if p_effective_at is null then
    raise exception 'La fecha efectiva es obligatoria.';
  end if;

  if p_outcome_type = 'ganada' then
    if p_closed_amount is null or p_closed_amount < 0 then
      raise exception 'El monto de cierre es obligatorio y no puede ser negativo.';
    end if;
    v_stage := 'Aprobada';
    v_status := 'ganada';
    v_probability := 100;
  elsif p_outcome_type = 'perdida' then
    if nullif(trim(coalesce(p_loss_reason, '')), '') is null then
      raise exception 'El motivo de pérdida es obligatorio.';
    end if;
    v_stage := 'Perdida';
    v_status := 'perdida';
    v_probability := 0;
  elsif p_outcome_type = 'postergada' then
    if nullif(trim(coalesce(p_postponement_reason, '')), '') is null then
      raise exception 'El motivo de postergación es obligatorio.';
    end if;
    if p_reactivation_at is null or p_reactivation_at <= p_effective_at then
      raise exception 'La fecha de reactivación debe ser posterior a la fecha efectiva.';
    end if;
    v_stage := 'Postergada';
    v_status := 'postergada';
    v_probability := 30;
  else
    if nullif(trim(coalesce(p_comment, '')), '') is null then
      raise exception 'El comentario de cancelación es obligatorio.';
    end if;
    v_stage := 'Cancelada';
    v_status := 'cancelada';
    v_probability := 0;
  end if;

  insert into public.opportunity_outcomes (
    organization_id,
    opportunity_id,
    outcome_type,
    previous_stage,
    previous_status,
    new_stage,
    new_status,
    effective_at,
    closed_amount,
    loss_reason,
    competitor,
    postponement_reason,
    reactivation_at,
    comment,
    created_by
  ) values (
    public.current_org(),
    p_opportunity_id,
    p_outcome_type,
    v_opportunity.etapa_comercial,
    v_opportunity.estado,
    v_stage,
    v_status,
    p_effective_at,
    p_closed_amount,
    nullif(trim(p_loss_reason), ''),
    nullif(trim(p_competitor), ''),
    nullif(trim(p_postponement_reason), ''),
    p_reactivation_at,
    nullif(trim(p_comment), ''),
    auth.uid()
  )
  returning id into v_history_id;

  update public.oportunidades
  set
    etapa_comercial = v_stage,
    estado = v_status,
    probabilidad_cierre = v_probability,
    proxima_accion = case
      when p_outcome_type = 'postergada' then 'Retomar oportunidad postergada'
      else null
    end,
    fecha_proxima_accion = case
      when p_outcome_type = 'postergada' then p_reactivation_at
      else null
    end,
    updated_at = now()
  where id = p_opportunity_id;

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'history_id', v_history_id,
    'outcome_type', p_outcome_type,
    'stage', v_stage,
    'status', v_status,
    'probability', v_probability,
    'reactivation_at', p_reactivation_at
  );
end;
$$;

create or replace function public.reopen_opportunity(
  p_opportunity_id uuid,
  p_stage text,
  p_next_action text,
  p_next_at timestamptz,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.oportunidades%rowtype;
  v_role text;
  v_probability integer;
  v_history_id uuid;
begin
  if auth.uid() is null or public.current_org() is null then
    raise exception 'Debe iniciar sesión para reabrir la oportunidad.';
  end if;

  select o.*
  into v_opportunity
  from public.oportunidades o
  where o.id = p_opportunity_id
    and o.organization_id = public.current_org()
    and o.deleted_at is null
  for update;

  if not found then
    raise exception 'Oportunidad no encontrada o no autorizada.';
  end if;

  select pr.rol
  into v_role
  from public.profiles pr
  where pr.id = auth.uid()
    and pr.organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial') then
    raise exception 'Solo administración o jefatura puede reabrir oportunidades.';
  end if;

  if v_opportunity.estado not in ('ganada', 'perdida', 'cancelada', 'postergada') then
    raise exception 'La oportunidad ya está abierta.';
  end if;

  if p_stage not in (
    'Cotización emitida',
    'Cotización enviada',
    'Recibida por el cliente',
    'En evaluación',
    'Negociación'
  ) then
    raise exception 'La etapa de reapertura no es válida.';
  end if;

  if nullif(trim(coalesce(p_next_action, '')), '') is null or p_next_at is null then
    raise exception 'La próxima acción y su fecha son obligatorias.';
  end if;

  v_probability := public.opportunity_stage_probability(p_stage);

  insert into public.opportunity_outcomes (
    organization_id,
    opportunity_id,
    outcome_type,
    previous_stage,
    previous_status,
    new_stage,
    new_status,
    effective_at,
    comment,
    created_by
  ) values (
    public.current_org(),
    p_opportunity_id,
    'reabierta',
    v_opportunity.etapa_comercial,
    v_opportunity.estado,
    p_stage,
    'abierta',
    now(),
    nullif(trim(p_comment), ''),
    auth.uid()
  )
  returning id into v_history_id;

  update public.oportunidades
  set
    etapa_comercial = p_stage,
    estado = 'abierta',
    probabilidad_cierre = v_probability,
    proxima_accion = p_next_action,
    fecha_proxima_accion = p_next_at,
    updated_at = now()
  where id = p_opportunity_id;

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'history_id', v_history_id,
    'stage', p_stage,
    'status', 'abierta',
    'probability', v_probability
  );
end;
$$;

revoke all on function public.close_opportunity(
  uuid, text, timestamptz, numeric, text, text, text, timestamptz, text
) from public;
revoke all on function public.reopen_opportunity(
  uuid, text, text, timestamptz, text
) from public;

grant execute on function public.close_opportunity(
  uuid, text, timestamptz, numeric, text, text, text, timestamptz, text
) to authenticated;
grant execute on function public.reopen_opportunity(
  uuid, text, text, timestamptz, text
) to authenticated;

commit;
