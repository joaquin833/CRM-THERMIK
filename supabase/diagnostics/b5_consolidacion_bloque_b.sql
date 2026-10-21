-- B5: consolidacion final del Bloque B
-- Contactos, Empresas, Proyectos y sus relaciones con Cotizaciones y Oportunidades.
-- SOLO LECTURA: no crea, modifica ni elimina datos.

-- ============================================================
-- RESULTADO 1: RESUMEN GENERAL
-- ============================================================
select
  (select count(*) from public.contactos c where c.deleted_at is null) as contactos_activos,
  (select count(*) from public.empresas e where e.deleted_at is null) as empresas_activas,
  (select count(*) from public.proyectos p where p.deleted_at is null) as proyectos_activos,
  (select count(*) from public.cotizaciones q where q.deleted_at is null) as cotizaciones_activas,
  (select count(*) from public.oportunidades o) as oportunidades_totales;

-- ============================================================
-- RESULTADO 2: CONTACTOS SIN RELACIONES COMERCIALES
-- ============================================================
select
  c.id,
  trim(concat_ws(' ', c.nombre, c.apellido)) as contacto,
  c.correo,
  c.telefono,
  c.estado,
  c.created_at
from public.contactos c
where c.deleted_at is null
  and not exists (
    select 1 from public.proyectos p
    where p.contacto_principal_id = c.id
      and p.deleted_at is null
  )
  and not exists (
    select 1 from public.oportunidades o
    where o.contacto_id = c.id
  )
  and not exists (
    select 1 from public.cotizaciones q
    where q.contacto_id = c.id
      and q.deleted_at is null
  )
  and not exists (
    select 1 from public.activities a
    where a.contacto_id = c.id
  )
  and not exists (
    select 1 from public.tasks t
    where t.contacto_id = c.id
  )
order by c.created_at;

-- ============================================================
-- RESULTADO 3: EMPRESAS SIN RELACIONES COMERCIALES
-- ============================================================
select
  e.id,
  e.razon_social,
  e.rut,
  e.estado,
  e.created_at
from public.empresas e
where e.deleted_at is null
  and not exists (
    select 1 from public.contactos c
    where c.empresa_id = e.id
      and c.deleted_at is null
  )
  and not exists (
    select 1 from public.proyectos p
    where p.empresa_id = e.id
      and p.deleted_at is null
  )
  and not exists (
    select 1 from public.oportunidades o
    where o.empresa_id = e.id
  )
  and not exists (
    select 1 from public.cotizaciones q
    where q.empresa_id = e.id
      and q.deleted_at is null
  )
order by e.created_at;

-- ============================================================
-- RESULTADO 4: PROYECTOS SIN CONTACTO PRINCIPAL
-- ============================================================
select
  p.id,
  p.nombre,
  p.estado,
  p.empresa_id,
  p.created_at
from public.proyectos p
where p.deleted_at is null
  and p.contacto_principal_id is null
order by p.created_at;

-- ============================================================
-- RESULTADO 5: PROYECTOS SIN COTIZACION NI OPORTUNIDAD
-- ============================================================
select
  p.id,
  p.nombre,
  p.estado,
  p.created_at
from public.proyectos p
where p.deleted_at is null
  and not exists (
    select 1 from public.oportunidades o
    where o.proyecto_id = p.id
  )
  and not exists (
    select 1 from public.cotizaciones q
    where q.proyecto_id = p.id
      and q.deleted_at is null
  )
order by p.created_at;

-- ============================================================
-- RESULTADO 6: INCONSISTENCIAS DE EMPRESA ENTRE ENTIDADES
-- ============================================================
select
  q.id as cotizacion_id,
  q.numero_cotizacion,
  q.empresa_id as empresa_cotizacion,
  p.empresa_id as empresa_proyecto,
  o.empresa_id as empresa_oportunidad,
  c.empresa_id as empresa_contacto,
  case
    when p.empresa_id is distinct from q.empresa_id
      then 'PROYECTO_DIFERENTE'
    when o.empresa_id is distinct from q.empresa_id
      then 'OPORTUNIDAD_DIFERENTE'
    when c.empresa_id is not null
      and c.empresa_id is distinct from q.empresa_id
      then 'CONTACTO_DIFERENTE'
    else 'OK'
  end as resultado
from public.cotizaciones q
left join public.proyectos p
  on p.id = q.proyecto_id
 and p.organization_id = q.organization_id
left join public.oportunidades o
  on o.id = q.oportunidad_id
 and o.organization_id = q.organization_id
