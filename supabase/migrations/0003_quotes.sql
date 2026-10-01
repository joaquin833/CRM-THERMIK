create table public.products_services(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  codigo text not null,
  nombre text not null,
  categoria text,
  descripcion text,
  unidad_venta text not null default 'unidad',
  precio_referencia bigint not null default 0 check(precio_referencia >= 0),
  porcentaje_iva numeric(5,2) not null default 19,
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,codigo)
);

create table public.quote_items(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  cotizacion_id uuid not null references cotizaciones(id) on delete restrict,
  posicion int not null check(posicion > 0),
  producto_servicio_id uuid references products_services(id),
  codigo text,
  descripcion text not null,
  cantidad numeric(14,3) not null check(cantidad > 0),
  unidad text not null,
  valor_unitario_original bigint not null check(valor_unitario_original >= 0),
  porcentaje_descuento numeric(5,2) not null default 0 check(porcentaje_descuento between 0 and 100),
  valor_descuento bigint not null default 0 check(valor_descuento >= 0),
  valor_unitario_final bigint not null check(valor_unitario_final >= 0),
  subtotal_neto bigint not null check(subtotal_neto >= 0),
  categoria text,
  observaciones text,
  afecto_iva boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cotizacion_id,posicion)
);

create table public.state_history(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entidad_tipo text not null,
  entidad_id uuid not null,
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  proxima_accion text,
  fecha_proxima_accion timestamptz,
  usuario_id uuid not null references profiles(id),
  origen_registro text not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.files(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  entidad_tipo text not null, entidad_id uuid not null, nombre text not null, ruta_storage text not null,
  tipo_mime text not null, tamano bigint not null check(tamano >= 0), version int not null default 1,
  usuario_id uuid not null references profiles(id), created_at timestamptz not null default now()
);

alter table cotizaciones add column if not exists producto_servicio_principal_id uuid references products_services(id);
alter table cotizaciones add column if not exists tipo_aplicacion text;
alter table cotizaciones add column if not exists metros_cuadrados numeric(12,2);
alter table cotizaciones add column if not exists espesor numeric(10,2);
alter table cotizaciones add column if not exists tiempo_ejecucion text;
alter table cotizaciones add column if not exists monto_aprobado bigint;
alter table cotizaciones add column if not exists motivo_rechazo text;
alter table cotizaciones add column if not exists competidor text;
alter table cotizaciones add column if not exists condiciones text;
alter table cotizaciones add column if not exists observaciones text;
alter table cotizaciones add column if not exists cotizacion_origen_id uuid references cotizaciones(id);
alter table cotizaciones add column if not exists reemplaza_cotizacion_id uuid references cotizaciones(id);
alter table cotizaciones add column if not exists reemplazada_por_cotizacion_id uuid references cotizaciones(id);
alter table cotizaciones add column if not exists motivo_reemision text;

create or replace function public.normalize_quote_number(value text) returns text language sql immutable as $$
  select upper(regexp_replace(trim(regexp_replace(coalesce(value,''), '\.0+$', '')), '\s+', '', 'g'))
$$;

create or replace function public.quote_number_guard() returns trigger language plpgsql as $$
begin
  new.numero_cotizacion := trim(new.numero_cotizacion);
  new.numero_cotizacion_normalizado := normalize_quote_number(new.numero_cotizacion);
  if new.numero_cotizacion_normalizado = '' then raise exception 'El N.º de cotización es obligatorio'; end if;
  if tg_op='UPDATE' and old.numero_cotizacion_normalizado <> new.numero_cotizacion_normalizado and current_role() <> 'admin' then
    raise exception 'Solo administración puede cambiar el N.º de cotización';
  end if;
  return new;
end $$;
create trigger quote_number_guard before insert or update of numero_cotizacion on cotizaciones for each row execute function quote_number_guard();

create or replace function public.calculate_quote_totals(p_quote_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_taxable bigint; v_exempt bigint; v_iva bigint;
begin
  select organization_id into v_org from cotizaciones where id=p_quote_id;
  if v_org is null or v_org <> current_org() then raise exception 'Cotización no autorizada'; end if;
  select coalesce(sum(subtotal_neto) filter(where afecto_iva),0), coalesce(sum(subtotal_neto) filter(where not afecto_iva),0)
    into v_taxable,v_exempt from quote_items where cotizacion_id=p_quote_id;
  v_iva := round(v_taxable * 0.19);
  update cotizaciones set subtotal_neto=v_taxable+v_exempt,neto_afecto=v_taxable,neto_exento=v_exempt,iva=v_iva,total=v_taxable+v_iva+v_exempt,updated_at=now() where id=p_quote_id;
end $$;

create or replace function public.recalculate_quote_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin perform calculate_quote_totals(coalesce(new.cotizacion_id,old.cotizacion_id)); return coalesce(new,old); end $$;
create trigger quote_items_recalculate after insert or update or delete on quote_items for each row execute function recalculate_quote_trigger();

create or replace function public.change_quote_status(p_quote_id uuid,p_status text,p_comment text default null,p_next_action text default null,p_next_at timestamptz default null) returns void language plpgsql security definer set search_path=public as $$
declare q cotizaciones%rowtype; p profiles%rowtype;
begin
  select * into p from profiles where id=auth.uid();
  select * into q from cotizaciones where id=p_quote_id and organization_id=p.organization_id for update;
  if q.id is null or not can_write_owner(q.ejecutivo_responsable_id) then raise exception 'No autorizado'; end if;
  if p_status in ('Enviada','Recibida por el cliente','En seguimiento') and (q.total<=0 or p_next_at is null or coalesce(p_next_action,'')='') then raise exception 'Para enviar se requiere monto, próxima acción y seguimiento'; end if;
  if p_status in ('Rechazada','Perdida') and coalesce(p_comment,'')='' then raise exception 'Se requiere motivo o comentario'; end if;
  if p_status='Aprobada' and coalesce(q.monto_aprobado,q.total)<=0 then raise exception 'Se requiere monto aprobado'; end if;
  update cotizaciones set estado=p_status,proxima_accion=coalesce(p_next_action,proxima_accion),fecha_proximo_seguimiento=coalesce(p_next_at,fecha_proximo_seguimiento),updated_at=now() where id=p_quote_id;
  insert into state_history(organization_id,entidad_tipo,entidad_id,estado_anterior,estado_nuevo,comentario,proxima_accion,fecha_proxima_accion,usuario_id)
  values(q.organization_id,'cotizacion',q.id,q.estado,p_status,p_comment,p_next_action,p_next_at,p.id);
  if p_status='Enviada' and p_next_at is not null then
    insert into tasks(organization_id,titulo,descripcion,contacto_id,empresa_id,oportunidad_id,proyecto_id,cotizacion_id,responsable_id,tipo,prioridad,fecha_hora_vencimiento,idempotency_key)
    values(q.organization_id,'Seguimiento Cotización N.º '||q.numero_cotizacion,p_next_action,q.contacto_id,q.empresa_id,q.oportunidad_id,q.proyecto_id,q.id,q.ejecutivo_responsable_id,'Seguimiento de cotización','alta',p_next_at,'quote-sent:'||q.id::text||':'||p_next_at::text)
    on conflict(idempotency_key) do nothing;
  end if;
end $$;

alter table products_services enable row level security; alter table quote_items enable row level security; alter table state_history enable row level security; alter table files enable row level security;
create policy products_read on products_services for select using(organization_id=current_org());
create policy products_admin on products_services for all using(organization_id=current_org() and current_role()='admin') with check(organization_id=current_org() and current_role()='admin');
create policy quote_items_read on quote_items for select using(organization_id=current_org());
create policy quote_items_write on quote_items for all using(organization_id=current_org() and current_role()<>'consulta') with check(organization_id=current_org() and current_role()<>'consulta');
create policy history_read on state_history for select using(organization_id=current_org());
create policy files_read on files for select using(organization_id=current_org());
create policy files_write on files for all using(organization_id=current_org() and current_role()<>'consulta') with check(organization_id=current_org() and current_role()<>'consulta');
create index idx_quote_items_quote on quote_items(cotizacion_id,posicion);
create index idx_state_history_entity on state_history(organization_id,entidad_tipo,entidad_id,created_at desc);

create or replace function public.global_search(p_term text)
returns table(id uuid, numero_cotizacion text, estado text, total bigint, cliente text, proyecto text, oportunidad text, exact_match boolean)
language sql stable security definer set search_path=public as $$
  select q.id,q.numero_cotizacion,q.estado,q.total,
    coalesce(e.razon_social,trim(concat_ws(' ',c.nombre,c.apellido))) cliente,
    pr.nombre proyecto,o.nombre oportunidad,
    q.numero_cotizacion_normalizado=normalize_quote_number(p_term) exact_match
  from cotizaciones q
  join contactos c on c.id=q.contacto_id
  left join empresas e on e.id=q.empresa_id
  left join proyectos pr on pr.id=q.proyecto_id
  join oportunidades o on o.id=q.oportunidad_id
  where q.organization_id=current_org() and q.deleted_at is null and (
    q.numero_cotizacion_normalizado ilike '%'||normalize_quote_number(p_term)||'%' or
    coalesce(e.rut,'') ilike '%'||p_term||'%' or coalesce(e.razon_social,'') ilike '%'||p_term||'%' or
    concat_ws(' ',c.nombre,c.apellido) ilike '%'||p_term||'%' or coalesce(c.telefono,'') ilike '%'||p_term||'%' or
    coalesce(c.correo,'') ilike '%'||p_term||'%' or coalesce(pr.nombre,'') ilike '%'||p_term||'%' or
    coalesce(pr.direccion,'') ilike '%'||p_term||'%')
  order by exact_match desc,q.updated_at desc limit 30
$$;

create or replace function public.add_business_days(p_start timestamptz,p_days int) returns timestamptz language plpgsql immutable as $$
declare d timestamptz:=p_start; n int:=0;
begin while n<p_days loop d:=d+interval '1 day'; if extract(isodow from d)<6 then n:=n+1; end if; end loop; return d; end $$;

create or replace function public.create_demo_14394() returns uuid language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; v_company uuid; v_contact uuid; v_project uuid; v_opportunity uuid; v_quote uuid;
begin
 select * into p from profiles where id=auth.uid(); if p.id is null then raise exception 'Perfil requerido'; end if;
 if exists(select 1 from cotizaciones where organization_id=p.organization_id and numero_cotizacion_normalizado='14394') then raise exception 'La Cotización N.º 14394 ya existe'; end if;
 insert into empresas(organization_id,razon_social,nombre_fantasia,segmento,ejecutivo_responsable_id,estado) values(p.organization_id,'Cliente demostración Thermikhaus','Cliente demostración','Dueño de casa',p.id,'activo') returning id into v_company;
 insert into contactos(organization_id,empresa_id,nombre,apellido,telefono,correo,estado,ejecutivo_responsable_id) values(p.organization_id,v_company,'Cliente','Demostración','+56900000000','demo@example.invalid','activo',p.id) returning id into v_contact;
 insert into proyectos(organization_id,nombre,empresa_id,contacto_principal_id,tipo_proyecto,estado,ejecutivo_responsable_id) values(p.organization_id,'Proyecto demostración',v_company,v_contact,'Vivienda','activo',p.id) returning id into v_project;
 insert into oportunidades(organization_id,contacto_id,empresa_id,proyecto_id,nombre,monto_estimado,probabilidad_cierre,etapa_comercial,temperatura,prioridad,ejecutivo_responsable_id,proxima_accion,fecha_proxima_accion) values(p.organization_id,v_contact,v_company,v_project,'Aislación vivienda demostración',4582000,60,'En seguimiento','Tibia','alta',p.id,'Llamar',public.add_business_days(now(),2)) returning id into v_opportunity;
 insert into cotizaciones(organization_id,numero_cotizacion,numero_cotizacion_normalizado,oportunidad_id,proyecto_id,contacto_id,empresa_id,fecha_emision,fecha_validez,estado,ejecutivo_responsable_id,fecha_proximo_seguimiento,proxima_accion,origen_registro,created_by) values(p.organization_id,'14394','14394',v_opportunity,v_project,v_contact,v_company,current_date,current_date+30,'En seguimiento',p.id,now()+interval '2 days','Llamar','demo',p.id) returning id into v_quote;
 insert into quote_items(organization_id,cotizacion_id,posicion,descripcion,cantidad,unidad,valor_unitario_original,porcentaje_descuento,valor_descuento,valor_unitario_final,subtotal_neto,afecto_iva) values(p.organization_id,v_quote,1,'Servicio de aislación con celulosa reciclada',1,'servicio',3850420,0,0,3850420,3850420,true);
 insert into activities(organization_id,contacto_id,empresa_id,oportunidad_id,proyecto_id,cotizacion_id,tipo_actividad,fecha_hora_inicio,estado,resultado,descripcion,ejecutivo_responsable_id,origen_registro,created_by) values(p.organization_id,v_contact,v_company,v_opportunity,v_project,v_quote,'Nota histórica',now()-interval '5 days','completada','Cotización enviada','Actividad histórica ficticia',p.id,'demo',p.id);
 insert into tasks(organization_id,titulo,descripcion,contacto_id,empresa_id,oportunidad_id,proyecto_id,cotizacion_id,responsable_id,tipo,prioridad,fecha_hora_vencimiento,idempotency_key,origen_registro) values(p.organization_id,'Seguimiento Cotización N.º 14394','Llamar al cliente demostración',v_contact,v_company,v_opportunity,v_project,v_quote,p.id,'Seguimiento de cotización','alta',now()+interval '2 days','demo-14394-'||p.organization_id::text,'demo');
 insert into state_history(organization_id,entidad_tipo,entidad_id,estado_anterior,estado_nuevo,comentario,proxima_accion,fecha_proxima_accion,usuario_id,origen_registro) values(p.organization_id,'cotizacion',v_quote,'Emitida','En seguimiento','Historial ficticio de demostración','Llamar',now()+interval '2 days',p.id,'demo');
 return v_quote;
end $$;


-- Reemplaza las políticas iniciales amplias por propiedad real.
drop policy if exists empresa_org on empresas;
drop policy if exists contacto_org on contactos;
drop policy if exists proyecto_org on proyectos;
drop policy if exists oportunidad_org on oportunidades;
drop policy if exists cotizacion_read on cotizaciones;
drop policy if exists cotizacion_write on cotizaciones;
create policy empresa_read_owner on empresas for select using(organization_id=current_org() and can_view_owner(ejecutivo_responsable_id));
create policy empresa_write_owner on empresas for all using(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id)) with check(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id));
create policy contacto_read_owner on contactos for select using(organization_id=current_org() and can_view_owner(ejecutivo_responsable_id));
create policy contacto_write_owner on contactos for all using(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id)) with check(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id));
create policy proyecto_read_owner on proyectos for select using(organization_id=current_org() and can_view_owner(ejecutivo_responsable_id));
create policy proyecto_write_owner on proyectos for all using(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id)) with check(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id));
create policy oportunidad_read_owner on oportunidades for select using(organization_id=current_org() and can_view_owner(ejecutivo_responsable_id));
create policy oportunidad_write_owner on oportunidades for all using(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id)) with check(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id));
create policy cotizacion_read_owner on cotizaciones for select using(organization_id=current_org() and can_view_owner(ejecutivo_responsable_id));
create policy cotizacion_write_owner on cotizaciones for all using(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id)) with check(organization_id=current_org() and can_write_owner(ejecutivo_responsable_id));
