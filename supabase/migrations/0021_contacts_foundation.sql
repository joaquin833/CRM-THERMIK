begin;

-- =========================================================
-- 0021 - FUNDACION DE CONTACTOS
-- Contactos como soporte estructural de Cotizaciones.
-- La prospeccion queda fuera de esta etapa.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Normalizacion reutilizable
-- ---------------------------------------------------------

create or replace function public.normalize_contact_email(p_email text)
returns text
language sql
immutable
parallel safe
as $function$
  select nullif(lower(trim(coalesce(p_email, ''))), '');
$function$;

create or replace function public.normalize_contact_phone(p_phone text)
returns text
language sql
immutable
parallel safe
as $function$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
$function$;

create or replace function public.normalize_contact_name(
  p_nombre text,
  p_apellido text default null
)
returns text
language sql
immutable
parallel safe
as $function$
  select nullif(
    lower(
      regexp_replace(
        translate(
          trim(concat_ws(' ', p_nombre, p_apellido)),
          'ÁÉÍÓÚÜÑáéíóúüñ',
          'AEIOUUNaeiouun'
        ),
        '[^a-zA-Z0-9]+',
        '',
        'g'
      )
    ),
    ''
  );
$function$;

-- ---------------------------------------------------------
-- 2. Trigger de normalizacion y limpieza basica
-- ---------------------------------------------------------

create or replace function public.normalize_contact_fields()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.nombre := nullif(trim(new.nombre), '');
  new.apellido := nullif(trim(new.apellido), '');
  new.cargo := nullif(trim(new.cargo), '');
  new.correo := nullif(trim(new.correo), '');
  new.telefono := nullif(trim(new.telefono), '');
  new.whatsapp := nullif(trim(new.whatsapp), '');
  new.direccion := nullif(trim(new.direccion), '');
  new.comuna := nullif(trim(new.comuna), '');
  new.ciudad := nullif(trim(new.ciudad), '');
  new.region := nullif(trim(new.region), '');
  new.observaciones := nullif(trim(new.observaciones), '');

  new.correo_normalizado := public.normalize_contact_email(new.correo);
  new.telefono_normalizado := public.normalize_contact_phone(new.telefono);

  if new.estado is null then
    new.estado := 'activo';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_normalize_contact_fields on public.contactos;

create trigger trg_normalize_contact_fields
before insert or update of
  nombre,
  apellido,
  cargo,
  correo,
  telefono,
  whatsapp,
  direccion,
  comuna,
  ciudad,
  region,
  observaciones,
  estado
on public.contactos
for each row
execute function public.normalize_contact_fields();

-- Regulariza los registros actuales sin fusionar ni archivar contactos.
update public.contactos
set correo_normalizado = public.normalize_contact_email(correo),
    telefono_normalizado = public.normalize_contact_phone(telefono),
    updated_at = now()
where correo_normalizado is distinct from public.normalize_contact_email(correo)
   or telefono_normalizado is distinct from public.normalize_contact_phone(telefono);

-- ---------------------------------------------------------
-- 3. Prevencion de nuevos correos duplicados activos
-- ---------------------------------------------------------

create or replace function public.prevent_active_contact_email_duplicate()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_duplicate_id uuid;
  v_duplicate_name text;
begin
  if new.deleted_at is not null
     or public.normalize_contact_email(new.correo) is null then
    return new;
  end if;

  select
    c.id,
    nullif(trim(concat_ws(' ', c.nombre, c.apellido)), '')
  into
    v_duplicate_id,
    v_duplicate_name
  from public.contactos c
  where c.organization_id = new.organization_id
    and c.id <> new.id
    and c.deleted_at is null
    and c.correo_normalizado = public.normalize_contact_email(new.correo)
  order by c.created_at
  limit 1;

  if v_duplicate_id is not null then
    raise exception using
      errcode = '23505',
      message = 'Ya existe un contacto activo con este correo.',
      detail = concat(
        'Contacto coincidente: ',
        coalesce(v_duplicate_name, 'Sin nombre'),
        ' (',
        v_duplicate_id::text,
        ').'
      ),
      hint = 'Revise el contacto existente antes de crear o restaurar otro.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_prevent_active_contact_email_duplicate
