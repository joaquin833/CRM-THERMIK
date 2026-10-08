"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = {
  quoteId: string;
  quoteNumber: string;
  hasPendingFollowUp: boolean;
};

const ACTIONS = [
  "Confirmar recepción de la cotización",
  "Llamar al cliente para revisar la propuesta",
  "Enviar correo de seguimiento",
  "Enviar WhatsApp de seguimiento",
  "Programar reunión con el cliente",
  "Revisar antecedentes pendientes",
];

export function InitialQuoteFollowUpForm({
  quoteId,
  quoteNumber,
  hasPendingFollowUp,
}: Props) {
  const router = useRouter();
  const defaultDueAt = useMemo(() => buildDefaultDueAt(), []);
  const [action, setAction] = useState(ACTIONS[0]);
  const [customAction, setCustomAction] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [priority, setPriority] = useState("alta");
  const [reminderMinutes, setReminderMinutes] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const selectedAction = action === "otra" ? customAction.trim() : action;

      if (!selectedAction) {
        throw new Error("Ingresa la primera acción comercial.");
      }

      const dueDate = new Date(dueAt);
      if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
        throw new Error("La fecha del seguimiento debe ser futura.");
      }

      const response = await fetch(
        `/api/cotizaciones/${quoteId}/seguimiento-inicial`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: selectedAction,
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
            : "No fue posible programar el seguimiento.",
        );
      }

      setSuccess(result.message ?? "Seguimiento programado correctamente.");
      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible programar el seguimiento.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-sm font-medium uppercase tracking-wide text-amber-800">
        A3 · Seguimiento inicial
      </p>
      <h2 className="mt-1 text-xl font-semibold text-amber-950">
        {hasPendingFollowUp
          ? "Reprogramar primer seguimiento"
          : "Programar primer seguimiento"}
      </h2>
      <p className="mt-2 text-sm text-amber-900">
        Cotización N.º {quoteNumber}. La tarea quedará vinculada al contacto,
        proyecto, oportunidad y ejecutivo responsable.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Primera acción
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-lg border bg-white p-3"
          >
            {ACTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="otra">Otra acción</option>
          </select>
        </label>

        {action === "otra" && (
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Describir acción
            <input
              value={customAction}
              onChange={(event) => setCustomAction(event.target.value)}
              maxLength={500}
              required
              className="rounded-lg border bg-white p-3"
            />
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Fecha y hora
            <input
              type="datetime-local"
              value={dueAt}
              min={toLocalInputValue(new Date())}
              onChange={(event) => setDueAt(event.target.value)}
              required
              className="rounded-lg border bg-white p-3"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Prioridad
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="rounded-lg border bg-white p-3"
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
              className="rounded-lg border bg-white p-3"
            >
              <option value="">Sin recordatorio</option>
              <option value="15">15 minutos antes</option>
              <option value="30">30 minutos antes</option>
              <option value="60">1 hora antes</option>
              <option value="1440">1 día antes</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-fit rounded-lg bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {busy
            ? "Programando seguimiento..."
            : hasPendingFollowUp
              ? "Actualizar primer seguimiento"
              : "Programar primer seguimiento"}
        </button>
      </form>
    </section>
  );
}

function buildDefaultDueAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return toLocalInputValue(date);
}

function toLocalInputValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
