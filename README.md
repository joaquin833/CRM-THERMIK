# Thermikhaus CRM

Etapa 1 funcional de un CRM multi-organización construido con Next.js, TypeScript, Tailwind y Supabase. Incluye autenticación, diseño Thermikhaus, esquema relacional inicial, RLS, API real de cotizaciones, normalización del N.º de cotización, inspección segura de Excel, conexión OAuth inicial de Google y endpoint de resumen Anthropic.

## Arquitectura

Navegador -> Next.js App Router -> servicios/Route Handlers -> Supabase PostgreSQL/Auth/Storage. Integraciones externas solo desde servidor: Google Calendar y Anthropic. UUID es clave técnica; `numero_cotizacion` es la referencia comercial visible.

## Inicio local

1. Instale Node.js 20+ y Supabase CLI.
2. Copie `.env.example` a `.env.local` y configure valores.
3. Ejecute `npm install`.
4. Vincule Supabase y aplique `supabase db push`, o copie `supabase/migrations/0001_stage1.sql` al SQL Editor.
5. Cree un usuario en Supabase Auth. Inserte su perfil con la organización semilla y rol `admin`.
6. Ejecute `npm run dev` y abra `http://localhost:3000`.
7. Verifique con `npm run typecheck`, `npm test` y `npm run build`.

## Seguridad

La service role, secretos OAuth, cifrado y Anthropic son solo servidor. RLS aísla organizaciones. La tabla de cotizaciones exige número no vacío y único por organización. Para producción agregue rate limiting distribuido, cifrado de tokens Google con AES-GCM/KMS, CSP, antivirus de archivos y backups PITR.

## Google Cloud

Habilite Calendar API, configure pantalla de consentimiento, cliente OAuth Web y redirect URI exacta. Se solicita únicamente `calendar.events`. La callback actual valida el código pero la persistencia cifrada de tokens queda planificada para Etapa 6.

## Anthropic

Configure `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL`. El endpoint recupera solo campos mínimos de la cotización, separa instrucciones del sistema y no envía planillas completas.

## Migración

`inspectWorkbook` busca exclusivamente `SEGUIMIENTO PRESUPUESTOS`. Si no existe, detiene el proceso. `Operaciones` solo se informa como excluida y su hoja jamás se transforma a filas. La prueba confirma que el contenido prohibido no aparece en la salida.

## Despliegue

Importe el repositorio en Vercel, configure variables, conecte Supabase, aplique migraciones y use una URL HTTPS para OAuth. Ejecute pruebas antes de promover a producción.

## Completado

- Base Next.js/TypeScript/Tailwind, identidad visual y dashboard responsive.
- Supabase Auth login, clientes SSR y RLS base.
- Organizaciones, perfiles, empresas, contactos, proyectos, oportunidades, cotizaciones y auditoría.
- Restricción única del N.º de cotización.
- API de cotizaciones y validación Zod.
- Inspector Excel seguro con exclusión total de Operaciones.
- Pruebas del número y exclusión de Operaciones.
- OAuth y Anthropic como integración servidor inicial.

## Pendiente priorizado

- Completar tablas restantes, CRUD y políticas por propiedad/rol.
- Persistencia cifrada Google, eventos idempotentes y diagnóstico.
- Asistente completo de migración, conflictos, lotes y reversión.
- Centro IA, reportes, archivos privados, automatizaciones y suite E2E.
- Semilla transaccional completa de la cotización 14394 ligada a un usuario real.

## Eliminar demostración

No se insertan datos comerciales automáticamente. El dashboard contiene una tarjeta visual ficticia. Para retirarla, elimine el bloque demostrativo de `src/app/dashboard/page.tsx`.

## Etapa 2

Se agregaron middleware de sesión, autorización servidor por rol, CRUD persistente de empresas, contactos, prospectos y proyectos, vista de oportunidades con números de cotización asociados, tablas de actividades/tareas/listas controladas, políticas RLS por propietario y auditoría automática mediante triggers.

### Supuesto de permisos aplicado

Los ejecutivos ven y modifican registros asignados a ellos. Jefatura y administrador ven el equipo completo. Consulta solo puede leer. Las pantallas nunca sustituyen las políticas RLS ni las verificaciones del servidor.

## Etapa 3

Se agregó el módulo funcional de cotizaciones con listado, creación, ficha, primer ítem, cálculos CLP, IVA 19 %, estados validados, seguimiento idempotente, historial, búsqueda global y semilla transaccional 14394. Para crear la demostración, inicie sesión con un perfil válido y ejecute `select create_demo_14394();` desde una llamada RPC autenticada. La función rechaza una segunda ejecución para la misma organización.

## Etapa 4

Agenda, actividades, tareas, seguimientos, alertas y dashboard conectado a datos reales. Las tareas vencidas se resaltan, las actividades se vinculan con Cotización N.º, y las alertas se generan de forma idempotente para cotizaciones sin seguimiento y tareas atrasadas.

## Etapa 5

Se agregó el asistente de migración histórica con hash SHA-256, validación de archivo, lectura exclusiva de `SEGUIMIENTO PRESUPUESTOS`, exclusión de `Operaciones`, previsualización, normalización, detección de duplicados, staging auditable, conflictos contra el CRM, propuestas de seguimiento y reversión administrativa. El guardado inicial crea un lote de revisión; no crea eventos de Calendar ni importa automáticamente filas ambiguas.

## Etapa 6

La migración histórica ahora puede ejecutarse de forma controlada, crear o vincular clientes, proyectos, oportunidades y cotizaciones, conservar comentarios como notas y actividades individuales, resolver conflictos, aprobar tareas futuras sin crear Calendar, exportar un informe CSV y revertir elementos del lote que no tuvieron modificaciones manuales posteriores.

## Etapa 7

Integración completa de Google Calendar mediante OAuth 2.0 web: estado CSRF firmado, tokens AES-256-GCM, refresh automático, conexión individual, diagnóstico, desconexión con revocación, sincronización masiva y creación/actualización idempotente del mismo evento. Los títulos incluyen `Cotización N.º [numero]` y utilizan `America/Santiago`.

## Etapa 8

Centro de IA con consentimiento, límites, auditoría, minimización, salida estructurada y protección contra prompt injection; resumen, próxima acción, comunicaciones y asistente con evidencias. Vista 360 del cliente, reportes comerciales y exportación CSV/XLSX con N.º de cotización incluido.

La puntuación comercial de 0 a 100 se calcula en servidor con probabilidad, temperatura, existencia de cotización, recencia y próxima acción. La vista `opportunity_health` identifica abandono y oportunidades sin próxima acción sin depender de una respuesta generativa.

## Etapa 9 y entrega

Gestión de usuarios e invitaciones, recuperación de contraseña, identidad administrable, storage privado con URLs firmadas, auditoría, rate limiting en PostgreSQL, encabezados de seguridad y manuales de puesta en marcha. Las tareas externas restantes requieren credenciales reales controladas por Thermikhaus.
