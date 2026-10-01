# Instalación y despliegue

## Requisitos

- Node.js 20 o posterior.
- Proyecto Supabase.
- Proyecto Vercel.
- Proyecto Google Cloud con Calendar API.
- API key de Anthropic.

## Supabase

1. Crea un proyecto en una región adecuada para Thermikhaus.
2. Ejecuta en orden las migraciones `0001` a `0009` mediante Supabase CLI o SQL Editor.
3. Configura Auth URL con la URL de producción.
4. Agrega las URLs de redirección de producción y desarrollo.
5. Verifica que el bucket `crm-private` sea privado.
6. Activa copias de seguridad y, para producción, recuperación a un punto en el tiempo si el plan lo permite.

## Local

```bash
cp .env.example .env.local
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

## Google Cloud

1. Habilita Google Calendar API.
2. Configura OAuth Consent Screen.
3. Crea un cliente OAuth Web.
4. Registra `GOOGLE_REDIRECT_URI` exactamente como `/api/google/callback` bajo el dominio final.
5. Mantén `GOOGLE_CLIENT_SECRET` solo en variables de servidor.

## Anthropic

1. Crea una API key para la organización.
2. Define `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL` en Vercel.
3. Configura límites de gasto y revisa `ai_usage_logs`.

## Vercel

1. Importa el repositorio.
2. Configura todas las variables de `.env.example` en Production y Preview según corresponda.
3. Despliega y comprueba `/login`, `/dashboard`, `/configuracion/google`, `/ia` e `/importacion`.
4. No expongas `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY` ni claves de cifrado con prefijo `NEXT_PUBLIC_`.
