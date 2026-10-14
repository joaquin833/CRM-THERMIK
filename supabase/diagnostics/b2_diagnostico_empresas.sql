-- =========================================================
-- B2 - DIAGNOSTICO INTEGRAL DE EMPRESAS
-- CRM Thermikhaus
-- Solo lectura: no crea, modifica ni elimina datos.
-- Ejecutar el archivo completo en Supabase SQL Editor.
-- =========================================================

-- ---------------------------------------------------------
-- 0. Contexto de ejecucion
-- ---------------------------------------------------------
select
  now() as ejecutado_en,
  auth.uid() as usuario_actual,
  public.current_org() as organization_id_actual;

-- ---------------------------------------------------------
-- 1. Estructura real de public.empresas
-- ---------------------------------------------------------
select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'empresas'
order by c.ordinal_position;

-- ---------------------------------------------------------
-- 2. Restricciones y relaciones declaradas
-- ---------------------------------------------------------
select
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_schema = tc.constraint_schema
 and ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name = 'empresas'
order by tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- ---------------------------------------------------------
-- 3. Indices existentes
-- ---------------------------------------------------------
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'empresas'
order by indexname;

-- ---------------------------------------------------------
-- 4. Triggers instalados
-- ---------------------------------------------------------
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'empresas'
order by trigger_name, event_manipulation;

-- ---------------------------------------------------------
-- 5. Politicas RLS
-- ---------------------------------------------------------
select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'empresas'
order by policyname;

-- ---------------------------------------------------------
-- 6. Resumen general por organizacion
-- ---------------------------------------------------------
select
  organization_id,
  count(*) as empresas_totales,
  count(*) filter (where deleted_at is null) as empresas_no_archivadas,
  count(*) filter (where deleted_at is not null) as empresas_archivadas,
  count(*) filter (where deleted_at is null and estado = 'activo') as activas,
  count(*) filter (where deleted_at is null and estado = 'inactivo') as inactivas,
  count(*) filter (where deleted_at is null and estado is null) as sin_estado
from public.empresas
group by organization_id
order by organization_id;

-- ---------------------------------------------------------
-- 7. Catalogos actuales encontrados en los datos
-- ---------------------------------------------------------
select
  'estado' as campo,
  coalesce(estado, '[NULL]') as valor,
  count(*) as cantidad
from public.empresas
where deleted_at is null
group by estado

union all

select
  'segmento',
  coalesce(segmento, '[NULL]'),
  count(*)
from public.empresas
where deleted_at is null
group by segmento

union all

select
  'origen',
  coalesce(origen, '[NULL]'),
  count(*)
from public.empresas
where deleted_at is null
group by origen

order by campo, cantidad desc, valor;

-- ---------------------------------------------------------
-- 8. Calidad y completitud de datos
-- ---------------------------------------------------------
select
  count(*) filter (where deleted_at is null) as empresas_activas_logicas,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(razon_social), '') is null
  ) as sin_razon_social,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(rut), '') is null
  ) as sin_rut,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(nombre_fantasia), '') is null
  ) as sin_nombre_fantasia,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(giro), '') is null
  ) as sin_giro,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(direccion), '') is null
  ) as sin_direccion,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(comuna), '') is null
  ) as sin_comuna,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(region), '') is null
  ) as sin_region,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(segmento), '') is null
  ) as sin_segmento,
  count(*) filter (
    where deleted_at is null
      and nullif(btrim(origen), '') is null
  ) as sin_origen,
  count(*) filter (
    where deleted_at is null
      and ejecutivo_responsable_id is null
  ) as sin_responsable
from public.empresas;

