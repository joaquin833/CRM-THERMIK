begin;

-- =========================================================
-- 0012 - BANDEJA DE IMPORTACION DE COTIZACIONES DESDE PDF
-- Etapa segura: carga, extraccion, revision y confirmacion.
-- No crea cotizaciones automaticamente.
-- =========================================================

create table if not exists public.quote_pdf_imports (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  uploaded_by uuid not null
    references public.profiles(id)
    on delete restrict,

  external_source_id uuid
    references public.external_sources(id)
    on delete restrict,

  file_name text not null,
  storage_path text not null,
  file_hash text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint not null default 0,

  extraction_method text,
  extracted_text text,
  parsed_data jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  confidence jsonb not null default '{}'::jsonb,

  status text not null default 'uploaded',

  matched_contact_id uuid
    references public.contactos(id)
    on delete set null,

  matched_company_id uuid
    references public.empresas(id)
    on delete set null,

  matched_project_id uuid
    references public.proyectos(id)
    on delete set null,

  matched_opportunity_id uuid
    references public.oportunidades(id)
    on delete set null,

  imported_quote_id uuid
    references public.cotizaciones(id)
    on delete set null,

  error_message text,
  analyzed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quote_pdf_imports_file_name_not_empty
    check (length(trim(file_name)) > 0),

  constraint quote_pdf_imports_storage_path_not_empty
    check (length(trim(storage_path)) > 0),

  constraint quote_pdf_imports_hash_not_empty
    check (length(trim(file_hash)) > 0),

  constraint quote_pdf_imports_pdf_only
    check (mime_type = 'application/pdf'),

  constraint quote_pdf_imports_file_size_valid
    check (file_size >= 0 and file_size <= 10485760),

  constraint quote_pdf_imports_status_valid
    check (
      status in (
        'uploaded',
        'analyzing',
        'review',
        'ready',
        'confirmed',
        'duplicate',
        'error',
        'discarded'
      )
    ),

  constraint quote_pdf_imports_method_valid
    check (
      extraction_method is null
      or extraction_method in ('text', 'ocr', 'hybrid')
    ),

  constraint quote_pdf_imports_parsed_object
    check (jsonb_typeof(parsed_data) = 'object'),

  constraint quote_pdf_imports_errors_array
    check (jsonb_typeof(validation_errors) = 'array'),

  constraint quote_pdf_imports_warnings_array
    check (jsonb_typeof(validation_warnings) = 'array'),

  constraint quote_pdf_imports_confidence_object
    check (jsonb_typeof(confidence) = 'object')
);

create unique index if not exists quote_pdf_imports_hash_unique
on public.quote_pdf_imports (organization_id, file_hash)
where status <> 'discarded';

create index if not exists quote_pdf_imports_status_idx
on public.quote_pdf_imports (
  organization_id,
  status,
  created_at desc
);

create index if not exists quote_pdf_imports_quote_idx
on public.quote_pdf_imports (
  organization_id,
  imported_quote_id
)
where imported_quote_id is not null;

create index if not exists quote_pdf_imports_matches_idx
on public.quote_pdf_imports (
  organization_id,
  matched_contact_id,
  matched_project_id
);

-- Mantener updated_at y asegurar que las vinculaciones pertenezcan
-- a la misma organizacion del registro de importacion.
create or replace function public.validate_quote_pdf_import()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.uploaded_by is not null and not exists (
    select 1
    from public.profiles profile_record
    where profile_record.id = new.uploaded_by
      and profile_record.organization_id = new.organization_id
  ) then
    raise exception 'El usuario que carga el PDF no pertenece a la organizacion';
  end if;

  if new.matched_contact_id is not null and not exists (
    select 1
    from public.contactos contact_record
    where contact_record.id = new.matched_contact_id
      and contact_record.organization_id = new.organization_id
  ) then
    raise exception 'El contacto vinculado no pertenece a la organizacion';
  end if;

  if new.matched_company_id is not null and not exists (
    select 1
    from public.empresas company_record
    where company_record.id = new.matched_company_id
      and company_record.organization_id = new.organization_id
  ) then
    raise exception 'La empresa vinculada no pertenece a la organizacion';
  end if;

  if new.matched_project_id is not null and not exists (
    select 1
    from public.proyectos project_record
    where project_record.id = new.matched_project_id
      and project_record.organization_id = new.organization_id
  ) then
    raise exception 'El proyecto vinculado no pertenece a la organizacion';
  end if;

  if new.matched_opportunity_id is not null and not exists (
    select 1
    from public.oportunidades opportunity_record
    where opportunity_record.id = new.matched_opportunity_id
      and opportunity_record.organization_id = new.organization_id
  ) then
    raise exception 'La oportunidad vinculada no pertenece a la organizacion';
  end if;

  if new.imported_quote_id is not null and not exists (
    select 1
    from public.cotizaciones quote_record
    where quote_record.id = new.imported_quote_id
      and quote_record.organization_id = new.organization_id
  ) then
    raise exception 'La cotizacion importada no pertenece a la organizacion';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.validate_quote_pdf_import() from public;

drop trigger if exists validate_quote_pdf_import
on public.quote_pdf_imports;

create trigger validate_quote_pdf_import
before insert or update
on public.quote_pdf_imports
for each row
execute function public.validate_quote_pdf_import();

-- RLS
alter table public.quote_pdf_imports enable row level security;

create policy quote_pdf_imports_read
on public.quote_pdf_imports
for select
to authenticated
using (
  organization_id = public.current_org()
);

create policy quote_pdf_imports_insert
on public.quote_pdf_imports
for insert
to authenticated
with check (
  organization_id = public.current_org()
  and uploaded_by = auth.uid()
  and public.app_current_role() <> 'consulta'
);

create policy quote_pdf_imports_update
on public.quote_pdf_imports
for update
to authenticated
using (
  organization_id = public.current_org()
  and public.app_current_role() <> 'consulta'
  and status <> 'confirmed'
)
with check (
  organization_id = public.current_org()
  and public.app_current_role() <> 'consulta'
);

create policy quote_pdf_imports_delete
on public.quote_pdf_imports
for delete
to authenticated
using (
  organization_id = public.current_org()
  and public.app_current_role() = 'admin'
  and status in ('uploaded', 'error', 'discarded')
);

grant select, insert, update, delete
on public.quote_pdf_imports
to authenticated;

-- Auditoria
create trigger audit_quote_pdf_imports
after insert or update or delete
on public.quote_pdf_imports
for each row
execute function public.audit_row();

commit;
