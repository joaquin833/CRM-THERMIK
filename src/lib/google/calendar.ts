import { google } from "googleapis";

import { createClient } from "../supabase/server";
import { decryptToken, encryptToken } from "./crypto";

const GOOGLE_TIME_ZONE = "America/Santiago";
const DEFAULT_EVENT_MINUTES = 30;

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export async function authorizedCalendar(userId: string) {
  const supabase = await createClient();

  const { data: connection, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !connection) {
    throw new Error("Google Calendar no está conectado");
  }

  const oauth = oauthClient();

  oauth.setCredentials({
    access_token: decryptToken(connection.access_token_encrypted),
    refresh_token: connection.refresh_token_encrypted
      ? decryptToken(connection.refresh_token_encrypted)
      : undefined,
    expiry_date: connection.token_expiry
      ? new Date(connection.token_expiry).getTime()
      : undefined,
  });

  oauth.on("tokens", async (tokens) => {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (tokens.access_token) {
      update.access_token_encrypted = encryptToken(tokens.access_token);
    }

    if (tokens.refresh_token) {
      update.refresh_token_encrypted = encryptToken(tokens.refresh_token);
    }

    if (tokens.expiry_date) {
      update.token_expiry = new Date(tokens.expiry_date).toISOString();
    }

    await supabase
      .from("google_calendar_connections")
      .update(update)
      .eq("user_id", userId);
  });

  return {
    api: google.calendar({ version: "v3", auth: oauth }),
    oauth,
    connection,
    supabase,
  };
}

type CalendarTask = {
  id: string;
  title: string;
  description?: string | null;
  task_type: string;
  due_at: string;
  idempotency_key: string;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  cotizaciones?: Array<{ numero_cotizacion: string }>;
  contactos?: Array<{
    nombre: string;
    apellido?: string | null;
    telefono?: string | null;
    correo?: string | null;
  }>;
};

function taskTypeLabel(taskType: string) {
  const labels: Record<string, string> = {
    follow_up: "Seguimiento",
    call: "Llamada",
    meeting: "Reunión",
    email: "Correo",

    visit: "Visita",

    quote_review: "Revisión de cotización",
    whatsapp: "WhatsApp",
    task: "Tarea",
    other: "Actividad",
  };

  return labels[taskType] ?? taskType;
}

export function eventFromTask(task: CalendarTask, appUrl: string) {
  const quote = task.cotizaciones?.[0];
  const contact = task.contactos?.[0];
  const start = new Date(task.due_at);

  if (Number.isNaN(start.getTime())) {
    throw new Error("La tarea no tiene una fecha de vencimiento válida");
  }

  const end = new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60_000);
  const quoteTitle = quote
    ? `Cotización N.º ${quote.numero_cotizacion}`
    : "Seguimiento comercial";
  const contactName = contact
    ? `${contact.nombre} ${contact.apellido ?? ""}`.trim()
    : "Cliente";

  return {
    summary: `${taskTypeLabel(task.task_type)} | ${quoteTitle} | ${contactName}`,
    description: [
      task.title,
      quoteTitle,
      contact ? `Cliente: ${contactName}` : "",
      contact?.telefono ? `Teléfono: ${contact.telefono}` : "",
      contact?.correo ? `Correo: ${contact.correo}` : "",
      task.description ? `Objetivo: ${task.description}` : "",
      `${appUrl}/agenda`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      dateTime: start.toISOString(),
      timeZone: GOOGLE_TIME_ZONE,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: GOOGLE_TIME_ZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 30 }],
    },
    extendedProperties: {
      private: {
        crmTaskId: task.id,
        idempotencyKey: task.idempotency_key,
      },
    },
  };
}

export async function syncTask(userId: string, taskId: string) {
  const { api, connection, supabase } = await authorizedCalendar(userId);

  const { data: task, error } = await supabase
    .from("tasks")
    .select(
      "*,cotizaciones(numero_cotizacion),contactos(nombre,apellido,telefono,correo)",
    )
    .eq("id", taskId)
    .eq("assigned_to", userId)
    .single();

  if (error || !task) {
    throw new Error("Tarea no encontrada o no autorizada");
  }

  if (!task.due_at) {
    throw new Error("La tarea no tiene fecha de vencimiento");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL no está configurada");
  }

  const event = eventFromTask(task as CalendarTask, appUrl);
  const syncedAt = new Date().toISOString();

  try {
    const calendarId = task.google_calendar_id || connection.calendar_id;
    let response;

    if (task.google_event_id) {
      response = await api.events.update({
        calendarId,
        eventId: task.google_event_id,
        requestBody: event,
      });
    } else {
      response = await api.events.insert({
        calendarId: connection.calendar_id,
        requestBody: event,
      });
    }

    const { error: taskUpdateError } = await supabase
      .from("tasks")
      .update({
        sincronizado_google: true,
        google_calendar_id: connection.calendar_id,
        google_event_id: response.data.id,
        google_sync_status: "synced",
        google_sync_error: null,
        google_synced_at: syncedAt,
      })
      .eq("id", task.id)
      .eq("assigned_to", userId);

    if (taskUpdateError) {
      throw taskUpdateError;
    }

    await supabase
      .from("google_calendar_connections")
      .update({
        last_sync_at: syncedAt,
        last_error: null,
      })
      .eq("user_id", userId);

    return response.data;
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "Error Google Calendar";
    const failedAt = new Date().toISOString();

    await supabase
      .from("tasks")
      .update({
        google_sync_status: "error",
        google_sync_error: message,
        google_synced_at: failedAt,
      })
      .eq("id", task.id)
      .eq("assigned_to", userId);

    await supabase
      .from("google_calendar_connections")
      .update({ last_error: message })
      .eq("user_id", userId);

    throw reason;
  }
}
