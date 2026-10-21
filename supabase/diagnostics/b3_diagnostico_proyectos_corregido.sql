-- B3: diagnostico integral de Proyectos
-- Solo lectura. La tabla proyectos no usa deleted_at.

-- RESULTADO 1: estructura real
select
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'proyectos'
order by ordinal_position;

-- RESULTADO 2: restricciones y relaciones
select
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'f' then 'FOREIGN KEY'
    when 'u' then 'UNIQUE'
    when 'c' then 'CHECK'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'proyectos'
order by constraint_type, constraint_name;

-- RESULTADO 3: indices
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'proyectos'
order by indexname;

-- RESULTADO 4: resumen general y calidad
select
  count(*) as total_proyectos,
  count(*) filter (
    where nullif(trim(coalesce(nombre, '')), '') is null
  ) as sin_nombre,
  count(*) filter (
    where contacto_principal_id is null
  ) as sin_contacto_principal,
  count(*) filter (
    where empresa_id is null
  ) as sin_empresa,
  count(*) filter (
    where nullif(trim(coalesce(direccion, '')), '') is null
  ) as sin_direccion,
  count(*) filter (
    where nullif(trim(coalesce(comuna, '')), '') is null
  ) as sin_comuna,
  count(*) filter (
    where nullif(trim(coalesce(region, '')), '') is null
  ) as sin_region,
  count(*) filter (
    where nullif(trim(coalesce(tipo_proyecto, '')), '') is null
  ) as sin_tipo_proyecto,
  count(*) filter (
    where nullif(trim(coalesce(tipo_obra, '')), '') is null
  ) as sin_tipo_obra,
  count(*) filter (
    where metros_cuadrados_estimados is null
  ) as sin_metros_cuadrados
from public.proyectos;

-- RESULTADO 5: valores actuales para menus controlados
select
  'estado'::text as campo,
  coalesce(estado, '(nulo)') as valor,
  count(*) as cantidad
from public.proyectos
group by estado

union all

select
  'tipo_proyecto',
  coalesce(tipo_proyecto, '(nulo)'),
  count(*)
from public.proyectos
group by tipo_proyecto

union all

select
  'tipo_obra',
  coalesce(tipo_obra, '(nulo)'),
  count(*)
from public.proyectos
group by tipo_obra

order by campo, cantidad desc, valor;

-- RESULTADO 6: candidatos a duplicado por nombre
select
  organization_id,
  lower(
    regexp_replace(
      trim(nombre),
      '[^a-zA-Z0-9]+',
      '',
      'g'
    )
  ) as nombre_normalizado,
  count(*) as cantidad,
  array_agg(id order by created_at) as proyecto_ids,
  array_agg(nombre order by created_at) as nombres
from public.proyectos
where nullif(trim(coalesce(nombre, '')), '') is not null
group by
  organization_id,
  lower(
    regexp_replace(
      trim(nombre),
      '[^a-zA-Z0-9]+',
      '',
      'g'
    )
  )
having count(*) > 1
order by cantidad desc, nombre_normalizado;

-- RESULTADO 7: relaciones comerciales por proyecto
select
  p.id,
  p.nombre,
  p.estado,
  trim(concat_ws(' ', c.nombre, c.apellido)) as contacto_principal,
  e.razon_social as empresa,
  (
    select count(*)
    from public.oportunidades o
    where o.proyecto_id = p.id
  ) as oportunidades,
  (
    select count(*)
    from public.cotizaciones q
    where q.proyecto_id = p.id
      and q.deleted_at is null
  ) as cotizaciones_activas,
  (
    select coalesce(sum(q.total), 0)
    from public.cotizaciones q
    where q.proyecto_id = p.id
      and q.deleted_at is null
  ) as monto_total_cotizado,
  (
    select count(*)
    from public.activities a
    where a.proyecto_id = p.id
  ) as actividades,
  (
    select count(*)
    from public.tasks t
    where t.proyecto_id = p.id
      and t.estado in ('pendiente', 'en_curso')
  ) as tareas_activas
from public.proyectos p
left join public.contactos c
  on c.id = p.contacto_principal_id
 and c.organization_id = p.organization_id
left join public.empresas e
  on e.id = p.empresa_id
 and e.organization_id = p.organization_id
order by p.updated_at desc nulls last, p.created_at desc;

-- RESULTADO 8: proyectos sin relaciones
select
  p.id,
  p.nombre,
  p.created_at,
  p.estado
from public.proyectos p
where not exists (
    select 1
    from public.oportunidades o
    where o.proyecto_id = p.id
  )
  and not exists (
    select 1
    from public.cotizaciones q
    where q.proyecto_id = p.id
      and q.deleted_at is null
  )
  and not exists (
    select 1
    from public.activities a
    where a.proyecto_id = p.id
  )
  and not exists (
    select 1
    from public.tasks t
    where t.proyecto_id = p.id
  )
order by p.created_at;

-- RESULTADO 9: relaciones inexistentes o de otra organizacion
select
  p.id as proyecto_id,
  p.nombre,
  p.organization_id as organizacion_proyecto,
  p.contacto_principal_id,
  c.organization_id as organizacion_contacto,
  p.empresa_id,
  e.organization_id as organizacion_empresa,
  case
    when p.contacto_principal_id is not null and c.id is null
      then 'CONTACTO_INEXISTENTE'
    when p.contacto_principal_id is not null
      and c.organization_id is distinct from p.organization_id
      then 'CONTACTO_OTRA_ORGANIZACION'
    when p.empresa_id is not null and e.id is null
      then 'EMPRESA_INEXISTENTE'
    when p.empresa_id is not null
      and e.organization_id is distinct from p.organization_id
      then 'EMPRESA_OTRA_ORGANIZACION'
    else 'OK'
  end as resultado
from public.proyectos p
left join public.contactos c
  on c.id = p.contacto_principal_id
left join public.empresas e
  on e.id = p.empresa_id
where (
    p.contacto_principal_id is not null
    and (
      c.id is null
      or c.organization_id is distinct from p.organization_id
    )
  )
  or (
    p.empresa_id is not null
    and (
      e.id is null
      or e.organization_id is distinct from p.organization_id
    )
  )
order by p.nombre;

-- RESULTADO 10: ficha base para revision
select
  p.id,
  p.organization_id,
  p.nombre,
  p.direccion,
  p.comuna,
  p.ciudad,
  p.region,
  p.tipo_proyecto,
  p.tipo_obra,
  p.metros_cuadrados_estimados,
  p.estado,
  p.contacto_principal_id,
  trim(concat_ws(' ', c.nombre, c.apellido)) as contacto_principal,
  p.empresa_id,
  e.razon_social as empresa,
  p.created_at,
  p.updated_at
from public.proyectos p
left join public.contactos c
  on c.id = p.contacto_principal_id
 and c.organization_id = p.organization_id
left join public.empresas e
  on e.id = p.empresa_id
 and e.organization_id = p.organization_id
order by p.updated_at desc nulls last, p.created_at desc;
