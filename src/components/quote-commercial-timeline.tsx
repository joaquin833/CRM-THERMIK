import { createClient } from "@/lib/supabase/server";

type TimelineEvent = {
  event_id: string;
  event_at: string | null;
  event_source: "QUOTE" | "IMPORT" | "ACTIVITY" | "TASK" | "CLOSURE";
  event_type: string;
  title: string;
  detail: string | null;
  status: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  metadata: Record<string, unknown> | null;
};

type Props = {
  quoteId: string;
};

const SOURCE_STYLES: Record<
  TimelineEvent["event_source"],
  { label: string; dot: string; badge: string }
> = {
  QUOTE: {
    label: "Cotización",
    dot: "bg-slate-500",
    badge: "bg-slate-100 text-slate-700",
  },
  IMPORT: {
    label: "Importación",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-800",
  },
  ACTIVITY: {
    label: "Actividad",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800",
  },
  TASK: {
    label: "Seguimiento",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-900",
  },
  CLOSURE: {
    label: "Cierre",
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-800",
  },
};

export async function QuoteCommercialTimeline({ quoteId }: Props) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_quote_commercial_timeline", {
    p_quote_id: quoteId,
  });

  if (error) {
    return (
      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">
          Historial comercial
        </h2>
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          No fue posible cargar el historial comercial: {error.message}
        </div>
      </section>
    );
  }

  const events = (Array.isArray(data) ? data : []) as TimelineEvent[];

  return (
    <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Línea de tiempo
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            Historial comercial
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Importaciones, hitos, actividades, seguimientos y cierres ordenados
            cronológicamente.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
          {events.length} {events.length === 1 ? "evento" : "eventos"}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
          Esta cotización todavía no tiene eventos comerciales registrados.
        </p>
      ) : (
        <ol className="relative mt-6 border-l border-slate-200 pl-6">
          {events.map((event, index) => (
            <TimelineItem
              key={`${event.event_source}-${event.event_id}`}
              event={event}
              isLast={index === events.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineItem({
  event,
  isLast,
}: {
  event: TimelineEvent;
  isLast: boolean;
}) {
  const style = SOURCE_STYLES[event.event_source] ?? SOURCE_STYLES.QUOTE;

  return (
    <li className={isLast ? "relative" : "relative pb-7"}>
      <span
        className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${style.dot}`}
        aria-hidden="true"
      />

      <article className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-950">{event.title}</p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDateTime(event.event_at)}
              {event.responsible_name ? ` · ${event.responsible_name}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${style.badge}`}
            >
              {style.label}
            </span>
            {event.status && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {humanize(event.status)}
              </span>
            )}
          </div>
        </div>

        <p className="mt-2 text-sm font-medium text-slate-700">
          {event.event_type}
        </p>

        {event.detail && (
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
            {event.detail}
          </p>
        )}
      </article>
    </li>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

function humanize(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