-- ---------------------------------------------------------
-- 9. Detalle de empresas con datos comerciales incompletos
-- ---------------------------------------------------------
select
  id,
  organization_id,
  razon_social,
  nombre_fantasia,
  rut,
  giro,
  direccion,
  comuna,
  ciudad,
  region,
  segmento,
  origen,
  ejecutivo_responsable_id,
  estado,
  array_remove(array[
    case when nullif(btrim(razon_social), '') is null then 'razon_social' end,
    case when nullif(btrim(rut), '') is null then 'rut' end,
    case when nullif(btrim(giro), '') is null then 'giro' end,
    case when nullif(btrim(comuna), '') is null then 'comuna' end,
    case when nullif(btrim(region), '') is null then 'region' end,
    case when nullif(btrim(segmento), '') is null then 'segmento' end,
    case when nullif(btrim(origen), '') is null then 'origen' end,
    case when ejecutivo_responsable_id is null then 'ejecutivo_responsable_id' end
  ], null) as campos_faltantes,
  created_at,
  updated_at
from public.empresas
where deleted_at is null
  and (
    nullif(btrim(razon_social), '') is null
    or nullif(btrim(rut), '') is null
    or nullif(btrim(giro), '') is null
    or nullif(btrim(comuna), '') is null
    or nullif(btrim(region), '') is null
    or nullif(btrim(segmento), '') is null
    or nullif(btrim(origen), '') is null
    or ejecutivo_responsable_id is null
  )
order by cardinality(array_remove(array[
  case when nullif(btrim(razon_social), '') is null then 'x' end,
  case when nullif(btrim(rut), '') is null then 'x' end,
  case when nullif(btrim(giro), '') is null then 'x' end,
  case when nullif(btrim(comuna), '') is null then 'x' end,
  case when nullif(btrim(region), '') is null then 'x' end,
  case when nullif(btrim(segmento), '') is null then 'x' end,
  case when nullif(btrim(origen), '') is null then 'x' end,
  case when ejecutivo_responsable_id is null then 'x' end
], null)) desc,
razon_social nulls last;

-- ---------------------------------------------------------
-- 10. Vista de normalizacion propuesta para RUT
-- No modifica datos. rut_normalizado conserva solo digitos y K.
-- ---------------------------------------------------------
select
  id,
  organization_id,
  razon_social,
  rut as rut_original,
  upper(regexp_replace(coalesce(rut, ''), '[^0-9kK]', '', 'g')) as rut_normalizado_propuesto,
  case
    when nullif(btrim(rut), '') is null then 'sin_rut'
    when length(upper(regexp_replace(rut, '[^0-9kK]', '', 'g'))) between 8 and 9
      then 'longitud_plausible'
    else 'revisar_formato'
  end as diagnostico_formato
from public.empresas
where deleted_at is null
order by razon_social nulls last;

-- ---------------------------------------------------------
-- 11. Duplicados exactos por RUT normalizado dentro de la organizacion
-- ---------------------------------------------------------
with empresas_normalizadas as (
  select
    id,
    organization_id,
    razon_social,
    rut,
    upper(regexp_replace(coalesce(rut, ''), '[^0-9kK]', '', 'g')) as rut_normalizado
  from public.empresas
  where deleted_at is null
)
select
  organization_id,
  rut_normalizado,
  count(*) as cantidad,
  array_agg(id order by id) as empresa_ids,
  array_agg(razon_social order by razon_social) as razones_sociales,
  array_agg(rut order by rut) as ruts_originales
from empresas_normalizadas
where rut_normalizado <> ''
group by organization_id, rut_normalizado
having count(*) > 1
order by cantidad desc, rut_normalizado;

-- ---------------------------------------------------------
-- 12. Coincidencias exactas por razon social normalizada
-- Usa lower + trim + reduccion de espacios; no requiere unaccent.
-- ---------------------------------------------------------
with empresas_normalizadas as (
  select
    id,
    organization_id,
    razon_social,
    rut,
    lower(regexp_replace(btrim(coalesce(razon_social, '')), '\s+', ' ', 'g'))
      as razon_social_normalizada
  from public.empresas
  where deleted_at is null
)
select
  organization_id,
  razon_social_normalizada,
  count(*) as cantidad,
  array_agg(id order by id) as empresa_ids,
  array_agg(razon_social order by razon_social) as razones_sociales,
  array_agg(rut order by rut) as ruts
from empresas_normalizadas
where razon_social_normalizada <> ''
group by organization_id, razon_social_normalizada
having count(*) > 1
order by cantidad desc, razon_social_normalizada;

