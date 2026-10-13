begin;

-- =========================================================
-- 0022 - CONSOLIDACION SEGURA DE CONTACTOS DUPLICADOS
-- Reasigna relaciones, archiva el duplicado y protege el correo activo.
-- =========================================================

create or replace function public.merge_duplicate_contacts(
  p_primary_contact_id uuid,
  p_duplicate_contact_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_primary public.contactos%rowtype;
  v_duplicate public.contactos%rowtype;
  v_role text;
  v_projects integer := 0;
  v_opportunities integer := 0;
  v_quotes integer := 0;
  v_activities integer := 0;
  v_tasks integer := 0;
begin
  if p_primary_contact_id is null or p_duplicate_contact_id is null then
    raise exception 'Debe indicar el contacto principal y el contacto duplicado';
  end if;

  if p_primary_contact_id = p_duplicate_contact_id then
    raise exception 'El contacto principal y el duplicado deben ser diferentes';
  end if;

  select rol into v_role
  from public.profiles
  where id = auth.uid()
    and organization_id = public.current_org()
    and estado = 'activo';

  if v_role not in ('admin', 'jefatura_comercial') then
    raise exception 'Solo administración o jefatura comercial puede consolidar contactos';
  end if;

  select * into v_primary
  from public.contactos
  where id = p_primary_contact_id
    and organization_id = public.current_org()
  for update;

  select * into v_duplicate
  from public.contactos
  where id = p_duplicate_contact_id
    and organization_id = public.current_org()
  for update;

  if v_primary.id is null then
    raise exception 'Contacto principal no encontrado o no autorizado';
  end if;

  if v_duplicate.id is null then
    raise exception 'Contacto duplicado no encontrado o no autorizado';
  end if;

  if v_primary.deleted_at is not null then
    raise exception 'El contacto principal debe estar activo';
  end if;

  if v_duplicate.deleted_at is not null then
    raise exception 'El contacto duplicado ya está archivado';
  end if;

  if v_primary.organization_id <> v_duplicate.organization_id then
    raise exception 'Los contactos deben pertenecer a la misma organización';
  end if;

  update public.proyectos
  set contacto_principal_id = v_primary.id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_principal_id = v_duplicate.id;
  get diagnostics v_projects = row_count;

  update public.oportunidades
  set contacto_id = v_primary.id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate.id;
  get diagnostics v_opportunities = row_count;

  update public.cotizaciones
  set contacto_id = v_primary.id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate.id;
  get diagnostics v_quotes = row_count;

  update public.activities
  set contacto_id = v_primary.id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate.id;
  get diagnostics v_activities = row_count;

  update public.tasks
  set contacto_id = v_primary.id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate.id;
  get diagnostics v_tasks = row_count;

  update public.contactos
  set cargo = coalesce(v_primary.cargo, v_duplicate.cargo),
      telefono = coalesce(v_primary.telefono, v_duplicate.telefono),
      whatsapp = coalesce(v_primary.whatsapp, v_duplicate.whatsapp),
      direccion = coalesce(v_primary.direccion, v_duplicate.direccion),
      comuna = coalesce(v_primary.comuna, v_duplicate.comuna),
      ciudad = coalesce(v_primary.ciudad, v_duplicate.ciudad),
      region = coalesce(v_primary.region, v_duplicate.region),
      tipo_contacto = coalesce(v_primary.tipo_contacto, v_duplicate.tipo_contacto),
      preferencia_contacto = coalesce(
        v_primary.preferencia_contacto,
        v_duplicate.preferencia_contacto
      ),
      origen = coalesce(v_primary.origen, v_duplicate.origen),
      empresa_id = coalesce(v_primary.empresa_id, v_duplicate.empresa_id),
      consentimiento_comunicaciones = (
        coalesce(v_primary.consentimiento_comunicaciones, false)
        or coalesce(v_duplicate.consentimiento_comunicaciones, false)
      ),
      observaciones = concat_ws(
        E'\n',
        nullif(trim(v_primary.observaciones), ''),
        case
          when nullif(trim(v_duplicate.observaciones), '') is not null
            then 'Información consolidada: ' || trim(v_duplicate.observaciones)
          else null
        end
      ),
      updated_at = now()
  where id = v_primary.id;

  update public.contactos
  set estado = 'inactivo',
      deleted_at = now(),
      observaciones = concat_ws(
        E'\n',
        nullif(trim(v_duplicate.observaciones), ''),
        concat(
          'Contacto consolidado en ',
          v_primary.id::text,
          ' el ',
          to_char(now() at time zone 'America/Santiago', 'DD-MM-YYYY HH24:MI'),
          '.'
        )
      ),
      updated_at = now()
  where id = v_duplicate.id;

  return jsonb_build_object(
    'success', true,
    'primary_contact_id', v_primary.id,
    'archived_contact_id', v_duplicate.id,
    'moved_relations', jsonb_build_object(
      'projects', v_projects,
      'opportunities', v_opportunities,
      'quotes', v_quotes,
      'activities', v_activities,
      'tasks', v_tasks
    )
  );
end;
$function$;

revoke all on function public.merge_duplicate_contacts(uuid, uuid) from public;
grant execute on function public.merge_duplicate_contacts(uuid, uuid) to authenticated;

comment on function public.merge_duplicate_contacts(uuid, uuid) is
  'Consolida dos contactos de la misma organización, reasigna relaciones y archiva el duplicado.';

-- ---------------------------------------------------------
-- Consolidación del único duplicado histórico confirmado.
-- Principal: Prueba CRM
-- Duplicado: Prueba 2
-- ---------------------------------------------------------

do $migration$
declare
  v_primary_id constant uuid := '78dea49f-becf-46aa-925b-6702a0926b8a';
  v_duplicate_id constant uuid := '1907fe68-38bc-48f6-a40f-7f690d7e60f0';
  v_primary public.contactos%rowtype;
  v_duplicate public.contactos%rowtype;
begin
  select * into v_primary
  from public.contactos
  where id = v_primary_id
  for update;

  select * into v_duplicate
  from public.contactos
  where id = v_duplicate_id
  for update;

  if v_primary.id is null or v_duplicate.id is null then
    raise notice 'El par de contactos de prueba no está completo; se omite la consolidación histórica.';
    return;
  end if;

  if v_primary.organization_id <> v_duplicate.organization_id then
    raise exception 'Los contactos de prueba pertenecen a organizaciones diferentes';
  end if;

  if v_duplicate.deleted_at is not null then
    raise notice 'El contacto duplicado de prueba ya estaba archivado.';
    return;
  end if;

  update public.proyectos
  set contacto_principal_id = v_primary_id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_principal_id = v_duplicate_id;

  update public.oportunidades
  set contacto_id = v_primary_id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate_id;

  update public.cotizaciones
  set contacto_id = v_primary_id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate_id;

  update public.activities
  set contacto_id = v_primary_id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate_id;

  update public.tasks
  set contacto_id = v_primary_id,
      updated_at = now()
  where organization_id = v_primary.organization_id
    and contacto_id = v_duplicate_id;

  update public.contactos
  set cargo = coalesce(v_primary.cargo, v_duplicate.cargo),
      telefono = coalesce(v_primary.telefono, v_duplicate.telefono),
      whatsapp = coalesce(v_primary.whatsapp, v_duplicate.whatsapp),
      direccion = coalesce(v_primary.direccion, v_duplicate.direccion),
      comuna = coalesce(v_primary.comuna, v_duplicate.comuna),
      ciudad = coalesce(v_primary.ciudad, v_duplicate.ciudad),
      region = coalesce(v_primary.region, v_duplicate.region),
      tipo_contacto = coalesce(v_primary.tipo_contacto, v_duplicate.tipo_contacto),
      preferencia_contacto = coalesce(
        v_primary.preferencia_contacto,
        v_duplicate.preferencia_contacto
      ),
      origen = coalesce(v_primary.origen, v_duplicate.origen),
      empresa_id = coalesce(v_primary.empresa_id, v_duplicate.empresa_id),
      consentimiento_comunicaciones = (
        coalesce(v_primary.consentimiento_comunicaciones, false)
        or coalesce(v_duplicate.consentimiento_comunicaciones, false)
      ),
      updated_at = now()
  where id = v_primary_id;

  update public.contactos
  set estado = 'inactivo',
      deleted_at = now(),
      observaciones = concat_ws(
        E'\n',
        nullif(trim(v_duplicate.observaciones), ''),
        concat('Contacto consolidado en ', v_primary_id::text, '.')
      ),
      updated_at = now()
  where id = v_duplicate_id;
end;
$migration$;

-- Si queda otro correo activo duplicado, la migración se detiene antes de
-- crear la protección única para permitir una revisión manual segura.
do $validation$
declare
  v_duplicate_email text;
begin
  select correo_normalizado
  into v_duplicate_email
  from public.contactos
  where deleted_at is null
    and correo_normalizado is not null
  group by organization_id, correo_normalizado
  having count(*) > 1
  limit 1;

  if v_duplicate_email is not null then
    raise exception using
      message = 'Aún existen correos duplicados entre contactos activos.',
      detail = concat('Primer correo pendiente: ', v_duplicate_email, '.'),
      hint = 'Revise y consolide los contactos antes de volver a ejecutar la migración.';
  end if;
end;
$validation$;

create unique index if not exists contactos_one_active_email_idx
on public.contactos (organization_id, correo_normalizado)
where deleted_at is null
  and correo_normalizado is not null;

comment on index public.contactos_one_active_email_idx is
  'Impide más de un contacto activo con el mismo correo normalizado por organización.';

commit;
