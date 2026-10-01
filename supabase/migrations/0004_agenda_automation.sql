create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  usuario_id uuid not null references profiles(id),
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  entidad_tipo text,
  entidad_id uuid,
  leida boolean not null default false,
  prioridad text not null default 'media',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create or replace function public.complete_activity(
  p_activity_id uuid,
  p_result text,
  p_next_action text default null,
  p_next_at timestamptz default null
) returns void language plpgsql security definer set search_path=public as $$
declare a activities%rowtype;
begin
  select * into a from activities where id=p_activity_id and organization_id=current_org() for update;
  if a.id is null or not can_write_owner(a.ejecutivo_responsable_id) then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_result),'')='' then raise exception 'El resultado es obligatorio'; end if;
  if coalesce(trim(p_next_action),'')='' and p_next_at is not null then raise exception 'Indique la próxima acción'; end if;
  update activities set estado='completada',resultado=p_result,proxima_accion=p_next_action,fecha_proxima_accion=p_next_at,updated_at=now() where id=a.id;
  if p_next_at is not null then
    insert into tasks(organization_id,titulo,descripcion,contacto_id,empresa_id,oportunidad_id,proyecto_id,cotizacion_id,responsable_id,tipo,prioridad,fecha_hora_vencimiento,idempotency_key)
    values(a.organization_id,coalesce(p_next_action,'Seguimiento'),p_result,a.contacto_id,a.empresa_id,a.oportunidad_id,a.proyecto_id,a.cotizacion_id,a.ejecutivo_responsable_id,'Seguimiento','media',p_next_at,'activity-next:'||a.id::text||':'||p_next_at::text)
    on conflict(idempotency_key) do nothing;
  end if;
end $$;

create or replace function public.complete_task(p_task_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id=p_task_id and organization_id=current_org() for update;
  if t.id is null or not can_write_owner(t.responsable_id) then raise exception 'No autorizado'; end if;
  update tasks set estado='completada',fecha_finalizacion=now(),updated_at=now() where id=t.id;
end $$;

create or replace function public.refresh_commercial_alerts() returns int language plpgsql security definer set search_path=public as $$
declare inserted_count int:=0;
begin
  insert into notifications(organization_id,usuario_id,tipo,titulo,mensaje,entidad_tipo,entidad_id,prioridad)
  select q.organization_id,q.ejecutivo_responsable_id,'cotizacion_sin_seguimiento',
    'Cotización N.º '||q.numero_cotizacion||' sin seguimiento',
    'La cotización no tiene una fecha de próximo seguimiento.','cotizacion',q.id,'alta'
  from cotizaciones q
  where q.organization_id=current_org() and q.deleted_at is null
    and q.estado in ('Enviada','Recibida por el cliente','En seguimiento','En negociación')
    and q.fecha_proximo_seguimiento is null
    and not exists(select 1 from notifications n where n.tipo='cotizacion_sin_seguimiento' and n.entidad_id=q.id and not n.leida);
  get diagnostics inserted_count=row_count;

  insert into notifications(organization_id,usuario_id,tipo,titulo,mensaje,entidad_tipo,entidad_id,prioridad)
  select t.organization_id,t.responsable_id,'tarea_atrasada','Seguimiento atrasado',
    t.titulo||' venció el '||to_char(t.fecha_hora_vencimiento at time zone 'America/Santiago','DD/MM/YYYY HH24:MI'),
    'tarea',t.id,'alta'
  from tasks t where t.organization_id=current_org() and t.estado='pendiente' and t.fecha_hora_vencimiento<now()
    and not exists(select 1 from notifications n where n.tipo='tarea_atrasada' and n.entidad_id=t.id and not n.leida);
  return inserted_count;
end $$;

alter table notifications enable row level security;
create policy notification_read on notifications for select using(organization_id=current_org() and (usuario_id=auth.uid() or current_role() in ('admin','jefatura_comercial')));
create policy notification_update on notifications for update using(organization_id=current_org() and usuario_id=auth.uid()) with check(organization_id=current_org() and usuario_id=auth.uid());

create trigger audit_activities after insert or update or delete on activities for each row execute function audit_row();
create trigger audit_tasks after insert or update or delete on tasks for each row execute function audit_row();
create index idx_notifications_user on notifications(organization_id,usuario_id,leida,created_at desc);
create index idx_quotes_followup on cotizaciones(organization_id,estado,fecha_proximo_seguimiento);
