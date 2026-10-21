begin;

alter table public.proyectos
  add column if not exists nombre_normalizado text,
  add column if not exists direccion_normalizada text,
  add column if not exists observaciones text,
  add column if not exists deleted_at timestamptz;

create or replace function public.normalize_project_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(
      regexp_replace(
        translate(
          trim(coalesce(p_value, '')),
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
$$;

create or replace function public.prepare_project_data()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.nombre := nullif(trim(new.nombre), '');
  new.direccion := nullif(trim(new.direccion), '');
  new.comuna := nullif(trim(new.comuna), '');
  new.ciudad := nullif(trim(new.ciudad), '');
  new.region := nullif(trim(new.region), '');
  new.tipo_proyecto := nullif(trim(new.tipo_proyecto), '');
  new.tipo_obra := nullif(trim(new.tipo_obra), '');
  new.observaciones := nullif(trim(new.observaciones), '');
  new.nombre_normalizado := public.normalize_project_text(new.nombre);
  new.direccion_normalizada := public.normalize_project_text(new.direccion);
  new.updated_at := now();

  if new.nombre is null then
    raise exception 'El nombre del proyecto es obligatorio.';
  end if;

  if new.metros_cuadrados_estimados is not null
     and new.metros_cuadrados_estimados < 0 then
    raise exception 'Los metros cuadrados no pueden ser negativos.';
  end if;

  if new.estado is null then
    new.estado := 'activo';
  end if;

  if new.estado not in (
    'activo',
    'pausado',
    'finalizado',
    'cancelado',
    'inactivo'
  ) then
    raise exception 'Estado de proyecto no válido.';
  end if;

  if new.tipo_proyecto is not null
     and new.tipo_proyecto not in (
       'Residencial',
       'Comercial',
       'Industrial',
       'Institucional',
       'Otro'
     ) then
    raise exception 'Tipo de proyecto no válido.';
  end if;

  if new.tipo_obra is not null
     and new.tipo_obra not in (
       'Obra nueva',
       'Ampliación',
       'Remodelación',
       'Regularización',
       'Otro'
     ) then
    raise exception 'Tipo de obra no válido.';
  end if;

  if new.contacto_principal_id is not null
     and not exists (
       select 1
       from public.contactos c
       where c.id = new.contacto_principal_id
         and c.organization_id = new.organization_id
         and c.deleted_at is null
     ) then
    raise exception 'El contacto principal no pertenece a la organización o está archivado.';
  end if;

  if new.empresa_id is not null
     and not exists (
       select 1
       from public.empresas e
       where e.id = new.empresa_id
         and e.organization_id = new.organization_id
         and e.deleted_at is null
     ) then
    raise exception 'La empresa no pertenece a la organización o está archivada.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_project_data on public.proyectos;
create trigger trg_prepare_project_data
before insert or update on public.proyectos
for each row
execute function public.prepare_project_data();

update public.proyectos
set
  nombre = nombre,
  updated_at = coalesce(updated_at, now());

create index if not exists idx_proyectos_org_nombre_normalizado
  on public.proyectos (organization_id, nombre_normalizado)
  where deleted_at is null;

create index if not exists idx_proyectos_org_direccion_normalizada
  on public.proyectos (organization_id, direccion_normalizada)
  where deleted_at is null
    and direccion_normalizada is not null;

create index if not exists idx_proyectos_contacto_principal
  on public.proyectos (organization_id, contacto_principal_id)
  where deleted_at is null;

create index if not exists idx_proyectos_empresa
  on public.proyectos (organization_id, empresa_id)
  where deleted_at is null;

create or replace function public.get_project_catalogs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'estados', jsonb_build_array(
      jsonb_build_object('value', 'activo', 'label', 'Activo'),
      jsonb_build_object('value', 'pausado', 'label', 'Pausado'),
      jsonb_build_object('value', 'finalizado', 'label', 'Finalizado'),
      jsonb_build_object('value', 'cancelado', 'label', 'Cancelado'),
      jsonb_build_object('value', 'inactivo', 'label', 'Inactivo')
    ),
    'tipos_proyecto', jsonb_build_array(
      jsonb_build_object('value', 'Residencial', 'label', 'Residencial'),
      jsonb_build_object('value', 'Comercial', 'label', 'Comercial'),
      jsonb_build_object('value', 'Industrial', 'label', 'Industrial'),
      jsonb_build_object('value', 'Institucional', 'label', 'Institucional'),
      jsonb_build_object('value', 'Otro', 'label', 'Otro')
    ),
    'tipos_obra', jsonb_build_array(
      jsonb_build_object('value', 'Obra nueva', 'label', 'Obra nueva'),
      jsonb_build_object('value', 'Ampliación', 'label', 'Ampliación'),
      jsonb_build_object('value', 'Remodelación', 'label', 'Remodelación'),
      jsonb_build_object('value', 'Regularización', 'label', 'Regularización'),
      jsonb_build_object('value', 'Otro', 'label', 'Otro')
    )
  );
$$;

create or replace function public.find_project_matches(
  p_nombre text,
  p_direccion text default null,
  p_contacto_principal_id uuid default null,
  p_empresa_id uuid default null,
  p_exclude_project_id uuid default null
)
returns table (
  project_id uuid,
  nombre text,
  direccion text,
  contacto_principal_id uuid,
  empresa_id uuid,
  coincidence_type text,
  coincidence_level text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nombre,
    p.direccion,
    p.contacto_principal_id,
    p.empresa_id,
    case
      when p.nombre_normalizado = public.normalize_project_text(p_nombre)
       and p.direccion_normalizada is not distinct from public.normalize_project_text(p_direccion)
       and p.direccion_normalizada is not null
        then 'nombre_direccion'
      when p.nombre_normalizado = public.normalize_project_text(p_nombre)
       and p.contacto_principal_id is not distinct from p_contacto_principal_id
       and p_contacto_principal_id is not null
        then 'nombre_contacto'
      when p.nombre_normalizado = public.normalize_project_text(p_nombre)
       and p.empresa_id is not distinct from p_empresa_id
       and p_empresa_id is not null
        then 'nombre_empresa'
      else 'nombre'
    end,
    case
      when p.nombre_normalizado = public.normalize_project_text(p_nombre)
       and (
         (p.direccion_normalizada is not distinct from public.normalize_project_text(p_direccion)
          and p.direccion_normalizada is not null)
         or (p.contacto_principal_id is not distinct from p_contacto_principal_id
             and p_contacto_principal_id is not null)
         or (p.empresa_id is not distinct from p_empresa_id
             and p.empresa_id is not null)
       ) then 'alta'
      else 'media'
    end
  from public.proyectos p
  where p.organization_id = public.current_org()
    and p.deleted_at is null
    and p.id is distinct from p_exclude_project_id
    and p.nombre_normalizado = public.normalize_project_text(p_nombre)
  order by
    case
      when p.direccion_normalizada is not distinct from public.normalize_project_text(p_direccion)
       and p.direccion_normalizada is not null then 1
      when p.contacto_principal_id is not distinct from p_contacto_principal_id
       and p_contacto_principal_id is not null then 2
      when p.empresa_id is not distinct from p_empresa_id
       and p.empresa_id is not null then 3
      else 4
    end,
    p.updated_at desc;
$$;

create or replace function public.deactivate_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.proyectos%rowtype;
  v_role text;
begin
  select *
  into v_project
  from public.proyectos
  where id = p_project_id
    and organization_id = public.current_org()
  for update;

  if not found then
    raise exception 'Proyecto no encontrado o no autorizado.';
  end if;

  if v_project.deleted_at is not null then
    return;
  end if;

  select rol
  into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No está autorizado para archivar este proyecto.';
  end if;

  update public.proyectos
  set
    estado = 'inactivo',
    deleted_at = now(),
    updated_at = now()
  where id = p_project_id;
end;
$$;

create or replace function public.restore_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.proyectos%rowtype;
  v_role text;
begin
  select *
  into v_project
  from public.proyectos
  where id = p_project_id
    and organization_id = public.current_org()
  for update;

  if not found then
    raise exception 'Proyecto no encontrado o no autorizado.';
  end if;

  select rol
  into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial') then
    raise exception 'Solo administración o jefatura comercial puede restaurar proyectos.';
  end if;

  update public.proyectos
  set
    estado = 'activo',
    deleted_at = null,
    updated_at = now()
  where id = p_project_id;
end;
$$;

revoke all on function public.get_project_catalogs() from public;
revoke all on function public.find_project_matches(text, text, uuid, uuid, uuid) from public;
revoke all on function public.deactivate_project(uuid) from public;
revoke all on function public.restore_project(uuid) from public;

grant execute on function public.get_project_catalogs() to authenticated;
grant execute on function public.find_project_matches(text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.deactivate_project(uuid) to authenticated;
grant execute on function public.restore_project(uuid) to authenticated;

commit;
