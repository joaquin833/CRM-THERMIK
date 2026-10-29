import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const entities = [
  "executive",
  "cotizaciones",
  "empresas",
  "contactos",
  "prospectos",
  "proyectos",
  "oportunidades",
  "activities",
  "tasks",
] as const;

const paramsSchema = z.object({
  entity: z.enum(entities),
  format: z.enum(["csv", "xlsx"]).default("xlsx"),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  userId: z.string().uuid().optional(),
});

type DashboardPayload = {
  meta: {
    from: string;
    to: string;
    generated_at: string;
  };
  kpis: {
    quoted_amount: { value: number; count: number; previous: number; change_pct: number | null };
    open_opportunities: { value: number; gross_amount: number };
    weighted_pipeline: { value: number; gross_amount: number };
    commercial_progress: { won: number; lost: number; total: number; rate: number };
    pending_tasks: { value: number; next_seven_days: number };
    overdue_tasks: { value: number; share: number };
    opportunities_without_next_action: number;
  };
  pipeline: Array<{
    stage: string;
    count: number;
    amount: number;
    weighted_amount: number;
    share: number;
  }>;
  monthly_evolution: Array<{
    month: string;
    quoted_amount: number;
    quote_count: number;
    opportunity_count: number;
    won_amount: number;
  }>;
  priority_opportunities: Array<Record<string, unknown>>;
  upcoming_tasks: Array<Record<string, unknown>>;
  top_clients: Array<Record<string, unknown>>;
  data_quality: {
    quotes_without_company: number;
    formal_closures: number;
  };
};

const labels: Record<string, string> = {
  id: "ID",
  numero_cotizacion: "N.º de cotización",
  fecha_emision: "Fecha de emisión",
  fecha_vencimiento: "Fecha de vencimiento",
  estado: "Estado",
  estado_comercial: "Estado comercial",
  total: "Total",
  subtotal: "Subtotal",
  iva: "IVA",
  nombre: "Nombre",
  apellido: "Apellido",
  correo: "Correo",
  telefono: "Teléfono",
  created_at: "Fecha de creación",
  updated_at: "Última actualización",
  title: "Título",
  description: "Descripción",
  task_type: "Tipo de actividad",
  status: "Estado",
  priority: "Prioridad",
  due_at: "Vencimiento",
  completed_at: "Fecha de finalización",
  monto_estimado: "Monto estimado",
  probabilidad_cierre: "Probabilidad de cierre",
  etapa_comercial: "Etapa comercial",
  fecha_estimada_cierre: "Fecha estimada de cierre",
  proxima_accion: "Próxima acción",
  fecha_proxima_accion: "Fecha próxima acción",
};

export async function GET(request: Request) {
  try {
    await requireProfile();

    const url = new URL(request.url);
    const params = paramsSchema.parse({
      entity: url.searchParams.get("entity"),
      format: url.searchParams.get("format") ?? "xlsx",
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      userId: url.searchParams.get("userId") || undefined,
    });

    if (params.entity === "executive") {
      return exportExecutive(params.from, params.to, params.userId);
    }

    return exportEntity(params.entity, params.format, params.from, params.to);
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Error al exportar" },
      { status: 400 },
    );
  }
}