on public.contactos;

create trigger trg_prevent_active_contact_email_duplicate
before insert or update of correo, deleted_at, organization_id
on public.contactos
for each row
execute function public.prevent_active_contact_email_duplicate();

-- ---------------------------------------------------------
-- 4. Catalogos controlados de Contactos
-- ---------------------------------------------------------

alter table public.contactos
  drop constraint if exists contactos_estado_controlado_check,
  drop constraint if exists contactos_tipo_controlado_check,
  drop constraint if exists contactos_preferencia_controlada_check,
  drop constraint if exists contactos_origen_controlado_check,
  drop constraint if exists contactos_empresa_condicional_check;

alter table public.contactos
  add constraint contactos_estado_controlado_check
  check (
    estado in ('activo', 'inactivo', 'no_contactar')
  ) not valid,

  add constraint contactos_tipo_controlado_check
  check (
    tipo_contacto is null
    or tipo_contacto in (
      'Cliente particular',
      'Contacto de empresa',
      'Profesional independiente',
      'Otro'
    )
  ) not valid,

  add constraint contactos_preferencia_controlada_check
  check (
    preferencia_contacto is null
    or preferencia_contacto in (
      'WhatsApp',
      'Correo',
      'Telefono',
      'Sin preferencia'
    )
  ) not valid,

  add constraint contactos_origen_controlado_check
  check (
    origen is null
    or origen in (
      'Cotizacion PDF',
      'Carga manual',
      'Referido',
      'Cliente existente',
      'Otro'
    )
  ) not valid,

  add constraint contactos_empresa_condicional_check
  check (
    tipo_contacto is distinct from 'Contacto de empresa'
    or empresa_id is not null
  ) not valid;

alter table public.contactos
  validate constraint contactos_estado_controlado_check;

alter table public.contactos
  validate constraint contactos_tipo_controlado_check;

alter table public.contactos
  validate constraint contactos_preferencia_controlada_check;

alter table public.contactos
  validate constraint contactos_origen_controlado_check;

alter table public.contactos
  validate constraint contactos_empresa_condicional_check;

-- ---------------------------------------------------------
-- 5. Catalogos para menus desplegables
-- ---------------------------------------------------------

create or replace function public.get_contact_catalogs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'tipos_contacto', jsonb_build_array(
      'Cliente particular',
      'Contacto de empresa',
      'Profesional independiente',
      'Otro'
    ),
    'preferencias_contacto', jsonb_build_array(
      'WhatsApp',
      'Correo',
      'Telefono',
      'Sin preferencia'
    ),
    'origenes', jsonb_build_array(
      'Cotizacion PDF',
      'Carga manual',
      'Referido',
      'Cliente existente',
      'Otro'
    ),
    'estados', jsonb_build_array(
      'activo',
      'inactivo',
      'no_contactar'
    )
  );
$function$;

-- ---------------------------------------------------------
-- 6. Busqueda preventiva de coincidencias
-- No fusiona ni bloquea por telefono o nombre.
-- ---------------------------------------------------------

