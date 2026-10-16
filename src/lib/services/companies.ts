import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const nullableText = z.string().nullable();
const dateText = z.string().nullable();

const companySchema = z.object({
  id: uuidSchema,
  organization_id: uuidSchema,
  razon_social: z.string(),
  nombre_fantasia: nullableText,
  rut: nullableText,
  rut_normalizado: nullableText,
  giro: nullableText,
  pagina_web: nullableText,
  direccion: nullableText,
  comuna: nullableText,
  ciudad: nullableText,
  region: nullableText,
  segmento: nullableText,
  origen: nullableText,
  observaciones: nullableText,
  estado: z.string(),
  ejecutivo_responsable_id: uuidSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: dateText,
});

const responsibleSchema = z
  .object({
    id: uuidSchema,
    nombre: nullableText,
    apellido: nullableText,
    nombre_completo: nullableText,
    correo: nullableText,
    cargo: nullableText,
    estado: nullableText,
  })
  .nullable();

const summarySchema = z.object({
  active_contacts: z.coerce.number().int().nonnegative(),
  archived_contacts: z.coerce.number().int().nonnegative(),
  projects: z.coerce.number().int().nonnegative(),
  opportunities: z.coerce.number().int().nonnegative(),
  active_quotes: z.coerce.number().int().nonnegative(),
  quoted_amount: z.coerce.number().nonnegative(),
  last_quote_at: dateText,
});

const contactSchema = z.object({
  id: uuidSchema,
  nombre: nullableText,
  apellido: nullableText,
  nombre_completo: nullableText,
  cargo: nullableText,
  telefono: nullableText,
  whatsapp: nullableText,
  correo: nullableText,
  tipo_contacto: nullableText,
  preferencia_contacto: nullableText,
  origen: nullableText,
  estado: z.string(),
  ejecutivo_responsable_id: uuidSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const projectSchema = z.object({
  id: uuidSchema,
  nombre: z.string(),
  direccion: nullableText,
  comuna: nullableText,
  ciudad: nullableText,
  region: nullableText,
  tipo_proyecto: nullableText,
  tipo_obra: nullableText,
  metros_cuadrados_estimados: z.coerce.number().nullable(),
  contacto_principal_id: uuidSchema.nullable(),
  estado: nullableText,
  created_at: z.string(),
  updated_at: z.string(),
});

const opportunitySchema = z.object({
  id: uuidSchema,
  nombre: z.string(),
  contacto_id: uuidSchema.nullable(),
  proyecto_id: uuidSchema.nullable(),
  etapa_comercial: nullableText,
  probabilidad_cierre: z.coerce.number().nullable(),
  monto_estimado: z.coerce.number().nullable(),
  temperatura: nullableText,
  prioridad: nullableText,
  fecha_estimada_cierre: dateText,
  estado: nullableText,
  proxima_accion: nullableText,
  fecha_proxima_accion: dateText,
  created_at: z.string(),
  updated_at: z.string(),
});

const quoteSchema = z.object({
  id: uuidSchema,
  numero_cotizacion: z.string(),
  contacto_id: uuidSchema.nullable(),
  proyecto_id: uuidSchema.nullable(),
  oportunidad_id: uuidSchema.nullable(),
  fecha_emision: dateText,
  fecha_validez: dateText,
  moneda: z.string(),
  neto: z.coerce.number(),
  iva: z.coerce.number(),
  total: z.coerce.number(),
  estado_documental: nullableText,
  estado_comercial: nullableText,
  proxima_accion: nullableText,
  fecha_proximo_seguimiento: dateText,
  ultima_actividad_at: dateText,
  created_at: z.string(),
  updated_at: z.string(),
});

const catalogsSchema = z.object({
  estados: z.array(z.string()),
  segmentos: z.array(z.string()),
  origenes: z.array(z.string()),
});

export const company360Schema = z.object({
  company: companySchema,
  responsible: responsibleSchema,
  summary: summarySchema,
  contacts: z.array(contactSchema),
  projects: z.array(projectSchema),
  opportunities: z.array(opportunitySchema),
  quotes: z.array(quoteSchema),
  catalogs: catalogsSchema,
});

export type Company360 = z.infer<typeof company360Schema>;
export type Company360Company = z.infer<typeof companySchema>;
export type CompanyCatalogs = z.infer<typeof catalogsSchema>;
export type CompanyContact = z.infer<typeof contactSchema>;
export type CompanyProject = z.infer<typeof projectSchema>;
export type CompanyOpportunity = z.infer<typeof opportunitySchema>;
export type CompanyQuote = z.infer<typeof quoteSchema>;

export type CompanyListItem = {
  id: string;
  razon_social: string;
  nombre_fantasia: string | null;
  rut: string | null;
  giro: string | null;
  comuna: string | null;
  ciudad: string | null;
  region: string | null;
  segmento: string | null;
  origen: string | null;
  estado: string;
  responsable: string | null;
  updated_at: string;
};

export async function getCompany360(id: string): Promise<Company360> {
  const companyId = uuidSchema.parse(id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_company_360", {
    p_company_id: companyId,
  });

  if (error) {
    throw new Error(
      `No fue posible cargar la ficha de la empresa: ${error.message}`,
    );
  }

  const parsed = company360Schema.safeParse(data);

  if (!parsed.success) {
    console.error(
      "Respuesta inválida de get_company_360",
      parsed.error.flatten(),
    );
    throw new Error("La ficha de la empresa devolvió una estructura inválida.");
  }

  return parsed.data;
}

export async function getCompanyCatalogs(): Promise<CompanyCatalogs> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_company_catalogs");

  if (error) {
    throw new Error(
      `No fue posible cargar los catálogos de Empresas: ${error.message}`,
    );
  }

  return catalogsSchema.parse(data);
}

export async function getCompanies(): Promise<CompanyListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empresas")
    .select(
      `
      id,
      razon_social,
      nombre_fantasia,
      rut,
      giro,
      comuna,
      ciudad,
      region,
      segmento,
      origen,
      estado,
      updated_at,
      profiles!empresas_ejecutivo_responsable_id_fkey (
        nombre,
        apellido
      )
    `,
    )
    .is("deleted_at", null)
    .order("razon_social", { ascending: true });

  if (error) {
    throw new Error(`No fue posible cargar las empresas: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const responsible = firstRelation(row.profiles as unknown);

    return {
      id: row.id,
      razon_social: row.razon_social,
      nombre_fantasia: row.nombre_fantasia,
      rut: row.rut,
      giro: row.giro,
      comuna: row.comuna,
      ciudad: row.ciudad,
      region: row.region,
      segmento: row.segmento,
      origen: row.origen,
      estado: row.estado,
      responsable:
        [textValue(responsible?.nombre), textValue(responsible?.apellido)]
          .filter(Boolean)
          .join(" ") || null,
      updated_at: row.updated_at,
    };
  });
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }

  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
