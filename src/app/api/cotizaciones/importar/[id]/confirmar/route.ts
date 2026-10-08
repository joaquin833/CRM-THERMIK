import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: Request,
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
        { error: "Debe indicar una importación." },
        { status: 422 }
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "confirm_quote_pdf_import",
      { p_import_id: id }
    );

    if (error) {
      throw new Error(translateDatabaseError(error.message));
    }

    const result = data as {
      success?: boolean;
      quote_id?: string;
      quote_number?: string;
      already_confirmed?: boolean;
    } | null;

    if (!result?.quote_id) {
      throw new Error(
        "La confirmación terminó sin devolver la cotización creada."
      );
    }

    return NextResponse.json({
      success: true,
      message: result.already_confirmed
        ? "La cotización ya estaba confirmada."
        : `Cotización N.º ${result.quote_number ?? ""} importada correctamente.`,
      quoteId: result.quote_id,
      quoteNumber: result.quote_number ?? null,
      alreadyConfirmed: Boolean(result.already_confirmed),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible confirmar la importación.",
      },
      { status: 400 }
    );
  }
}

function translateDatabaseError(message: string): string {
  if (message.includes("debe estar lista para vincular")) {
    return "Guarda la revisión y corrige los errores antes de confirmar.";
  }

  if (message.includes("errores de validacion")) {
    return "La importación todavía contiene errores de validación.";
  }

  if (message.includes("ya existe en el CRM")) {
    return message;
  }

  if (message.includes("No esta autorizado")) {
    return "No estás autorizado para confirmar esta importación.";
  }

  if (message.includes("Importacion no encontrada")) {
    return "No se encontró la importación solicitada.";
  }

  return message;
}
