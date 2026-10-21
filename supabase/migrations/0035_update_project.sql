begin;

create or replace function public.update_project(
  p_project_id uuid,
  p_nombre text,
  p_contacto_principal_id uuid default null,
  p_empresa_id uuid default null,
  p_direccion text default null,
  p_comuna text default null,
  p_ciudad text default null,
  p_region text default null,
  p_tipo_proyecto text default null,
  p_tipo_obra text default null,
  p_metros_cuadrados_estimados numeric default null,
  p_estado text default 'activo',
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.proyectos%rowtype;
  v_role text;
  v_matches jsonb;
begin
  if auth.uid() is null or public.current_org() is null then
    raise exception 'Debe iniciar sesión para editar el proyecto.';
  end if;

  select * into v_project
  from public.proyectos
  where id = p_project_id
    and organization_id = public.current_org()
  for update;

  if not found then
    raise exception 'Proyecto no encontrado o no autorizado.';
  end if;

  if v_project.deleted_at is not null then
    raise exception 'Un proyecto archivado no puede editarse.';
  end if;

  select rol into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org();

  if v_role not in ('admin', 'jefatura_comercial', 'ejecutivo_comercial') then
    raise exception 'No está autorizado para editar proyectos.';
  end if;

  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El nombre del proyecto es obligatorio.';
  end if;

  if p_contacto_principal_id is not null and not exists (
    select 1 from public.contactos c
    where c.id = p_contacto_principal_id
      and c.organization_id = public.current_org()
      and c.deleted_at is null
  ) then
    raise exception 'El contacto principal no es válido.';
  end if;

  if p_empresa_id is not null and not exists (
    select 1 from public.empresas e
    where e.id = p_empresa_id
      and e.organization_id = public.current_org()
      and e.deleted_at is null
  ) then
    raise exception 'La empresa seleccionada no es válida.';
  end if;

  update public.proyectos
  set
    nombre = p_nombre,
    contacto_principal_id = p_contacto_principal_id,
    empresa_id = p_empresa_id,
    direccion = p_direccion,
    comuna = p_comuna,
    ciudad = p_ciudad,
    region = p_region,
    tipo_proyecto = p_tipo_proyecto,
    tipo_obra = p_tipo_obra,
    metros_cuadrados_estimados = p_metros_cuadrados_estimados,
    estado = p_estado,
    observaciones = p_observaciones,
    updated_at = now()
  where id = p_project_id;

  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
  into v_matches
  from public.find_project_matches(
    p_nombre,
    p_direccion,
    p_contacto_principal_id,
    p_empresa_id,
    p_project_id
  ) m;

  return jsonb_build_object(
    'project_id', p_project_id,
    'matches', v_matches
  );
end;
$$;

revoke all on function public.update_project(
  uuid, text, uuid, uuid, text, text, text, text, text, text, numeric, text, text
) from public;

grant execute on function public.update_project(
  uuid, text, uuid, uuid, text, text, text, text, text, text, numeric, text, text
) to authenticated;

commit;
