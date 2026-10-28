import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth/authorization";
import { syncTask } from "@/lib/google/calendar";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const profile = await requireProfile([
      "admin",
      "jefatura_comercial",
      "ejecutivo_comercial",
    ]);

    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id")
      .eq("assigned_to", profile.id)
      .in("status", ["pending", "in_progress"])
      .not("due_at", "is", null)
      .gte("due_at", now)
      .order("due_at", { ascending: true })
      .limit(100);

    if (error) {
      throw error;
    }

    let synced = 0;
    let failed = 0;
    const errors: Array<{ taskId: string; error: string }> = [];

    for (const task of tasks ?? []) {
      try {
        await syncTask(profile.id, task.id);
        synced += 1;
      } catch (reason) {
        failed += 1;
        errors.push({
          taskId: task.id,
          error:
            reason instanceof Error
              ? reason.message
              : "Error desconocido al sincronizar",
        });
      }
    }

    return NextResponse.json({
      total: tasks?.length ?? 0,
      synced,
      failed,
      errors,
    });
  } catch (reason) {
    return NextResponse.json(
      {
        error:
          reason instanceof Error
            ? reason.message
            : "Error al sincronizar Google Calendar",
      },
      { status: 400 },
    );
  }
}
