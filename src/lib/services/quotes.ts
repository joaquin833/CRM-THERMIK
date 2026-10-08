import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { calculateItem } from "@/lib/money";
import { normalizeQuoteNumber } from "@/lib/quote-number";
import { createClient } from "@/lib/supabase/server";

const itemSchema = z.object({
  descripcion: z.string().trim().min(1),
  cantidad: z.coerce.number().positive(),
  unidad: z.string().trim().min(1),
  valor_unitario_original: z.coerce.number().int().nonnegative(),
  porcentaje_descuento: z.coerce.number().min(0).max(100).default(0),
  afecto_iva: z.coerce.boolean().default(true),
});

export const newQuoteSchema = z.object({
  numero_cotizacion: z.string().trim().min(1),
  oportunidad_id: z.string().uuid(),
  contacto_id: z.string().uuid(),
  empresa_id: z.string().uuid().optional().or(z.literal("")),
  proyecto_id: z.string().uuid().optional().or(z.literal("")),
  fecha_emision: z.string().date(),
  fecha_validez: z.string().date().optional().or(z.literal("")),
  estado: z.string().default("Borrador"),
  descripcion: z.string().trim().min(1),
  cantidad: z.coerce.number().positive(),
  unidad: z.string().trim().min(1),
  valor_unitario_original: z.coerce.number().int().nonnegative(),
  porcentaje_descuento: z.coerce.number().min(0).max(100).default(0),
});

