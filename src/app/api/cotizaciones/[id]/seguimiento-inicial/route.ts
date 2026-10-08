import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const inputSchema = z.object({
  action: z.string().trim().min(1).max(500),
  dueAt: z.string().datetime({ offset: true }),
  priority: z.enum(["baja", "media", "alta", "urgente"]),
  reminderMinutes: z.union([z.number().int().nonnegative(), z.null()]),
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

    if (new Date(input.dueAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "La fecha del seguimiento debe ser futura." },
        { status: 422 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "create_initial_quote_followup",
      {
        p_quote_id: id,
        p_action: input.action,
        p_due_at: input.dueAt,
        p_priority: input.priority,
        p_reminder_minutes: input.reminderMinutes,
      },
    );

    if (error) {
      throw new Error(translateError(error.message));
    }

    return NextResponse.json({
      success: true,
      message: "Primer seguimiento programado correctamente.",
      followUp: data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Revisa los datos del seguimiento." },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible programar el seguimiento.",
      },
      { status: 400 },
    );
  }
}

function translateError(message: string): string {
  if (message.includes("fecha del seguimiento debe ser futura")) {
    return "La fecha del seguimiento debe ser futura.";
  }
  if (message.includes("no tiene un contacto vinculado")) {
    return "La cotización no tiene un contacto vinculado.";
  }
  if (message.includes("no tiene un responsable asignado")) {
    return "La cotización no tiene un responsable asignado.";
  }
  if (message.includes("No esta autorizado")) {
    return "No estás autorizado para programar seguimientos.";
  }
  return message;
}
