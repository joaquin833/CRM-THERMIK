begin;

-- =========================================================
-- 0013 - ITEMS OFICIALES DE COTIZACIONES EXTERNAS
-- Crea la tabla que el codigo del CRM ya espera: quote_items.
-- =========================================================

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,
  cotizacion_id uuid not null
    references public.cotizaciones(id)
    on delete cascade,
  posicion integer not null default 1,
  producto_servicio_id uuid,
  codigo text,
  descripcion text not null,
  cantidad numeric(14,3) not null default 1,
  unidad text not null default 'unidad',
  valor_unitario_original bigint not null default 0,
  porcentaje_descuento numeric(7,4) not null default 0,
  valor_descuento bigint not null default 0,
  valor_unitario_final bigint not null default 0,
  subtotal_neto bigint not null default 0,
  categoria text,
  observaciones text,
  afecto_iva boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quote_items_position_positive
    check (posicion > 0),
  constraint quote_items_description_not_empty
    check (length(trim(descripcion)) > 0),
  constraint quote_items_quantity_nonnegative
    check (cantidad >= 0),
  constraint quote_items_original_value_nonnegative
    check (valor_unitario_original >= 0),
  constraint quote_items_discount_range
    check (porcentaje_descuento >= 0 and porcentaje_descuento <= 100),
  constraint quote_items_discount_value_nonnegative
    check (valor_descuento >= 0),
  constraint quote_items_final_value_nonnegative
    check (valor_unitario_final >= 0),
  constraint quote_items_subtotal_nonnegative
    check (subtotal_neto >= 0),
  constraint quote_items_quote_position_unique
    unique (cotizacion_id, posicion)
);

create index if not exists quote_items_org_quote_idx
on public.quote_items (organization_id, cotizacion_id, posicion);

create index if not exists quote_items_code_idx
on public.quote_items (organization_id, codigo)
where codigo is not null;

-- Verifica que organization_id coincida con la cotizacion padre.
create or replace function public.validate_quote_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quote_org uuid;
begin
  select organization_id
  into v_quote_org
  from public.cotizaciones
  where id = new.cotizacion_id;

  if v_quote_org is null then
    raise exception 'La cotizacion asociada no existe';
  end if;

  if new.organization_id <> v_quote_org then
    raise exception 'El item y la cotizacion deben pertenecer a la misma organizacion';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.validate_quote_item() from public;

drop trigger if exists validate_quote_item
on public.quote_items;

create trigger validate_quote_item
before insert or update
on public.quote_items
for each row
execute function public.validate_quote_item();

alter table public.quote_items enable row level security;

create policy quote_items_read
on public.quote_items
for select
to authenticated
using (
  organization_id = public.current_org()
);

create policy quote_items_insert
on public.quote_items
for insert
to authenticated
with check (
  organization_id = public.current_org()
  and public.app_current_role() <> 'consulta'
  and exists (
    select 1
    from public.cotizaciones quote_record
    where quote_record.id = cotizacion_id
      and quote_record.organization_id = public.current_org()
  )
);

create policy quote_items_update
on public.quote_items
for update
to authenticated
using (
  organization_id = public.current_org()
  and public.app_current_role() in ('admin', 'jefatura_comercial')
)
with check (
  organization_id = public.current_org()
  and public.app_current_role() in ('admin', 'jefatura_comercial')
);

create policy quote_items_delete
on public.quote_items
for delete
to authenticated
using (
  organization_id = public.current_org()
  and public.app_current_role() = 'admin'
);

grant select, insert, update, delete
on public.quote_items
to authenticated;

create trigger audit_quote_items
after insert or update or delete
on public.quote_items
for each row
execute function public.audit_row();

commit;
