-- B2: prueba final de consistencia de Empresas
-- Solo lectura. No modifica datos.

with cotizaciones_activas as (
  select
    q.id,
    q.numero_cotizacion,
    q.organization_id,
    q.empresa_id,
    q.proyecto_id,
    q.oportunidad_id,
    q.contacto_id
  from public.cotizaciones q
  where q.deleted_at is null
),
inconsistencias_entidades as (
  select
    q.id,
    q.numero_cotizacion
  from cotizaciones_activas q
  left join public.proyectos p
    on p.id = q.proyecto_id
   and p.organization_id = q.organization_id
  left join public.oportunidades o
    on o.id = q.oportunidad_id
   and o.organization_id = q.organization_id
  where p.empresa_id is distinct from q.empresa_id
     or o.empresa_id is distinct from q.empresa_id
),
inconsistencias_importacion as (
  select
    q.id,
    q.numero_cotizacion
  from cotizaciones_activas q
  join public.quote_pdf_imports i
    on i.imported_quote_id = q.id
   and i.organization_id = q.organization_id
  where i.matched_company_id is distinct from q.empresa_id
),
empresas_inexistentes as (
  select
    q.id,
    q.numero_cotizacion
  from cotizaciones_activas q
  left join public.empresas e
    on e.id = q.empresa_id
   and e.organization_id = q.organization_id
  where q.empresa_id is not null
    and e.id is null
),
duplicados_rut as (
  select
    e.organization_id,
    e.rut_normalizado
  from public.empresas e
  where e.deleted_at is null
    and nullif(trim(coalesce(e.rut_normalizado, '')), '') is not null
  group by e.organization_id, e.rut_normalizado
  having count(*) > 1
),
empresas_archivadas_vinculadas as (
  select distinct e.id
  from public.empresas e
  join cotizaciones_activas q
    on q.empresa_id = e.id
   and q.organization_id = e.organization_id
  where e.deleted_at is not null
)
select
  (select count(*) from cotizaciones_activas) as cotizaciones_activas,
  (
    select count(*)
    from cotizaciones_activas
    where empresa_id is not null
  ) as cotizaciones_con_empresa,
  (
    select count(*)
    from cotizaciones_activas
    where empresa_id is null
  ) as cotizaciones_particulares,
  (select count(*) from inconsistencias_entidades) as inconsistencias_entidades,
  (select count(*) from inconsistencias_importacion) as inconsistencias_importacion,
  (select count(*) from empresas_inexistentes) as empresas_inexistentes,
  (select count(*) from duplicados_rut) as rut_duplicados,
  (
    select count(*)
    from empresas_archivadas_vinculadas
  ) as empresas_archivadas_vinculadas,
  case
    when (select count(*) from inconsistencias_entidades) = 0
     and (select count(*) from inconsistencias_importacion) = 0
     and (select count(*) from empresas_inexistentes) = 0
     and (select count(*) from duplicados_rut) = 0
     and (select count(*) from empresas_archivadas_vinculadas) = 0
      then 'B2_CONSISTENTE'
    else 'B2_REQUIERE_REVISION'
  end as resultado_final;
