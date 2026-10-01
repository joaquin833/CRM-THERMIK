alter table import_batches add column if not exists report_data jsonb;
alter table import_batches add column if not exists reverted_at timestamptz;
alter table import_rows add column if not exists processed_at timestamptz;
alter table import_rows add column if not exists decision text;
alter table import_rows add column if not exists matched_contact_id uuid references contactos(id);
alter table import_rows add column if not exists matched_company_id uuid references empresas(id);

create or replace function public.process_historical_import_row(p_row_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 r import_rows%rowtype; b import_batches%rowtype; n jsonb; p profiles%rowtype;
 v_company uuid; v_contact uuid; v_project uuid; v_opp uuid; v_quote uuid;
 v_number text; v_name text; v_contact_name text; v_rut text; v_email text; v_phone text;
 v_state text; v_comment text; v_date timestamptz; v_total bigint; v_net bigint; v_m2 numeric;
 existing_quote cotizaciones%rowtype; conflict_count int;
begin
 select * into p from profiles where id=auth.uid();
 if p.id is null or p.rol<>'admin' then raise exception 'No autorizado'; end if;
 select * into r from import_rows where id=p_row_id for update;
 select * into b from import_batches where id=r.import_batch_id and organization_id=p.organization_id for update;
 if b.id is null then raise exception 'Lote no encontrado'; end if;
 if r.sheet_name<>'SEGUIMIENTO PRESUPUESTOS' then raise exception 'Pestaña no autorizada'; end if;
 if r.status in ('imported','linked','merged','skipped') then return jsonb_build_object('status',r.status,'entity_id',r.entity_id); end if;
 if r.status='review' then raise exception 'Fila pendiente de revisión'; end if;
 select count(*) into conflict_count from import_conflicts where import_row_id=r.id and resolution is null;
 if conflict_count>0 then raise exception 'Fila con conflicto no resuelto'; end if;
 n:=r.normalized_data; v_number:=n->>'numero_cotizacion'; v_name:=coalesce(nullif(n->>'nombre',''),'Proyecto histórico');
 v_contact_name:=coalesce(nullif(r.raw_data->>'CONTACTO',''),nullif(v_name,''),'Contacto histórico');
 v_rut:=nullif(n->>'rut_normalizado',''); v_email:=nullif(n->>'correo_normalizado',''); v_phone:=nullif(n->>'telefono_normalizado','');
 v_state:=coalesce(nullif(n->>'estado',''),'Pendiente'); v_comment:=coalesce(n->>'comentario','');
 v_date:=coalesce((n->>'fecha')::timestamptz,b.created_at); v_total:=coalesce((n->>'total_iva')::numeric,0)::bigint;
 v_net:=coalesce((n->>'monto_neto')::numeric,round(v_total/1.19),0)::bigint; v_m2:=nullif(n->>'metros_cuadrados','')::numeric;
 if coalesce(v_number,'')='' then raise exception 'No se puede importar una cotización sin N.º PTO'; end if;
 select * into existing_quote from cotizaciones where organization_id=b.organization_id and numero_cotizacion_normalizado=normalize_quote_number(v_number) and deleted_at is null;
 if existing_quote.id is not null then
   v_quote:=existing_quote.id; v_contact:=existing_quote.contacto_id; v_opp:=existing_quote.oportunidad_id;
   if v_comment<>'' then
    insert into historical_notes(organization_id,cotizacion_id,oportunidad_id,contacto_id,source_import_row_id,original_text,created_at) values(b.organization_id,v_quote,v_opp,v_contact,r.id,v_comment,v_date);
    insert into activities(organization_id,contacto_id,empresa_id,oportunidad_id,proyecto_id,cotizacion_id,tipo_actividad,fecha_hora_inicio,estado,descripcion,ejecutivo_responsable_id,origen_registro,import_row_id,created_by)
    values(b.organization_id,v_contact,existing_quote.empresa_id,v_opp,existing_quote.proyecto_id,v_quote,'Nota histórica',v_date,'completada',v_comment,existing_quote.ejecutivo_responsable_id,'importacion',r.id,p.id);
   end if;
   update import_rows set entity_type='cotizacion',entity_id=v_quote,status='linked',processed_at=now(),matched_contact_id=v_contact where id=r.id;
   return jsonb_build_object('status','linked','entity_id',v_quote);
 end if;

 if v_rut is not null then select id into v_company from empresas where organization_id=b.organization_id and replace(upper(rut),'.','')=v_rut and deleted_at is null limit 1; end if;
 if v_company is null and v_email is not null then select empresa_id,id into v_company,v_contact from contactos where organization_id=b.organization_id and correo_normalizado=v_email and deleted_at is null limit 1; end if;
 if v_contact is null and v_phone is not null then select empresa_id,id into v_company,v_contact from contactos where organization_id=b.organization_id and telefono_normalizado=v_phone and deleted_at is null limit 1; end if;
 if v_company is null and v_rut is not null then insert into empresas(organization_id,razon_social,nombre_fantasia,rut,segmento,origen,ejecutivo_responsable_id,estado) values(b.organization_id,v_name,v_name,v_rut,n->>'tipo_cliente','migracion',p.id,'activo') returning id into v_company; end if;
 if v_contact is null then insert into contactos(organization_id,empresa_id,nombre,telefono,telefono_normalizado,correo,correo_normalizado,tipo_contacto,origen,estado,ejecutivo_responsable_id) values(b.organization_id,v_company,v_contact_name,v_phone,v_phone,v_email,v_email,n->>'tipo_cliente','migracion','activo',p.id) returning id into v_contact; end if;
 insert into proyectos(organization_id,nombre,empresa_id,contacto_principal_id,tipo_proyecto,metros_cuadrados_estimados,descripcion,estado,ejecutivo_responsable_id) values(b.organization_id,v_name,v_company,v_contact,n->>'categoria_original',v_m2,'Proyecto histórico migrado','histórico',p.id) returning id into v_project;
 insert into oportunidades(organization_id,contacto_id,empresa_id,proyecto_id,nombre,monto_estimado,etapa_comercial,temperatura,prioridad,ejecutivo_responsable_id,estado,created_at) values(b.organization_id,v_contact,v_company,v_project,v_name,v_total,v_state,'Histórica','media',p.id,case when v_state in ('Aprobada','Rechazada') then 'cerrada' else 'abierta' end,v_date) returning id into v_opp;
 insert into cotizaciones(organization_id,numero_cotizacion,numero_cotizacion_normalizado,oportunidad_id,proyecto_id,contacto_id,empresa_id,fecha_emision,estado,subtotal_neto,neto_afecto,iva,total,metros_cuadrados,moneda,ejecutivo_responsable_id,nota_comercial,origen_registro,import_batch_id,created_by,created_at)
 values(b.organization_id,v_number,normalize_quote_number(v_number),v_opp,v_project,v_contact,v_company,v_date::date,v_state,v_net,v_net,greatest(v_total-v_net,0),v_total,v_m2,'CLP',p.id,v_comment,'migracion',b.id,p.id,v_date) returning id into v_quote;
 if v_comment<>'' then
  insert into historical_notes(organization_id,cotizacion_id,oportunidad_id,contacto_id,source_import_row_id,original_text,created_at) values(b.organization_id,v_quote,v_opp,v_contact,r.id,v_comment,v_date);
  insert into activities(organization_id,contacto_id,empresa_id,oportunidad_id,proyecto_id,cotizacion_id,tipo_actividad,fecha_hora_inicio,estado,descripcion,ejecutivo_responsable_id,origen_registro,import_row_id,created_by) values(b.organization_id,v_contact,v_company,v_opp,v_project,v_quote,'Nota histórica',v_date,'completada',v_comment,p.id,'importacion',r.id,p.id);
 end if;
 update import_rows set entity_type='cotizacion',entity_id=v_quote,status='imported',processed_at=now(),matched_contact_id=v_contact,matched_company_id=v_company where id=r.id;
 update proposed_followups set cotizacion_id=v_quote where import_row_id=r.id;
 return jsonb_build_object('status','imported','entity_id',v_quote);
end $$;

create or replace function public.finish_import_batch(p_batch_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare b import_batches%rowtype; ok int; warn int; fail int; conf int; props int; rep jsonb;
begin
 select * into b from import_batches where id=p_batch_id and organization_id=current_org() for update;
 if b.id is null or current_role()<>'admin' then raise exception 'No autorizado'; end if;
 select count(*) filter(where status in ('imported','linked','merged')),count(*) filter(where status='warning'),count(*) filter(where status in ('review','error')) into ok,warn,fail from import_rows where import_batch_id=b.id;
 select count(*) into conf from import_conflicts where import_batch_id=b.id and resolution is null;
 select count(*) into props from proposed_followups where import_batch_id=b.id and status='pending';
 rep:=jsonb_build_object('archivo',b.file_name,'fecha',now(),'usuario',auth.uid(),'fuente_importada','SEGUIMIENTO PRESUPUESTOS','operaciones','excluida del proceso','filas_procesadas',b.total_rows,'exitos',ok,'advertencias',warn,'errores',fail,'conflictos_pendientes',conf,'seguimientos_pendientes',props);
 update import_batches set status=case when conf=0 and fail=0 then 'completed' else 'completed_with_review' end,successful_rows=ok,warning_rows=warn,failed_rows=fail,completed_at=now(),report_data=rep where id=b.id;
 return rep;
end $$;

create or replace function public.review_followup(p_id uuid,p_action text,p_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare f proposed_followups%rowtype; q cotizaciones%rowtype;
begin
 select * into f from proposed_followups where id=p_id and organization_id=current_org() for update;
 if f.id is null or current_role()<>'admin' then raise exception 'No autorizado'; end if;
 if p_action not in ('approved','discarded') then raise exception 'Acción inválida'; end if;
 if p_action='approved' and (coalesce(p_at,f.suggested_at) is null or f.responsable_id is null or f.cotizacion_id is null) then raise exception 'Se requiere fecha, responsable y cotización'; end if;
 if p_action='approved' then
  select * into q from cotizaciones where id=f.cotizacion_id;
  insert into tasks(organization_id,titulo,descripcion,contacto_id,empresa_id,oportunidad_id,proyecto_id,cotizacion_id,responsable_id,tipo,prioridad,fecha_hora_vencimiento,idempotency_key,origen_registro)
  values(f.organization_id,f.action_type||' Cotización N.º '||q.numero_cotizacion,f.original_comment,q.contacto_id,q.empresa_id,q.oportunidad_id,q.proyecto_id,q.id,f.responsable_id,f.action_type,f.priority,coalesce(p_at,f.suggested_at),'migration-followup:'||f.id::text,'migracion') on conflict(idempotency_key) do nothing;
 end if;
 update proposed_followups set status=p_action,reviewed_by=auth.uid(),reviewed_at=now(),suggested_at=coalesce(p_at,suggested_at) where id=f.id;
 return jsonb_build_object('status',p_action);
end $$;

create or replace function public.revert_import_batch(p_batch_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare b import_batches%rowtype; deleted_notes int:=0; deleted_quotes int:=0; deleted_tasks int:=0; deleted_activities int:=0; deleted_opps int:=0; deleted_projects int:=0;
begin
 select * into b from import_batches where id=p_batch_id and organization_id=current_org() for update;
 if b.id is null or current_role()<>'admin' then raise exception 'No autorizado'; end if;
 if b.status='reverted' then return jsonb_build_object('status','already_reverted'); end if;
 delete from tasks t using proposed_followups f where f.import_batch_id=b.id and t.idempotency_key='migration-followup:'||f.id::text;
 get diagnostics deleted_tasks=row_count;
 delete from activities a using import_rows r where a.import_row_id=r.id and r.import_batch_id=b.id and a.origen_registro='importacion';
 get diagnostics deleted_activities=row_count;
 delete from historical_notes h using import_rows r where h.source_import_row_id=r.id and r.import_batch_id=b.id;
 get diagnostics deleted_notes=row_count;
 delete from proposed_followups where import_batch_id=b.id;
 delete from cotizaciones q where q.import_batch_id=b.id and not exists(select 1 from audit_logs a where a.entidad_id=q.id and a.created_at>b.completed_at and a.accion='UPDATE');
 get diagnostics deleted_quotes=row_count;
 delete from oportunidades o where o.created_at between b.started_at and coalesce(b.completed_at,now()) and o.ejecutivo_responsable_id=b.imported_by and not exists(select 1 from cotizaciones q where q.oportunidad_id=o.id) and not exists(select 1 from activities a where a.oportunidad_id=o.id) and not exists(select 1 from tasks t where t.oportunidad_id=o.id);
 get diagnostics deleted_opps=row_count;
 delete from proyectos p where p.created_at between b.started_at and coalesce(b.completed_at,now()) and p.ejecutivo_responsable_id=b.imported_by and p.estado='histórico' and not exists(select 1 from oportunidades o where o.proyecto_id=p.id) and not exists(select 1 from cotizaciones q where q.proyecto_id=p.id);
 get diagnostics deleted_projects=row_count;
 update import_batches set status='reverted',reverted_at=now() where id=b.id;
 update import_rows set status='reverted' where import_batch_id=b.id and status in ('imported','linked');
 insert into audit_logs(organization_id,usuario_id,entidad_tipo,entidad_id,accion,valores_nuevos) values(b.organization_id,auth.uid(),'import_batch',b.id,'REVERT',jsonb_build_object('notes',deleted_notes,'quotes',deleted_quotes,'tasks',deleted_tasks,'activities',deleted_activities,'opportunities',deleted_opps,'projects',deleted_projects));
 return jsonb_build_object('status','reverted','deleted_notes',deleted_notes,'deleted_quotes',deleted_quotes,'deleted_tasks',deleted_tasks,'deleted_activities',deleted_activities,'deleted_opportunities',deleted_opps,'deleted_projects',deleted_projects);
end $$;
