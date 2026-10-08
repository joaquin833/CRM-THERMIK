import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SIGNED_URL_TTL_SECONDS = 5 * 60;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const profile = await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
      "consulta",
    ]);

    const { id } = await context.params;

    if (!id) {
      return errorResponse(
        request,
        "Debe indicar una cotización.",
        422
      );
    }

    const supabase = await createClient();
    const quoteResult = await supabase
      .from("cotizaciones")
      .select("id,numero_cotizacion,archivo_pdf_url")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (quoteResult.error) {
      throw new Error(quoteResult.error.message);
    }

    if (!quoteResult.data) {
      return errorResponse(
        request,
        "No se encontró la cotización o no tienes acceso a ella.",
        404
      );
    }

    const storagePath = quoteResult.data.archivo_pdf_url?.trim();

    if (!storagePath) {
      return errorResponse(
        request,
        "La cotización no tiene un PDF original vinculado.",
        404
      );
    }

    if (
      storagePath.startsWith("http://") ||
      storagePath.startsWith("https://")
    ) {
      return errorResponse(
        request,
        "El documento utiliza una dirección antigua y debe migrarse al almacenamiento privado.",
        409
      );
    }

    const signedResult = await supabase.storage
      .from("crm-private")
      .createSignedUrl(
        storagePath,
        SIGNED_URL_TTL_SECONDS,
        {
          download: buildDownloadName(
            quoteResult.data.numero_cotizacion
          ),
        }
      );

    if (signedResult.error || !signedResult.data?.signedUrl) {
      throw new Error(
        signedResult.error?.message ??
          "No fue posible generar el acceso temporal al PDF."
      );
    }

    return NextResponse.redirect(
      signedResult.data.signedUrl,
      {
        status: 307,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    return errorResponse(
      request,
      error instanceof Error
        ? translateError(error.message)
        : "No fue posible abrir el PDF original.",
      400
    );
  }
}

function buildDownloadName(
  quoteNumber: string
): string {
  const safeNumber = quoteNumber
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `cotizacion-${safeNumber || "documento"}.pdf`;
}

function errorResponse(
  request: Request,
  message: string,
  status: number
) {
  const acceptsHtml =
    request.headers.get("accept")?.includes("text/html") ??
    false;

  if (!acceptsHtml) {
    return NextResponse.json(
      { error: message },
      { status }
    );
  }

  return new NextResponse(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PDF no disponible</title>
</head>
<body style="font-family:Arial,sans-serif;padding:32px;color:#0f172a">
  <h1>PDF no disponible</h1>
  <p>${escapeHtml(message)}</p>
  <p><a href="javascript:history.back()">Volver a la cotización</a></p>
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function translateError(message: string): string {
  if (message.includes("Object not found")) {
    return "El PDF original no fue encontrado en el almacenamiento privado.";
  }

  if (message.includes("row-level security")) {
    return "No tienes autorización para abrir este PDF.";
  }

  return message;
}
