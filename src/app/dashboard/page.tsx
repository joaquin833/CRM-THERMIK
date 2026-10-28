"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileSpreadsheet,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
  getCommercialDashboard,
  type CommercialDashboardData,
  type DashboardMonthlyPoint,
  type DashboardPipelineStage,
} from "@/lib/services/commercial-analytics";

export default function DashboardPage() {
  const initial = useMemo(() => currentMonth(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<CommercialDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (manual = false) => {
      manual ? setRefreshing(true) : setLoading(true);
      setError("");

      try {
        const result = await getCommercialDashboard({
          from,
          to,
          userId: userId || null,
        });
        setData(result);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "No fue posible cargar el Dashboard comercial.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [from, to, userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data ? executiveSummary(data) : [];

  return (
    <AppShell>
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900 px-5 py-5 text-white shadow-lg sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
              <BarChart3 className="size-4" />
              Inteligencia comercial
            </div>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight sm:text-3xl">
              Dashboard comercial
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-emerald-50/80">
              Visión ejecutiva del pipeline, las cotizaciones y las acciones que
              requieren atención para mantener activo el flujo comercial.
            </p>
          </div>

          <div className="grid gap-2 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur sm:grid-cols-2 xl:min-w-[540px] xl:grid-cols-[1fr_1fr_1.2fr_auto]">
            <FilterField label="Desde">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none [color-scheme:dark]"
              />
            </FilterField>
            <FilterField label="Hasta">
              <input
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none [color-scheme:dark]"
              />
            </FilterField>
            <FilterField label="Ejecutivo">
              <select
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                className="w-full rounded-lg border border-white/15 bg-emerald-950 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="">Todos los ejecutivos</option>
                {(data?.executives ?? []).map((executive) => (
                  <option key={executive.id} value={executive.id}>
                    {executive.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing || loading}
              className="focus-ring self-end rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                Actualizar
              </span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-xs text-emerald-100/75">
          <span>Período: {formatDate(from)} al {formatDate(to)}</span>
          <span>•</span>
          <span>
            Actualizado: {data ? formatDateTime(data.meta.generated_at) : "Cargando..."}
          </span>
          <Link
            href={`/reportes?from=${from}&to=${to}`}
            className="ml-auto inline-flex items-center gap-2 font-semibold text-white hover:text-emerald-200"
          >
            Ver reportes detallados <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <strong>No fue posible cargar el Dashboard.</strong>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              label="Monto cotizado"
              value={money(data.kpis.quoted_amount.value)}
              detail={`${data.kpis.quoted_amount.count} cotizaciones en el período`}
              change={data.kpis.quoted_amount.change_pct}
              icon={<DollarSign className="size-5" />}
              tone="emerald"
              href="/cotizaciones"
            />
            <KpiCard
              label="Oportunidades abiertas"
              value={integer(data.kpis.open_opportunities.value)}
              detail={`${money(data.kpis.open_opportunities.gross_amount)} de pipeline bruto`}
              icon={<Target className="size-5" />}
              tone="blue"
              href="/oportunidades"
            />
            <KpiCard
              label="Pipeline ponderado"
              value={money(data.kpis.weighted_pipeline.value)}
              detail="Ajustado por probabilidad de cierre"
              icon={<TrendingUp className="size-5" />}
              tone="violet"
              href="/oportunidades/forecast"
            />
            <KpiCard
              label="Avance comercial"
              value={`${decimal(data.kpis.commercial_progress.rate)}%`}
              detail={`${data.kpis.commercial_progress.won} ganadas · ${data.kpis.commercial_progress.lost} perdidas`}
              icon={<CheckCircle2 className="size-5" />}
              tone="emerald"
              href="/reportes"
            />
            <KpiCard
              label="Seguimientos pendientes"
              value={integer(data.kpis.pending_tasks.value)}
              detail={`${data.kpis.pending_tasks.next_seven_days} próximos en 7 días`}
              icon={<CalendarClock className="size-5" />}
              tone="amber"
              href="/agenda"
            />
            <KpiCard
              label="Actividades vencidas"
              value={integer(data.kpis.overdue_tasks.value)}
              detail={`${decimal(data.kpis.overdue_tasks.share)}% de las pendientes`}
              icon={<AlertTriangle className="size-5" />}
              tone="red"
              href="/agenda"
            />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white">
                  <BarChart3 className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Resumen ejecutivo
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">
                    Lectura comercial del período
                  </h2>
                </div>
              </div>
              <div className="mt-4 grid gap-2.5">
                {summary.map((item) => (
                  <div key={item.text} className="flex gap-3 rounded-xl bg-white/80 p-3 text-sm leading-6 text-slate-700">
                    <span className={`mt-2 size-2 shrink-0 rounded-full ${item.dot}`} />
                    <p>{item.text}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Calidad comercial
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">Datos por completar</h2>
                </div>
                <AlertTriangle className="size-6 text-amber-500" />
              </div>
              <div className="mt-4 grid gap-2.5">
                <QualityRow
                  label="Cotizaciones sin empresa"
                  value={data.data_quality.quotes_without_company}
                  href="/cotizaciones"
                />
                <QualityRow
                  label="Oportunidades sin próxima acción"
                  value={data.kpis.opportunities_without_next_action}
                  href="/oportunidades"
                />
                <QualityRow
                  label="Cierres formales registrados"
                  value={data.data_quality.formal_closures}
                  href="/reportes"
                  positive
                />
              </div>
            </article>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <Panel
              eyebrow="Embudo comercial"
              title="Pipeline por etapa"
              description="Distribución del valor activo y su ponderación por probabilidad."
              action={<Link href="/oportunidades" className="text-sm font-semibold text-emerald-700">Ver pipeline</Link>}
            >
              <PipelineChart stages={data.pipeline} />
            </Panel>

            <Panel
              eyebrow="Tendencia"
              title="Evolución de los últimos 6 meses"
              description="Monto cotizado y actividad comercial mensual."
              action={<Link href={`/reportes?from=${from}&to=${to}`} className="text-sm font-semibold text-emerald-700">Abrir reporte</Link>}
            >
              <MonthlyChart points={data.monthly_evolution} />
            </Panel>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel
              eyebrow="Gestión operativa"
              title="Agenda prioritaria"
              description="Actividades vencidas y próximas que requieren acción."
              action={<Link href="/agenda" className="text-sm font-semibold text-emerald-700">Abrir Agenda</Link>}
            >
              <div className="grid gap-3">
                {data.upcoming_tasks.slice(0, 7).map((task) => (
                  <Link
                    href="/agenda"
                    key={task.id}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${task.is_overdue ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {task.is_overdue ? <AlertTriangle className="size-4" /> : <Clock3 className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {task.contact_name || "Sin contacto"}
                        {task.quote_number ? ` · Cot. ${task.quote_number}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-semibold ${task.is_overdue ? "text-red-700" : "text-slate-600"}`}>
                        {relativeDate(task.due_at)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{formatShortDateTime(task.due_at)}</p>
                    </div>
                  </Link>
                ))}
                {!data.upcoming_tasks.length && <EmptyState text="No hay actividades pendientes." />}
              </div>
            </Panel>

            <Panel
              eyebrow="Prioridad comercial"
              title="Oportunidades que requieren foco"
              description="Ordenadas por probabilidad, prioridad y vigencia de la próxima acción."
              action={<Link href="/oportunidades" className="text-sm font-semibold text-emerald-700">Ver todas</Link>}
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
                    {data.priority_opportunities.slice(0, 7).map((opportunity) => (
                      <tr key={opportunity.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4">
                          <Link href={`/oportunidades/${opportunity.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                            {opportunity.name}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {opportunity.company_name || opportunity.contact_name || "Sin cliente asociado"}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {opportunity.stage}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold text-slate-900">{money(opportunity.amount)}</td>
                        <td className="py-3 text-right">
                          <span className="font-semibold text-emerald-700">{decimal(opportunity.probability)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.priority_opportunities.length && <EmptyState text="No hay oportunidades activas para priorizar." />}
              </div>
            </Panel>
          </section>

          <section className="mt-4">
            <Panel
              eyebrow="Cartera comercial"
              title="Clientes con mayor actividad"
              description="Contactos ordenados por monto cotizado activo y movimiento comercial."
              action={<Link href="/contactos" className="text-sm font-semibold text-emerald-700">Ver contactos</Link>}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {data.top_clients.slice(0, 8).map((client) => (
                  <Link
                    href={`/contactos/${client.contact_id}`}
                    key={client.contact_id}
                    className="rounded-2xl border border-slate-100 p-4 transition hover:border-emerald-200 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                        <Users className="size-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-400">{client.quote_count} cot.</span>
                    </div>
                    <h3 className="mt-4 font-semibold text-slate-950">{client.contact_name || "Contacto sin nombre"}</h3>
                    <p className="mt-1 truncate text-xs text-slate-500">{client.company_name || "Empresa pendiente"}</p>
                    <p className="mt-4 text-lg font-bold text-emerald-800">{money(client.active_amount)}</p>
                    <p className="mt-1 text-xs text-slate-400">{client.opportunity_count} oportunidades asociadas</p>
                  </Link>
                ))}
              </div>
              {!data.top_clients.length && <EmptyState text="Todavía no hay clientes con actividad suficiente." />}
            </Panel>
          </section>

          <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">¿Necesitas presentar estos resultados?</p>
              <p className="mt-1 text-sm text-slate-500">Abre Reportes para ampliar el período y exportar los datos comerciales.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/export?entity=cotizaciones&from=${from}&to=${to}&format=xlsx`}
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="size-4" /> Exportar Excel
              </a>
              <Link
                href={`/reportes?from=${from}&to=${to}`}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
              >
                Abrir reportes <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  detail,
  change,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  change?: number | null;
  icon: ReactNode;
  tone: "emerald" | "blue" | "violet" | "amber" | "red";
  href: string;
}) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  };

  return (
    <Link href={href} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid size-10 place-items-center rounded-2xl ${tones[tone]}`}>{icon}</div>
        {change !== undefined && change !== null && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {change >= 0 ? "+" : ""}{decimal(change)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1.5 min-h-9 text-xs leading-5 text-slate-500">{detail}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 opacity-0 transition group-hover:opacity-100">
        Ver detalle <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

function Panel({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function PipelineChart({ stages }: { stages: DashboardPipelineStage[] }) {
  if (!stages.length) return <EmptyState text="No hay oportunidades abiertas en el pipeline." />;
  const max = Math.max(...stages.map((stage) => stage.amount), 1);

  return (
    <div className="grid gap-4">
      {stages.map((stage, index) => (
        <div key={stage.stage}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-850">{stage.stage}</p>
              <p className="mt-1 text-xs text-slate-500">{stage.count} oportunidades · ponderado {money(stage.weighted_amount)}</p>
            </div>
            <p className="text-sm font-bold text-slate-950">{money(stage.amount)}</p>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${index % 3 === 0 ? "bg-emerald-600" : index % 3 === 1 ? "bg-teal-500" : "bg-blue-500"}`}
              style={{ width: `${Math.max((stage.amount / max) * 100, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlyChart({ points }: { points: DashboardMonthlyPoint[] }) {
  if (!points.length) return <EmptyState text="No hay evolución mensual disponible." />;
  const max = Math.max(...points.map((point) => point.quoted_amount), 1);

  return (
    <div>
      <div className="flex h-44 items-end gap-3 border-b border-l border-slate-200 px-3 pt-4">
        {points.map((point) => {
          const height = Math.max((point.quoted_amount / max) * 100, point.quoted_amount > 0 ? 8 : 2);
          return (
            <div key={point.month} className="group flex min-w-0 flex-1 flex-col items-center justify-end self-stretch">
              <div className="invisible mb-2 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-medium text-white group-hover:visible">
                {money(point.quoted_amount)}
              </div>
              <div className="w-full max-w-10 rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-400 transition group-hover:from-emerald-800" style={{ height: `${height}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-6 gap-3 text-center text-[11px] font-medium text-slate-500">
        {points.map((point) => <span key={point.month}>{monthLabel(point.month)}</span>)}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4 text-center">
        <MiniMetric label="Cotizaciones" value={String(points.reduce((sum, item) => sum + item.quote_count, 0))} />
        <MiniMetric label="Oportunidades" value={String(points.reduce((sum, item) => sum + item.opportunity_count, 0))} />
        <MiniMetric label="Cierres formales" value={money(points.reduce((sum, item) => sum + item.won_amount, 0))} />
      </div>
    </div>
  );
}

function QualityRow({ label, value, href, positive = false }: { label: string; value: number; href: string; positive?: boolean }) {
  const warning = !positive ? value > 0 : value === 0;
  return (
    <Link href={href} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 p-4 transition hover:border-emerald-200">
      <div className="flex items-center gap-3">
        <span className={`size-2.5 rounded-full ${warning ? "bg-amber-500" : "bg-emerald-500"}`} />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <span className={`text-lg font-bold ${warning ? "text-amber-700" : "text-emerald-700"}`}>{integer(value)}</span>
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100/70">{label}</span>{children}</label>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{text}</div>;
}

function DashboardSkeleton() {
  return <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border bg-white p-5"><div className="size-10 rounded-2xl bg-slate-100" /><div className="mt-6 h-3 w-28 rounded bg-slate-100" /><div className="mt-3 h-8 w-36 rounded bg-slate-100" /></div>)}</div>;
}

function executiveSummary(data: CommercialDashboardData) {
  const k = data.kpis;
  const items = [
    {
      text: `El pipeline activo alcanza ${money(k.open_opportunities.gross_amount)}, con un valor ponderado de ${money(k.weighted_pipeline.value)} según las probabilidades registradas.`,
      dot: "bg-emerald-500",
    },
    {
      text: k.overdue_tasks.value > 0
        ? `${integer(k.overdue_tasks.value)} de ${integer(k.pending_tasks.value)} actividades pendientes están vencidas. La recuperación de seguimientos es la principal prioridad operativa.`
        : "No existen actividades vencidas. La Agenda comercial está al día.",
      dot: k.overdue_tasks.value > 0 ? "bg-red-500" : "bg-emerald-500",
    },
    {
      text: k.opportunities_without_next_action > 0
        ? `${integer(k.opportunities_without_next_action)} oportunidades abiertas no tienen una próxima acción completa y requieren planificación.`
        : "Todas las oportunidades abiertas tienen una próxima acción definida.",
      dot: k.opportunities_without_next_action > 0 ? "bg-amber-500" : "bg-emerald-500",
    },
  ];
  return items;
}

function currentMonth() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: localDate(from), to: localDate(to) };
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function formatShortDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(value));
}

function relativeDate(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  const days = Math.round(difference / 86_400_000);
  if (days < -1) return `${Math.abs(days)} días atrasada`;
  if (days === -1) return "Ayer";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { month: "short" }).format(new Date(year, month - 1, 1));
}
