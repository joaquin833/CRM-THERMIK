import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const profile = await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);

    const formData = await request.formData();
    const fileValue = formData.get("file");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        { error: "Selecciona un archivo PDF." },
        { status: 422 }
      );
    }

    const file = fileValue;
    const lowerName = file.name.toLowerCase();

    if (file.type !== "application/pdf" || !lowerName.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "El archivo debe ser un PDF válido." },
        { status: 422 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "El archivo PDF está vacío." },
        { status: 422 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El PDF supera el límite de 10 MB." },
        { status: 413 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json(
        { error: "El contenido del archivo no corresponde a un PDF válido." },
        { status: 422 }
      );
    }

    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const supabase = await createClient();

    const duplicateResult = await supabase
      .from("quote_pdf_imports")
      .select("id,status,file_name,created_at,imported_quote_id")
      .eq("organization_id", profile.organization_id)
      .eq("file_hash", fileHash)
      .neq("status", "discarded")
      .maybeSingle();

    if (duplicateResult.error) {
      throw new Error(duplicateResult.error.message);
    }

    if (duplicateResult.data) {
      return NextResponse.json(
        {
          error: "Este PDF ya fue cargado anteriormente.",
          duplicate: duplicateResult.data,
        },
        { status: 409 }
      );
    }

    const sourceResult = await supabase
      .from("external_sources")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("codigo", "SISTEMA_COTIZACIONES")
      .maybeSingle();

    if (sourceResult.error) {
      throw new Error(sourceResult.error.message);
    }

    const safeName = sanitizeFileName(file.name);
    uploadedPath = `${profile.organization_id}/quote-imports/${randomUUID()}-${safeName}`;

    const uploadResult = await supabase.storage
      .from("crm-private")
      .upload(uploadedPath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadResult.error) {
      throw new Error(uploadResult.error.message);
    }

    const insertResult = await supabase
      .from("quote_pdf_imports")
      .insert({
        organization_id: profile.organization_id,
        uploaded_by: profile.id,
        external_source_id: sourceResult.data?.id ?? null,
        file_name: file.name,
        storage_path: uploadedPath,
        file_hash: fileHash,
        mime_type: "application/pdf",
        file_size: file.size,
        status: "uploaded",
      })
      .select("id,status,file_name,file_size,created_at")
      .single();

    if (insertResult.error) {
      await supabase.storage.from("crm-private").remove([uploadedPath]);
      uploadedPath = null;
      throw new Error(insertResult.error.message);
    }

    return NextResponse.json(
      {
        success: true,
        message: "PDF cargado correctamente. Está pendiente de análisis.",
        import: insertResult.data,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cargar el PDF.",
      },
      { status: 400 }
    );
  }
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "cotizacion.pdf";
}