create or replace function public.find_contact_matches(
  p_email text default null,
  p_phone text default null,
  p_nombre text default null,
  p_apellido text default null,
  p_empresa_id uuid default null,
  p_exclude_contact_id uuid default null
)
returns table (
  contact_id uuid,
  nombre_completo text,
  correo text,
  telefono text,
  empresa_id uuid,
  coincidencia_correo boolean,
  coincidencia_telefono boolean,
  coincidencia_nombre boolean,
  nivel_coincidencia text
)
language sql
stable
security definer
set search_path = public
as $function$
  with input as (
    select
      public.normalize_contact_email(p_email) as email_normalizado,
      public.normalize_contact_phone(p_phone) as phone_normalizado,
      public.normalize_contact_name(p_nombre, p_apellido) as name_normalizado
  ), candidates as (
    select
      c.*,
      (
        i.email_normalizado is not null
        and c.correo_normalizado = i.email_normalizado
      ) as match_email,
      (
        i.phone_normalizado is not null
        and c.telefono_normalizado = i.phone_normalizado
      ) as match_phone,
      (
        i.name_normalizado is not null
        and public.normalize_contact_name(c.nombre, c.apellido) = i.name_normalizado
        and (
          p_empresa_id is null
          or c.empresa_id is not distinct from p_empresa_id
        )
      ) as match_name
    from public.contactos c
    cross join input i
    where c.organization_id = public.current_org()
      and c.deleted_at is null
      and (p_exclude_contact_id is null or c.id <> p_exclude_contact_id)
  )
  select
    c.id,
    nullif(trim(concat_ws(' ', c.nombre, c.apellido)), ''),
    c.correo,
    c.telefono,
    c.empresa_id,
    c.match_email,
    c.match_phone,
    c.match_name,
    case
      when c.match_email then 'alta'
      when c.match_phone and c.match_name then 'alta'
      when c.match_phone then 'media'
      when c.match_name then 'baja'
      else 'sin_coincidencia'
    end
  from candidates c
  where c.match_email or c.match_phone or c.match_name
  order by
    case
      when c.match_email then 1
      when c.match_phone and c.match_name then 2
      when c.match_phone then 3
      else 4
    end,
    c.created_at;
$function$;

-- ---------------------------------------------------------
-- 7. Restauracion segura con control de duplicados
-- ---------------------------------------------------------

create or replace function public.restore_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_contact public.contactos%rowtype;
  v_role text;
  v_duplicate_id uuid;
begin
  select rol into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org()
    and estado = 'activo';

  if v_role not in ('admin', 'jefatura_comercial') then
    raise exception 'Solo administración o jefatura comercial puede restaurar contactos';
  end if;

  select * into v_contact
  from public.contactos
  where id = p_contact_id
    and organization_id = public.current_org()
  for update;

  if v_contact.id is null then
    raise exception 'Contacto no encontrado o no autorizado';
  end if;

  if v_contact.deleted_at is null then
    return;
  end if;

  if public.normalize_contact_email(v_contact.correo) is not null then
    select c.id into v_duplicate_id
    from public.contactos c
    where c.organization_id = v_contact.organization_id
      and c.id <> v_contact.id
      and c.deleted_at is null
      and c.correo_normalizado = public.normalize_contact_email(v_contact.correo)
    limit 1;

    if v_duplicate_id is not null then
      raise exception using
        errcode = '23505',
        message = 'No se puede restaurar el contacto porque el correo ya pertenece a otro contacto activo.',
        detail = concat('Contacto activo coincidente: ', v_duplicate_id::text, '.');
    end if;
  end if;

  update public.contactos
  set estado = 'activo',
      deleted_at = null,
      correo_normalizado = public.normalize_contact_email(correo),
      telefono_normalizado = public.normalize_contact_phone(telefono),
      updated_at = now()
  where id = v_contact.id;
end;
$function$;

-- ---------------------------------------------------------
-- 8. Permisos
-- ---------------------------------------------------------

revoke all on function public.get_contact_catalogs() from public;
revoke all on function public.find_contact_matches(
  text, text, text, text, uuid, uuid
) from public;
revoke all on function public.restore_contact(uuid) from public;

grant execute on function public.get_contact_catalogs() to authenticated;
grant execute on function public.find_contact_matches(
  text, text, text, text, uuid, uuid
) to authenticated;
grant execute on function public.restore_contact(uuid) to authenticated;

comment on function public.find_contact_matches(
  text, text, text, text, uuid, uuid
) is 'Busca coincidencias de contactos sin fusionar registros automaticamente.';

comment on function public.get_contact_catalogs() is
  'Entrega catalogos controlados para los menus de Contactos.';

commit;
