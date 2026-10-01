import { createClient } from '../supabase/server';

export type AppRole = 'admin' | 'jefatura_comercial' | 'ejecutivo_comercial' | 'consulta';
export type SessionProfile = { id: string; organization_id: string; rol: AppRole; nombre: string; apellido: string };

export async function requireProfile(allowed?: AppRole[]): Promise<SessionProfile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  const { data, error } = await supabase.from('profiles').select('id,organization_id,rol,nombre,apellido').eq('id', user.id).single();
  if (error || !data) throw new Error('PROFILE_NOT_FOUND');
  if (allowed && !allowed.includes(data.rol as AppRole)) throw new Error('FORBIDDEN');
  return data as SessionProfile;
}

export function canManage(role: AppRole) { return role !== 'consulta'; }
export function canManageUsers(role: AppRole) { return role === 'admin'; }
