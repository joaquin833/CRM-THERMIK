import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  channel: z.enum([
    "Correo",
    "WhatsApp",
    "Entrega personal",
    "Portal externo",
    "Otro",
  ]),
  sentAt: z.string().datetime({ offset: true }),
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
    const { data, error } = await supabase.rpc("mark_quote_sent_milestone", {
      p_quote_id: id,
      p_channel: input.channel,
      p_sent_at: input.sentAt,
      p_comment: input.comment ?? null,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      message:
        "Hito de envío registrado. Programa la próxima tarea en Registrar seguimiento.",
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
            : "No fue posible registrar el envío.",
      },
      { status: 400 },
    );
  }
}
