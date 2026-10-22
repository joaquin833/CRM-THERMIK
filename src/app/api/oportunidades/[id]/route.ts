import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

const schema = z.object({
  nombre: z.string().trim().min(1).max(250),
  montoEstimado: z.coerce.number().nonnegative().nullable().optional(),
  contactoId: z.string().uuid(),
  empresaId: z.string().uuid().nullable().optional(),
  proyectoId: z.string().uuid(),
  prioridad: z.enum(["Baja", "Media", "Alta", "Crítica"]),
  temperatura: z.enum(["Fría", "Tibia", "Caliente"]),
  fechaEstimadaCierre: z.string().date().nullable().optional(),
  proximaAccion: z.string().trim().max(500).nullable().optional(),
  fechaProximaAccion: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  observaciones: z.string().trim().max(5000).nullable().optional(),
});

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const opportunityId = z.string().uuid().parse(id);
    const input = schema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("update_opportunity", {
      p_opportunity_id: opportunityId,
      p_nombre: input.nombre,
      p_monto_estimado: input.montoEstimado ?? null,
      p_contacto_id: input.contactoId,
      p_empresa_id: input.empresaId ?? null,
      p_proyecto_id: input.proyectoId,
      p_prioridad: input.prioridad,
      p_temperatura: input.temperatura,
      p_fecha_estimada_cierre: input.fechaEstimadaCierre ?? null,
      p_proxima_accion: input.proximaAccion ?? null,
      p_fecha_proxima_accion: input.fechaProximaAccion ?? null,
      p_observaciones: input.observaciones ?? null,
    });

    if (error) {
      const status = error.message.toLowerCase().includes("no autorizado")
        ? 403
        : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(data ?? { opportunity_id: opportunityId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Revisa los campos obligatorios de la oportunidad.",
          issues: error.issues,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar la oportunidad.",
      },
      { status: 500 },
    );
  }
}
