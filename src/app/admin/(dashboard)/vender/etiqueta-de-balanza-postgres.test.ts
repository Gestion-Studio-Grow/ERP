// MG-023 · F-1 (cert. Magra T1) contra Postgres de verdad: «Cobrar el de la etiqueta» es una línea a
// precio a mano con el nombre del producto, el importe del papel y el motivo «etiqueta de balanza».
// El servidor la controla con `controlarPreciosAManoEnTx` y el tope sale del ROL de la sesión:
//   · la dueña (OWNER, sin tope) la graba: total = el importe de la etiqueta, motivo en la auditoría;
//   · la recepcionista (RECEPTION) que forja el mismo formulario —aunque mande un «tope» propio— es
//     rechazada (el producto se vende por kilo y tiene precio) y no se graba nada;
//   · el otro negocio no ve ni toca nada (la línea del negocio A no aparece en B).
//
// Base efímera con RLS (`app_rls`), como el resto de los *-postgres. Sin Postgres local, se saltea.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { lineaAManoDeLaEtiqueta, MOTIVO_ETIQUETA_DE_BALANZA } from "./etiqueta-de-balanza";

const laBase = baseEfimeraDelArchivo();

test("Cobrar el de la etiqueta: la dueña lo graba con su motivo; la recepción forjándolo es rechazada sin grabar nada", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { createOrder } = await import("@/lib/order-actions");

  // Sin tildes en la base: el clúster local es SQL_ASCII (la regla compara sin tildes igual).
  await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacio", saleUnit: "WEIGHT", pricePerKg: 28600, unit: "kg", trackStock: false },
  });
  const linea = lineaAManoDeLaEtiqueta({ nombre: "Vacio", kg: 0.62, importeEtiqueta: 18538, importeSistema: 17732 });

  let n = 0;
  const formulario = (extra: [string, string][] = []) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      channel: "COUNTER",
      fulfillment: "PICKUP",
      paid: "on",
      paymentMethod: "EFECTIVO",
      idempotencyKey: `etiqueta-${++n}`,
    }))
      fd.set(k, v);
    fd.append("manualNombre", linea.nombre);
    fd.append("manualImporte", linea.importeText);
    fd.append("manualMotivo", linea.motivo);
    for (const [k, v] of extra) fd.append(k, v);
    return fd;
  };
  const vender = (negocio: typeof base.a, usuario: typeof base.a.duenia, fd: FormData) =>
    ejecutarAccion({ negocio, usuario }, () => createOrder(fd));
  const valor = (r: Awaited<ReturnType<typeof vender>>) => {
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof createOrder>> }).valor;
  };
  const contar = (tenantId: string) => duenio.order.count({ where: { tenantId } });

  // La foto del negocio B antes (la base efímera ya trae datos suyos).
  const fotoB = async () => [
    await contar(base.b.id),
    await duenio.auditLog.count({ where: { tenantId: base.b.id } }),
    await duenio.cashMovement.count({ where: { tenantId: base.b.id } }),
  ];
  const bAntes = await fotoB();

  // 1 · La recepcionista (con tope) forja la línea —y un «tope» propio en el formulario—: rechazo.
  const antes = await contar(base.a.id);
  const rRecepcion = valor(
    await vender(base.a, base.a.recepcion, formulario([["topePrecioAMano", "null"], ["tope", "0"], ["rol", "OWNER"]])),
  );
  assert.equal(rRecepcion?.ok, false, JSON.stringify(rRecepcion));
  assert.match(rRecepcion && !rRecepcion.ok ? rRecepcion.error : "", /se vende por kilo/);
  assert.equal(await contar(base.a.id), antes, "la recepción no grabó nada");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id } }), 0, "ni un peso en la caja");

  // 2 · La dueña (sin tope): se graba al importe de la etiqueta, sin producto, con el motivo.
  const rDuenia = valor(await vender(base.a, base.a.duenia, formulario()));
  assert.equal(rDuenia?.ok, true, JSON.stringify(rDuenia));
  const orden = await duenio.order.findFirst({
    where: { tenantId: base.a.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, total: true, paid: true, items: { select: { name: true, productId: true, lineTotal: true } } },
  });
  assert.equal(Number(orden?.total), 18538);
  assert.equal(orden?.paid, true);
  assert.deepEqual(
    orden?.items.map((i) => [i.name, i.productId, Number(i.lineTotal)]),
    [["Vacio", null, 18538]],
  );
  const rastro = await duenio.auditLog.findFirst({
    where: { tenantId: base.a.id, entity: "Order", entityId: orden!.id, action: "create" },
    select: { changes: true },
  });
  const preciosAMano = (rastro?.changes as { preciosAMano?: { motivo: string }[] } | null)?.preciosAMano ?? [];
  assert.equal(preciosAMano.length, 1, JSON.stringify(rastro?.changes));
  assert.ok(preciosAMano[0].motivo.startsWith(MOTIVO_ETIQUETA_DE_BALANZA), preciosAMano[0].motivo);

  // 3 · Aislamiento: nada de esto aparece en el negocio B.
  assert.deepEqual(await fotoB(), bAntes, "el negocio B quedó idéntico");
});
