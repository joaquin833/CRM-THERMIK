import { describe, expect, it } from "vitest";

import { eventFromTask } from "./calendar";

describe("evento Calendar", () => {
  it("incluye número de cotización e idempotencia", () => {
    const event = eventFromTask(
      {
        id: "t1",
        title: "Seguimiento de cotización",
        description: "Llamar",
        task_type: "follow_up",
        due_at: "2026-10-05T13:00:00.000Z",
        idempotency_key: "key1",
        cotizaciones: [
          {
            numero_cotizacion: "14394",
          },
        ],
        contactos: [
          {
            nombre: "Cliente",
            apellido: "Demo",
          },
        ],
      },
      "https://crm.example",
    );

    expect(event.summary).toContain("Cotización N.º 14394");
    expect(event.description).toContain("Cotización N.º 14394");
    expect(event.extendedProperties.private.idempotencyKey).toBe("key1");
    expect(event.start.timeZone).toBe("America/Santiago");
  });
});