create table public.ai_settings(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) unique,
 enabled boolean not null default true, consent_required boolean not null default true,
 monthly_request_limit int not null default 1000 check(monthly_request_limit>=0),
 allowed_roles app_role[] not null default array['admin','jefatura_comercial','ejecutivo_comercial']::app_role[],
 model_override text, data_retention_days int not null default 90,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ai_usage_logs(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 user_id uuid not null references profiles(id), feature text not null, entity_type text, entity_id uuid,
 input_tokens int not null default 0, output_tokens int not null default 0,
 status text not null, error_code text, records_used jsonb not null default '[]',
 created_at timestamptz not null default now()
);
create table public.ai_consents(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 user_id uuid not null references profiles(id), granted boolean not null, policy_version text not null,
 granted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
 unique(user_id,policy_version)
);
create table public.commercial_goals(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 user_id uuid references profiles(id), period_start date not null, period_end date not null,
 target_amount bigint not null default 0, target_quotes int not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table ai_settings enable row level security; alter table ai_usage_logs enable row level security;
alter table ai_consents enable row level security; alter table commercial_goals enable row level security;
create policy ai_settings_read on ai_settings for select using(organization_id=current_org());
create policy ai_settings_admin on ai_settings for all using(organization_id=current_org() and current_role()='admin') with check(organization_id=current_org() and current_role()='admin');
create policy ai_logs_read on ai_usage_logs for select using(organization_id=current_org() and (user_id=auth.uid() or current_role()='admin'));
create policy ai_logs_insert on ai_usage_logs for insert with check(organization_id=current_org() and user_id=auth.uid());
create policy ai_consent_owner on ai_consents for all using(organization_id=current_org() and user_id=auth.uid()) with check(organization_id=current_org() and user_id=auth.uid());
create policy goals_read on commercial_goals for select using(organization_id=current_org());
create policy goals_manage on commercial_goals for all using(organization_id=current_org() and current_role() in ('admin','jefatura_comercial')) with check(organization_id=current_org() and current_role() in ('admin','jefatura_comercial'));

create or replace function public.commercial_report(p_from date,p_to date)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'desde',p_from,'hasta',p_to,
  'prospectos_nuevos',(select count(*) from prospectos where organization_id=current_org() and fecha_ingreso between p_from and p_to),
  'cotizaciones_emitidas',(select count(*) from cotizaciones where organization_id=current_org() and fecha_emision between p_from and p_to and deleted_at is null),
  'neto_cotizado',(select coalesce(sum(neto_afecto+neto_exento),0) from cotizaciones where organization_id=current_org() and fecha_emision between p_from and p_to and deleted_at is null),
  'iva',(select coalesce(sum(iva),0) from cotizaciones where organization_id=current_org() and fecha_emision between p_from and p_to and deleted_at is null),
  'total_cotizado',(select coalesce(sum(total),0) from cotizaciones where organization_id=current_org() and fecha_emision between p_from and p_to and deleted_at is null),
  'aprobadas',(select count(*) from cotizaciones where organization_id=current_org() and estado='Aprobada' and fecha_emision between p_from and p_to and deleted_at is null),
  'rechazadas',(select count(*) from cotizaciones where organization_id=current_org() and estado in ('Rechazada','Perdida') and fecha_emision between p_from and p_to and deleted_at is null),
  'sin_seguimiento',(select count(*) from cotizaciones where organization_id=current_org() and estado in ('Enviada','En seguimiento','En negociación') and fecha_proximo_seguimiento is null and deleted_at is null),
  'seguimientos_atrasados',(select count(*) from tasks where organization_id=current_org() and estado='pendiente' and fecha_hora_vencimiento<now()),
  'actividades',(select count(*) from activities where organization_id=current_org() and fecha_hora_inicio::date between p_from and p_to),
  'm2_cotizados',(select coalesce(sum(metros_cuadrados),0) from cotizaciones where organization_id=current_org() and fecha_emision between p_from and p_to and deleted_at is null),
  'm2_aprobados',(select coalesce(sum(metros_cuadrados),0) from cotizaciones where organization_id=current_org() and estado='Aprobada' and fecha_emision between p_from and p_to and deleted_at is null)
 )
$$;
create index idx_ai_usage_month on ai_usage_logs(organization_id,user_id,created_at);
create index idx_quotes_report on cotizaciones(organization_id,fecha_emision,estado);

create or replace function public.calculate_opportunity_score(p_id uuid) returns int language plpgsql stable security definer set search_path=public as $$
declare o oportunidades%rowtype; score int:=0; has_quote boolean; activity_days int;
begin
 select * into o from oportunidades where id=p_id and organization_id=current_org(); if o.id is null then return 0; end if;
 score:=least(30,coalesce(o.probabilidad_cierre,0)*30/100);
 score:=score+case o.temperatura when 'Caliente' then 20 when 'Tibia' then 12 else 5 end;
 select exists(select 1 from cotizaciones where oportunidad_id=o.id and deleted_at is null) into has_quote; if has_quote then score:=score+20; end if;
 activity_days:=coalesce(extract(day from now()-o.ultima_actividad_at)::int,999); score:=score+case when activity_days<=3 then 20 when activity_days<=7 then 12 when activity_days<=14 then 5 else 0 end;
 if o.fecha_proxima_accion is not null then score:=score+10; end if;
 return greatest(0,least(100,score));
end $$;

create or replace view public.opportunity_health with (security_invoker=true) as
select o.id,o.organization_id,o.nombre,o.etapa_comercial,o.ejecutivo_responsable_id,o.ultima_actividad_at,o.fecha_proxima_accion,
 calculate_opportunity_score(o.id) score,
 case when o.estado='abierta' and (o.ultima_actividad_at is null or o.ultima_actividad_at<now()-interval '7 days') then true else false end abandoned,
 case when o.fecha_proxima_accion is null and o.estado='abierta' then true else false end missing_next_action
from oportunidades o;
