begin;

-- =========================================================
-- 0026 - FUNDACION CONTROLADA DE EMPRESAS
-- Normalizacion de RUT, catalogos, coincidencias y restauracion.
-- =========================================================

-- 1. Columna normalizada
alter table public.empresas
  add column if not exists rut_normalizado text;

-- 2. Normalizacion de RUT
create or replace function public.normalize_company_rut(p_rut text)
returns text
language sql
immutable
as $function$
  select nullif(upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g')), '');
$function$;

-- 3. Validacion matematica de RUT chileno
create or replace function public.is_valid_chilean_rut(p_rut text)
returns boolean
language plpgsql
immutable
as $function$
declare
  v_rut text := public.normalize_company_rut(p_rut);
  v_body text;
  v_given_dv text;
  v_sum integer := 0;
  v_factor integer := 2;
  v_expected_dv text;
  i integer;
begin
  if v_rut is null then
    return true;
  end if;

  if v_rut !~ '^[0-9]{7,8}[0-9K]$' then
    return false;
  end if;

  v_body := left(v_rut, length(v_rut) - 1);
  v_given_dv := right(v_rut, 1);

  for i in reverse length(v_body)..1 loop
    v_sum := v_sum + substring(v_body from i for 1)::integer * v_factor;
    v_factor := case when v_factor = 7 then 2 else v_factor + 1 end;
  end loop;

  v_expected_dv := case 11 - (v_sum % 11)
    when 11 then '0'
    when 10 then 'K'
    else (11 - (v_sum % 11))::text
  end;

  return v_given_dv = v_expected_dv;
end;
$function$;

-- 4. Limpieza y normalizacion automatica
create or replace function public.prepare_company_data()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.razon_social := nullif(regexp_replace(btrim(coalesce(new.razon_social, '')), '\s+', ' ', 'g'), '');
  new.nombre_fantasia := nullif(regexp_replace(btrim(coalesce(new.nombre_fantasia, '')), '\s+', ' ', 'g'), '');
  new.rut := nullif(btrim(coalesce(new.rut, '')), '');
  new.rut_normalizado := public.normalize_company_rut(new.rut);
  new.giro := nullif(regexp_replace(btrim(coalesce(new.giro, '')), '\s+', ' ', 'g'), '');
  new.pagina_web := nullif(btrim(coalesce(new.pagina_web, '')), '');
  new.direccion := nullif(regexp_replace(btrim(coalesce(new.direccion, '')), '\s+', ' ', 'g'), '');
  new.comuna := nullif(regexp_replace(btrim(coalesce(new.comuna, '')), '\s+', ' ', 'g'), '');
  new.ciudad := nullif(regexp_replace(btrim(coalesce(new.ciudad, '')), '\s+', ' ', 'g'), '');
  new.region := nullif(regexp_replace(btrim(coalesce(new.region, '')), '\s+', ' ', 'g'), '');
  new.segmento := nullif(btrim(coalesce(new.segmento, '')), '');
  new.origen := nullif(btrim(coalesce(new.origen, '')), '');
  new.observaciones := nullif(btrim(coalesce(new.observaciones, '')), '');
  new.estado := coalesce(nullif(btrim(coalesce(new.estado, '')), ''), 'activo');
  new.updated_at := now();

  if new.razon_social is null then
    raise exception 'La razón social es obligatoria';
  end if;

  if new.rut_normalizado is not null
     and not public.is_valid_chilean_rut(new.rut_normalizado) then
    raise exception 'El RUT ingresado no es válido';
  end if;

  return new;
end;
$function$;

drop trigger if exists empresas_prepare_data_trg on public.empresas;
create trigger empresas_prepare_data_trg
before insert or update on public.empresas
for each row
execute function public.prepare_company_data();

-- 5. Normalizar registros existentes sin RUT obligatorio
update public.empresas
set
  razon_social = razon_social,
  updated_at = updated_at;

-- 6. Catalogos controlados
alter table public.empresas
  drop constraint if exists empresas_estado_check;
alter table public.empresas
  add constraint empresas_estado_check
  check (estado in ('activo', 'inactivo'));

alter table public.empresas
  drop constraint if exists empresas_segmento_check;
alter table public.empresas
  add constraint empresas_segmento_check
  check (
    segmento is null or segmento in (
      'Residencial',
      'Comercial',
      'Industrial',
      'Construccion',
      'Institucional',
      'Otro'
    )
  );

alter table public.empresas
  drop constraint if exists empresas_origen_check;
alter table public.empresas
  add constraint empresas_origen_check
  check (
    origen is null or origen in (
      'Cotizacion PDF',
      'Carga manual',
      'Referido',
      'Cliente existente',
      'Importacion historica',
      'Otro'
    )
  );

-- 7. Un RUT activo por organizacion
create unique index if not exists empresas_one_active_rut_idx
on public.empresas (organization_id, rut_normalizado)
where deleted_at is null and rut_normalizado is not null;

create index if not exists empresas_razon_social_search_idx
on public.empresas (
  organization_id,
  lower(regexp_replace(btrim(razon_social), '\s+', ' ', 'g'))
)
where deleted_at is null;

-- 8. Catalogos para la interfaz
create or replace function public.get_company_catalogs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'estados', jsonb_build_array('activo', 'inactivo'),
    'segmentos', jsonb_build_array(
      'Residencial', 'Comercial', 'Industrial',
      'Construccion', 'Institucional', 'Otro'
    ),
    'origenes', jsonb_build_array(
      'Cotizacion PDF', 'Carga manual', 'Referido',
      'Cliente existente', 'Importacion historica', 'Otro'
    )
  );