left join public.contactos c
  on c.id = q.contacto_id
 and c.organization_id = q.organization_id
where q.deleted_at is null
  and (
    p.empresa_id is distinct from q.empresa_id
    or o.empresa_id is distinct from q.empresa_id
    or (
      c.empresa_id is not null
      and c.empresa_id is distinct from q.empresa_id
    )
  )
order by q.numero_cotizacion;

-- ============================================================
-- RESULTADO 7: RELACIONES INEXISTENTES O DE OTRA ORGANIZACION
-- ============================================================
select
  'COTIZACION_CONTACTO'::text as tipo,
  q.id as entidad_id,
  q.numero_cotizacion as entidad_nombre,
  q.organization_id,
  q.contacto_id as relacion_id
from public.cotizaciones q
left join public.contactos c
  on c.id = q.contacto_id
 and c.organization_id = q.organization_id
where q.deleted_at is null
  and (c.id is null or c.deleted_at is not null)

union all

select
  'COTIZACION_PROYECTO',
  q.id,
  q.numero_cotizacion,
  q.organization_id,
  q.proyecto_id
from public.cotizaciones q
left join public.proyectos p
  on p.id = q.proyecto_id
 and p.organization_id = q.organization_id
where q.deleted_at is null
  and (p.id is null or p.deleted_at is not null)

union all

select
  'COTIZACION_OPORTUNIDAD',
  q.id,
  q.numero_cotizacion,
  q.organization_id,
  q.oportunidad_id
from public.cotizaciones q
left join public.oportunidades o
  on o.id = q.oportunidad_id
 and o.organization_id = q.organization_id
where q.deleted_at is null
  and o.id is null

union all

select
  'PROYECTO_CONTACTO',
  p.id,
  p.nombre,
  p.organization_id,
  p.contacto_principal_id
from public.proyectos p
left join public.contactos c
  on c.id = p.contacto_principal_id
 and c.organization_id = p.organization_id
where p.deleted_at is null
  and p.contacto_principal_id is not null
  and (c.id is null or c.deleted_at is not null)

union all

select
  'PROYECTO_EMPRESA',
  p.id,
  p.nombre,
  p.organization_id,
  p.empresa_id
from public.proyectos p
left join public.empresas e
  on e.id = p.empresa_id
 and e.organization_id = p.organization_id
where p.deleted_at is null
  and p.empresa_id is not null
  and (e.id is null or e.deleted_at is not null);

-- ============================================================
-- RESULTADO 8: DUPLICADOS ACTIVOS
-- ============================================================
select
  'CONTACTO_CORREO'::text as tipo,
  c.organization_id,
  c.correo_normalizado as clave,
  count(*) as cantidad,
  array_agg(c.id order by c.created_at) as ids
from public.contactos c
where c.deleted_at is null
  and nullif(trim(coalesce(c.correo_normalizado, '')), '') is not null
group by c.organization_id, c.correo_normalizado
having count(*) > 1

union all

select
  'EMPRESA_RUT',
  e.organization_id,
  e.rut_normalizado,
  count(*),
  array_agg(e.id order by e.created_at)
from public.empresas e
where e.deleted_at is null
  and nullif(trim(coalesce(e.rut_normalizado, '')), '') is not null
group by e.organization_id, e.rut_normalizado
having count(*) > 1

union all

select
  'PROYECTO_NOMBRE',
  p.organization_id,
  p.nombre_normalizado,
  count(*),
  array_agg(p.id order by p.created_at)
from public.proyectos p
where p.deleted_at is null
  and nullif(trim(coalesce(p.nombre_normalizado, '')), '') is not null
group by p.organization_id, p.nombre_normalizado
having count(*) > 1;

-- ============================================================
-- RESULTADO 9: REGISTROS ARCHIVADOS CON RELACIONES ACTIVAS
-- ============================================================
select
  'CONTACTO_ARCHIVADO'::text as tipo,
  c.id,
  trim(concat_ws(' ', c.nombre, c.apellido)) as nombre,
  c.deleted_at,
  (
    select count(*) from public.cotizaciones q
    where q.contacto_id = c.id and q.deleted_at is null
  ) as cotizaciones_activas
from public.contactos c
where c.deleted_at is not null
  and exists (
    select 1 from public.cotizaciones q
    where q.contacto_id = c.id and q.deleted_at is null
  )

union all

select
  'EMPRESA_ARCHIVADA',
  e.id,
  e.razon_social,
  e.deleted_at,
  (
    select count(*) from public.cotizaciones q
    where q.empresa_id = e.id and q.deleted_at is null
  )
