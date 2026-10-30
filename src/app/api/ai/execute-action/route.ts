import { NextResponse } from "next/server";

import { executeActionSchema } from "@/lib/ai/action-schemas";
import { authorizeAI } from "@/lib/ai/security";
import { syncTask } from "@/lib/google/calendar";

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof authorizeAI>> | undefined;

  try {
    const action = executeActionSchema.parse(await request.json());
    context = await authorizeAI("execute_action");
    const now = new Date();

    if (action.type === "create_task") {
      const start = new Date(action.payload.start_at);
      const due = new Date(action.payload.due_at);
      validateDates(start, due, now);

      const { relations: _relations, ...taskPayload } = action.payload;
      const verifiedRelations = await verifyRelations(context.supabase, taskPayload);

      const { data: task, error } = await context.supabase
        .from("tasks")
        .insert({
          ...taskPayload,
          assigned_to: context.profile.id,
          created_by: context.profile.id,
          status: "pending",
          google_sync_status: "not_synced",
          metadata: {
            source: "thermikhaus_ai",
            confirmed_by: context.profile.id,
            confirmed_at: now.toISOString(),
          },
        })
        .select("*")
        .single();

      if (error || !task) throw error ?? new Error("No fue posible crear la actividad");
      const calendar = await trySync(context.profile.id, task.id);
      await context.log("success", undefined, [{ type: "task", id: task.id }]);

      return NextResponse.json({
        success: true,
        message: "Actividad creada correctamente.",
        task,
        calendar,
        relations: verifiedRelations,
        url: "/agenda",
      });
    }

    const start = new Date(action.payload.start_at);
    const due = new Date(action.payload.due_at);
    validateDates(start, due, now);

    const { data: task, error } = await context.supabase
      .from("tasks")
      .update({
        start_at: action.payload.start_at,
        due_at: action.payload.due_at,
        reminder_at: action.payload.reminder_at,
        all_day: action.payload.all_day,
        google_sync_status: "pending",
        metadata: {
          source: "thermikhaus_ai_reschedule",
          confirmed_by: context.profile.id,
          confirmed_at: now.toISOString(),
        },
      })
      .eq("id", action.payload.task_id)
      .eq("assigned_to", context.profile.id)
      .select("*")
      .single();

    if (error || !task) throw error ?? new Error("Actividad no encontrada o no autorizada");
    const calendar = await trySync(context.profile.id, task.id);
    await context.log("success", undefined, [{ type: "task", id: task.id }]);

    return NextResponse.json({
      success: true,
      message: "Actividad reprogramada correctamente.",
      task,
      calendar,
      url: "/agenda",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al ejecutar la acción";
    await context?.log("error", undefined, [], message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function verifyRelations(
  supabase: Awaited<ReturnType<typeof authorizeAI>>["supabase"],
  payload: {
    contact_id: string | null; company_id: string | null; project_id: string | null;
    opportunity_id: string | null; quote_id: string | null;
  },
) {
  const [contact, company, project, opportunity, quote] = await Promise.all([
    relation(supabase, "contactos", payload.contact_id, "nombre,apellido"),
    relation(supabase, "empresas", payload.company_id, "razon_social,nombre_fantasia"),
    relation(supabase, "proyectos", payload.project_id, "nombre"),
    relation(supabase, "oportunidades", payload.opportunity_id, "nombre"),
    relation(supabase, "cotizaciones", payload.quote_id, "numero_cotizacion"),
  ]);

  return { contact, company, project, opportunity, quote };
}

async function relation(
  supabase: Awaited<ReturnType<typeof authorizeAI>>["supabase"],
  table: "contactos" | "empresas" | "proyectos" | "oportunidades" | "cotizaciones",
  id: string | null,
  columns: string,
) {
  if (!id) return null;
  const { data, error } = await supabase.from(table).select(`id,${columns}`).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`La relación ${table} no existe o no está autorizada`);
  return data;
}

function validateDates(start: Date, due: Date, now: Date) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) {
    throw new Error("La acción contiene una fecha inválida");
  }
  if (due.getTime() <= start.getTime()) {
    throw new Error("El vencimiento debe ser posterior al inicio");
  }
  if (due.getTime() < now.getTime()) {
    throw new Error("No se puede programar una actividad en el pasado");
  }
}

async function trySync(userId: string, taskId: string) {
  try {
    const event = await syncTask(userId, taskId);
    return { synced: true, eventId: event.id ?? null };
  } catch (error) {
    return {
      synced: false,
      error: error instanceof Error ? error.message : "Google Calendar no disponible",
    };
  }
}
