import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const text = value?.trim();
    return text ? text : null;
  });

const updateContactSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  apellido: optionalText,
  cargo: optionalText,
  telefono: optionalText,
  whatsapp: optionalText,
  correo: optionalText,
  direccion: optionalText,
  comuna: optionalText,
  ciudad: optionalText,
  region: optionalText,
  tipo_contacto: optionalText,
  preferencia_contacto: optionalText,
  origen: optionalText,
  estado: z.enum(["activo", "inactivo", "no_contactar"]),
  empresa_id: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => value || null),
  consentimiento_comunicaciones: z.boolean().default(false),
  observaciones: optionalText,
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const contactId = z.string().uuid().parse(id);
    const body = updateContactSchema.parse(await request.json());

    if (!body.correo && !body.telefono && !body.whatsapp) {
      return NextResponse.json(
        {
          error: "Debes registrar al menos un correo, teléfono o WhatsApp.",
        },
        { status: 400 },
      );
    }

    if (body.tipo_contacto === "Contacto de empresa" && !body.empresa_id) {
      return NextResponse.json(
        { error: "Debes seleccionar una empresa para este tipo de contacto." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_contact", {
      p_contact_id: contactId,
      p_nombre: body.nombre,
      p_apellido: body.apellido,
      p_cargo: body.cargo,
      p_telefono: body.telefono,
      p_whatsapp: body.whatsapp,
      p_correo: body.correo,
      p_direccion: body.direccion,
      p_comuna: body.comuna,
      p_ciudad: body.ciudad,
      p_region: body.region,
      p_tipo_contacto: body.tipo_contacto,
      p_preferencia_contacto: body.preferencia_contacto,
      p_origen: body.origen,
      p_estado: body.estado,
      p_empresa_id: body.empresa_id,
      p_consentimiento_comunicaciones: body.consentimiento_comunicaciones,
      p_observaciones: body.observaciones,
    });

    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        {
          error: duplicate
            ? "Ya existe otro contacto activo con este correo."
            : error.message,
          detail: error.details ?? null,
          hint: error.hint ?? null,
        },
        { status: duplicate ? 409 : 400 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Revisa los datos ingresados.",
          issues: error.flatten(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el contacto.",
      },
      { status: 500 },
    );
  }
}
