import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { getOpportunityForecast } from "@/lib/services/forecast";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ inicio?: string; meses?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const inicio = validDate(params.inicio) ? params.inicio! : today();
  const meses = clampMonths(params.meses);
  const data = await getOpportunityForecast(inicio, meses);
  const { summary } = data;
  const maxMonthly = Math.max(
    1,
    ...data.monthly_forecast.map((item) => item.scenario_potential),
  );
  const maxStage = Math.max(
    1,
    ...data.by_stage.map((item) => item.pipeline_total),
  );

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            C7 · Proyección comercial
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Forecast de Oportunidades
          </h1>
          <p className="mt-1 text-slate-600">
            Escenarios, cierres estimados, principales negocios y riesgos.
          </p>
        </div>
        <Link
          href="/oportunidades"
          className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Volver al pipeline
        </Link>
      </header>

      <form className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-[220px_180px_auto]">
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Fecha inicial
          </span>
          <input
            name="inicio"
            type="date"
            defaultValue={inicio}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Meses proyectados
          </span>
          <select
            name="meses"
            defaultValue={String(meses)}
            className="w-full rounded-lg border px-3 py-2"
          >
            {[3, 6, 9, 12, 18, 24].map((value) => (
              <option key={value} value={value}>
                {value} meses
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">
          Actualizar forecast
        </button>
      </form>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Pipeline total" value={money(summary.pipeline_total)} />
        <Metric
          label="Pipeline ponderado"
          value={money(summary.pipeline_weighted)}
        />
        <Metric
          label="Oportunidades activas"
          value={String(summary.active_opportunities)}
        />
        <Metric
          label="Seguimientos atrasados"
          value={String(summary.overdue_followups)}
          danger={summary.overdue_followups > 0}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Scenario
          label="Conservador"
          value={summary.scenario_conservative}
          description="70% del pipeline ponderado"
        />
        <Scenario
          label="Probable"
          value={summary.scenario_probable}
          description="Probabilidad actual por oportunidad"
          featured
        />
        <Scenario
          label="Potencial"
          value={summary.scenario_potential}
          description="100% del pipeline abierto"
        />
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Proyección mensual
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Conservador, probable y potencial por fecha estimada de cierre.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Ganado en período: {money(summary.won_amount_period)}
          </p>
        </div>
        <div className="mt-5 grid gap-4">
          {data.monthly_forecast.map((month) => (
            <article
              key={month.month}
              className="grid gap-3 border-t pt-4 lg:grid-cols-[110px_1fr_160px] lg:items-center"
            >
              <div>
                <p className="font-semibold text-slate-950">
                  {monthLabel(month.month)}
                </p>
                <p className="text-xs text-slate-500">
                  {month.opportunities} oportunidades
                </p>
              </div>
              <div className="grid gap-2">
                <Bar
                  label="Potencial"
                  value={month.scenario_potential}
                  max={maxMonthly}
                  color="bg-slate-300"
                />
                <Bar
                  label="Probable"
                  value={month.scenario_probable}
                  max={maxMonthly}
                  color="bg-emerald-600"
                />
                <Bar
                  label="Conservador"
                  value={month.scenario_conservative}
                  max={maxMonthly}
                  color="bg-amber-500"
                />
              </div>
              <div className="text-sm lg:text-right">
                <p className="font-semibold text-slate-950">
                  {money(month.scenario_probable)}
                </p>
                <p className="text-xs text-slate-500">
                  probable · ganado {money(month.won_amount)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Pipeline por etapa">
          <div className="grid gap-4">
            {data.by_stage.map((stage) => (
              <article key={stage.stage}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">
                    {stage.stage}
                  </span>
                  <span className="text-slate-500">
                    {stage.opportunities} · {money(stage.pipeline_total)}
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{
                      width: `${Math.max(2, (stage.pipeline_total / maxStage) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Ponderado {money(stage.pipeline_weighted)} · Probabilidad
                  media {stage.probability_average}%
                </p>
              </article>
            ))}
            {data.by_stage.length === 0 && <Empty />}
          </div>
        </Panel>

        <Panel title="Alertas del forecast">
          <div className="grid gap-3 sm:grid-cols-2">
            <Alert
              label="Sin fecha estimada de cierre"
              value={summary.without_estimated_close_date}
            />
            <Alert
              label="Seguimientos atrasados"
              value={summary.overdue_followups}
            />
            <Alert
              label="Oportunidades de alto valor"
              value={summary.high_value_opportunities}
            />
            <Alert
              label="Perdidas en período"
              value={summary.lost_count_period}
            />
          </div>
        </Panel>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">
          Principales oportunidades
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="p-3">Oportunidad</th>
                <th className="p-3">Etapa</th>
                <th className="p-3">Monto</th>
                <th className="p-3">Probabilidad</th>
                <th className="p-3">Ponderado</th>
                <th className="p-3">Cierre estimado</th>
              </tr>
            </thead>
            <tbody>
              {data.top_opportunities.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    <Link
                      href={`/oportunidades/${item.id}`}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      {item.nombre}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.proyecto || item.empresa || "Sin relación"}
                    </p>
                  </td>
                  <td className="p-3">{item.etapa_comercial}</td>
                  <td className="p-3 font-medium">{money(item.amount)}</td>
                  <td className="p-3">{item.probability}%</td>
                  <td className="p-3">{money(item.weighted_amount)}</td>
                  <td className="p-3">
                    {dateLabel(item.fecha_estimada_cierre)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.top_opportunities.length === 0 && <Empty />}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">
            Riesgos comerciales
          </h2>
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
            {data.risks.length}
          </span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.risks.map((risk) => (
            <Link
              key={`${risk.id}-${risk.risk_type}`}
              href={`/oportunidades/${risk.id}`}
              className="rounded-xl border border-red-200 bg-red-50 p-4 transition hover:border-red-400"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{risk.nombre}</p>
                  <p className="mt-1 text-xs font-medium text-red-800">
                    {riskLabel(risk.risk_type)}
                  </p>
                </div>
                <p className="font-bold text-slate-950">{money(risk.amount)}</p>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {risk.next_action || "Sin próxima acción"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {dateTimeLabel(risk.next_action_at)} · {risk.stage}
              </p>
            </Link>
          ))}
          {data.risks.length === 0 && <Empty />}
        </div>
      </section>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${danger ? "border-red-200 bg-red-50" : "bg-white"}`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${danger ? "text-red-800" : "text-slate-950"}`}
      >
        {value}
      </p>
    </article>
  );
}

function Scenario({
  label,
  value,
  description,
  featured = false,
}: {
  label: string;
  value: number;
  description: string;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-5 shadow-sm ${featured ? "border-emerald-300 bg-emerald-50" : "bg-white"}`}
    >
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{money(value)}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </article>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = value <= 0 ? 0 : Math.max(2, (value / max) * 100);
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function Alert({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </article>
  );
}

function Empty() {
  return (
    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
      No hay información disponible para el período.
    </p>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validDate(value?: string): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function clampMonths(value?: string): number {
  const parsed = Number(value ?? 6);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 24 ? parsed : 6;
}

function monthLabel(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("es-CL", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateLabel(value?: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(date);
}

function dateTimeLabel(value?: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function riskLabel(value: string): string {
  const labels: Record<string, string> = {
    SIN_FECHA_PROXIMA_ACCION: "Sin fecha de próxima acción",
    SEGUIMIENTO_ATRASADO: "Seguimiento atrasado",
    SIN_FECHA_ESTIMADA_CIERRE: "Sin fecha estimada de cierre",
    CIERRE_ESTIMADO_VENCIDO: "Fecha estimada de cierre vencida",
  };
  return labels[value] || value;
}
