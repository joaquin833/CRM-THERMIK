import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  channel: z.enum(["Llamada", "WhatsApp", "Correo", "Reunion", "Otro"]),
  receivedAt: z.string().datetime({ offset: true }),
  confirmedBy: z.string().trim().max(200).nullable().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
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
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "confirm_quote_received_milestone",
      {
        p_quote_id: id,
        p_channel: input.channel,
        p_received_at: input.receivedAt,
        p_confirmed_by: input.confirmedBy ?? null,
        p_comment: input.comment ?? null,
      },
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      message:
        "Hito de recepción registrado. Programa la próxima tarea en Registrar seguimiento.",
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
