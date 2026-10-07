"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type UploadResult = {
  id: string;
  status: string;
  file_name: string;
  file_size: number;
  created_at: string;
};

export function QuotePdfUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);

  function selectFile(event: ChangeEvent<HTMLInputElement>): void {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    setSuccess("");
    setUploaded(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (selected.type !== "application/pdf" || !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError("Selecciona un archivo PDF válido.");
      event.target.value = "";
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("El PDF supera el límite de 10 MB.");
      event.target.value = "";
      return;
    }

    setFile(selected);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!file) {
      setError("Selecciona una cotización en formato PDF.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");
      setUploaded(null);

      const body = new FormData();
      body.set("file", file);

      const response = await fetch("/api/cotizaciones/importar", {
        method: "POST",
        body,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No fue posible cargar el PDF."
        );
      }

      setUploaded(result.import as UploadResult);
      setSuccess(result.message ?? "PDF cargado correctamente.");
      setFile(null);

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible cargar el PDF."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          Paso 1
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">
          Cargar PDF oficial
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          El documento se almacenará de forma privada. El CRM no creará la
          cotización hasta que los datos extraídos sean revisados y confirmados.
        </p>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Archivo PDF
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={selectFile}
            className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-4 file:py-2 file:font-semibold file:text-white hover:border-emerald-400 disabled:opacity-50"
          />
        </label>

        {file && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-medium text-emerald-950">{file.name}</p>
            <p className="mt-1 text-sm text-emerald-800">
              {formatBytes(file.size)} · PDF listo para cargar
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="font-semibold text-red-900">No fue posible cargar el PDF</p>
            <p className="mt-1 text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && uploaded && (
          <div aria-live="polite" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-950">{success}</p>
            <p className="mt-1 text-sm text-emerald-800">
              Estado: pendiente de análisis · {uploaded.file_name}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy || !file}
            className="rounded-lg bg-brand px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Cargando PDF..." : "Cargar PDF"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setFile(null);
              setError("");
              setSuccess("");
              setUploaded(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Limpiar
          </button>
        </div>
      </form>
    </section>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
