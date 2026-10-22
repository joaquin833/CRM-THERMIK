import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { OpportunityPipeline } from "@/components/opportunity-pipeline";
import {
  getOpportunities,
  getOpportunityCatalogs,
} from "@/lib/services/opportunities";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [opportunities, catalogs] = await Promise.all([
    getOpportunities(),
    getOpportunityCatalogs(),
  ]);

  const active = opportunities.filter((item) =>
    ["abierta", "postergada"].includes(item.estado),
  );
  const total = active.reduce(
    (sum, item) => sum + Number(item.monto_estimado ?? 0),
    0,
  );
  const weighted = active.reduce(
    (sum, item) =>
      sum +
      (Number(item.monto_estimado ?? 0) *
        Number(item.probabilidad_cierre ?? 0)) /
        100,
    0,
  );
  const overdue = active.filter(
    (item) =>
      !item.fecha_proxima_accion ||
      new Date(item.fecha_proxima_accion).getTime() < Date.now(),
  ).length;

  return (
    <AppShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Pipeline comercial
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Oportunidades
          </h1>
          <p className="mt-1 text-slate-600">
            Montos, probabilidades, próximas acciones y avance por etapa.
          </p>
        </div>

        <Link
          href="/oportunidades/forecast"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          Ver forecast
        </Link>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Oportunidades activas" value={String(active.length)} />
        <Metric label="Pipeline total" value={money(total)} />
        <Metric label="Pipeline ponderado" value={money(weighted)} />
        <Metric
          label="Seguimientos atrasados"
          value={String(overdue)}
          danger={overdue > 0}
        />
      </section>

      <OpportunityPipeline opportunities={opportunities} catalogs={catalogs} />
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
      className={`rounded-2xl border p-4 shadow-sm ${
        danger ? "border-red-200 bg-red-50" : "bg-white"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          danger ? "text-red-800" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}
