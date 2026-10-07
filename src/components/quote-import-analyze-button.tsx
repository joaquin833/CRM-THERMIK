"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  importId: string;
  status: string;
};

export function QuoteImportAnalyzeButton({ importId, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canAnalyze = ["uploaded", "review", "error"].includes(status);

  async function analyze(): Promise<void> {
    try {
      setBusy(true);
      setError("");

      const response = await fetch(
        `/api/cotizaciones/importar/${importId}/analizar`,
        { method: "POST" }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No fue posible analizar el PDF."
        );
      }

      router.push(`/cotizaciones/importar/${importId}`);
      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible analizar el PDF."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canAnalyze) {
    return (
      <a
        href={`/cotizaciones/importar/${importId}`}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Revisar datos
      </a>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={analyze}
        className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Analizando PDF..." : "Analizar PDF"}
      </button>

      {error && (
        <p className="max-w-72 text-right text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
