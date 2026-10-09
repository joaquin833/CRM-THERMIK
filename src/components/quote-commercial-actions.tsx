"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type LossReason = {
  id: string;
  nombre: string;
  requiere_comentario: boolean;
};

type Props = {
  quoteId: string;
  quoteNumber: string;
  currentStatus: string;
  total: number;
  lossReasons: LossReason[];
};

type ActionType = "sent" | "received" | "won" | "lost" | "postponed";
type Payload = Record<string, unknown>;

const CLOSED_STATUSES = ["Aprobada", "Perdida", "Anulada externamente"];

export function QuoteCommercialActions({
  quoteId,
  quoteNumber,
  currentStatus,
  total,
  lossReasons,
}: Props) {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const isClosed = CLOSED_STATUSES.includes(currentStatus);

  function selectAction(action: ActionType): void {
    setActiveAction((current) => (current === action ? null : action));
    setError("");
    setSuccess("");
  }

  async function submit(
    endpoint: string,
    payload: Payload,
    fallbackMessage: string,
  ): Promise<void> {
    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const response = await fetch(`/api/cotizaciones/${quoteId}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "No fue posible completar la acción.",
        );
      }

      setSuccess(result.message ?? fallbackMessage);
      setActiveAction(null);
      router.refresh();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "No fue posible completar la acción.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
        Hitos comerciales
      </p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">
        Cambiar etapa comercial
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Cotización N.º {quoteNumber}. Estas acciones registran hitos formales;
        la próxima tarea se programa en Registrar seguimiento.
      </p>

      {isClosed ? (
        <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
          Esta cotización tiene un cierre definitivo. Las acciones operativas
          están deshabilitadas.
        </div>
      ) : (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <ActionButton
            label="Marcar como enviada"
            active={activeAction === "sent"}
            onClick={() => selectAction("sent")}
          />
          <ActionButton
            label="Confirmar recepción"
            active={activeAction === "received"}
            onClick={() => selectAction("received")}
          />
          <ActionButton
            label="Aprobar cotización"
            active={activeAction === "won"}
            onClick={() => selectAction("won")}
          />
          <ActionButton
            label="Marcar como perdida"
            active={activeAction === "lost"}
            onClick={() => selectAction("lost")}
          />
          <ActionButton
            label="Postergar decisión"
            active={activeAction === "postponed"}
            onClick={() => selectAction("postponed")}
          />
        </div>
      )}

      {activeAction === "sent" && (
        <SentForm
          busy={busy}
          onSubmit={(payload) =>
            submit("enviar", payload, "Hito de envío registrado.")
          }
        />
      )}

      {activeAction === "received" && (
        <ReceivedForm
          busy={busy}
          onSubmit={(payload) =>
            submit(
              "confirmar-recepcion",
              payload,
              "Hito de recepción registrado.",
            )
          }
        />
      )}

      {activeAction === "won" && (
        <WonForm
          busy={busy}
          defaultAmount={total}
          onSubmit={(payload) =>
            submit("cerrar", payload, "Cotización aprobada.")
          }
        />
      )}

      {activeAction === "lost" && (
        <LostForm
          busy={busy}
          lossReasons={lossReasons}
          onSubmit={(payload) =>
            submit("cerrar", payload, "Pérdida registrada.")
          }
        />
      )}

      {activeAction === "postponed" && (
        <PostponedForm
          busy={busy}
          onSubmit={(payload) =>
            submit("cerrar", payload, "Postergación registrada.")
          }
        />
      )}

      {error && <Message tone="error">{error}</Message>}
      {success && <Message tone="success">{success}</Message>}
    </section>
  );
}

function SentForm({ busy, onSubmit }: FormProps) {
  const [channel, setChannel] = useState("Correo");
  const [sentAt, setSentAt] = useState(nowLocal());
  const [comment, setComment] = useState("");

  return (
    <ControlledForm
      title="Registrar hito de envío"
      busy={busy}
      onSubmit={() =>
        onSubmit({
          channel,
          sentAt: toIso(sentAt),
          comment: nullable(comment),
        })
      }
    >
      <SelectField
        label="Canal de envío"
        value={channel}
        onChange={setChannel}
        options={[
          "Correo",
          "WhatsApp",
          "Entrega personal",
          "Portal externo",
          "Otro",
        ]}
      />
      <DateField label="Fecha de envío" value={sentAt} onChange={setSentAt} />
      <TextField
        label="Comentario opcional"
        value={comment}
        onChange={setComment}
        multiline
      />
      <FormHint>
        Esta acción no crea una tarea. Usa Registrar seguimiento para programar
        el próximo contacto.
      </FormHint>
    </ControlledForm>
  );
}

function ReceivedForm({ busy, onSubmit }: FormProps) {
  const [channel, setChannel] = useState("Llamada");
  const [receivedAt, setReceivedAt] = useState(nowLocal());
  const [confirmedBy, setConfirmedBy] = useState("");
  const [comment, setComment] = useState("");

  return (
    <ControlledForm
      title="Registrar hito de recepción"
      busy={busy}
      onSubmit={() =>
        onSubmit({
          channel,
          receivedAt: toIso(receivedAt),
          confirmedBy: nullable(confirmedBy),
          comment: nullable(comment),
        })
      }
    >
      <SelectField
        label="Canal de confirmación"
        value={channel}
        onChange={setChannel}
        options={["Llamada", "WhatsApp", "Correo", "Reunion", "Otro"]}
      />
      <DateField
        label="Fecha de recepción"
        value={receivedAt}
        onChange={setReceivedAt}
      />
      <TextField
        label="Persona que confirmó"
        value={confirmedBy}
        onChange={setConfirmedBy}
      />
      <TextField
        label="Comentario opcional"
        value={comment}
        onChange={setComment}
        multiline
      />
      <FormHint>
        Esta acción no crea una tarea. Usa Registrar seguimiento para programar
        el próximo contacto.
      </FormHint>
    </ControlledForm>
  );
}

function WonForm({
  busy,
  defaultAmount,
  onSubmit,
}: FormProps & { defaultAmount: number }) {
  const [approvedAmount, setApprovedAmount] = useState(String(defaultAmount));
  const [comment, setComment] = useState("Propuesta aprobada por el cliente.");

  return (
    <ControlledForm
      title="Aprobar cotización"
      busy={busy}
      confirmText="Esta acción cerrará la oportunidad como ganada. ¿Deseas continuar?"
      onSubmit={() =>
        onSubmit({
          result: "ganada",
          approvedAmount: Number(approvedAmount),
          comment: nullable(comment),
          priority: "media",
        })
      }
    >
      <TextField
        label="Monto aprobado"
        value={approvedAmount}
        onChange={setApprovedAmount}
        type="number"
        required
      />
      <TextField
        label="Comentario"
        value={comment}
        onChange={setComment}
        multiline
      />
    </ControlledForm>
  );
}

function LostForm({
  busy,
  lossReasons,
  onSubmit,
}: FormProps & { lossReasons: LossReason[] }) {
  const [lossReasonId, setLossReasonId] = useState(lossReasons[0]?.id ?? "");
  const [competitor, setCompetitor] = useState("");
  const [comment, setComment] = useState("");
  const selected = lossReasons.find((reason) => reason.id === lossReasonId);

  return (
    <ControlledForm
      title="Marcar como perdida"
      busy={busy}
      confirmText="Esta acción cerrará la oportunidad como perdida. ¿Deseas continuar?"
      onSubmit={() =>
        onSubmit({
          result: "perdida",
          lossReasonId,
          competitor: nullable(competitor),
          comment: nullable(comment),
          priority: "media",
        })
      }
    >
      <SelectField
        label="Motivo de pérdida"
        value={lossReasonId}
        onChange={setLossReasonId}
        options={lossReasons.map((reason) => reason.id)}
        labels={Object.fromEntries(
          lossReasons.map((reason) => [reason.id, reason.nombre]),
        )}
      />
      <TextField
        label="Competidor"
        value={competitor}
        onChange={setCompetitor}
      />
      <TextField
        label={
          selected?.requiere_comentario
            ? "Comentario obligatorio"
            : "Comentario"
        }
        value={comment}
        onChange={setComment}
        multiline
        required={selected?.requiere_comentario}
      />
    </ControlledForm>
  );
}

function PostponedForm({ busy, onSubmit }: FormProps) {
  const [comment, setComment] = useState("");
  const [nextAction, setNextAction] = useState(
    "Retomar contacto con el cliente",
  );
  const [nextAt, setNextAt] = useState(nextWeekLocal());
  const [priority, setPriority] = useState("media");

  return (
    <ControlledForm
      title="Postergar decisión"
      busy={busy}
      onSubmit={() =>
        onSubmit({
          result: "postergada",
          comment,
          nextAction,
          nextAt: toIso(nextAt),
          priority,
        })
      }
    >
      <TextField
        label="Motivo de postergación"
        value={comment}
        onChange={setComment}
        multiline
        required
      />
      <TextField
        label="Próxima acción"
        value={nextAction}
        onChange={setNextAction}
        required
      />
      <DateField
        label="Fecha de reactivación"
        value={nextAt}
        onChange={setNextAt}
        future
      />
      <PriorityField value={priority} onChange={setPriority} />
      <FormHint>
        Postergar sí crea una tarea porque la fecha de reactivación forma parte
        del hito comercial.
      </FormHint>
    </ControlledForm>
  );
}

type FormProps = {
  busy: boolean;
  onSubmit: (payload: Payload) => Promise<void>;
};

function ControlledForm({
  title,
  busy,
  onSubmit,
  confirmText,
  children,
}: {
  title: string;
  busy: boolean;
  onSubmit: () => Promise<void>;
  confirmText?: string;
  children: ReactNode;
}) {
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    await onSubmit();
  }

  return (
    <form
      className="mt-5 grid gap-4 rounded-xl border bg-slate-50 p-4"
      onSubmit={handleSubmit}
    >
      <p className="font-semibold text-slate-950">{title}</p>
      {children}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy ? "Guardando..." : title}
      </button>
    </form>
  );
}

function ActionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  required?: boolean;
  type?: string;
}) {
  const className = "rounded-lg border border-slate-300 bg-white p-3";
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      {multiline ? (
        <textarea
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          className={className}
          rows={3}
        />
      ) : (
        <input
          type={type}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  labels = {},
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <select
        value={value}
        required
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white p-3"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  future = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  future?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        type="datetime-local"
        value={value}
        min={future ? nowLocal() : undefined}
        required
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white p-3"
      />
    </label>
  );
}

function PriorityField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectField
      label="Prioridad"
      value={value}
      onChange={onChange}
      options={["baja", "media", "alta", "urgente"]}
      labels={{
        baja: "Baja",
        media: "Media",
        alta: "Alta",
        urgente: "Urgente",
      }}
    />
  );
}

function FormHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
      {children}
    </p>
  );
}

function Message({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "success";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      aria-live={tone === "success" ? "polite" : undefined}
      className={`mt-4 rounded-xl border p-4 text-sm ${
        tone === "error"
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-emerald-300 bg-emerald-50 text-emerald-900"
      }`}
    >
      {children}
    </div>
  );
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function nowLocal(): string {
  return formatLocal(new Date());
}

function nextWeekLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(10, 0, 0, 0);
  return formatLocal(date);
}

function formatLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
