"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  importId: string;
  status: string;
};

const ACTION_OPTIONS = [
  "Confirmar recepción de la cotización",
  "Llamar al cliente",
  "Enviar correo de seguimiento",
  "Enviar WhatsApp de seguimiento",
  "Programar reunión",
  "Revisar antecedentes con el cliente",
  "Otra acción comercial",
];

export function QuoteImportConfirmButton({ importId, status }: Props) {
  const router = useRouter();
  const [action, setAction] = useState(ACTION_OPTIONS[0]);
  const [dueAt, setDueAt] = useState(defaultDueDate());
  const [priority, setPriority] = useState("alta");
  const [reminderMinutes, setReminderMinutes] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canConfirm = status === "ready";
  const alreadyConfirmed = status === "confirmed";

  async function confirmImport(): Promise<void> {
    try {
      setBusy(true);
      setError("");

      const dueDate = new Date(dueAt);

      if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
        throw new Error("La fecha del seguimiento debe ser futura.");
      }

      const accepted = window.confirm(
        "Se crearán o vincularán los registros comerciales y se programará la primera tarea. ¿Deseas continuar?",
      );

      if (!accepted) {
        setBusy(false);
        return;
      }

      const response = await fetch(
        `/api/cotizaciones/importar/${importId}/confirmar`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            dueAt: dueDate.toISOString(),
            priority,
            reminderMinutes:
              reminderMinutes === "" ? null : Number(reminderMinutes),
          }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No fue posible confirmar la importación.",
        );
      }

      if (!result.quoteId) {
        throw new Error("La respuesta no contiene la cotización creada.");
      }

      router.push(`/cotizaciones/${result.quoteId}`);
      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible confirmar la importación.",
      );
      setBusy(false);
    }
  }

  if (alreadyConfirmed) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
        Esta importación ya fue confirmada.
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="font-semibold text-emerald-950">
        Confirmar importación y seguimiento inicial
      </p>
      <p className="mt-1 text-sm text-emerald-800">
        La cotización se confirmará junto con su primera tarea comercial.
      </p>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Primera acción
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3"
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Fecha y hora
          <input
            type="datetime-local"
            value={dueAt}
            min={minimumDateTime()}
            required
            onChange={(event) => setDueAt(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Prioridad
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white p-3"
            >
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Recordatorio
            <select
              value={reminderMinutes}
              onChange={(event) => setReminderMinutes(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white p-3"
            >
              <option value="">Sin recordatorio</option>
              <option value="15">15 minutos antes</option>
              <option value="30">30 minutos antes</option>
              <option value="60">1 hora antes</option>
              <option value="1440">1 día antes</option>
            </select>
          </label>
        </div>
      </div>

      <button
        type="button"
        disabled={busy || !canConfirm}
        onClick={confirmImport}
        className="mt-5 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Confirmando y programando..." : "Confirmar importación"}
      </button>

      {!canConfirm && (
        <p className="mt-2 text-sm text-amber-800">
          Guarda la revisión hasta que el estado sea Listo para vincular.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          {error}
        </div>
      )}
    </section>
  );
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return formatLocal(date);
}

function minimumDateTime(): string {
  return formatLocal(new Date());
}

function formatLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
