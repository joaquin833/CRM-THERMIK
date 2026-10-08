"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  importId: string;
  status: string;
};

export function QuoteImportConfirmButton({
  importId,
  status,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canConfirm = status === "ready";
  const alreadyConfirmed = status === "confirmed";

  async function confirmImport(): Promise<void> {
    const accepted = window.confirm(
      "Se crearán o vincularán el contacto, proyecto, oportunidad, cotización e ítems oficiales. ¿Deseas continuar?"
    );

    if (!accepted) {
      return;
    }

    try {
      setBusy(true);
      setError("");

      const response = await fetch(
        `/api/cotizaciones/importar/${importId}/confirmar`,
        { method: "POST" }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No fue posible confirmar la importación."
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
          : "No fue posible confirmar la importación."
      );
    } finally {
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
        Confirmar importación
      </p>
      <p className="mt-1 text-sm text-emerald-800">
        Esta acción creará o vinculará los registros comerciales y luego abrirá la ficha de seguimiento.
      </p>

      <button
        type="button"
        disabled={busy || !canConfirm}
        onClick={confirmImport}
        className="mt-4 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Confirmando importación..." : "Confirmar importación"}
      </button>

      {!canConfirm && (
        <p className="mt-2 text-sm text-amber-800">
          Guarda la revisión hasta que el estado sea Listo para vincular.
        </p>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}
    </section>
  );
}
