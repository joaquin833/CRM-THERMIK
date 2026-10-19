import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

const confirmSchema = z
  .object({
    companyMode: z.enum(["individual", "existing", "new"]),
    existingCompanyId: z.string().uuid().optional().nullable(),
    companyLegalName: optionalText(250),
    companyTradeName: optionalText(250),
    companyRut: optionalText(30),
    companyBusinessActivity: optionalText(250),
    companyAddress: optionalText(500),
    companyCommune: optionalText(150),
    companyCity: optionalText(150),
    companyRegion: optionalText(150),
    companySegment: optionalText(100),
    companyOrigin: optionalText(100),
    nextAction: z.string().trim().min(1).max(1000),
    nextAt: z.string().datetime({ offset: true }),
    priority: z.enum(["baja", "media", "alta", "urgente"]),
    reminderMinutes: z.number().int().min(0).max(43200),
  })
  .superRefine((input, context) => {
    if (input.companyMode === "existing" && !input.existingCompanyId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["existingCompanyId"],
        message: "Seleccione una empresa existente.",
      });
    }

    if (input.companyMode === "new" && !input.companyLegalName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyLegalName"],
        message: "La razon social es obligatoria.",
      });
    }

    if (new Date(input.nextAt).getTime() <= Date.now()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextAt"],
        message: "La fecha del seguimiento debe ser futura.",
      });
    }
  });

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const profile = await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);
    const { id } = await context.params;
    const supabase = await createClient();

    const [companiesResult, importResult, catalogsResult] = await Promise.all([
      supabase
        .from("empresas")
        .select("id,razon_social,nombre_fantasia,rut,segmento,estado")
        .eq("organization_id", profile.organization_id)
        .is("deleted_at", null)
        .order("razon_social", { ascending: true }),
      supabase
        .from("quote_pdf_imports")
        .select("id,status,parsed_data,matched_company_id,imported_quote_id")
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle(),
      supabase.rpc("get_company_catalogs"),
    ]);

    if (companiesResult.error) throw new Error(companiesResult.error.message);
    if (importResult.error) throw new Error(importResult.error.message);
    if (!importResult.data) throw new Error("No se encontro la importacion.");

    return NextResponse.json({
      companies: companiesResult.data ?? [],
      importRecord: importResult.data,
      catalogs: catalogsResult.error ? null : catalogsResult.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cargar las empresas.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);

    const { id } = await context.params;
    const input = confirmSchema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "confirm_quote_pdf_import_with_company",
      {
        p_import_id: id,
        p_company_mode: input.companyMode,
        p_existing_company_id:
          input.companyMode === "existing" ? input.existingCompanyId : null,
        p_company_legal_name:
          input.companyMode === "new" ? input.companyLegalName : null,
        p_company_trade_name:
          input.companyMode === "new" ? input.companyTradeName : null,
        p_company_rut: input.companyMode === "new" ? input.companyRut : null,
        p_company_business_activity:
          input.companyMode === "new" ? input.companyBusinessActivity : null,
        p_company_address:
          input.companyMode === "new" ? input.companyAddress : null,
        p_company_commune:
          input.companyMode === "new" ? input.companyCommune : null,
        p_company_city: input.companyMode === "new" ? input.companyCity : null,
        p_company_region:
          input.companyMode === "new" ? input.companyRegion : null,
        p_company_segment:
          input.companyMode === "new" ? input.companySegment : null,
        p_company_origin:
          input.companyMode === "new"
            ? (input.companyOrigin ?? "Cotizacion PDF")
            : null,
        p_next_action: input.nextAction,
        p_next_at: input.nextAt,
        p_priority: input.priority,
        p_reminder_minutes: input.reminderMinutes,
      },
    );

    if (error) throw new Error(translateDatabaseError(error.message));

    const result = asRecord(data);
    const quoteId = readString(result.quote_id);
    if (!quoteId)
      throw new Error("La confirmacion no devolvio una cotizacion valida.");

    return NextResponse.json({
      success: true,
      message: result.already_confirmed
        ? "La importacion ya estaba confirmada."
        : "Cotizacion confirmada correctamente.",
      quoteId,
      companyId: readString(result.company_id),
      companyCreated: result.company_created === true,
      companyMode: readString(result.company_mode) ?? input.companyMode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Revise los datos ingresados.",
          details: error.flatten(),
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible confirmar la importacion.",
      },
      { status: 400 },
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function translateDatabaseError(message: string): string {
  if (message.includes("Ya existe una empresa activa con este RUT")) {
    return "Ya existe una empresa activa con este RUT. Seleccione la empresa existente.";
  }
  if (message.includes("RUT de la empresa no es valido")) {
    return "El RUT de la empresa no es valido.";
  }
  if (message.includes("empresa seleccionada no existe")) {
    return "La empresa seleccionada no existe o esta archivada.";
  }
  if (
    message.includes("numero de cotizacion") ||
    message.includes("cotizacion ya existe")
  ) {
    return "La cotizacion ya fue importada anteriormente.";
  }
  return message;
}
