// ============================================================================
// UAT MAGRA 16/10 · El WhatsApp de quien compra en la tienda se valida en el borde.
// ============================================================================
//
// `placeOnlineOrder` (order-actions.ts) tomaba cualquier texto como teléfono: el local recibía
// un pedido al que no podía contestar. Se ejecuta la acción REAL como un anónimo de la vidriera
// del negocio A, contra Postgres efímero con RLS.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { TELEFONO_DEL_PEDIDO_INVALIDO } from "@/lib/contact-validation";

const laBase = baseEfimeraDelArchivo();

function pedido(telefono: string): FormData {
  const fd = new FormData();
  fd.set("customerName", "Clienta Teléfono");
  fd.set("customerPhone", telefono);
  fd.set("fulfillment", "PICKUP");
  return fd;
}

test("tienda: con un WhatsApp que no es teléfono no se toma el pedido y se dice qué corregir", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { placeOnlineOrder } = await import("@/lib/order-actions");
  const duenio = await prismaComoDuenio(base);
  const antes = await duenio.order.count({ where: { tenantId: base.a.id } });

  for (const malo of ["hola", "123", "11-2345"]) {
    const r: Awaited<ReturnType<typeof ejecutarAccion<Awaited<ReturnType<typeof placeOnlineOrder>>>>> = await ejecutarAccion({ negocio: base.a }, () => placeOnlineOrder({ ok: false, error: "" } as never, pedido(malo)));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    assert.deepEqual(r.tipo === "respuesta" && r.valor, { ok: false, error: TELEFONO_DEL_PEDIDO_INVALIDO, campo: "datos" });
  }
  assert.equal(await duenio.order.count({ where: { tenantId: base.a.id } }), antes, "no se grabó ningún pedido");

  // Un teléfono bien escrito pasa esa guarda (la bolsa vacía es lo siguiente que frena).
  const bien = await ejecutarAccion({ negocio: base.a }, () => placeOnlineOrder({ ok: false, error: "" } as never, pedido("11 2345 6789")));
  const valor = bien.tipo === "respuesta" ? bien.valor : null;
  assert.ok(valor && !valor.ok, JSON.stringify(bien));
  assert.notEqual(valor.ok === false ? valor.error : "", TELEFONO_DEL_PEDIDO_INVALIDO);
});
