import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const itemSchema = z.object({
  descripcion: z.string().trim().min(1),
  cantidad: z.number().nonnegative().nullable(),
  unidad: z.string().trim().nullable(),
  valor_unitario: z.number().nonnegative().nullable(),
  subtotal: z.number().nonnegative().nullable(),
});

const extractedQuoteSchema = z.object({
  numero_cotizacion: z.string().trim().min(1).nullable(),
  fecha_emision: z.string().trim().nullable(),
  fecha_validez: z.string().trim().nullable(),
  cliente: z.string().trim().nullable(),
  rut_cliente: z.string().trim().nullable(),
  nombre_contacto: z.string().trim().nullable(),
  telefono_contacto: z.string().trim().nullable(),
  correo_contacto: z.string().trim().nullable(),
  proyecto: z.string().trim().nullable(),
  direccion_proyecto: z.string().trim().nullable(),
  moneda: z.string().trim().default("CLP"),
  neto_afecto: z.number().nonnegative().nullable(),
  neto_exento: z.number().nonnegative().nullable(),
  iva: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(),
  metros_cuadrados: z.number().nonnegative().nullable(),
  plazo_ejecucion: z.string().trim().nullable(),
  condiciones: z.array(z.string().trim()).default([]),
  items: z.array(itemSchema).default([]),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext
) {
  try {
    const profile = await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Debe indicar una carga de PDF." },
        { status: 422 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY no está configurada.");
    }

    if (!process.env.ANTHROPIC_MODEL) {
      throw new Error("ANTHROPIC_MODEL no está configurado.");
    }

    const supabase = await createClient();

    const importResult = await supabase
      .from("quote_pdf_imports")
      .select("id,organization_id,file_name,storage_path,status")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (importResult.error || !importResult.data) {
      return NextResponse.json(
        { error: "No se encontró la carga de PDF." },
        { status: 404 }
      );
    }

    if (importResult.data.status === "confirmed") {
      return NextResponse.json(
        { error: "Esta cotización ya fue importada." },
        { status: 409 }
      );
    }

    await supabase
      .from("quote_pdf_imports")
      .update({
        status: "analyzing",
        error_message: null,
      })
      .eq("id", id);

    const downloadResult = await supabase.storage
      .from("crm-private")
      .download(importResult.data.storage_path);

    if (downloadResult.error || !downloadResult.data) {
      throw new Error(
        downloadResult.error?.message ?? "No fue posible leer el PDF."
      );
    }

    const pdfBuffer = Buffer.from(
      await downloadResult.data.arrayBuffer()
    );

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: extractionPrompt(),
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find(
      (block) => block.type === "text"
    );

    if (!textBlock || textBlock.type !== "text") {
      throw new Error("El analizador no entregó una respuesta de texto.");
    }

    const rawJson = removeCodeFence(textBlock.text);
    const parsedUnknown: unknown = JSON.parse(rawJson);
    const parsed = extractedQuoteSchema.parse(parsedUnknown);

    const validation = validateExtractedQuote(parsed);
    const duplicateQuote = parsed.numero_cotizacion
      ? await findDuplicateQuote(
          supabase,
          profile.organization_id,
          parsed.numero_cotizacion
        )
      : null;

    const warnings = [...validation.warnings];

    if (duplicateQuote) {
      warnings.push(
        `La cotización N.º ${parsed.numero_cotizacion} ya existe en el CRM.`
      );
    }

    const nextStatus = duplicateQuote
      ? "duplicate"
      : validation.errors.length > 0
        ? "review"
        : "ready";

    const updateResult = await supabase
      .from("quote_pdf_imports")
      .update({
        extraction_method: "hybrid",
        parsed_data: parsed,
        validation_errors: validation.errors,
        validation_warnings: warnings,
        confidence: buildConfidence(parsed),
        status: nextStatus,
        analyzed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", id)
      .select(
        "id,status,parsed_data,validation_errors,validation_warnings,confidence,analyzed_at"
      )
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return NextResponse.json({
      success: true,
      message:
        nextStatus === "ready"
          ? "PDF analizado. Los datos están listos para revisión."
          : nextStatus === "duplicate"
            ? "PDF analizado, pero la cotización ya existe."
            : "PDF analizado. Algunos datos requieren revisión.",
      analysis: updateResult.data,
      duplicateQuote,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    });
  } catch (error) {
    const { id } = await context.params;

    try {
      const supabase = await createClient();
      await supabase
        .from("quote_pdf_imports")
        .update({
          status: "error",
          error_message:
            error instanceof Error
              ? error.message
              : "No fue posible analizar el PDF.",
        })
        .eq("id", id);
    } catch {
      // No oculta el error original si tampoco se puede actualizar el estado.
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? translateError(error.message)
            : "No fue posible analizar el PDF.",
      },
      { status: 400 }
    );
  }
}

function extractionPrompt(): string {
  return `
Analiza esta cotización comercial de Thermikhaus.
Extrae únicamente información visible en el PDF.
No inventes ni completes datos ausentes.
Devuelve exclusivamente JSON válido, sin Markdown y sin texto adicional.

Usa exactamente esta estructura:
{
  "numero_cotizacion": "texto o null",
  "fecha_emision": "YYYY-MM-DD o null",
  "fecha_validez": "YYYY-MM-DD o null",
  "cliente": "texto o null",
  "rut_cliente": "texto o null",
  "nombre_contacto": "texto o null",
  "telefono_contacto": "texto o null",
  "correo_contacto": "texto o null",
  "proyecto": "texto o null",
  "direccion_proyecto": "texto o null",
  "moneda": "CLP",
  "neto_afecto": 0,
  "neto_exento": 0,
  "iva": 0,
  "total": 0,
  "metros_cuadrados": 0,
  "plazo_ejecucion": "texto o null",
  "condiciones": ["texto"],
  "items": [
    {
      "descripcion": "texto",
      "cantidad": 0,
      "unidad": "texto o null",
      "valor_unitario": 0,
      "subtotal": 0
    }
  ]
}

Reglas:
- Los montos deben ser números enteros sin símbolo de moneda ni separadores.
- Usa null cuando un dato no aparece claramente.
- neto_afecto, neto_exento, iva y total deben corresponder al resumen oficial.
- No confundas datos de Thermikhaus, del vendedor o del emisor con los datos del cliente.
- telefono_contacto debe corresponder al cliente o contacto destinatario. Si no es inequívoco, usa null.
- correo_contacto debe corresponder al cliente o contacto destinatario. Si no es inequívoco, usa null.
- Normaliza teléfonos chilenos a un formato legible, preferentemente +56 9 XXXX XXXX, sin inventar dígitos.
- El número de cotización es la referencia comercial principal.
- Conserva los ítems en el orden del documento.
`;
}

function removeCodeFence(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function validateExtractedQuote(
  quote: z.infer<typeof extractedQuoteSchema>
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!quote.numero_cotizacion) {
    errors.push("No se pudo identificar el número de cotización.");
  }

  if (!quote.fecha_emision) {
    warnings.push("No se pudo identificar la fecha de emisión.");
  }

  if (!quote.proyecto) {
    warnings.push("No se pudo identificar el proyecto.");
  }

  if (quote.total === null) {
    errors.push("No se pudo identificar el total de la cotización.");
  }

  const neto =
    (quote.neto_afecto ?? 0) + (quote.neto_exento ?? 0);

  if (quote.total !== null && quote.iva !== null) {
    const calculatedTotal = neto + quote.iva;

    if (Math.abs(calculatedTotal - quote.total) > 1) {
      errors.push(
        `Los montos no cuadran: neto más IVA es ${calculatedTotal}, pero el total es ${quote.total}.`
      );
    }
  }

  if (quote.items.length === 0) {
    warnings.push("No se identificaron ítems estructurados.");
  }

  return { errors, warnings };
}

function buildConfidence(
  quote: z.infer<typeof extractedQuoteSchema>
): Record<string, number> {
  return {
    numero_cotizacion: quote.numero_cotizacion ? 1 : 0,
    fecha_emision: quote.fecha_emision ? 0.9 : 0,
    cliente: quote.cliente ? 0.7 : 0,
    nombre_contacto: quote.nombre_contacto ? 0.7 : 0,
    telefono_contacto: quote.telefono_contacto ? 0.75 : 0,
    correo_contacto: quote.correo_contacto ? 0.8 : 0,
    proyecto: quote.proyecto ? 0.8 : 0,
    neto: quote.neto_afecto !== null ? 0.95 : 0,
    iva: quote.iva !== null ? 0.95 : 0,
    total: quote.total !== null ? 0.95 : 0,
    items: quote.items.length > 0 ? 0.8 : 0,
  };
}

async function findDuplicateQuote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  quoteNumber: string
) {
  const normalized = quoteNumber
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

  const result = await supabase
    .from("cotizaciones")
    .select("id,numero_cotizacion,estado_comercial")
    .eq("organization_id", organizationId)
    .eq("numero_cotizacion_normalizado", normalized)
    .is("deleted_at", null)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

function translateError(message: string): string {
  if (message.includes("credit balance")) {
    return "La cuenta de Anthropic no dispone de saldo suficiente.";
  }

  if (message.includes("invalid x-api-key")) {
    return "La clave de Anthropic no es válida.";
  }

  if (message.includes("Could not process PDF")) {
    return "El PDF no pudo ser procesado. Comprueba que no tenga contraseña.";
  }

  if (message.includes("JSON")) {
    return "El analizador no devolvió datos estructurados válidos.";
  }

  return message;
}
