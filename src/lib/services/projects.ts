import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const nullableText = z.string().nullable().optional();
const nullableNumber = z.coerce.number().nullable().optional();

const catalogOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const projectCatalogsSchema = z.object({
  estados: z.array(catalogOptionSchema).default([]),
  tipos_proyecto: z.array(catalogOptionSchema).default([]),
  tipos_obra: z.array(catalogOptionSchema).default([]),
});

const projectSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  nombre: z.string(),
  nombre_normalizado: nullableText,
  direccion: nullableText,
  direccion_normalizada: nullableText,
  comuna: nullableText,
  ciudad: nullableText,
  region: nullableText,
  tipo_proyecto: nullableText,
  tipo_obra: nullableText,
  metros_cuadrados_estimados: nullableNumber,
  estado: z.string(),
  observaciones: nullableText,
  contacto_principal_id: z.string().uuid().nullable().optional(),
  empresa_id: z.string().uuid().nullable().optional(),
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
  })
  .nullable();

const companySchema = z
  .object({
    id: z.string().uuid(),
    razon_social: z.string(),
    nombre_fantasia: nullableText,
    rut: nullableText,
    giro: nullableText,
    segmento: nullableText,
    estado: nullableText,
  })
  .nullable();

const summarySchema = z.object({
  oportunidades: z.coerce.number().default(0),
  cotizaciones_activas: z.coerce.number().default(0),
  monto_total_cotizado: z.coerce.number().default(0),
  actividades: z.coerce.number().default(0),
  tareas_activas: z.coerce.number().default(0),
  tareas_atrasadas: z.coerce.number().default(0),
  ultima_cotizacion_at: nullableText,
  ultima_actividad_at: nullableText,
});

const opportunitySchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  monto_estimado: nullableNumber,
  etapa_comercial: nullableText,
  estado: nullableText,
  probabilidad_cierre: nullableNumber,
  prioridad: nullableText,
  temperatura: nullableText,
  fecha_estimada_cierre: nullableText,
  proxima_accion: nullableText,
  fecha_proxima_accion: nullableText,
  created_at: z.string(),
  updated_at: z.string(),
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

const project360Schema = z.object({
  project: projectSchema,
  contact: contactSchema,
  company: companySchema,
  summary: summarySchema,
  opportunities: z.array(opportunitySchema).default([]),
  quotes: z.array(quoteSchema).default([]),
  activities: z.array(activitySchema).default([]),
  tasks: z.array(taskSchema).default([]),
  catalogs: projectCatalogsSchema,
});

const projectListItemSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  direccion: nullableText,
  comuna: nullableText,
  ciudad: nullableText,
  region: nullableText,
  tipo_proyecto: nullableText,
  tipo_obra: nullableText,
  metros_cuadrados_estimados: nullableNumber,
  estado: z.string(),
  contacto_principal_id: z.string().uuid().nullable().optional(),
  empresa_id: z.string().uuid().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  contactos: z.unknown().optional(),
  empresas: z.unknown().optional(),
});

export type Project360 = z.infer<typeof project360Schema>;
export type ProjectCatalogs = z.infer<typeof projectCatalogsSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type ProjectOpportunity = z.infer<typeof opportunitySchema>;
export type ProjectQuote = z.infer<typeof quoteSchema>;
export type ProjectActivity = z.infer<typeof activitySchema>;
export type ProjectTask = z.infer<typeof taskSchema>;

export async function getProject360(id: string): Promise<Project360> {
  const projectId = z.string().uuid().parse(id);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_project_360", {
    p_project_id: projectId,
  });

  if (error) {
    throw new Error(
      `No fue posible cargar la ficha del proyecto: ${error.message}`,
    );
  }

  return project360Schema.parse(data);
}

export async function getProjects(): Promise<ProjectListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("proyectos")
    .select(
      `
      id,
      nombre,
      direccion,
      comuna,
      ciudad,
      region,
      tipo_proyecto,
      tipo_obra,
      metros_cuadrados_estimados,
      estado,
      contacto_principal_id,
      empresa_id,
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
      )
    `,
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`No fue posible cargar los proyectos: ${error.message}`);
  }

  return z.array(projectListItemSchema).parse(data ?? []);
}

export async function getProjectCatalogs(): Promise<ProjectCatalogs> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_catalogs");

  if (error) {
    throw new Error(
      `No fue posible cargar los catálogos de proyectos: ${error.message}`,
    );
  }

  return projectCatalogsSchema.parse(data);
}
