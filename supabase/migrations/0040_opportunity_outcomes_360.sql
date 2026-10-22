begin;

-- C6: incorpora el historial de resultados de Oportunidades a la ficha 360.

create or replace function public.get_opportunity_outcomes(
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_result jsonb;
begin
  v_org_id := public.current_org();

  if auth.uid() is null or v_org_id is null then
    raise exception 'Debe iniciar sesión para consultar resultados comerciales.';
  end if;

  if not exists (
    select 1
    from public.oportunidades o
    where o.id = p_opportunity_id
      and o.organization_id = v_org_id
      and o.deleted_at is null
  ) then
    raise exception 'Oportunidad no encontrada o no autorizada.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oo.id,
        'outcome_type', oo.outcome_type,
        'previous_stage', oo.previous_stage,
        'previous_status', oo.previous_status,
        'new_stage', oo.new_stage,
        'new_status', oo.new_status,
        'effective_at', oo.effective_at,
        'closed_amount', oo.closed_amount,
        'loss_reason', oo.loss_reason,
        'competitor', oo.competitor,
        'postponement_reason', oo.postponement_reason,
        'reactivation_at', oo.reactivation_at,
        'comment', oo.comment,
        'created_by', oo.created_by,
        'created_by_name', nullif(
          trim(concat_ws(' ', pr.nombre, pr.apellido)),
          ''
        ),
        'created_at', oo.created_at
      )
      order by oo.effective_at desc, oo.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.opportunity_outcomes oo
  left join public.profiles pr
    on pr.id = oo.created_by
   and pr.organization_id = oo.organization_id
  where oo.organization_id = v_org_id
    and oo.opportunity_id = p_opportunity_id;

  return v_result;
end;
$$;

revoke all on function public.get_opportunity_outcomes(uuid) from public;
grant execute on function public.get_opportunity_outcomes(uuid) to authenticated;

commit;
