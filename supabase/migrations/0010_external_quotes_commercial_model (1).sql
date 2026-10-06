begin;

-- =========================================================
-- 0010 - MODELO COMERCIAL PARA COTIZACIONES EXTERNAS
-- No elimina datos ni modifica montos existentes.
-- =========================================================

-- 1. FUENTES EXTERNAS
create table if not exists public.external_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  tipo_integracion text not null default 'manual',
  estado text not null default 'activo',
  ultima_sincronizacion timestamptz,
  configuracion jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_sources_unique_code unique (organization_id, codigo),
  constraint external_sources_tipo_valid check (tipo_integracion in ('manual','pdf','excel','csv','api','correo')),
  constraint external_sources_estado_valid check (estado in ('activo','inactivo','error')),
  constraint external_sources_config_object check (jsonb_typeof(configuracion) = 'object')
);

-- 2. MOTIVOS DE PERDIDA
create table if not exists public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  requiere_comentario boolean not null default false,
  orden integer not null default 0,
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loss_reasons_unique_code unique (organization_id, codigo),
  constraint loss_reasons_estado_valid check (estado in ('activo','inactivo'))
);

-- 3. RESULTADOS CONTROLADOS DE ACTIVIDAD
create table if not exists public.activity_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  requiere_proxima_accion boolean not null default false,
  requiere_fecha boolean not null default false,
  requiere_comentario boolean not null default false,
  cierra_oportunidad boolean not null default false,
  resultado_cierre text,
  orden integer not null default 0,
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_results_unique_code unique (organization_id, codigo),
  constraint activity_results_estado_valid check (estado in ('activo','inactivo')),
  constraint activity_results_cierre_valid check (
    resultado_cierre is null or resultado_cierre in ('ganada','perdida','postergada','cancelada')
  )
);

-- 4. CONTACTOS QUE PARTICIPAN EN UN PROYECTO
create table if not exists public.project_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  contacto_id uuid not null references public.contactos(id) on delete restrict,
  rol_en_proyecto text,
  es_principal boolean not null default false,
  observaciones text,
  created_at timestamptz not null default now(),
  constraint project_contacts_unique unique (proyecto_id, contacto_id)
);

create unique index if not exists project_contacts_one_principal
on public.project_contacts (proyecto_id)
where es_principal = true;

-- 5. AMPLIACION NO DESTRUCTIVA DE COTIZACIONES
alter table public.cotizaciones
  add column if not exists external_source_id uuid references public.external_sources(id) on delete restrict,
  add column if not exists external_id text,
  add column if not exists sistema_origen text,
  add column if not exists estado_documental_externo text,
  add column if not exists hash_documento text,
  add column if not exists fecha_ultima_sincronizacion timestamptz,
  add column if not exists estado_comercial text not null default 'Importada',
  add column if not exists fecha_envio_cliente timestamptz,
  add column if not exists fecha_confirmacion_recepcion timestamptz,
  add column if not exists ultima_actividad_at timestamptz,
  add column if not exists probabilidad_cierre integer,
  add column if not exists motivo_perdida_id uuid references public.loss_reasons(id) on delete set null,
  add column if not exists fecha_aprobacion timestamptz,
  add column if not exists comentario_resultado text;

alter table public.cotizaciones
  drop constraint if exists cotizaciones_probabilidad_cierre_check;

alter table public.cotizaciones
  add constraint cotizaciones_probabilidad_cierre_check
  check (probabilidad_cierre is null or probabilidad_cierre between 0 and 100);

create unique index if not exists cotizaciones_external_id_unique
on public.cotizaciones (organization_id, external_source_id, external_id)
where external_source_id is not null and external_id is not null and deleted_at is null;

create index if not exists cotizaciones_commercial_followup_idx
on public.cotizaciones (
  organization_id,
  estado_comercial,
  ejecutivo_responsable_id,
  fecha_proximo_seguimiento
)
where deleted_at is null;

