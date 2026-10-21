import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

const schema = z.object({
  nombre: z.string().trim().min(1).max(250),
  contactoPrincipalId: z.string().uuid().nullable().optional(),
  empresaId: z.string().uuid().nullable().optional(),
  direccion: z.string().trim().max(500).nullable().optional(),
  comuna: z.string().trim().max(150).nullable().optional(),
  ciudad: z.string().trim().max(150).nullable().optional(),
  region: z.string().trim().max(150).nullable().optional(),
  tipoProyecto: z.string().trim().max(100).nullable().optional(),
  tipoObra: z.string().trim().max(100).nullable().optional(),
  metrosCuadradosEstimados: z.coerce
    .number()
    .nonnegative()
    .nullable()
    .optional(),
  estado: z.string().trim().min(1),
  observaciones: z.string().trim().max(5000).nullable().optional(),
});

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const projectId = z.string().uuid().parse(id);
    const input = schema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("update_project", {
      p_project_id: projectId,
      p_nombre: input.nombre,
      p_contacto_principal_id: input.contactoPrincipalId ?? null,
      p_empresa_id: input.empresaId ?? null,
      p_direccion: input.direccion ?? null,
      p_comuna: input.comuna ?? null,
      p_ciudad: input.ciudad ?? null,
      p_region: input.region ?? null,
      p_tipo_proyecto: input.tipoProyecto ?? null,
      p_tipo_obra: input.tipoObra ?? null,
      p_metros_cuadrados_estimados: input.metrosCuadradosEstimados ?? null,
      p_estado: input.estado,
      p_observaciones: input.observaciones ?? null,
    });

    if (error) {
      const status = error.message.toLowerCase().includes("no autorizado")
        ? 403
        : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(data ?? { project_id: projectId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Revisa los campos obligatorios del proyecto.",
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
            : "No fue posible actualizar el proyecto.",
      },
      { status: 500 },
    );
  }
}
