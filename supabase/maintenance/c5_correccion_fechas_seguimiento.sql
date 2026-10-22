begin;

-- C5: correccion controlada de fechas de proxima accion
-- Solo completa fechas nulas de las cuatro oportunidades identificadas.
-- No modifica etapa, estado, probabilidad, monto, contacto, empresa ni proyecto.

update public.oportunidades
set
  fecha_proxima_accion = case id
    when '5d32f61d-f3f5-4478-aacb-3c088e723909'::uuid
      then '2026-10-23 10:00:00-03'::timestamptz
    when '5a18e749-9cad-4ede-b5fc-67f93b998abc'::uuid
      then '2026-10-26 10:00:00-03'::timestamptz
    when '45da5531-28b0-43ab-a75f-31c569cc6a5e'::uuid
      then '2026-10-27 10:00:00-03'::timestamptz
    when '451a271b-5f41-4e1e-b1ad-f1081fc8568d'::uuid
      then '2026-10-28 10:00:00-03'::timestamptz
  end,
  updated_at = now()
where id in (
  '5d32f61d-f3f5-4478-aacb-3c088e723909'::uuid,
  '5a18e749-9cad-4ede-b5fc-67f93b998abc'::uuid,
  '45da5531-28b0-43ab-a75f-31c569cc6a5e'::uuid,
  '451a271b-5f41-4e1e-b1ad-f1081fc8568d'::uuid
)
  and deleted_at is null
  and estado = 'abierta'
  and etapa_comercial = 'Cotización emitida'
  and fecha_proxima_accion is null
  and nullif(trim(coalesce(proxima_accion, '')), '') is not null;

-- Debe devolver cuatro filas con resultado OK.
select
  id,
  nombre,
  proxima_accion,
  fecha_proxima_accion,
  case
    when fecha_proxima_accion is not null then 'OK'
    else 'REVISAR'
  end as resultado
from public.oportunidades
where id in (
  '5d32f61d-f3f5-4478-aacb-3c088e723909'::uuid,
  '5a18e749-9cad-4ede-b5fc-67f93b998abc'::uuid,
  '45da5531-28b0-43ab-a75f-31c569cc6a5e'::uuid,
  '451a271b-5f41-4e1e-b1ad-f1081fc8568d'::uuid
)
order by fecha_proxima_accion;

commit;
