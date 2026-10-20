import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const schema = z
  .object({
    companyMode: z.enum(["individual", "existing", "new"]),
    existingCompanyId: z.string().uuid().optional().nullable(),
    companyLegalName: optionalText(250),
    companyTradeName: optionalText(250),
    companyRut: optionalText(30),
    companyBusinessActivity: optionalText(250),
    companyWebsite: optionalText(300),
    companyAddress: optionalText(500),
    companyCommune: optionalText(150),
    companyCity: optionalText(150),
    companyRegion: optionalText(150),
    companySegment: optionalText(100),
    companyOrigin: optionalText(100),
    companyNotes: optionalText(3000),
    linkContact: z.boolean().default(true),
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
  });

export async function GET(_request: Request, context: RouteContext) {
  try {
    const profile = await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
      "consulta",
    ]);
    const { id } = await context.params;
    const supabase = await createClient();

    const [quoteResult, companiesResult, catalogsResult] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select(
          `
          id,
          numero_cotizacion,
          empresa_id,
          contacto_id,
          empresas (id, razon_social, nombre_fantasia, rut),
          contactos (id, nombre, apellido, empresa_id, tipo_contacto)
        `,
        )
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("empresas")
        .select("id,razon_social,nombre_fantasia,rut,segmento,estado")
        .eq("organization_id", profile.organization_id)
        .is("deleted_at", null)
        .order("razon_social", { ascending: true }),
      supabase.rpc("get_company_catalogs"),
    ]);

    if (quoteResult.error) throw new Error(quoteResult.error.message);
    if (!quoteResult.data) throw new Error("No se encontro la cotizacion.");
    if (companiesResult.error) throw new Error(companiesResult.error.message);

    return NextResponse.json({
      quote: quoteResult.data,
      companies: companiesResult.data ?? [],
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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "relink_existing_quote_company",
      {
        p_quote_id: id,
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
        p_company_website:
          input.companyMode === "new" ? input.companyWebsite : null,
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
        p_company_notes:
          input.companyMode === "new" ? input.companyNotes : null,
        p_link_contact: input.linkContact,
      },
    );

    if (error) throw new Error(translateError(error.message));

    return NextResponse.json({
      success: true,
      message: "Empresa de la cotizacion actualizada correctamente.",
      result: data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Revise los datos ingresados." },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar la empresa.",
      },
      { status: 400 },
    );
  }
}

function translateError(message: string): string {
  if (message.includes("Ya existe una empresa activa con este RUT")) {
    return "Ya existe una empresa activa con este RUT. Seleccione la empresa existente.";
  }
  if (message.includes("RUT de la empresa no es valido")) {
    return "El RUT de la empresa no es valido.";
  }
  if (message.includes("empresa seleccionada no existe")) {
    return "La empresa seleccionada no existe o esta archivada.";
  }
  return message;
}
