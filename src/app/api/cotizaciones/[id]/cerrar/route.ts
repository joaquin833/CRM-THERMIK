import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  result: z.enum(["ganada", "perdida", "postergada", "cancelada"]),
  comment: z.string().trim().max(3000).nullable().optional(),
  lossReasonId: z.string().uuid().nullable().optional(),
  competitor: z.string().trim().max(300).nullable().optional(),
  approvedAmount: z.number().int().positive().nullable().optional(),
  nextAction: z.string().trim().nullable().optional(),
  nextAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(["baja", "media", "alta", "urgente"]).default("media"),
});

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);
    const { id } = await context.params;
    const input = schema.parse(await request.json());

    if (input.result === "ganada" && !input.approvedAmount) {
      return NextResponse.json(
        { error: "Ingresa el monto aprobado." },
        { status: 422 },
      );
    }
    if (input.result === "perdida" && !input.lossReasonId) {
      return NextResponse.json(
        { error: "Selecciona un motivo de pérdida." },
        { status: 422 },
      );
    }
    if (input.result === "postergada" && (!input.nextAction || !input.nextAt)) {
      return NextResponse.json(
        { error: "La postergación requiere próxima acción y fecha." },
        { status: 422 },
      );
    }
    if (input.nextAt && new Date(input.nextAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "La próxima fecha debe ser futura." },
        { status: 422 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("close_quote_controlled", {
      p_quote_id: id,
      p_result: input.result,
      p_comment: input.comment ?? null,
      p_loss_reason_id: input.lossReasonId ?? null,
      p_competitor: input.competitor ?? null,
      p_approved_amount: input.approvedAmount ?? null,
      p_next_action: input.nextAction ?? null,
      p_next_at: input.nextAt ?? null,
      p_priority: input.priority,
    });

    if (error) throw new Error(error.message);
    return NextResponse.json({
      success: true,
      message: "Resultado comercial registrado.",
      result: data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Datos inválidos." },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cerrar la cotización.",
      },
      { status: 400 },
    );
  }
}
