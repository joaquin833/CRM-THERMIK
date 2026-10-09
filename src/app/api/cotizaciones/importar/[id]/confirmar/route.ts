import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const inputSchema = z.object({
  action: z.string().trim().min(1, "Selecciona una primera acción."),
  dueAt: z.string().datetime({ offset: true }),
  priority: z.enum(["baja", "media", "alta", "urgente"]),
  reminderMinutes: z.number().int().min(0).max(10080).nullable(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);

    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    const dueAt = new Date(input.dueAt);

    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "La fecha del seguimiento debe ser futura." },
        { status: 422 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "confirm_quote_pdf_import_with_followup",
      {
        p_import_id: id,
        p_action: input.action,
        p_due_at: dueAt.toISOString(),
        p_priority: input.priority,
        p_reminder_minutes: input.reminderMinutes,
      },
    );

    if (error) {
      throw new Error(translateDatabaseError(error.message));
    }

    const result = data as {
      success?: boolean;
      quote_id?: string;
      quote_number?: string;
      already_confirmed?: boolean;
      initial_followup_created?: boolean;
      followup?: { task_id?: string };
    } | null;

    if (!result?.quote_id) {
      throw new Error(
        "La confirmación terminó sin devolver la cotización creada.",
      );
    }

    return NextResponse.json({
      success: true,
      message: result.already_confirmed
        ? "La cotización ya estaba confirmada y su seguimiento inicial quedó actualizado."
        : `Cotización N.º ${result.quote_number ?? ""} importada con seguimiento inicial.`,
      quoteId: result.quote_id,
      quoteNumber: result.quote_number ?? null,
      taskId: result.followup?.task_id ?? null,
      alreadyConfirmed: Boolean(result.already_confirmed),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Revisa los datos ingresados." },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible confirmar la importación.",
      },
      { status: 400 },
    );
  }
}

function translateDatabaseError(message: string): string {
  if (message.includes("primera accion es obligatoria")) {
    return "Selecciona una primera acción.";
  }

  if (message.includes("fecha del seguimiento debe ser futura")) {
    return "La fecha del seguimiento debe ser futura.";
  }

  if (message.includes("debe estar lista para vincular")) {
    return "Guarda la revisión y corrige los errores antes de confirmar.";
  }

  if (message.includes("errores de validacion")) {
    return "La importación todavía contiene errores de validación.";
  }

  if (message.includes("ya existe en el CRM")) {
    return message;
  }

  if (message.includes("No esta autorizado")) {
    return "No estás autorizado para confirmar esta importación.";
  }

  if (message.includes("Importacion no encontrada")) {
    return "No se encontró la importación solicitada.";
  }

  return message;
}
