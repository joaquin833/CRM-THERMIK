begin;

-- =========================================================
-- 0028 - CORRECCION FICHA 360 DE EMPRESAS
-- Elimina referencias a q.neto y q.iva, columnas inexistentes.
-- Conserva el contrato JSON esperado por TypeScript.
-- =========================================================

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_company_360'
    and pg_get_function_identity_arguments(p.oid) = 'p_company_id uuid';

  if v_definition is null then
    raise exception 'No existe public.get_company_360(uuid). Ejecuta primero 0027_company_360.sql';
  end if;

  if position('q.neto' in v_definition) = 0
     and position('q.iva' in v_definition) = 0 then
    raise notice 'get_company_360 ya estaba corregida';
    return;
  end if;

  v_definition := replace(v_definition, '''neto'', q.neto', '''neto'', 0::numeric');
  v_definition := replace(v_definition, '''iva'', q.iva', '''iva'', 0::numeric');

  execute v_definition;
end;
$migration$;

revoke all on function public.get_company_360(uuid) from public;
grant execute on function public.get_company_360(uuid) to authenticated;

comment on function public.get_company_360(uuid) is
  'Devuelve la ficha 360 de una empresa; neto e IVA quedan en cero porque no existen como columnas oficiales en cotizaciones.';

commit;
