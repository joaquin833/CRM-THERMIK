import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

const contactSchema = z.object({
  id: uuidSchema,
  nombre: z.string().nullable(),
  apellido: z.string().nullable(),
  nombre_completo: z.string().nullable(),
  cargo: z.string().nullable(),
  telefono: z.string().nullable(),
  telefono_normalizado: z.string().nullable(),
  whatsapp: z.string().nullable(),
  correo: z.string().nullable(),
  correo_normalizado: z.string().nullable(),
  direccion: z.string().nullable(),
  comuna: z.string().nullable(),
  ciudad: z.string().nullable(),
  region: z.string().nullable(),
  tipo_contacto: z.string().nullable(),
  preferencia_contacto: z.string().nullable(),
  origen: z.string().nullable(),
  estado: z.string(),
  consentimiento_comunicaciones: z.boolean(),
  observaciones: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

const companySchema = z
  .object({
    id: uuidSchema,
    razon_social: z.string(),
    rut: z.string().nullable(),
    telefono: z.string().nullable(),
    correo: z.string().nullable(),
    estado: z.string().nullable(),
  })
  .nullable();

const responsibleSchema = z
  .object({
    id: uuidSchema,
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
    nombre_completo: z.string().nullable(),
    correo: z.string().nullable(),
    cargo: z.string().nullable(),
  })
  .nullable();

const summarySchema = z.object({
  projects: z.coerce.number().int().nonnegative(),
  opportunities: z.coerce.number().int().nonnegative(),
  quotes: z.coerce.number().int().nonnegative(),
  activities: z.coerce.number().int().nonnegative(),
  active_tasks: z.coerce.number().int().nonnegative(),
  overdue_tasks: z.coerce.number().int().nonnegative(),
});

const projectSchema = z.object({
  id: uuidSchema,
  nombre: z.string(),
  estado: z.string().nullable(),
  empresa_id: uuidSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const opportunitySchema = z.object({
  id: uuidSchema,
  nombre: z.string(),
  etapa_comercial: z.string().nullable(),
  estado: z.string().nullable(),
  monto_estimado: z.coerce.number().nullable(),
  probabilidad: z.coerce.number().nullable(),
  proxima_accion: z.string().nullable(),
  fecha_proxima_accion: z.string().nullable(),
  proyecto_id: uuidSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const quoteSchema = z.object({
  id: uuidSchema,
  numero_cotizacion: z.string(),
  fecha_emision: z.string().nullable(),
  total: z.coerce.number(),
  moneda: z.string(),
  estado_documental: z.string().nullable(),
  estado_comercial: z.string().nullable(),
  proxima_accion: z.string().nullable(),
  fecha_proximo_seguimiento: z.string().nullable(),
  proyecto_id: uuidSchema.nullable(),
  oportunidad_id: uuidSchema.nullable(),
  ultima_actividad_at: z.string().nullable(),
  created_at: z.string(),
});

const activitySchema = z.object({
  id: uuidSchema,
  tipo_actividad: z.string(),
  fecha_hora_inicio: z.string().nullable(),
  estado: z.string(),
  resultado: z.string().nullable(),
  descripcion: z.string().nullable(),
  proxima_accion: z.string().nullable(),
  fecha_proxima_accion: z.string().nullable(),
  cotizacion_id: uuidSchema.nullable(),
  oportunidad_id: uuidSchema.nullable(),
  proyecto_id: uuidSchema.nullable(),
  created_at: z.string(),
});

const taskSchema = z.object({
  id: uuidSchema,
  titulo: z.string(),
  descripcion: z.string().nullable(),
  tipo: z.string(),
  prioridad: z.string(),
  estado: z.string(),
  fecha_hora_vencimiento: z.string().nullable(),
  fecha_finalizacion: z.string().nullable(),
  cotizacion_id: uuidSchema.nullable(),
  oportunidad_id: uuidSchema.nullable(),
  proyecto_id: uuidSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const catalogsSchema = z.object({
  tipos_contacto: z.array(z.string()),
  preferencias_contacto: z.array(z.string()),
  origenes: z.array(z.string()),
  estados: z.array(z.string()),
});

export const contact360Schema = z.object({
  contact: contactSchema,
  company: companySchema,
  responsible: responsibleSchema,
  summary: summarySchema,
  projects: z.array(projectSchema),
  opportunities: z.array(opportunitySchema),
  quotes: z.array(quoteSchema),
  activities: z.array(activitySchema),
  tasks: z.array(taskSchema),
  catalogs: catalogsSchema,
});

export type Contact360 = z.infer<typeof contact360Schema>;
export type Contact360Contact = z.infer<typeof contactSchema>;
export type ContactCatalogs = z.infer<typeof catalogsSchema>;
export type ContactProject = z.infer<typeof projectSchema>;
export type ContactOpportunity = z.infer<typeof opportunitySchema>;
export type ContactQuote = z.infer<typeof quoteSchema>;
export type ContactActivity = z.infer<typeof activitySchema>;
export type ContactTask = z.infer<typeof taskSchema>;

export async function getContact360(id: string): Promise<Contact360> {
  const contactId = uuidSchema.parse(id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_contact_360", {
    p_contact_id: contactId,
  });

  if (error) {
    throw new Error(
      `No fue posible cargar la ficha del contacto: ${error.message}`,
    );
  }

  const parsed = contact360Schema.safeParse(data);

  if (!parsed.success) {
    console.error(
      "Respuesta inválida de get_contact_360",
      parsed.error.flatten(),
    );
    throw new Error("La ficha del contacto devolvió una estructura inválida.");
  }

  return parsed.data;
}

export async function getContactCatalogs(): Promise<ContactCatalogs> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_contact_catalogs");

  if (error) {
    throw new Error(`No fue posible cargar los catálogos: ${error.message}`);
  }

  return catalogsSchema.parse(data);
}

export type ContactListItem = {
  id: string;
  nombre: string | null;
  apellido: string | null;
  nombre_completo: string;
  correo: string | null;
  telefono: string | null;
  whatsapp: string | null;
  tipo_contacto: string | null;
  preferencia_contacto: string | null;
  origen: string | null;
  estado: string;
  empresa_id: string | null;
  empresa: string | null;
  responsable: string | null;
  updated_at: string;
};

export async function getContacts(): Promise<ContactListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contactos")
    .select(
      `
      id,
      nombre,
      apellido,
      correo,
      telefono,
      whatsapp,
      tipo_contacto,
      preferencia_contacto,
      origen,
      estado,
      empresa_id,
      updated_at,
      empresas (
        razon_social
      ),
      profiles!contactos_ejecutivo_responsable_id_fkey (
        nombre,
        apellido
      )
    `,
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`No fue posible cargar los contactos: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const company = firstRelation(row.empresas);
    const responsible = firstRelation(row.profiles as unknown);

    return {
      id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      nombre_completo:
        [row.nombre, row.apellido].filter(Boolean).join(" ").trim() ||
        "Sin nombre",
      correo: row.correo,
      telefono: row.telefono,
      whatsapp: row.whatsapp,
      tipo_contacto: row.tipo_contacto,
      preferencia_contacto: row.preferencia_contacto,
      origen: row.origen,
      estado: row.estado,
      empresa_id: row.empresa_id,
      empresa: textValue(company?.razon_social),
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
