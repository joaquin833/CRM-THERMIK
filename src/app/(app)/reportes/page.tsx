"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
  getCommercialDashboard,
  type CommercialDashboardData,
  type DashboardMonthlyPoint,
  type DashboardPipelineStage,
} from "@/lib/services/commercial-analytics";

export default function ReportesPage() {
  const initial = useMemo(() => currentMonth(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<CommercialDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      setData(
        await getCommercialDashboard({
          from,
          to,
          userId: userId || null,
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible generar el reporte ejecutivo.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [from, to, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"
            >
              <ArrowLeft className="size-4" /> Dashboard
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Reporte ejecutivo comercial
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Análisis del período, evolución del pipeline, resultados y riesgos
              comerciales preparado para revisión de jefatura.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.25fr_auto]">
            <Filter label="Desde">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
                className={control}
              />
            </Filter>
            <Filter label="Hasta">
              <input
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
                className={control}
              />
            </Filter>
            <Filter label="Ejecutivo">
              <select
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                className={control}
              >
                <option value="">Todos los ejecutivos</option>
                {(data?.executives ?? []).map((executive) => (
                  <option key={executive.id} value={executive.id}>
                    {executive.name}
                  </option>
                ))}
              </select>
            </Filter>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading || refreshing}
              className="focus-ring self-end rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                Aplicar
              </span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <strong>No fue posible generar el reporte.</strong>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Monto cotizado"
              value={money(data.kpis.quoted_amount.value)}
              detail={`${data.kpis.quoted_amount.count} cotizaciones emitidas`}
              icon={<FileSpreadsheet className="size-5" />}
            />
            <Metric
              label="Pipeline ponderado"
              value={money(data.kpis.weighted_pipeline.value)}
              detail={`Sobre ${money(data.kpis.weighted_pipeline.gross_amount)} brutos`}
              icon={<TrendingUp className="size-5" />}
            />
            <Metric
              label="Avance comercial"
              value={`${decimal(data.kpis.commercial_progress.rate)}%`}
              detail={`${data.kpis.commercial_progress.won} ganadas · ${data.kpis.commercial_progress.lost} perdidas`}
              icon={<CheckCircle2 className="size-5" />}
            />
            <Metric
              label="Gestiones vencidas"
              value={integer(data.kpis.overdue_tasks.value)}
              detail={`${decimal(data.kpis.overdue_tasks.share)}% de las pendientes`}
              icon={<AlertTriangle className="size-5" />}
              warning
            />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Panel
              eyebrow="Síntesis del período"
              title={`Resumen ejecutivo · ${formatDate(from)} al ${formatDate(to)}`}
              description="Conclusiones automáticas construidas con datos reales del CRM."
            >
              <div className="grid gap-3">
                {conclusions(data).map((item) => (
                  <div
                    key={item.text}
                    className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4"
                  >
                    <span className={`mt-2 size-2.5 shrink-0 rounded-full ${item.dot}`} />
                    <p className="text-sm leading-6 text-slate-700">{item.text}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              eyebrow="Exportación"
              title="Archivos del período"
              description="Datos disponibles para análisis y presentaciones."
            >
              <div className="grid gap-3">
                <ExportLink
                  href={`/api/export?entity=cotizaciones&from=${from}&to=${to}&format=xlsx`}
                  label="Cotizaciones en Excel"
                  detail="Detalle completo del período"
                />
                <ExportLink
                  href="/api/export?entity=oportunidades&format=xlsx"
                  label="Oportunidades en Excel"
                  detail="Pipeline y datos comerciales"
                />
                <ExportLink
                  href="/api/export?entity=tasks&format=xlsx"
                  label="Agenda en Excel"
                  detail="Tareas y seguimientos"
                />
              </div>
            </Panel>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel
              eyebrow="Embudo comercial"
              title="Pipeline por etapa"
              description="Monto, ponderación y participación de las oportunidades activas."
            >
              <Pipeline stages={data.pipeline} />
            </Panel>

            <Panel
              eyebrow="Evolución"
              title="Tendencia de seis meses"
              description="Monto cotizado, oportunidades creadas y cierres formalizados."
            >
              <Evolution points={data.monthly_evolution} />
            </Panel>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Panel
              eyebrow="Oportunidades"
              title="Negocios prioritarios"
              description="Oportunidades activas con mayor necesidad de foco comercial."
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-3 pr-4 font-semibold">Oportunidad</th>
                      <th className="pb-3 pr-4 font-semibold">Etapa</th>
                      <th className="pb-3 pr-4 text-right font-semibold">Monto</th>
                      <th className="pb-3 text-right font-semibold">Prob.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.priority_opportunities.map((opportunity) => (
                      <tr key={opportunity.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4">
                          <Link
                            href={`/oportunidades/${opportunity.id}`}
                            className="font-semibold text-slate-900 hover:text-emerald-700"
                          >
                            {opportunity.name}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {opportunity.company_name || opportunity.contact_name || "Sin cliente asociado"}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{opportunity.stage}</td>
                        <td className="py-3 pr-4 text-right font-semibold">{money(opportunity.amount)}</td>
                        <td className="py-3 text-right font-semibold text-emerald-700">
                          {decimal(opportunity.probability)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.priority_opportunities.length && <Empty text="Sin oportunidades activas." />}
              </div>
            </Panel>

            <Panel
              eyebrow="Riesgo operativo"
              title="Agenda y calidad de datos"
              description="Alertas que afectan la continuidad del proceso comercial."
            >
              <div className="grid gap-3">
                <Risk
                  label="Actividades vencidas"
                  value={data.kpis.overdue_tasks.value}
                  detail="Seguimientos que requieren recuperación"
                  href="/agenda"
                />
                <Risk
                  label="Sin próxima acción"
                  value={data.kpis.opportunities_without_next_action}
                  detail="Oportunidades abiertas sin planificación completa"
                  href="/oportunidades"
                />
                <Risk
                  label="Cotizaciones sin empresa"
                  value={data.data_quality.quotes_without_company}
                  detail="Registros comerciales por completar"
                  href="/cotizaciones"
                />
                <Risk
                  label="Cierres formales"
                  value={data.data_quality.formal_closures}
                  detail="Resultados registrados en commercial_closures"
                  href="/reportes"
                  positive
                />
              </div>
            </Panel>
          </section>

          <section className="mt-4">
            <Panel
              eyebrow="Cartera"
              title="Clientes con mayor actividad"
              description="Contactos ordenados por monto cotizado y movimiento comercial."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {data.top_clients.map((client) => (
                  <Link
                    key={client.contact_id}
                    href={`/contactos/${client.contact_id}`}
                    className="rounded-xl border border-slate-100 p-4 transition hover:border-emerald-200 hover:shadow-sm"
                  >
                    <p className="font-semibold text-slate-950">
                      {client.contact_name || "Contacto sin nombre"}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {client.company_name || "Empresa pendiente"}
                    </p>
                    <p className="mt-4 text-lg font-bold text-emerald-800">
                      {money(client.active_amount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {client.quote_count} cotizaciones · {client.opportunity_count} oportunidades
                    </p>
                  </Link>
                ))}
              </div>
              {!data.top_clients.length && <Empty text="Sin clientes con actividad suficiente." />}
            </Panel>
          </section>

          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
            <span>
              Generado el {formatDateTime(data.meta.generated_at)} · CRM Thermikhaus
            </span>
            <Link href="/dashboard" className="font-semibold text-emerald-700">
              Volver al Dashboard
            </Link>
          </footer>
        </>
      ) : null}
    </AppShell>
  );
}

const control =
  "focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none hover:border-slate-300 focus:border-emerald-500";

function Metric({
  label,
  value,
  detail,
  icon,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`grid size-10 place-items-center rounded-xl ${warning ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
        {icon}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function Pipeline({ stages }: { stages: DashboardPipelineStage[] }) {
  const total = stages.reduce((sum, item) => sum + item.amount, 0) || 1;
  if (!stages.length) return <Empty text="No hay oportunidades abiertas." />;

  return (
    <div className="grid gap-4">
      {stages.map((stage) => (
        <div key={stage.stage}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{stage.stage}</p>
              <p className="mt-1 text-xs text-slate-500">
                {stage.count} oportunidades · ponderado {money(stage.weighted_amount)}
              </p>
            </div>
            <p className="text-sm font-bold text-slate-950">{money(stage.amount)}</p>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-emerald-400"
              style={{ width: `${Math.max((stage.amount / total) * 100, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Evolution({ points }: { points: DashboardMonthlyPoint[] }) {
  if (!points.length) return <Empty text="No existe evolución mensual disponible." />;
  const max = Math.max(...points.map((point) => point.quoted_amount), 1);

  return (
    <div>
      <div className="flex h-52 items-end gap-3 border-b border-l border-slate-200 px-3 pt-4">
        {points.map((point) => (
          <div key={point.month} className="group flex min-w-0 flex-1 flex-col items-center justify-end self-stretch">
            <div className="invisible mb-2 rounded bg-slate-900 px-2 py-1 text-[10px] text-white group-hover:visible">
              {money(point.quoted_amount)}
            </div>
            <div
              className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-400"
              style={{ height: `${Math.max((point.quoted_amount / max) * 100, point.quoted_amount ? 8 : 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-6 gap-3 text-center text-[11px] font-medium text-slate-500">
        {points.map((point) => <span key={point.month}>{monthLabel(point.month)}</span>)}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center">
        <Small label="Cotizaciones" value={String(points.reduce((sum, p) => sum + p.quote_count, 0))} />
        <Small label="Oportunidades" value={String(points.reduce((sum, p) => sum + p.opportunity_count, 0))} />
        <Small label="Cierres" value={money(points.reduce((sum, p) => sum + p.won_amount, 0))} />
      </div>
    </div>
  );
}

function Risk({
  label,
  value,
  detail,
  href,
  positive = false,
}: {
  label: string;
  value: number;
  detail: string;
  href: string;
  positive?: boolean;
}) {
  const warning = positive ? value === 0 : value > 0;
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:border-emerald-200">
      <span className={`size-2.5 shrink-0 rounded-full ${warning ? "bg-amber-500" : "bg-emerald-500"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
      <span className={`text-xl font-bold ${warning ? "text-amber-700" : "text-emerald-700"}`}>{integer(value)}</span>
    </Link>
  );
}

function ExportLink({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/30">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
        <Download className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
    </a>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}

function Small({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{text}</div>;
}

function Loading() {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl border bg-white p-4"><div className="size-10 rounded-xl bg-slate-100" /><div className="mt-5 h-3 w-28 rounded bg-slate-100" /><div className="mt-3 h-7 w-36 rounded bg-slate-100" /></div>)}</div>;
}

function conclusions(data: CommercialDashboardData) {
  const k = data.kpis;
  const change = k.quoted_amount.change_pct;
  return [
    {
      text: `El período registra ${money(k.quoted_amount.value)} cotizados en ${integer(k.quoted_amount.count)} documentos.${change === null ? " No existe una base comparable en el período anterior." : ` La variación respecto del período anterior es de ${change >= 0 ? "+" : ""}${decimal(change)}%.`}`,
      dot: change !== null && change < 0 ? "bg-red-500" : "bg-emerald-500",
    },
    {
      text: `El pipeline abierto alcanza ${money(k.open_opportunities.gross_amount)} y su valor ponderado es ${money(k.weighted_pipeline.value)}.`,
      dot: "bg-blue-500",
    },
    {
      text: k.overdue_tasks.value > 0
        ? `${integer(k.overdue_tasks.value)} actividades están vencidas, equivalentes al ${decimal(k.overdue_tasks.share)}% de las gestiones pendientes.`
        : "La Agenda no presenta actividades vencidas.",
      dot: k.overdue_tasks.value > 0 ? "bg-red-500" : "bg-emerald-500",
    },
    {
      text: k.opportunities_without_next_action > 0
        ? `${integer(k.opportunities_without_next_action)} oportunidades activas no tienen una próxima acción completa.`
        : "Todas las oportunidades activas tienen una próxima acción definida.",
      dot: k.opportunities_without_next_action > 0 ? "bg-amber-500" : "bg-emerald-500",
    },
  ];
}

function currentMonth() {
  const now = new Date();
  return {
    from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function money(value: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function integer(value: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(value);
}

function decimal(value: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(year, month - 1, day));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(value));
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { month: "short" }).format(new Date(year, month - 1, 1));
}
