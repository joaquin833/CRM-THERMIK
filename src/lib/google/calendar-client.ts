import type { AgendaTask } from "@/lib/agenda";

async function calendarRequest(method: "POST" | "DELETE", taskId: string) {
  const response = await fetch("/api/google/sync-task", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "No fue posible sincronizar Google Calendar");
  }
  return body;
}

export async function syncAgendaTaskAutomatically(task: AgendaTask) {
  const isFuture = new Date(task.due_at).getTime() >= Date.now();
  const isActive = task.status === "pending" || task.status === "in_progress";

  if (!isFuture || !isActive) return { skipped: true };

  try {
    return await calendarRequest("POST", task.id);
  } catch (reason) {
    console.warn("Agenda guardada, pero Google Calendar no pudo sincronizarse", reason);
    return { skipped: true, error: true };
  }
}

export async function removeAgendaTaskFromCalendar(taskId: string) {
  try {
    return await calendarRequest("DELETE", taskId);
  } catch (reason) {
    console.warn("Agenda actualizada, pero el evento de Google Calendar no pudo eliminarse", reason);
    return { skipped: true, error: true };
  }
}
