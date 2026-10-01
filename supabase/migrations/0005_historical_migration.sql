create table public.import_batches(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 file_name text not null, file_hash text not null, file_size bigint not null check(file_size>=0),
 authorized_sheet_name text not null check(authorized_sheet_name='SEGUIMIENTO PRESUPUESTOS'),
 excluded_sheet_names text[] not null default array['Operaciones']::text[], status text not null default 'preview',
 imported_by uuid not null references profiles(id), started_at timestamptz, completed_at timestamptz,
 total_rows int not null default 0, successful_rows int not null default 0, warning_rows int not null default 0,
 failed_rows int not null default 0, created_at timestamptz not null default now(),
 unique(organization_id,file_hash)
);
create table public.import_rows(
 id uuid primary key default gen_random_uuid(), import_batch_id uuid not null references import_batches(id) on delete restrict,
 sheet_name text not null check(sheet_name='SEGUIMIENTO PRESUPUESTOS'), source_row_number int not null,
 raw_data jsonb not null, normalized_data jsonb not null, entity_type text, entity_id uuid, status text not null,
 warning_messages jsonb not null default '[]', error_messages jsonb not null default '[]', created_at timestamptz not null default now(),
 unique(import_batch_id,sheet_name,source_row_number)
);
create table public.import_conflicts(
 id uuid primary key default gen_random_uuid(), import_batch_id uuid not null references import_batches(id),
 import_row_id uuid not null references import_rows(id), conflict_type text not null,
 existing_entity_type text, existing_entity_id uuid, incoming_value jsonb not null, existing_value jsonb,
 resolution text, resolved_by uuid references profiles(id), resolved_at timestamptz, created_at timestamptz not null default now()
);
create table public.historical_notes(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 cotizacion_id uuid references cotizaciones(id), oportunidad_id uuid references oportunidades(id), contacto_id uuid references contactos(id),
 source_import_row_id uuid not null references import_rows(id), original_text text not null,
 interpreted_result text, interpreted_next_action text, interpreted_date timestamptz,
 confidence numeric(5,4) check(confidence between 0 and 1), created_at timestamptz not null default now()
);
create table public.proposed_followups(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 import_batch_id uuid not null references import_batches(id), import_row_id uuid not null references import_rows(id),
 cotizacion_id uuid references cotizaciones(id), responsable_id uuid references profiles(id), action_type text not null,
 suggested_at timestamptz, priority text not null default 'media', original_comment text not null,
 confidence numeric(5,4) not null default 0, explanation text, status text not null default 'pending',
 reviewed_by uuid references profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);

alter table import_batches enable row level security; alter table import_rows enable row level security;
alter table import_conflicts enable row level security; alter table historical_notes enable row level security;
alter table proposed_followups enable row level security;
create policy batch_read on import_batches for select using(organization_id=current_org());
create policy batch_admin on import_batches for all using(organization_id=current_org() and current_role()='admin') with check(organization_id=current_org() and current_role()='admin');
create policy row_read on import_rows for select using(exists(select 1 from import_batches b where b.id=import_batch_id and b.organization_id=current_org()));
create policy row_admin on import_rows for all using(exists(select 1 from import_batches b where b.id=import_batch_id and b.organization_id=current_org() and current_role()='admin')) with check(exists(select 1 from import_batches b where b.id=import_batch_id and b.organization_id=current_org() and current_role()='admin'));
create policy conflict_read on import_conflicts for select using(exists(select 1 from import_batches b where b.id=import_batch_id and b.organization_id=current_org()));
create policy conflict_admin on import_conflicts for all using(exists(select 1 from import_batches b where b.id=import_batch_id and b.organization_id=current_org() and current_role()='admin')) with check(exists(select 1 from import_batches b where b.id=import_batch_id and b.organization_id=current_org() and current_role()='admin'));
create policy note_read on historical_notes for select using(organization_id=current_org());
create policy proposal_read on proposed_followups for select using(organization_id=current_org());
create policy proposal_admin on proposed_followups for all using(organization_id=current_org() and current_role()='admin') with check(organization_id=current_org() and current_role()='admin');

create or replace function public.revert_import_batch(p_batch_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare b import_batches%rowtype; deleted_notes int:=0; deleted_quotes int:=0;
begin
 select * into b from import_batches where id=p_batch_id and organization_id=current_org() for update;
 if b.id is null or current_role()<>'admin' then raise exception 'No autorizado'; end if;
 if b.status='reverted' then return jsonb_build_object('status','already_reverted'); end if;
 delete from proposed_followups where import_batch_id=b.id and status='pending';
 delete from historical_notes h using import_rows r where h.source_import_row_id=r.id and r.import_batch_id=b.id;
 get diagnostics deleted_notes=row_count;
 delete from cotizaciones q where q.import_batch_id=b.id and not exists(select 1 from audit_logs a where a.entidad_id=q.id and a.created_at>b.completed_at and a.accion='UPDATE');
 get diagnostics deleted_quotes=row_count;
 update import_batches set status='reverted' where id=b.id;
 insert into audit_logs(organization_id,usuario_id,entidad_tipo,entidad_id,accion,valores_nuevos) values(b.organization_id,auth.uid(),'import_batch',b.id,'REVERT',jsonb_build_object('deleted_notes',deleted_notes,'deleted_quotes',deleted_quotes));
 return jsonb_build_object('status','reverted','deleted_notes',deleted_notes,'deleted_quotes',deleted_quotes);
end $$;
create index idx_import_batches_hash on import_batches(organization_id,file_hash);
create index idx_import_rows_quote on import_rows((normalized_data->>'numero_cotizacion'));
create index idx_proposed_followups_status on proposed_followups(organization_id,status,suggested_at);
