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

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const selectedResult = useMemo(() => {
    return (
      activityResults.find(
        (result) =>
          result.codigo === form.resultCode
      ) ?? null
    );
  }, [activityResults, form.resultCode]);

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

  function updateF*eld(
  field: keyof FormState,
  v*lue: string
) {
  setForm((current* => {
    switch (field) {
      c*se "activityType":
        return *
          ...current,
          a*tivityType: value,
        };

   *  case "resultCode":
        retur* {
          ...current,
         *resultCode: value,
        };

   *  case "comment":
        return {*          ...current,
          co*ment: value,
        };

      cas* "nextAction":
        return {
  *       ...current,
          nextA*tion: value,
        };

      cas* "nextAt":
        return {
      *   ...current,
          nextAt: value,
        };

      case "priority":
        return {
          ...current,
          priority: value,
        };

      default:
        return current;
    }
  });

  setError("");
  setSuccess("");
}