"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ActivityResult = {
  id: string;
  codigo: string;
  nombre: string;
  requiere_proxima_accion: boolean;
  requiere_fecha: boolean;
  requiere_comentario: boolean;
  cierra_oportunidad: boolean;
  resultado_cierre: string | null;
  orden: number;
};

type QuoteFollowUpFormProps = {
  quoteId: string;
  quoteNumber: string;
  activityResults: ActivityResult[];
};

type FormState = {
  activityType: string;
  resultCode: string;
  comment: string;
  nextAction: string;
  nextAt: string;
  priority: string;
};

const initialState: FormState = {
  activityType: "Llamada",
  resultCode: "",
  comment: "",
  nextAction: "",
  nextAt: "",
  priority: "media",
};

export function QuoteFollowUpForm({
  quoteId,
  quoteNumber,
  activityResults,
}: QuoteFollowUpFormProps) {
  const router = useRouter();

  const [form, setForm] =
    useState<FormState>(initialState);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const selectedResult = useMemo(
    () =>
      activityResults.find(
        (result) =>
          result.codigo ===
          form.resultCode
      ) ?? null,
    [
      activityResults,
      form.resultCode,
    ]
  );

  const requiresComment =
    selectedResult
      ?.requiere_comentario ??
    false;

  const requiresNextAction =
    selectedResult
      ?.requiere_proxima_accion ??
    false;

  const requiresDate =
    selectedResult
      ?.requiere_fecha ??
    false;

  const closesOpportunity =
    selectedResult
      ?.cierra_oportunidad ??
    false;

  function updateField(
    field: keyof FormState,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field\]: value,
    }));

    setError("");
    setSuccess("");
  }

  function clearForm() {
    setForm(initialState);
    setError("");
    setSuccess("");
  }

  async function submitFollowUp(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!form.resultCode) {
      setError(
        "Selecciona el resultado del seguimiento."
      );

      return;
    }

    if (
      requiresComment &&
      !form.comment.trim()
    ) {
      setError(
        "El resultado seleccionado requiere un comentario."
      );

      return;
    }

    if (
      requiresNextAction &&
      !form.nextAction.trim()
    ) {
      setError(
        "El resultado seleccionado requiere una próxima acción."
      );

      return;
    }

    if (
      requiresDate &&
      !form.nextAt
    ) {
      setError(
        "El resultado seleccionado requiere una fecha de seguimiento."
      );

      return;
    }

    if (form.nextAt) {
      const selectedDate =
        new Date(form.nextAt);

      if (
        Number.isNaN(
          selectedDate.getTime()
        )
      ) {
        setError(
          "La fecha del seguimiento no es válida."
        );

        return;
      }

      if (
        selectedDate.getTime() <=
        Date.now()
      ) {
        setError(
          "La fecha del próximo seguimiento debe ser futura."
        );

        return;
      }
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const nextAt = form.nextAt
        ? new Date(
            form.nextAt
          ).toISOString()
        : null;

      const response = await fetch(
        `/api/cotizaciones/${quoteId}/followup`,
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body: JSON.stringify({
            activityType:
              form.activityType,

            resultCode:
              form.resultCode,

            comment:
              form.comment.trim() ||
              null,

            nextAction:
              form.nextAction.trim() ||
              null,

            nextAt,

            priority:
              form.priority,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error ===
            "string"
            ? result.error
            : "No fue posible registrar el seguimiento."
        );
      }

      setSuccess(
        result.message ??
          "Seguimiento registrado correctamente."
      );

      setForm(initialState);

      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible registrar el seguimiento."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Gestión comercial
        </p>

        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          Registrar seguimiento
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Cotización N.º{" "}
          {quoteNumber}. Registra el
          contacto realizado y programa la
          próxima acción cuando corresponda.
        </p>
      </div>

      <form
        onSubmit={submitFollowUp}
        className="mt-5 grid gap-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Canal de contacto

            <select
              value={
                form.activityType
              }
              disabled={busy}
              onChange={(event) =>
                updateField(
                  "activityType",
                  event.target.value
                )
              }
              className="rounded-lg border border-slate-300 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            >
              <ue="Llamada">
                Llamada
              </option>

              <option value="WhatsApp">
                WhatsApp
              </option>

              <option value="Correo">
                Correo
              </option>

              <option value="Reunion">
                Reunión
              </option>

              <option value="Visita">
                Visita
              </option>

              <option value="Nota">
                Nota interna
              </option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Resultado

            <select
              value={
                form.resultCode
              }
              disabled={busy}
              required
              onChange={(event) =>
                updateField(
                  "resultCode",
                  event.target.value
                )
              }
              className="rounded-lg border border-slate-300 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            >
              <option value="">
                Selecciona un resultado
              </option>

              {activityResults.map(
                (result) => (
                  <option
                    key={result.id}
                    value={
                      result.codigo
                    }
                  >
                    {result.nombre}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        {selectedResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-medium text-emerald-900">
              Resultado seleccionado:{" "}
              {selectedResult.nombre}
            </p>

            <ul className="mt-2 space-y-1 text-sm text-emerald-800">
              {requiresComment && (
                <li>
                  • Requiere un comentario.
                </li>
              )}

              {requiresNextAction && (
                <li>
                  • Requiere una próxima acción.
                </li>
              )}

              {requiresDate && (
                <li>
                  • Requiere una fecha futura.
                </li>
              )}

              {closesOpportunity && (
                <li>
                  • Este resultado puede cerrar o
                  postergar la oportunidad.
                </li>
              )}

              {!requiresComment &&
                !requiresNextAction &&
                !requiresDate &&
                !closesOpportunity && (
                  <li>
                    • No tiene requisitos
                    adicionales.
                  </li>
                )}
            </ul>
          </div>
        )}

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Comentario
          {requiresComment && (
            <span className="text-red-600">
              *
            </span>
          )}

          <textarea
            value={form.comment}
            disabled={busy}
            required={
              requiresComment
            }
            maxLength={5000}
            onChange={(event) =>
              updateField(
                "comment",
                event.target.value
              )
            }
            className="min-h-28 rounded-lg border border-slate-300 p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            placeholder="Ejemplo: El cliente confirmó que está evaluando la propuesta y responderá durante la semana."
          />

          <span className="text-xs font-normal text-slate-500">
            {form.comment.length}
            /5000 caracteres
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Próxima acción
            {requiresNextAction && (
              <span className="text-red-600">
                *
              </span>
            )}

            <input
              value={
                form.nextAction
              }
              disabled={busy}
              required={
                requiresNextAction
              }
              maxLength={1000}
              onChange={(event) =>
                updateField(
                  "nextAction",
                  event.target.value
                )
              }
              className="rounded-lg border border-slate-300 p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
              placeholder="Ejemplo: Volver a llamar"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Fecha del próximo seguimiento
            {requiresDate && (
              <span className="text-red-600">
                *
              </span>
            )}

            <input
              type="datetime-local"
              value={form.nextAt}
              disabled={busy}
              required={requiresDate}
              onChange={(event) =>
                updateField(
                  "nextAt",
                  event.target.value
                )
              }
              className="rounded-lg border border-slate-300 p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-slate-700 md:max-w-xs">
          Prioridad de la próxima tarea

          <select
            value={form.priority}
            disabled={busy}
            onChange={(event) =>
              updateField(
                "priority",
                event.target.value
              )
            }
            className="rounded-lg border border-slate-300 bg-white p-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          >
            <option value="baja">
              Baja
            </option>

            <option value="media">
              Media
            </option>

            <option value="alta">
              Alta
            </option>

            <option value="urgente">
              Urgente
            </option>
          </select>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-4"
          >
            <p className="font-medium text-red-900">
              No fue posible registrar el
              seguimiento
            </p>

            <p className="mt-1 text-sm text-red-800">
              {error}
            </p>
          </div>
        )}

        {success && (
          <div
            aria-live="polite"
            className="rounded-xl border border-emerald-300 bg-emerald-50 p-4"
          >
            <p className="font-medium text-emerald-900">
              {success}
            </p>

            <p className="mt-1 text-sm text-emerald-800">
              La ficha comercial y las tareas
              relacionadas fueron actualizadas.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Registrando..."
              : "Guardar seguimiento"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={clearForm}
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Limpiar
          </button>
        </div>
      </form>
    </section>
  );
}