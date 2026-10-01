-- Reemplace los UUID de usuario por uno existente de auth.users antes de ejecutar.
insert into organizations(id,nombre,razon_social,rut) values('00000000-0000-4000-8000-000000000001','Thermikhaus','Thermikhaus SpA','76.000.000-0') on conflict do nothing;
-- La semilla demostrativa completa se crea con scripts/seed-demo.sql después de registrar el primer usuario.
