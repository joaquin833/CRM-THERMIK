import { describe, expect, it } from "vitest";

import { eventFromTask } from "./calendar";

describe("evento Calendar", () => {
  it("genera un titulo claro e incluye cotizacion e idempotencia", () => {
    const event = eventFromTask(
      {
        id: "t1",
        title: "Seguimiento de cotización",
        description: "Llamar",
        task_type: "follow_up",
        due_at: "2026-10-29T12:00:00.000Z",
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

    expect(event.summary).toBe(
      "[Seguimiento] Seguimiento de cotización | Cliente Demo",
    );
    expect(event.description).toContain("Actividad: Seguimiento de cotización");
    expect(event.description).toContain("Tipo: Seguimiento");
    expect(event.description).toContain("Cotización: 14394");
    expect(event.description).toContain("Contacto: Cliente Demo");
    expect(event.description).toContain(
      "Abrir en CRM: https://crm.example/agenda",
    );
    expect(event.extendedProperties.private.idempotencyKey).toBe("key1");
    expect(event.start.timeZone).toBe("America/Santiago");
  });

  it("traduce revision de cotizacion en el titulo", () => {
    const event = eventFromTask(
      {
        id: "t2",
        title: "Revisar condiciones comerciales",
        task_type: "quote_review",
        due_at: "2026-10-30T14:00:00.000Z",
        idempotency_key: "key2",
      },
      "https://crm.example",
    );

    expect(event.summary).toBe(
      "[Revisión de cotización] Revisar condiciones comerciales",
    );
  });
});
