create table public.organization_branding(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) unique,
 name text not null default 'Thermikhaus', slogan text not null default 'Aísla · Protege · Ahorra',
 logo_light_path text, logo_dark_path text, isotipo_path text, favicon_path text,
 primary_color text not null default '#2D8B57', primary_dark_color text not null default '#134931', secondary_color text not null default '#E8B51A',
 primary_font text not null default 'Inter', secondary_font text, tax_data jsonb not null default '{}', contact_data jsonb not null default '{}',
 commercial_signature text, report_header text, email_template text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.api_rate_limits(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), user_id uuid not null references profiles(id),
 bucket text not null, window_start timestamptz not null, request_count int not null default 1, updated_at timestamptz not null default now(),
 unique(user_id,bucket,window_start)
);
alter table organization_branding enable row level security; alter table api_rate_limits enable row level security;
create policy branding_read on organization_branding for select using(organization_id=current_org());
create policy branding_admin on organization_branding for all using(organization_id=current_org() and current_role()='admin') with check(organization_id=current_org() and current_role()='admin');
create policy rate_limit_owner on api_rate_limits for select using(organization_id=current_org() and user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crm-private','crm-private',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy storage_private_read on storage.objects for select to authenticated using(bucket_id='crm-private' and (storage.foldername(name))[1]=current_org()::text);
create policy storage_private_insert on storage.objects for insert to authenticated with check(bucket_id='crm-private' and (storage.foldername(name))[1]=current_org()::text and current_role()<>'consulta');
create policy storage_private_delete on storage.objects for delete to authenticated using(bucket_id='crm-private' and (storage.foldername(name))[1]=current_org()::text and current_role()='admin');

create or replace function public.consume_rate_limit(p_bucket text,p_limit int,p_window_minutes int) returns boolean language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; start_at timestamptz; current_count int;
begin
 select * into p from profiles where id=auth.uid(); if p.id is null then return false; end if;
 start_at:=to_timestamp(floor(extract(epoch from now())/(p_window_minutes*60))*(p_window_minutes*60));
 insert into api_rate_limits(organization_id,user_id,bucket,window_start,request_count) values(p.organization_id,p.id,p_bucket,start_at,1)
 on conflict(user_id,bucket,window_start) do update set request_count=api_rate_limits.request_count+1,updated_at=now() returning request_count into current_count;
 return current_count<=p_limit;
end $$;
create index idx_files_entity on files(organization_id,entidad_tipo,entidad_id,created_at desc);
create index idx_audit_entity_date on audit_logs(organization_id,entidad_tipo,entidad_id,created_at desc);
