import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const nullableText = z
  .union([z.string().trim(), z.null()])
  .transform((value) => (value === "" ? null : value));

const nullableMoney = z
  .union([z.number().int().nonnegative(), z.null()]);

const reviewSchema = z.object({
  numero_cotizacion: z.string().trim().min(1).max(100),
  fecha_emision: nullableText,
  fecha_validez: nullableText,
  cliente: nullableText,
  rut_cliente: nullableText,
  nombre_contacto: nullableText,
  telefono_contacto: nullableText,
  correo_contacto: z
    .union([z.string().trim().email(), z.literal(""), z.null()])
    .transform((value) => (value === "" ? null : value)),
  proyecto: nullableText,
  direccion_proyecto: nullableText,
  moneda: z.string().trim().min(1).max(10).default("CLP"),
  neto_afecto: nullableMoney,
  neto_exento: nullableMoney,
  iva: nullableMoney,
  total: nullableMoney,
  metros_cuadrados: z
    .union([z.number().nonnegative(), z.null()]),
  plazo_ejecucion: nullableText,
  condiciones: z.array(z.string().trim()).default([]),
  items: z.array(
    z.object({
      descripcion: z.string().trim().min(1),
      cantidad: z.union([z.number().nonnegative(), z.null()]),
      unidad: nullableText,
      valor_unitario: nullableMoney,
      subtotal: nullableMoney,
    })
  ).default([]),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const profile = await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);
    const { id } = await context.params;
    const input = reviewSchema.parse(await request.json());
    const validation = validateQuote(input);
    const supabase = await createClient();

    const existingResult = await supabase
      .from("quote_pdf_imports")
      .select("id,status")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (existingResult.error || !existingResult.data) {
      return NextResponse.json(
        { error: "No se encontró la importación." },
        { status: 404 }
      );
    }

    if (existingResult.data.status === "confirmed") {
      return NextResponse.json(
        { error: "La importación ya fue confirmada y no puede editarse." },
        { status: 409 }
      );
    }

    const normalizedNumber = normalizeQuoteNumber(input.numero_cotizacion);
    const duplicateResult = await supabase
      .from("cotizaciones")
      .select("id,numero_cotizacion,estado_comercial")
      .eq("organization_id", profile.organization_id)
      .eq("numero_cotizacion_normalizado", normalizedNumber)
      .is("deleted_at", null)
      .maybeSingle();

    if (duplicateResult.error) {
      throw new Error(duplicateResult.error.message);
    }

    const warnings = [...validation.warnings];

    if (duplicateResult.data) {
      warnings.push(
        `La cotización N.º ${input.numero_cotizacion} ya existe en el CRM.`
      );
    }

    const nextStatus = duplicateResult.data
      ? "duplicate"
      : validation.errors.length > 0
        ? "review"
        : "ready";

    const updateResult = await supabase
      .from("quote_pdf_imports")
      .update({
        parsed_data: input,
        validation_errors: validation.errors,
        validation_warnings: warnings,
        status: nextStatus,
        error_message: null,
      })
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .select("id,status,parsed_data,validation_errors,validation_warnings")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return NextResponse.json({
      success: true,
      message:
        nextStatus === "ready"
          ? "Revisión guardada. La cotización está lista para vincular."
          : nextStatus === "duplicate"
            ? "Revisión guardada, pero el número ya existe en el CRM."
            : "Revisión guardada. Aún existen campos que debes corregir.",
      review: updateResult.data,
      duplicateQuote: duplicateResult.data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Revisa los campos ingresados.",
          details: error.flatten(),
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible guardar la revisión.",
      },
      { status: 400 }
    );
  }
}

function normalizeQuoteNumber(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

function validateQuote(
  quote: z.infer<typeof reviewSchema>
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!quote.fecha_emision) {
    warnings.push("Falta la fecha de emisión.");
  }

  if (!quote.nombre_contacto && !quote.cliente) {
    errors.push("Debes indicar un cliente o contacto.");
  }

  if (!quote.proyecto) {
    warnings.push("Falta el nombre del proyecto.");
  }

  if (quote.total === null) {
    errors.push("Debes indicar el total de la cotización.");
  }

  const neto =
    (quote.neto_afecto ?? 0) + (quote.neto_exento ?? 0);

  if (quote.total !== null && quote.iva !== null) {
    const calculated = neto + quote.iva;

    if (Math.abs(calculated - quote.total) > 1) {
      errors.push(
        `Los montos no cuadran: neto más IVA es ${calculated}, pero el total es ${quote.total}.`
      );
    }
  }

  if (!quote.telefono_contacto && !quote.correo_contacto) {
    warnings.push(
      "El contacto no tiene celular ni correo para realizar seguimiento."
    );
  }

  return { errors, warnings };
}
