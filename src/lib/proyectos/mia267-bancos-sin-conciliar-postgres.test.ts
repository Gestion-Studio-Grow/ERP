// GSG-MIA-267 · tarea 6: la tarjeta de cada cuenta en Bancos dice cuántos renglones del extracto faltan conciliar.
// Un renglón conciliado con un movimiento de la cuenta (O38, `origenTipo`/`origenId`, M8) ya está conciliado: no cuenta.
// Postgres real, la app como `app_rls`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("MIA-267 · Bancos: «sin conciliar» descuenta también lo conciliado con un movimiento de la cuenta", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const { datosDeBancos } = await import("./empresa.server");

  const cuenta = await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco MIA-267" }, select: { id: true } });
  const renglon = (descripcion: string, extra: { origenTipo?: string; origenId?: string } = {}) =>
    duenio.proyectoMovBanco.create({ data: { tenantId: a.id, cuentaId: cuenta.id, fecha: new Date(), descripcion, importe: 1000, ...extra } });
  await renglon("Transferencia conciliada con un cobro", { origenTipo: "COBRO", origenId: "cobro-mia267" });
  await renglon("Transferencia conciliada con un pago", { origenTipo: "PAGO", origenId: "pago-mia267" });
  await renglon("Transferencia sin conciliar");

  const r = await ejecutarAccion({ negocio: a, usuario: { id: a.recepcion.id } }, () => datosDeBancos(a.id));
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  const { cuentas } = (r as { valor: Awaited<ReturnType<typeof datosDeBancos>> }).valor;
  assert.equal(cuentas.find((c) => c.id === cuenta.id)?.sinConciliar, 1, "3 renglones, 2 conciliados con un movimiento de la cuenta → 1 sin conciliar");
});