export async function createQuote(raw: unknown) {
  const profile = await requireProfile([
    "admin",
    "jefatura_comercial",
    "ejecutivo_comercial",
  ]);
  const input = newQuoteSchema.parse(raw);
  const item = itemSchema.parse(input);
  const calculated = calculateItem({
    cantidad: item.cantidad,
    valorUnitarioOriginal: item.valor_unitario_original,
    porcentajeDescuento: item.porcentaje_descuento,
  });
  const supabase = await createClient();

  const { data: quote, error: quoteError } = await supabase
    .from("cotizaciones")
    .insert({
      organization_id: profile.organization_id,
      numero_cotizacion: input.numero_cotizacion,
      numero_cotizacion_normalizado: normalizeQuoteNumber(
        input.numero_cotizacion,
      ),
      oportunidad_id: input.oportunidad_id,
      contacto_id: input.contacto_id,
      empresa_id: input.empresa_id || null,
      proyecto_id: input.proyecto_id || null,
      fecha_emision: input.fecha_emision,
      fecha_validez: input.fecha_validez || null,
      estado: input.estado,
      estado_comercial: "Importada",
      ejecutivo_responsable_id: profile.id,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (quoteError) {
    throw new Error(
      quoteError.code === "23505"
        ? "El N.º de cotización ya existe."
        : quoteError.message,
    );
  }

  const { error: itemError } = await supabase.from("quote_items").insert({
    organization_id: profile.organization_id,
    cotizacion_id: quote.id,
    posicion: 1,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    unidad: item.unidad,
    valor_unitario_original: item.valor_unitario_original,
    porcentaje_descuento: item.porcentaje_descuento,
    valor_descuento: calculated.valorDescuento,
    valor_unitario_final: calculated.valorUnitarioFinal,
    subtotal_neto: calculated.subtotalNeto,
    afecto_iva: item.afecto_iva,
  });

  if (itemError) {
    await supabase.from("cotizaciones").delete().eq("id", quote.id);
    throw new Error(itemError.message);
  }

  return quote.id;
}

export async function getQuote(id: string) {
  const supabase = await createClient();

  const [
    quoteResult,
    itemsResult,
    historyResult,
    activitiesResult,
    tasksResult,
    activityResultsResult,
    lossReasonsResult,
    closuresResult,
    relationsResult,
  ] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        `
        *,
        contactos (
          id,
          nombre,
          apellido,
          cargo,
          telefono,
          whatsapp,
          correo,
          preferencia_contacto
        ),
        empresas (
          id,
          razon_social,
          nombre_fantasia,
          rut,
          giro
        ),
        proyectos (
          id,
          nombre,
          direccion,
          comuna,
          ciudad,
          region,
          tipo_proyecto,
          tipo_obra,
          metros_cuadrados_estimados
        ),
        oportunidades (
          id,
          nombre,
          etapa_comercial,
          probabilidad_cierre,
          temperatura,
          prioridad,
          fecha_estimada_cierre,
          estado,
          proxima_accion,
          fecha_proxima_accion
        ),
        external_sources (
          id,
          codigo,
          nombre,
          tipo_integracion,
          estado,
          ultima_sincronizacion
        ),
        loss_reasons (
          id,
          codigo,
          nombre,
          requiere_comentario
        )
      `,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("quote_items")
      .select("*")
      .eq("cotizacion_id", id)
      .order("posicion", { ascending: true }),

    Promise.resolve({
      data: [] as Record<string, unknown>[],
      error: null,
    }),

    supabase
      .from("activities")
      .select(
        `
        *,
        activity_results (
          id,
          codigo,
          nombre,
          requiere_proxima_accion,
          requiere_fecha,
          requiere_comentario,
          cierra_oportunidad,
          resultado_cierre
        )
      `,
      )
      .eq("cotizacion_id", id)
      .order("fecha_hora_inicio", { ascending: false }),

    supabase
      .from("tasks")
      .select("*")
      .eq("cotizacion_id", id)
      .order("fecha_hora_vencimiento", { ascending: true }),

    supabase
      .from("activity_results")
      .select("*")
      .eq("estado", "activo")
      .order("orden", { ascending: true }),

    supabase
      .from("loss_reasons")
      .select("*")
      .eq("estado", "activo")
      .order("orden", { ascending: true }),

    supabase
      .from("commercial_closures")
      .select(
        `
        *,
        loss_reasons (
          id,
          codigo,
          nombre
        )
      `,
      )
      .eq("cotizacion_ganadora_id", id)
      .order("fecha_cierre", { ascending: false }),

    supabase
      .from("quote_relations")
      .select("*")
      .or(`cotizacion_origen_id.eq.${id},cotizacion_relacionada_id.eq.${id}`)
      .order("created_at", { ascending: false }),
  ]);

  if (quoteResult.error) throw new Error(quoteResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (activitiesResult.error) throw new Error(activitiesResult.error.message);
  if (tasksResult.error) throw new Error(tasksResult.error.message);
  if (activityResultsResult.error) {
    throw new Error(activityResultsResult.error.message);
  }
  if (lossReasonsResult.error) {
    throw new Error(lossReasonsResult.error.message);
  }
  if (closuresResult.error) throw new Error(closuresResult.error.message);
  if (relationsResult.error) throw new Error(relationsResult.error.message);

  const quote = quoteResult.data;
  let responsibleProfile = null;

  if (quote.ejecutivo_responsable_id) {
    const responsibleResult = await supabase
      .from("profiles")
      .select("id,nombre,apellido,correo,telefono,cargo,rol,estado")
      .eq("id", quote.ejecutivo_responsable_id)
      .maybeSingle();

    if (responsibleResult.error) {
      throw new Error(responsibleResult.error.message);
    }

    responsibleProfile = responsibleResult.data;
  }

  const tasks = tasksResult.data ?? [];
  const pendingTasks = tasks.filter(
    (task) => task.estado === "pendiente" || task.estado === "en_curso",
  );
  const completedTasks = tasks.filter(
    (task) => task.estado === "completada" || task.estado === "cancelada",
  );
  const overdueTasks = pendingTasks.filter((task) => {
    if (!task.fecha_hora_vencimiento) return false;
    return new Date(task.fecha_hora_vencimiento).getTime() < Date.now();
  });
  const nextPendingTask =
    pendingTasks.find((task) => {
      if (!task.fecha_hora_vencimiento) return false;
      return new Date(task.fecha_hora_vencimiento).getTime() >= Date.now();
    }) ?? null;

  const requiresCommercialAction =
    !quote.fecha_proximo_seguimiento &&
    [
      "Importada",
      "Pendiente de asignación",
      "Pendiente de contacto",
      "Enviada",
      "Recibida por el cliente",
      "Contacto intentado",
      "En evaluación",
      "Requiere aclaración",
      "Requiere nueva cotización",
      "En negociación",
    ].includes(quote.estado_comercial);

  return {
    ...quote,
    quote_items: itemsResult.data ?? [],
    state_history: historyResult.data ?? [],
    activities: activitiesResult.data ?? [],
    tasks,
    pending_tasks: pendingTasks,
    completed_tasks: completedTasks,
    overdue_tasks: overdueTasks,
    next_pending_task: nextPendingTask,
    last_activity: activitiesResult.data?.[0] ?? null,
    activity_results: activityResultsResult.data ?? [],
    loss_reasons: lossReasonsResult.data ?? [],
    commercial_closures: closuresResult.data ?? [],
    quote_relations: relationsResult.data ?? [],
    responsible_profile: responsibleProfile,
    commercial_indicators: {
      has_pending_follow_up: pendingTasks.length > 0,
      has_overdue_follow_up: overdueTasks.length > 0,
      requires_commercial_action: requiresCommercialAction,
    },
  };
}
