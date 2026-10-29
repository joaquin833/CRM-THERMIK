"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUp, ExternalLink, Loader2, MessageCircle, Plus, Sparkles, X } from "lucide-react";

type RecordLink = { type: string; id: string; label: string; url: string };
type AssistantResponse = {
  answer: string;
  recordsUsed: RecordLink[];
  suggestedAction: string | null;
};
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  records?: RecordLink[];
  action?: string | null;
};

const suggestions = [
  "¿Qué debo hacer hoy?",
  "¿Cuáles son las oportunidades prioritarias?",
  "¿Qué actividades están vencidas?",
  "Resume el desempeño comercial del mes.",
];

export function ThermikhausAICloud() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const context = useMemo(() => pageContext(pathname), [pathname]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(value: string) {
    const clean = value.trim();
    if (!clean || loading) return;

    setError("");
    setQuestion("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: clean },
    ]);
    setLoading(true);

    try {
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          pathname,
          entityType: context.entityType,
          entityId: context.entityId,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible consultar THERMIKHAUS AI");

      const result = body as AssistantResponse;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.answer,
          records: result.recordsUsed,
          action: result.suggestedAction,
        },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error al consultar la IA");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  function reset() {
    setMessages([]);
    setError("");
    setQuestion("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-emerald-900"
        aria-label="Abrir THERMIKHAUS AI"
      >
        <Sparkles className="size-5" />
        <span className="hidden sm:inline">THERMIKHAUS AI</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-slate-950/35" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <aside className="ml-auto flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl">
            <header className="border-b bg-gradient-to-r from-emerald-950 to-emerald-800 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-white/15">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-bold">THERMIKHAUS AI</h2>
                    <p className="mt-0.5 text-xs text-emerald-100">Asistente comercial contextual</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={reset} className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Nueva conversación">
                    <Plus className="size-4" />
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Cerrar asistente">
                    <X className="size-5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-emerald-50">
                Contexto: <strong>{context.label}</strong>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
              {!messages.length ? (
                <div>
                  <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <MessageCircle className="size-4 text-emerald-700" />
                      ¿Qué necesitas revisar?
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Consulta indicadores, riesgos, oportunidades, Agenda o cotizaciones usando datos reales del CRM.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {suggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => void ask(item)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  {messages.map((message) => (
                    <article key={message.id} className={message.role === "user" ? "ml-10 rounded-2xl rounded-br-md bg-emerald-800 px-4 py-3 text-sm text-white" : "mr-5 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"}>
                      <p className="whitespace-pre-wrap leading-6">{message.text}</p>
                      {!!message.records?.length && (
                        <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                          {message.records.map((record) => (
                            <Link key={`${record.type}-${record.id}`} href={record.url} onClick={() => setOpen(false)} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
                              {record.label}<ExternalLink className="size-3" />
                            </Link>
                          ))}
                        </div>
                      )}
                      {message.action && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                          <strong>Acción sugerida:</strong> {message.action}
                        </div>
                      )}
                    </article>
                  ))}
                  {loading && (
                    <div className="mr-20 flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm text-slate-500">
                      <Loader2 className="size-4 animate-spin text-emerald-700" /> Analizando el CRM...
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                  {error.toLowerCase().includes("consentimiento") && (
                    <Link href="/ia" onClick={() => setOpen(false)} className="mt-2 block font-semibold underline">Ir al Centro de IA</Link>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={submit} className="border-t bg-white p-4">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
                <textarea
                  rows={2}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void ask(question);
                    }
                  }}
                  placeholder="Pregunta sobre el CRM..."
                  className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-800 outline-none"
                />
                <button type="submit" disabled={!question.trim() || loading} className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white hover:bg-emerald-900 disabled:opacity-40" aria-label="Enviar pregunta">
                  <ArrowUp className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">Las respuestas son sugerencias y deben revisarse antes de tomar decisiones.</p>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

function pageContext(pathname: string) {
  const patterns = [
    { regex: /^\/cotizaciones\/([^/]+)/, entityType: "cotizacion", label: "Cotización" },
    { regex: /^\/oportunidades\/([^/]+)/, entityType: "oportunidad", label: "Oportunidad" },
    { regex: /^\/contactos\/([^/]+)/, entityType: "contacto", label: "Contacto" },
    { regex: /^\/empresas\/([^/]+)/, entityType: "empresa", label: "Empresa" },
    { regex: /^\/proyectos\/([^/]+)/, entityType: "proyecto", label: "Proyecto" },
  ];

  for (const pattern of patterns) {
    const match = pathname.match(pattern.regex);
    if (match) return { entityType: pattern.entityType, entityId: match[1], label: pattern.label };
  }

  const labels: Record<string, string> = {
    "/dashboard": "Dashboard comercial",
    "/agenda": "Agenda comercial",
    "/oportunidades": "Oportunidades",
    "/cotizaciones": "Cotizaciones",
    "/reportes": "Reportes ejecutivos",
    "/ia": "Centro de IA",
  };
  return { entityType: undefined, entityId: undefined, label: labels[pathname] ?? "CRM general" };
}
