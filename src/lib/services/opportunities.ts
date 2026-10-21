import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const nullableText = z.string().nullable().optional();
const nullableNumber = z.coerce.number().nullable().optional();

const catalogOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const stageOptionSchema = catalogOptionSchema.extend({
  order: z.coerce.number(),
  probability: z.coerce.number(),
});

const opportunityCatalogsSchema = z.object({
  etapas: z.array(stageOptionSchema).default([]),
  estados: z.array(catalogOptionSchema).default([]),
  prioridades: z.array(catalogOptionSchema).default([]),
  temperaturas: z.array(catalogOptionSchema).default([]),
});

const opportunitySchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  monto_estimado: nullableNumber,
  etapa_comercial: z.string(),
  estado: z.string(),
  probabilidad_cierre: nullableNumber,
  prioridad: nullableText,
  temperatura: nullableText,
  fecha_estimada_cierre: nullableText,
  proxima_accion: nullableText,
  fecha_proxima_accion: nullableText,
  contacto_id: z.string().uuid().nullable().optional(),
  empresa_id: z.string().uuid().nullable().optional(),
  proyecto_id: z.string().uuid().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  contactos: z.unknown().optional(),
  empresas: z.unknown().optional(),
  proyectos: z.unknown().optional(),
});

export type OpportunityCatalogs = z.infer<typeof opportunityCatalogsSchema>;
export type OpportunityListItem = z.infer<typeof opportunitySchema>;

export async function getOpportunities(): Promise<OpportunityListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(
      `
      id,
      nombre,
      monto_estimado,
      etapa_comercial,
      estado,
      probabilidad_cierre,
      prioridad,
      temperatura,
      fecha_estimada_cierre,
      proxima_accion,
      fecha_proxima_accion,
      contacto_id,
      empresa_id,
      proyecto_id,
      created_at,
      updated_at,
      contactos (
        id,
        nombre,
        apellido,
        correo,
        telefono,
        whatsapp
      ),
      empresas (
        id,
        razon_social,
        nombre_fantasia,
        rut
      ),
      proyectos (
        id,
        nombre,
        direccion,
        comuna,
        ciudad,
        region
      )
    `,
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(
      `No fue posible cargar las oportunidades: ${error.message}`,
    );
  }

  return z.array(opportunitySchema).parse(data ?? []);
}

export async function getOpportunityCatalogs(): Promise<OpportunityCatalogs> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_opportunity_catalogs");

  if (error) {
    throw new Error(`No fue posible cargar los catálogos: ${error.message}`);
  }

  return opportunityCatalogsSchema.parse(data);
}
