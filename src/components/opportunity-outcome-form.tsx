"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  opportunityId: string;
  estimatedAmount: number;
};

type Outcome = "ganada" | "perdida" | "postergada" | "cancelada";

export function OpportunityOutcomeForm({
  opportunityId,
  estimatedAmount,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("ganada");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const effectiveAt = toIso(form.get("effectiveAt"));
    const reactivationAt = toIso(form.get("reactivationAt"));
    const amount = text(form.get("closedAmount"));

    try {
      const response = await fetch(
        `/api/oportunidades/${opportunityId}/resultado`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcomeType: outcome,
            effectiveAt,
            closedAmount: amount ? Number(amount) : null,
            lossReason: nullable(form.get("lossReason")),
            competitor: nullable(form.get("competitor")),
            postponementReason: nullable(form.get("postponementReason")),
            reactivationAt,
            comment: nullable(form.get("comment")),
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error || "No fue posible registrar el resultado.",
        );
      setOpen(false);
      router.refresh();
      router.push("/oportunidades");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible registrar el resultado.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Registrar resultado
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
                  Resultado comercial
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Cerrar o postergar oportunidad
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cerrar
              </button>
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                {error}
              </p>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Resultado
                </span>
                <select
                  value={outcome}
                  onChange={(event) =>
                    setOutcome(event.target.value as Outcome)
                  }
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="ganada">Ganada</option>
                  <option value="perdida">Perdida</option>
                  <option value="postergada">Postergada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </label>

              <Field
                label="Fecha efectiva"
                name="effectiveAt"
                type="datetime-local"
                defaultValue={nowInput()}
                required
              />

              {outcome === "ganada" && (
                <Field
                  label="Monto de cierre"
                  name="closedAmount"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={estimatedAmount}
                  required
                />
              )}

              {outcome === "perdida" && (
                <>
                  <Field label="Motivo de pérdida" name="lossReason" required />
                  <Field label="Competidor" name="competitor" />
                </>
              )}

              {outcome === "postergada" && (
                <>
                  <Field
                    label="Motivo de postergación"
                    name="postponementReason"
                    required
                  />
                  <Field
                    label="Fecha de reactivación"
                    name="reactivationAt"
                    type="datetime-local"
                    required
                  />
                </>
              )}

              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  {outcome === "cancelada"
                    ? "Motivo de cancelación *"
                    : "Comentario"}
                </span>
                <textarea
                  name="comment"
                  rows={4}
                  required={outcome === "cancelada"}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border px-4 py-2 font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Confirmar resultado"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...inputProps } = props;
  return (
    <label>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input {...inputProps} className="w-full rounded-lg border px-3 py-2" />
    </label>
  );
}

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}
function nullable(value: FormDataEntryValue | null): string | null {
  return text(value) || null;
}
function toIso(value: FormDataEntryValue | null): string | null {
  const result = text(value);
  return result ? new Date(result).toISOString() : null;
}
function nowInput(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
