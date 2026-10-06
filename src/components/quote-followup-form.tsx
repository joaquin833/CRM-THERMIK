"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedResult = useMemo(
    () =>
      activityResults.find(
        (result) =>
          result.codigo === form.resultCode
      ) ?? null,
    [activityResults, form.resultCode]
  );

  const requiresComment =
    selectedResult?.requiere_comentario ??
    false;

  const requiresNextAction =
    selectedResult?.requiere_proxima_accion ??
    false;

  const requiresDate =
    selectedResult?.requiere_fecha ??
    false;

  const closesOpportunity =
    selectedResult?.cierra_oportunidad ??
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
 