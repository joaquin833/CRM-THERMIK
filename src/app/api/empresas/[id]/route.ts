import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => value?.trim() || null);

const schema = z.object({
  razon_social: z.string().trim().min(1, "La razón social es obligatoria."),
  nombre_fantasia: optionalText,
  rut: optionalText,
  giro: optionalText,
  pagina_web: optionalText,
  direccion: optionalText,
  comuna: optionalText,
  ciudad: optionalText,
  region: optionalText,
  segmento: optionalText,
  origen: optionalText,
  estado: z.enum(["activo", "inactivo"]),
  observaciones: optionalText,
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const companyId = z.string().uuid().parse(id);
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("update_company", {
      p_company_id: companyId,
      p_razon_social: body.razon_social,
      p_nombre_fantasia: body.nombre_fantasia,
      p_rut: body.rut,
      p_giro: body.giro,
      p_pagina_web: body.pagina_web,
      p_direccion: body.direccion,
      p_comuna: body.comuna,
      p_ciudad: body.ciudad,
      p_region: body.region,
      p_segmento: body.segmento,
      p_origen: body.origen,
      p_estado: body.estado,
      p_observaciones: body.observaciones,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, detail: error.details ?? null },
        { status: error.code === "23505" ? 409 : 400 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Revisa los datos ingresados.", issues: error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar la empresa.",
      },
      { status: 500 },
    );
  }
}
