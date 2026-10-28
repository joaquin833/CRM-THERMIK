import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProfile } from "@/lib/auth/authorization";
import { deleteTaskEvent, syncTask } from "@/lib/google/calendar";

const payloadSchema = z.object({ taskId: z.string().uuid() });
const roles = ["admin", "jefatura_comercial", "ejecutivo_comercial"] as const;

export async function POST(request: Request) {
  try {
    const profile = await requireProfile([...roles]);
    const { taskId } = payloadSchema.parse(await request.json());
    const event = await syncTask(profile.id, taskId);

    return NextResponse.json({
      eventId: event.id,
      htmlLink: event.htmlLink,
      status: event.status,
    });
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Error al sincronizar" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await requireProfile([...roles]);
    const { taskId } = payloadSchema.parse(await request.json());
    const result = await deleteTaskEvent(profile.id, taskId);
    return NextResponse.json(result);
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Error al eliminar el evento" },
      { status: 400 },
    );
  }
}