-- ---------------------------------------------------------
-- 13. Coincidencias exactas por nombre de fantasia normalizado
-- ---------------------------------------------------------
with empresas_normalizadas as (
  select
    id,
    organization_id,
    razon_social,
    nombre_fantasia,
    rut,
    lower(regexp_replace(btrim(coalesce(nombre_fantasia, '')), '\s+', ' ', 'g'))
      as nombre_fantasia_normalizado
  from public.empresas
  where deleted_at is null
)
select
  organization_id,
  nombre_fantasia_normalizado,
  count(*) as cantidad,
  array_agg(id order by id) as empresa_ids,
  array_agg(razon_social order by razon_social) as razones_sociales,
  array_agg(nombre_fantasia order by nombre_fantasia) as nombres_fantasia,
  array_agg(rut order by rut) as ruts
from empresas_normalizadas
where nombre_fantasia_normalizado <> ''
group by organization_id, nombre_fantasia_normalizado
having count(*) > 1
order by cantidad desc, nombre_fantasia_normalizado;

-- ---------------------------------------------------------
-- 14. Relaciones por empresa
-- Contactos, proyectos, oportunidades y cotizaciones.
-- ---------------------------------------------------------
select
  e.id,
  e.organization_id,
  e.razon_social,
  e.nombre_fantasia,
  e.rut,
  e.estado,
  count(distinct c.id) filter (where c.deleted_at is null) as contactos_activos,
  count(distinct c.id) filter (where c.deleted_at is not null) as contactos_archivados,
  count(distinct p.id) as proyectos,
  count(distinct o.id) as oportunidades,
  count(distinct q.id) filter (where q.deleted_at is null) as cotizaciones_activas,
  count(distinct q.id) filter (where q.deleted_at is not null) as cotizaciones_archivadas,
  coalesce(sum(distinct q.total) filter (where q.deleted_at is null), 0) as monto_cotizado_referencial
from public.empresas e
left join public.contactos c
  on c.organization_id = e.organization_id
 and c.empresa_id = e.id
left join public.proyectos p
  on p.organization_id = e.organization_id
 and p.empresa_id = e.id
left join public.oportunidades o
  on o.organization_id = e.organization_id
 and o.empresa_id = e.id
left join public.cotizaciones q
  on q.organization_id = e.organization_id
 and q.empresa_id = e.id
where e.deleted_at is null
group by
  e.id,
  e.organization_id,
  e.razon_social,
  e.nombre_fantasia,
  e.rut,
  e.estado
order by cotizaciones_activas desc, contactos_activos desc, e.razon_social;

-- Nota: monto_cotizado_referencial usa SUM(DISTINCT total) para evitar
-- multiplicacion por joins. No debe utilizarse como reporte financiero final.

-- ---------------------------------------------------------
-- 15. Empresas sin relaciones comerciales
-- ---------------------------------------------------------
select
  e.id,
  e.organization_id,
  e.razon_social,
  e.nombre_fantasia,
  e.rut,
  e.estado,
  e.created_at,
  e.updated_at
from public.empresas e
where e.deleted_at is null
  and not exists (
    select 1 from public.contactos c
    where c.organization_id = e.organization_id
      and c.empresa_id = e.id
  )
  and not exists (
    select 1 from public.proyectos p
    where p.organization_id = e.organization_id
      and p.empresa_id = e.id
  )
  and not exists (
    select 1 from public.oportunidades o
    where o.organization_id = e.organization_id
      and o.empresa_id = e.id
  )
  and not exists (
    select 1 from public.cotizaciones q
    where q.organization_id = e.organization_id
      and q.empresa_id = e.id
  )
order by e.created_at;

-- ---------------------------------------------------------
-- 16. Relaciones cruzadas incoherentes
-- Detecta entidades relacionadas a una empresa de otra organizacion.
-- ---------------------------------------------------------
select
  'contactos' as tabla_origen,
  c.id as registro_id,
  c.organization_id as registro_organization_id,
  c.empresa_id,
  e.organization_id as empresa_organization_id
from public.contactos c
join public.empresas e on e.id = c.empresa_id
where c.organization_id <> e.organization_id