$function$;

-- 9. Busqueda preventiva de coincidencias
create or replace function public.find_company_matches(
  p_rut text default null,
  p_razon_social text default null,
  p_nombre_fantasia text default null,
  p_exclude_company_id uuid default null
)
returns table (
  company_id uuid,
  razon_social text,
  nombre_fantasia text,
  rut text,
  coincidencia_rut boolean,
  coincidencia_razon_social boolean,
  coincidencia_nombre_fantasia boolean,
  nivel_coincidencia text
)
language sql
stable
security definer
set search_path = public
as $function$
  with input as (
    select
      public.normalize_company_rut(p_rut) as rut_normalizado,
      lower(regexp_replace(btrim(coalesce(p_razon_social, '')), '\s+', ' ', 'g')) as razon_normalizada,
      lower(regexp_replace(btrim(coalesce(p_nombre_fantasia, '')), '\s+', ' ', 'g')) as fantasia_normalizada
  )
  select
    e.id,
    e.razon_social,
    e.nombre_fantasia,
    e.rut,
    i.rut_normalizado is not null and e.rut_normalizado = i.rut_normalizado,
    i.razon_normalizada <> '' and
      lower(regexp_replace(btrim(e.razon_social), '\s+', ' ', 'g')) = i.razon_normalizada,
    i.fantasia_normalizada <> '' and
      lower(regexp_replace(btrim(coalesce(e.nombre_fantasia, '')), '\s+', ' ', 'g')) = i.fantasia_normalizada,
    case
      when i.rut_normalizado is not null and e.rut_normalizado = i.rut_normalizado then 'alta'
      when i.razon_normalizada <> '' and
        lower(regexp_replace(btrim(e.razon_social), '\s+', ' ', 'g')) = i.razon_normalizada then 'media'
      else 'baja'
    end
  from public.empresas e
  cross join input i
  where e.organization_id = public.current_org()
    and e.deleted_at is null
    and (p_exclude_company_id is null or e.id <> p_exclude_company_id)
    and (
      (i.rut_normalizado is not null and e.rut_normalizado = i.rut_normalizado)
      or (i.razon_normalizada <> '' and
        lower(regexp_replace(btrim(e.razon_social), '\s+', ' ', 'g')) = i.razon_normalizada)
      or (i.fantasia_normalizada <> '' and
        lower(regexp_replace(btrim(coalesce(e.nombre_fantasia, '')), '\s+', ' ', 'g')) = i.fantasia_normalizada)
    )
  order by
    case
      when i.rut_normalizado is not null and e.rut_normalizado = i.rut_normalizado then 1
      when i.razon_normalizada <> '' and
        lower(regexp_replace(btrim(e.razon_social), '\s+', ' ', 'g')) = i.razon_normalizada then 2
      else 3
    end,
    e.razon_social;
$function$;

-- 10. Restauracion segura
create or replace function public.restore_company(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company public.empresas%rowtype;
begin
  select * into v_company
  from public.empresas
  where id = p_company_id
    and organization_id = public.current_org()
  for update;

  if v_company.id is null then
    raise exception 'Empresa no encontrada o no autorizada';
  end if;

  if v_company.deleted_at is null then
    return v_company.id;
  end if;

  if v_company.rut_normalizado is not null and exists (
    select 1
    from public.empresas e
    where e.organization_id = v_company.organization_id
      and e.rut_normalizado = v_company.rut_normalizado
      and e.deleted_at is null
      and e.id <> v_company.id
  ) then
    raise exception 'No se puede restaurar: existe otra empresa activa con el mismo RUT';
  end if;

  update public.empresas
  set deleted_at = null,
      estado = 'activo',
      updated_at = now()
  where id = v_company.id;

  return v_company.id;
end;
$function$;

-- 11. Permisos
revoke all on function public.get_company_catalogs() from public;
grant execute on function public.get_company_catalogs() to authenticated;

revoke all on function public.find_company_matches(text, text, text, uuid) from public;
grant execute on function public.find_company_matches(text, text, text, uuid) to authenticated;

revoke all on function public.restore_company(uuid) from public;
grant execute on function public.restore_company(uuid) to authenticated;

comment on column public.empresas.rut_normalizado is
  'RUT sin puntos ni guion, en mayusculas, utilizado para busqueda y unicidad.';

commit;