-- 6. RESULTADO CONTROLADO EN ACTIVIDADES
alter table public.activities
  add column if not exists resultado_id uuid references public.activity_results(id) on delete set null;

create index if not exists activities_resultado_idx
on public.activities (organization_id, resultado_id, fecha_hora_inicio desc);

-- 7. RELACIONES ENTRE COTIZACIONES EXTERNAS
create table if not exists public.quote_relations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cotizacion_origen_id uuid not null references public.cotizaciones(id) on delete cascade,
  cotizacion_relacionada_id uuid not null references public.cotizaciones(id) on delete cascade,
  tipo_relacion text not null,
  motivo text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint quote_relations_not_self check (cotizacion_origen_id <> cotizacion_relacionada_id),
  constraint quote_relations_unique unique (
    cotizacion_origen_id,
    cotizacion_relacionada_id,
    tipo_relacion
  ),
  constraint quote_relations_tipo_valid check (
    tipo_relacion in ('reemplaza','reemplazada_por','alternativa','complementaria','nueva_version_externa','mismo_proyecto')
  )
);

-- 8. HISTORIAL DE CIERRES COMERCIALES
create table if not exists public.commercial_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  oportunidad_id uuid not null references public.oportunidades(id) on delete restrict,
  cotizacion_ganadora_id uuid references public.cotizaciones(id) on delete set null,
  resultado text not null,
  fecha_cierre timestamptz not null default now(),
  monto_cierre bigint,
  motivo_perdida_id uuid references public.loss_reasons(id) on delete set null,
  competidor text,
  comentario text,
  cerrado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint commercial_closures_resultado_valid check (
    resultado in ('ganada','perdida','postergada','cancelada')
  ),
  constraint commercial_closures_monto_valid check (monto_cierre is null or monto_cierre >= 0),
  constraint commercial_closures_required_data check (
    (resultado <> 'ganada' or (cotizacion_ganadora_id is not null and monto_cierre is not null))
    and
    (resultado <> 'perdida' or motivo_perdida_id is not null)
  )
);

-- 9. RLS
alter table public.external_sources enable row level security;
alter table public.loss_reasons enable row level security;
alter table public.activity_results enable row level security;
alter table public.project_contacts enable row level security;
alter table public.quote_relations enable row level security;
alter table public.commercial_closures enable row level security;

create policy external_sources_read on public.external_sources
for select to authenticated using (organization_id = public.current_org());
create policy external_sources_admin on public.external_sources
for all to authenticated
using (organization_id = public.current_org() and public.app_current_role() = 'admin')
with check (organization_id = public.current_org() and public.app_current_role() = 'admin');

create policy loss_reasons_read on public.loss_reasons
for select to authenticated using (organization_id = public.current_org());
create policy loss_reasons_manage on public.loss_reasons
for all to authenticated
using (organization_id = public.current_org() and public.app_current_role() in ('admin','jefatura_comercial'))
with check (organization_id = public.current_org() and public.app_current_role() in ('admin','jefatura_comercial'));

create policy activity_results_read on public.activity_results
for select to authenticated using (organization_id = public.current_org());
create policy activity_results_manage on public.activity_results
for all to authenticated
using (organization_id = public.current_org() and public.app_current_role() in ('admin','jefatura_comercial'))
with check (organization_id = public.current_org() and public.app_current_role() in ('admin','jefatura_comercial'));

create policy project_contacts_read on public.project_contacts
for select to authenticated using (organization_id = public.current_org());
create policy project_contacts_write on public.project_contacts
for all to authenticated
using (organization_id = public.current_org() and public.app_current_role() <> 'consulta')
with check (organization_id = public.current_org() and public.app_current_role() <> 'consulta');

