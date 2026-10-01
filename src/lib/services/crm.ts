import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/authorization';
import { z } from 'zod';

const text = z.string().trim().min(1);
export const schemas = {
  empresas: z.object({ razon_social: text, nombre_fantasia: z.string().optional(), rut: z.string().optional(), segmento: z.string().optional(), estado: z.string().default('activo') }),
  contactos: z.object({ nombre: text, apellido: z.string().optional(), correo: z.string().email().optional().or(z.literal('')), telefono: z.string().optional(), empresa_id: z.string().uuid().optional().or(z.literal('')), estado: z.string().default('activo') }),
  prospectos: z.object({ contacto_id: z.string().uuid(), empresa_id: z.string().uuid().optional().or(z.literal('')), segmento: z.string().optional(), fuente: z.string().optional(), necesidad_principal: text, estado: z.string().default('Prospecto nuevo'), temperatura_comercial: z.string().default('Tibia') }),
  proyectos: z.object({ nombre: text, contacto_principal_id: z.string().uuid(), empresa_id: z.string().uuid().optional().or(z.literal('')), tipo_proyecto: z.string().optional(), estado: z.string().default('activo') }),
};
export type EntityName = keyof typeof schemas;

export async function listEntity(entity: EntityName) {
  await requireProfile();
  const supabase = await createClient();
  let query = supabase.from(entity).select('*').order('created_at', { ascending: false }).limit(200);
  if (entity !== 'proyectos') query = query.is('deleted_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createEntity(entity: EntityName, raw: unknown) {
  const profile = await requireProfile(['admin', 'jefatura_comercial', 'ejecutivo_comercial']);
  const parsed = schemas[entity].parse(raw);
  const cleaned = Object.fromEntries(Object.entries(parsed).map(([k,v]) => [k, v === '' ? null : v]));
  const payload = { ...cleaned, organization_id: profile.organization_id, ejecutivo_responsable_id: profile.id };
  const supabase = await createClient();
  const { data, error } = await supabase.from(entity).insert(payload).select().single();
  if (error) throw error;
  return data;
}
