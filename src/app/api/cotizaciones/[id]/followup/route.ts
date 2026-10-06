import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const followUpSchema = z.object({
  activityType: z.enum([
    "Llamada",
    "WhatsApp",
    "Correo",
    "Reunion",
    "Visita",
    "Nota",
  ]),

  resultCode: z
    .string()
    .trim()
    .min(1),

  comment: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .nullable(),

  nextAction: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable(),

  nextAt: z
    .string()
    .datetime({
      offset: true,
    })
    .optional()
    .nullable(),

  priority: z
    .enum([
      "baja",
      "media",
      "alta",
      "urgente",
    ])
    .default("media"),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Debe indicar una cotización.",
        },
        {
          status: 422,
        }
      );
    }

    const input = followUpSchema.parse(
      await request.json()
    );

    const supabase =
      await createClient();

    const {
      data,
      error,
    } = await supabase.rpc(
      "record_quote_followup",
      {
        p_quote_id:
          id,

        p_activity_type:
          input.activityType,

        p_result_code:
          input.resultCode,

        p_comment:
          input.comment || null,

        p_next_action:
          input.nextAction || null,

        p_next_at:
          input.nextAt || null,

        p_priority:
          input.priority,
      }
    );

    if (error) {
      throw new Error(
        translateDatabaseError(
          error.message
        )
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Seguimiento registrado correctamente.",

      result:
        data,
    });
  } catch (error) {
    if (
      error instanceof z.ZodError
    ) {
      return NextResponse.json(
        {
          error:
            "Revisa los datos ingresados en el seguimiento.",

          details:
            error.flatten(),
        },
        {
          status: 422,
        }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar el seguimiento.",
      },
      {
        status: 400,
      }
    );
  }
}

function translateDatabaseError(
  message: string
) {
  if (
    message.includes(
      "Cotizacion no encontrada"
    )
  ) {
    return "No se encontró la cotización o no tienes acceso a ella.";
  }

  if (
    message.includes(
      "No esta autorizado"
    )
  ) {
    return "No estás autorizado para gestionar esta cotización.";
  }

  if (
    message.includes(
      "Resultado de seguimiento no valido"
    )
  ) {
    return "Selecciona un resultado de seguimiento válido.";
  }

  if (
    message.includes(
      "requiere un comentario"
    )
  ) {
    return "El resultado seleccionado requiere un comentario.";
  }

  if (
    message.includes(
      "requiere una proxima accion"
    )
  ) {
    return "El resultado seleccionado requiere una próxima acción.";
  }

  if (
    message.includes(
      "requiere una fecha"
    )
  ) {
    return "El resultado seleccionado requiere una fecha de seguimiento.";
  }

  if (
    message.includes(
      "debe ser futura"
    )
  ) {
    return "La fecha del próximo seguimiento debe ser futura.";
  }

  if (
    message.includes(
      "Prioridad no valida"
    )
  ) {
    return "Selecciona una prioridad válida.";
  }

  if (
    message.includes(
      "Tipo de actividad no valido"
    )
  ) {
    return "Selecciona un canal de contacto válido.";
  }

  return message;
}