create table public.google_calendar_connections(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
 user_id uuid not null references profiles(id), google_email text, calendar_id text not null default 'primary',
 access_token_encrypted text not null, refresh_token_encrypted text, token_expiry timestamptz,
 scopes text[] not null default '{}', connected_at timestamptz not null default now(),
 last_sync_at timestamptz, last_error text, status text not null default 'connected', updated_at timestamptz not null default now(),
 unique(user_id)
);
alter table google_calendar_connections enable row level security;
create policy google_connection_owner_read on google_calendar_connections for select using(organization_id=current_org() and user_id=auth.uid());
create policy google_connection_owner_write on google_calendar_connections for all using(organization_id=current_org() and user_id=auth.uid()) with check(organization_id=current_org() and user_id=auth.uid());
create index idx_google_connection_user on google_calendar_connections(user_id,status);

create or replace function public.mark_google_disconnected() returns trigger language plpgsql security definer set search_path=public as $$
begin update profiles set google_calendar_connected=false,updated_at=now() where id=old.user_id; return old; end $$;
create trigger google_disconnection after delete on google_calendar_connections for each row execute function mark_google_disconnected();
