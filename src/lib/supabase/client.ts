import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para componentes del navegador.
 *
 * Usa @supabase/ssr para compartir la misma sesion basada en cookies que
 * src/lib/supabase/server.ts. Esto permite que RLS reconozca al usuario y a
 * la organizacion activa del CRM Thermikhaus.
 *
 * El tipado flexible se mantiene temporalmente hasta regenerar Database.
 */
type AppSupabaseClient = SupabaseClient<any, "public", any>;

let browserClient: AppSupabaseClient | undefined;

export function createClient(): AppSupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient<any>(
      supabaseUrl,
      supabaseAnonKey,
    ) as AppSupabaseClient;
  }

  return browserClient;
}