async function exportExecutive(from?: string, to?: string, userId?: string) {
  const range = normalizeRange(from, to);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("commercial_dashboard", {
    p_from: range.from,
    p_to: range.to,
    p_user_id: userId ?? null,
  });

  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("La función commercial_dashboard no devolvió datos válidos");
  }

  const dashboard = data as DashboardPayload;
  const workbook = XLSX.utils.book_new();

  const summary = [
    ["REPORTE EJECUTIVO COMERCIAL THERMIKHAUS", ""],
    ["Período", `${range.from} al ${range.to}`],
    ["Generado", dashboard.meta.generated_at],
    ["", ""],
    ["INDICADOR", "VALOR"],
    ["Monto cotizado", number(dashboard.kpis.quoted_amount.value)],
    ["Cantidad de cotizaciones", number(dashboard.kpis.quoted_amount.count)],
    ["Variación respecto al período anterior (%)", nullableNumber(dashboard.kpis.quoted_amount.change_pct)],
    ["Oportunidades abiertas", number(dashboard.kpis.open_opportunities.value)],
    ["Pipeline bruto", number(dashboard.kpis.open_opportunities.gross_amount)],
    ["Pipeline ponderado", number(dashboard.kpis.weighted_pipeline.value)],
    ["Avance comercial (%)", number(dashboard.kpis.commercial_progress.rate)],
    ["Oportunidades ganadas", number(dashboard.kpis.commercial_progress.won)],
    ["Oportunidades perdidas", number(dashboard.kpis.commercial_progress.lost)],
    ["Actividades pendientes", number(dashboard.kpis.pending_tasks.value)],
    ["Actividades vencidas", number(dashboard.kpis.overdue_tasks.value)],
    ["Oportunidades sin próxima acción", number(dashboard.kpis.opportunities_without_next_action)],
    ["Cotizaciones sin empresa", number(dashboard.data_quality.quotes_without_company)],
    ["Cierres formales registrados", number(dashboard.data_quality.formal_closures)],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 46 }, { wch: 24 }];
  summarySheet["!autofilter"] = { ref: "A5:B19" };
  appendSheet(workbook, summarySheet, "Resumen ejecutivo");

  const pipelineRows = dashboard.pipeline.map((item) => ({
    Etapa: item.stage,
    Oportunidades: number(item.count),
    "Monto bruto": number(item.amount),
    "Monto ponderado": number(item.weighted_amount),
    "Participación (%)": number(item.share),
  }));
  appendJsonSheet(workbook, pipelineRows, "Pipeline", [28, 16, 20, 20, 18]);

  const evolutionRows = dashboard.monthly_evolution.map((item) => ({
    Mes: item.month,
    "Monto cotizado": number(item.quoted_amount),
    Cotizaciones: number(item.quote_count),
    Oportunidades: number(item.opportunity_count),
    "Monto cerrado": number(item.won_amount),
  }));
  appendJsonSheet(workbook, evolutionRows, "Evolución mensual", [14, 20, 16, 16, 20]);

  appendJsonSheet(
    workbook,
    dashboard.priority_opportunities.map((item) => ({
      Oportunidad: item.name,
      Cliente: item.company_name || item.contact_name || "Sin cliente asociado",
      Proyecto: item.project_name || "",
      Etapa: item.stage,
      Estado: item.status,
      Monto: number(item.amount),
      "Probabilidad (%)": number(item.probability),
      Prioridad: item.priority || "",
      Temperatura: item.temperature || "",
      "Próxima acción": item.next_action || "",
      "Fecha próxima acción": item.next_action_at || "",
      "Fecha estimada de cierre": item.estimated_close_date || "",
    })),
    "Oportunidades",
    [34, 28, 28, 24, 16, 18, 18, 16, 16, 32, 22, 24],
  );

  appendJsonSheet(
    workbook,
    dashboard.upcoming_tasks.map((item) => ({
      Actividad: item.title,
      Tipo: item.type,
      Prioridad: item.priority,
      Estado: item.status,
      Vencimiento: item.due_at,
      Vencida: item.is_overdue ? "Sí" : "No",
      Contacto: item.contact_name || "",
      "N.º de cotización": item.quote_number || "",
    })),
    "Agenda y riesgos",
    [36, 20, 16, 16, 24, 12, 28, 20],
  );

  appendJsonSheet(
    workbook,
    dashboard.top_clients.map((item) => ({
      Contacto: item.contact_name || "",
      Empresa: item.company_name || "",
      Cotizaciones: number(item.quote_count),
      Oportunidades: number(item.opportunity_count),
      "Monto activo": number(item.active_amount),
      "Última actividad": item.last_activity_at || "",
    })),
    "Clientes",
    [28, 30, 16, 16, 20, 24],
  );

  applyWorkbookFormats(workbook);
  return workbookResponse(
    workbook,
    `reporte_ejecutivo_${range.from}_${range.to}.xlsx`,
  );
}

async function exportEntity(
  entity: Exclude<(typeof entities)[number], "executive">,
  format: "csv" | "xlsx",
  from?: string,
  to?: string,
) {
  const supabase = await createClient();
  let query = supabase.from(entity).select("*").limit(10000);

  if (entity === "cotizaciones") {
    if (from) query = query.gte("fecha_emision", from);
    if (to) query = query.lte("fecha_emision", to);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => friendlyRow(row as Record<string, unknown>));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  setAutoWidths(worksheet, rows);

  if (format === "csv") {
    const body = `\ufeff${XLSX.utils.sheet_to_csv(worksheet, { FS: ";" })}`;
    return new NextResponse(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${entity}.csv"`,
      },
    });
  }

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, worksheet, sheetName(entity));
  applyWorkbookFormats(workbook);
  return workbookResponse(workbook, `${entity}.xlsx`);
}

function appendJsonSheet(
  workbook: XLSX.WorkBook,
  rows: Array<Record<string, unknown>>,
  name: string,
  widths: number[],
) {
  const safeRows = rows.length ? rows : [{ Información: "Sin datos para el período" }];
  const worksheet = XLSX.utils.json_to_sheet(safeRows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  if (worksheet["!ref"] && rows.length) {
    worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  }
  appendSheet(workbook, worksheet, name);
}

function appendSheet(workbook: XLSX.WorkBook, worksheet: XLSX.WorkSheet, name: string) {
  XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
}

function applyWorkbookFormats(workbook: XLSX.WorkBook) {
  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (!cell) continue;
        if (cell.t === "n") cell.z = "#,##0";
      }
    }
  }
}

function setAutoWidths(worksheet: XLSX.WorkSheet, rows: Array<Record<string, unknown>>) {
  const headers = rows.length ? Object.keys(rows[0]) : ["Información"];
  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.min(
      45,
      Math.max(
        12,
        header.length + 2,
        ...rows.slice(0, 200).map((row) => String(row[header] ?? "").length + 2),
      ),
    ),
  }));
  if (worksheet["!ref"] && rows.length) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
}

function friendlyRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !key.endsWith("_encrypted"))
      .map(([key, value]) => [labels[key] ?? humanize(key), serializable(value)]),
  );
}

function serializable(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function sheetName(entity: string) {
  const names: Record<string, string> = {
    cotizaciones: "Cotizaciones",
    empresas: "Empresas",
    contactos: "Contactos",
    prospectos: "Prospectos",
    proyectos: "Proyectos",
    oportunidades: "Oportunidades",
    activities: "Actividades",
    tasks: "Agenda",
  };
  return names[entity] ?? entity;
}

function normalizeRange(from?: string, to?: string) {
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  return { from: from ?? defaultFrom, to: to ?? defaultTo };
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? "Sin base comparable" : number(value);
}

function workbookResponse(workbook: XLSX.WorkBook, filename: string) {
  const body = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(body, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