union all

select
  'proyectos',
  p.id,
  p.organization_id,
  p.empresa_id,
  e.organization_id
from public.proyectos p
join public.empresas e on e.id = p.empresa_id
where p.organization_id <> e.organization_id

union all

select
  'oportunidades',
  o.id,
  o.organization_id,
  o.empresa_id,
  e.organization_id
from public.oportunidades o
join public.empresas e on e.id = o.empresa_id
where o.organization_id <> e.organization_id

union all

select
  'cotizaciones',
  q.id,
  q.organization_id,
  q.empresa_id,
  e.organization_id
from public.cotizaciones q
join public.empresas e on e.id = q.empresa_id
where q.organization_id <> e.organization_id

order by tabla_origen, registro_id;

-- ---------------------------------------------------------
-- 17. Empresas archivadas que conservan relaciones activas
-- ---------------------------------------------------------
select
  e.id,
  e.organization_id,
  e.razon_social,
  e.rut,
  e.estado,
  e.deleted_at,
  (select count(*) from public.contactos c
    where c.organization_id = e.organization_id
      and c.empresa_id = e.id
      and c.deleted_at is null) as contactos_activos,
  (select count(*) from public.proyectos p
    where p.organization_id = e.organization_id
      and p.empresa_id = e.id) as proyectos,
  (select count(*) from public.oportunidades o
    where o.organization_id = e.organization_id
      and o.empresa_id = e.id) as oportunidades,
  (select count(*) from public.cotizaciones q
    where q.organization_id = e.organization_id
      and q.empresa_id = e.id
      and q.deleted_at is null) as cotizaciones_activas
from public.empresas e
where e.deleted_at is not null
  and (
    exists (
      select 1 from public.contactos c
      where c.organization_id = e.organization_id
        and c.empresa_id = e.id
        and c.deleted_at is null
    )
    or exists (
      select 1 from public.proyectos p
      where p.organization_id = e.organization_id
        and p.empresa_id = e.id
    )
    or exists (
      select 1 from public.oportunidades o
      where o.organization_id = e.organization_id
        and o.empresa_id = e.id
    )
    or exists (
      select 1 from public.cotizaciones q
      where q.organization_id = e.organization_id
        and q.empresa_id = e.id
        and q.deleted_at is null
    )
  )
order by e.deleted_at desc;

-- ---------------------------------------------------------
-- 18. Responsables inexistentes o de otra organizacion
-- ---------------------------------------------------------
select
  e.id as empresa_id,
  e.organization_id as empresa_organization_id,
  e.razon_social,
  e.ejecutivo_responsable_id,
  p.organization_id as perfil_organization_id,
  p.estado as perfil_estado
from public.empresas e
left join public.profiles p
  on p.id = e.ejecutivo_responsable_id
where e.deleted_at is null
  and e.ejecutivo_responsable_id is not null
  and (
    p.id is null
    or p.organization_id <> e.organization_id
    or p.estado <> 'activo'
  )
order by e.razon_social;

-- ---------------------------------------------------------
-- 19. Ficha base para revision manual
-- ---------------------------------------------------------
select
  e.id,
  e.organization_id,
  e.razon_social,
  e.nombre_fantasia,
  e.rut,
  upper(regexp_replace(coalesce(e.rut, ''), '[^0-9kK]', '', 'g'))
    as rut_normalizado_propuesto,
  e.giro,
  e.pagina_web,
  e.direccion,
  e.comuna,
  e.ciudad,
  e.region,
  e.segmento,
  e.origen,
  e.ejecutivo_responsable_id,
  nullif(btrim(concat_ws(' ', pr.nombre, pr.apellido)), '') as responsable,
  e.observaciones,
  e.estado,
  e.created_at,
  e.updated_at,
  e.deleted_at
from public.empresas e
left join public.profiles pr
  on pr.id = e.ejecutivo_responsable_id
 and pr.organization_id = e.organization_id
order by e.deleted_at nulls first, e.razon_social nulls last;

-- =========================================================
-- FIN DEL DIAGNOSTICO B2
-- No se realizaron cambios en la base de datos.
-- =========================================================