from public.empresas e
where e.deleted_at is not null
  and exists (
    select 1 from public.cotizaciones q
    where q.empresa_id = e.id and q.deleted_at is null
  )

union all

select
  'PROYECTO_ARCHIVADO',
  p.id,
  p.nombre,
  p.deleted_at,
  (
    select count(*) from public.cotizaciones q
    where q.proyecto_id = p.id and q.deleted_at is null
  )
from public.proyectos p
where p.deleted_at is not null
  and exists (
    select 1 from public.cotizaciones q
    where q.proyecto_id = p.id and q.deleted_at is null
  );

-- ============================================================
-- RESULTADO 10: CONSISTENCIA FINAL AUTOMATICA
-- ============================================================
with
contactos_sin_relacion as (
  select c.id
  from public.contactos c
  where c.deleted_at is null
    and not exists (select 1 from public.proyectos p where p.contacto_principal_id = c.id and p.deleted_at is null)
    and not exists (select 1 from public.oportunidades o where o.contacto_id = c.id)
    and not exists (select 1 from public.cotizaciones q where q.contacto_id = c.id and q.deleted_at is null)
    and not exists (select 1 from public.activities a where a.contacto_id = c.id)
    and not exists (select 1 from public.tasks t where t.contacto_id = c.id)
),
empresas_sin_relacion as (
  select e.id
  from public.empresas e
  where e.deleted_at is null
    and not exists (select 1 from public.contactos c where c.empresa_id = e.id and c.deleted_at is null)
    and not exists (select 1 from public.proyectos p where p.empresa_id = e.id and p.deleted_at is null)
    and not exists (select 1 from public.oportunidades o where o.empresa_id = e.id)
    and not exists (select 1 from public.cotizaciones q where q.empresa_id = e.id and q.deleted_at is null)
),
proyectos_sin_contacto as (
  select p.id from public.proyectos p
  where p.deleted_at is null and p.contacto_principal_id is null
),
proyectos_sin_relacion as (
  select p.id
  from public.proyectos p
  where p.deleted_at is null
    and not exists (select 1 from public.oportunidades o where o.proyecto_id = p.id)
    and not exists (select 1 from public.cotizaciones q where q.proyecto_id = p.id and q.deleted_at is null)
),
inconsistencias_empresa as (
  select q.id
  from public.cotizaciones q
  left join public.proyectos p on p.id = q.proyecto_id and p.organization_id = q.organization_id
  left join public.oportunidades o on o.id = q.oportunidad_id and o.organization_id = q.organization_id
  where q.deleted_at is null
    and (p.empresa_id is distinct from q.empresa_id or o.empresa_id is distinct from q.empresa_id)
),
duplicados_contacto as (
  select c.organization_id, c.correo_normalizado
  from public.contactos c
  where c.deleted_at is null and c.correo_normalizado is not null
  group by c.organization_id, c.correo_normalizado
  having count(*) > 1
),
duplicados_empresa as (
  select e.organization_id, e.rut_normalizado
  from public.empresas e
  where e.deleted_at is null and e.rut_normalizado is not null
  group by e.organization_id, e.rut_normalizado
  having count(*) > 1
),
duplicados_proyecto as (
  select p.organization_id, p.nombre_normalizado
  from public.proyectos p
  where p.deleted_at is null and p.nombre_normalizado is not null
  group by p.organization_id, p.nombre_normalizado
  having count(*) > 1
)
select
  (select count(*) from contactos_sin_relacion) as contactos_sin_relacion,
  (select count(*) from empresas_sin_relacion) as empresas_sin_relacion,
  (select count(*) from proyectos_sin_contacto) as proyectos_sin_contacto,
  (select count(*) from proyectos_sin_relacion) as proyectos_sin_relacion,
  (select count(*) from inconsistencias_empresa) as inconsistencias_empresa,
  (select count(*) from duplicados_contacto) as duplicados_contacto,
  (select count(*) from duplicados_empresa) as duplicados_empresa,
  (select count(*) from duplicados_proyecto) as duplicados_proyecto,
  case
    when (select count(*) from proyectos_sin_contacto) = 0
     and (select count(*) from proyectos_sin_relacion) = 0
     and (select count(*) from inconsistencias_empresa) = 0
     and (select count(*) from duplicados_contacto) = 0
     and (select count(*) from duplicados_empresa) = 0
     and (select count(*) from duplicados_proyecto) = 0
      then 'BLOQUE_B_CONSISTENTE'
    else 'BLOQUE_B_REQUIERE_REVISION'
  end as resultado_final;
