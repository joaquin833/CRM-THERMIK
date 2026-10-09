import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  channel: z.enum(["Llamada", "WhatsApp", "Correo", "Reunion", "Otro"]),
  receivedAt: z.string().datetime({ offset: true }),
  confirmedBy: z.string().trim().max(200).nullable().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
  nextAction: z.string().trim().min(1),
  nextAt: z.string().datetime({ offset: true }),
  priority: z.enum(["baja", "media", "alta", "urgente"]),
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

    if (new Date(input.nextAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "La próxima fecha debe ser futura." },
        { status: 422 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "confirm_quote_received_controlled",
      {
        p_quote_id: id,
        p_channel: input.channel,
        p_received_at: input.receivedAt,
        p_confirmed_by: input.confirmedBy ?? null,
        p_comment: input.comment ?? null,
        p_next_action: input.nextAction,
        p_next_at: input.nextAt,
        p_priority: input.priority,
      },
    );

    if (error) throw new Error(error.message);
    return NextResponse.json({
      success: true,
      message: "Recepción confirmada correctamente.",
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
            : "No fue posible confirmar la recepción.",
      },
      { status: 400 },
    );
  }
}
