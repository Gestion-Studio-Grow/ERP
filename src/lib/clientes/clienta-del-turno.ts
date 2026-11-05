// La clienta de un turno para precargar la venta («Sumar un producto», /admin/pedidos?turno=<id>).
// Lógica pura, aparte de la server action para probarla sin base: sin `clients:contact` (casilla 5
// de la matriz) el teléfono sale ENMASCARADO del servidor —nunca crudo en el payload RSC— y la venta
// se ata a la ficha por `clientId`, no por el teléfono (certificación M1).

import { enmascararTelefono, puedeVerContacto, type QuienMira } from "./telefono";

export type ClientaDelTurno = { nombre: string; telefono: string; clientId: string };

export function clientaDelTurnoPara(
  client: { id: string; name: string; phone: string },
  quien: QuienMira,
): ClientaDelTurno {
  const telefono = puedeVerContacto(quien) ? client.phone : (enmascararTelefono(client.phone) ?? "");
  return { nombre: client.name, telefono, clientId: client.id };
}
