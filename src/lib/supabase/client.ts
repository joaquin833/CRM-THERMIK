import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el navegador.
 *
 * El tipo flexible es intencional mientras el proyecto no tenga generado
 * src/types/database.ts. Evita que tablas nuevas como public.tasks sean
 * inferidas por TypeScript como `never`.
 */
type AppSupabaseClient = SupabaseClient<any, "public", any>;

let browserClient: AppSupabaseClient | undefined;

export function createClient(): AppSupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno.",
    );
  }

  if (!browserClient) {
    browserClient = createSupabaseClient<any, "public", any>(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  }

  return browserClient;
}
