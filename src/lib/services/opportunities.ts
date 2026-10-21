import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const nullableText = z.string().nullable().optional();
const nullableNumber = z.coerce.number().nullable().optional();

const catalogOptionSchema = z.object({ value: z.string(), label: z.string() });
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

const opportunityListSchema = z.object({
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

const opportunityDetailSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  nombre: z.string(),
  nombre_normalizado: nullableText,
  monto_estimado: nullableNumber,
  etapa_comercial: z.string(),
  estado: z.string(),
  probabilidad_cierre: nullableNumber,
  monto_ponderado: z.coerce.number().default(0),
  prioridad: nullableText,
  temperatura: nullableText,
  fecha_estimada_cierre: nullableText,
  proxima_accion: nullableText,
  fecha_proxima_accion: nullableText,
  seguimiento_atrasado: z.boolean().default(false),
  observaciones: nullableText,
  contacto_id: z.string().uuid().nullable().optional(),
  empresa_id: z.string().uuid().nullable().optional(),
  proyecto_id: z.string().uuid().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const contactSchema = z
  .object({
    id: z.string().uuid(),
    nombre: nullableText,
    apellido: nullableText,
    nombre_completo: nullableText,
    cargo: nullableText,
    telefono: nullableText,
    whatsapp: nullableText,
    correo: nullableText,
    preferencia_contacto: nullableText,
    tipo_contacto: nullableText,
    estado: nullableText,
    empresa_id: z.string().uuid().nullable().optional(),
  })
  .nullable();

const companySchema = z
  .object({
    id: z.string().uuid(),
    razon_social: z.string(),
    nombre_fantasia: nullableText,
    rut: nullableText,
    giro: nullableText,
    direccion: nullableText,
    comuna: nullableText,
    ciudad: nullableText,
    region: nullableText,
    segmento: nullableText,
    estado: nullableText,
  })
  .nullable();

const projectSchema = z
  .object({
    id: z.string().uuid(),
    nombre: z.string(),
    direccion: nullableText,
    comuna: nullableText,
    ciudad: nullableText,
    region: nullableText,
    tipo_proyecto: nullableText,
    tipo_obra: nullableText,
    metros_cuadrados_estimados: nullableNumber,
    estado: nullableText,
    contacto_principal_id: z.string().uuid().nullable().optional(),
    empresa_id: z.string().uuid().nullable().optional(),
  })
  .nullable();

const summarySchema = z.object({
  cotizaciones_activas: z.coerce.number().default(0),
  monto_total_cotizado: z.coerce.number().default(0),
  actividades: z.coerce.number().default(0),
  tareas_activas: z.coerce.number().default(0),
  tareas_atrasadas: z.coerce.number().default(0),
  cierres_registrados: z.coerce.number().default(0),
  ultima_cotizacion_at: nullableText,
  ultima_actividad_at: nullableText,
});

const quoteSchema = z.object({
  id: z.string().uuid(),
  numero_cotizacion: z.string(),
  fecha_emision: nullableText,
  fecha_validez: nullableText,
  total: z.coerce.number().default(0),
  estado: nullableText,
  estado_comercial: nullableText,
  proxima_accion: nullableText,
  fecha_proximo_seguimiento: nullableText,
  contacto_id: z.string().uuid().nullable().optional(),
  empresa_id: z.string().uuid().nullable().optional(),
  proyecto_id: z.string().uuid().nullable().optional(),
  archivo_pdf_url: nullableText,
  created_at: z.string(),
  updated_at: z.string(),
});

const activitySchema = z.object({
  id: z.string().uuid(),
  tipo_actividad: nullableText,
  fecha_hora_inicio: nullableText,
  fecha_hora_fin: nullableText,
  estado: nullableText,
  resultado: nullableText,
  descripcion: nullableText,
  proxima_accion: nullableText,
  fecha_proxima_accion: nullableText,
  ejecutivo_responsable_id: z.string().uuid().nullable().optional(),
  responsable: nullableText,
  created_at: z.string(),
});

const taskSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string(),
  descripcion: nullableText,
  tipo: nullableText,
  prioridad: nullableText,
  estado: nullableText,
  fecha_hora_vencimiento: nullableText,
  fecha_finalizacion: nullableText,
  responsable_id: z.string().uuid().nullable().optional(),
  responsable: nullableText,
  origen_registro: nullableText,
  created_at: z.string(),
  updated_at: z.string(),
});

const opportunity360Schema = z.object({
  opportunity: opportunityDetailSchema,
  contact: contactSchema,
  company: companySchema,
  project: projectSchema,
  summary: summarySchema,
  quotes: z.array(quoteSchema).default([]),
  activities: z.array(activitySchema).default([]),
  tasks: z.array(taskSchema).default([]),
  closures: z.array(z.record(z.string(), z.unknown())).default([]),
  catalogs: opportunityCatalogsSchema,
});

export type OpportunityCatalogs = z.infer<typeof opportunityCatalogsSchema>;
export type OpportunityListItem = z.infer<typeof opportunityListSchema>;
export type Opportunity360 = z.infer<typeof opportunity360Schema>;

export async function getOpportunities(): Promise<OpportunityListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(
      `
      id, nombre, monto_estimado, etapa_comercial, estado,
      probabilidad_cierre, prioridad, temperatura,
      fecha_estimada_cierre, proxima_accion, fecha_proxima_accion,
      contacto_id, empresa_id, proyecto_id, created_at, updated_at,
      contactos (id, nombre, apellido, correo, telefono, whatsapp),
      empresas (id, razon_social, nombre_fantasia, rut),
      proyectos (id, nombre, direccion, comuna, ciudad, region)
    `,
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error)
    throw new Error(
      `No fue posible cargar las oportunidades: ${error.message}`,
    );
  return z.array(opportunityListSchema).parse(data ?? []);
}

export async function getOpportunityCatalogs(): Promise<OpportunityCatalogs> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_opportunity_catalogs");
  if (error)
    throw new Error(`No fue posible cargar los catálogos: ${error.message}`);
  return opportunityCatalogsSchema.parse(data);
}

export async function getOpportunity360(id: string): Promise<Opportunity360> {
  const opportunityId = z.string().uuid().parse(id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_opportunity_360", {
    p_opportunity_id: opportunityId,
  });

  if (error) {
    throw new Error(
      `No fue posible cargar la ficha de la oportunidad: ${error.message}`,
    );
  }

  return opportunity360Schema.parse(data);
}