create policy quote_relations_read on public.quote_relations
for select to authenticated using (organization_id = public.current_org());
create policy quote_relations_write on public.quote_relations
for all to authenticated
using (organization_id = public.current_org() and public.app_current_role() <> 'consulta')
with check (organization_id = public.current_org() and public.app_current_role() <> 'consulta');

create policy commercial_closures_read on public.commercial_closures
for select to authenticated using (organization_id = public.current_org());
create policy commercial_closures_write on public.commercial_closures
for all to authenticated
using (organization_id = public.current_org() and public.app_current_role() <> 'consulta')
with check (organization_id = public.current_org() and public.app_current_role() <> 'consulta');

-- 10. PERMISOS

grant select, insert, update, delete on public.external_sources to authenticated;
grant select, insert, update, delete on public.loss_reasons to authenticated;
grant select, insert, update, delete on public.activity_results to authenticated;
grant select, insert, update, delete on public.project_contacts to authenticated;
grant select, insert, update, delete on public.quote_relations to authenticated;
grant select, insert, update, delete on public.commercial_closures to authenticated;

-- 11. DATOS BASE PARA THERMIKHAUS
insert into public.external_sources (organization_id, codigo, nombre, tipo_integracion)
select id, 'SISTEMA_COTIZACIONES', 'Sistema oficial de cotizaciones', 'manual'
from public.organizations
on conflict (organization_id, codigo) do nothing;

insert into public.loss_reasons (organization_id, codigo, nombre, requiere_comentario, orden)
select o.id, v.codigo, v.nombre, v.requiere_comentario, v.orden
from public.organizations o
cross join (values
  ('PRECIO','Precio',false,10),
  ('COMPETIDOR','Eligio otra empresa',true,20),
  ('PROYECTO_CANCELADO','Proyecto cancelado',true,30),
  ('PROYECTO_POSTERGADO','Proyecto postergado',true,40),
  ('SIN_PRESUPUESTO','Sin presupuesto',true,50),
  ('SIN_RESPUESTA','Sin respuesta',false,60),
  ('PLAZO','Plazo de ejecucion',true,70),
  ('SOLUCION_DISTINTA','Solucion tecnica distinta',true,80),
  ('OTRO','Otro',true,90)
) as v(codigo,nombre,requiere_comentario,orden)
on conflict (organization_id, codigo) do nothing;

insert into public.activity_results (
  organization_id,codigo,nombre,requiere_proxima_accion,requiere_fecha,
  requiere_comentario,cierra_oportunidad,resultado_cierre,orden
)
select o.id, v.codigo, v.nombre, v.req_accion, v.req_fecha,
       v.req_comentario, v.cierra, v.cierre, v.orden
from public.organizations o
cross join (values
  ('NO_RESPONDIO','No respondio',true,true,false,false,null,10),
  ('MENSAJE_ENVIADO','Mensaje enviado',true,true,false,false,null,20),
  ('CONFIRMO_RECEPCION','Confirmo recepcion',true,true,false,false,null,30),
  ('ESTA_EVALUANDO','Esta evaluando',true,true,true,false,null,40),
  ('SOLICITA_ACLARACION','Solicita aclaracion',true,true,true,false,null,50),
  ('SOLICITA_VISITA','Solicita visita',true,true,true,false,null,60),
  ('SOLICITA_NUEVA_COTIZACION','Solicita nueva cotizacion externa',true,true,true,false,null,70),
  ('PROYECTO_POSTERGADO','Proyecto postergado',true,true,true,true,'postergada',80),
  ('ACEPTO_PROPUESTA','Acepto propuesta',false,false,true,true,'ganada',90),
  ('ELIGIO_COMPETIDOR','Eligio otra empresa',false,false,true,true,'perdida',100),
  ('DESISTIO','Desistio del proyecto',false,false,true,true,'perdida',110)
) as v(codigo,nombre,req_accion,req_fecha,req_comentario,cierra,cierre,orden)
on conflict (organization_id, codigo) do nothing;

commit;
