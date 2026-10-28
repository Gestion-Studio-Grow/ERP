// Cert M1 F6 (vuelta 2; arreglado: a ciegas, un esperado «confirmado» sin conteo a ciegas escrito no
// se confirma — si cuadra no abre, si no cuadra queda escrito el conteo — y la pantalla Caja ya no
// muestra ni manda el esperado). (1) lo que mandaba OpenCajaForm: esperado a la vista y confirmado;
// (2) un esperado inventado en el primer envío revelaba el número sin dejar el conteo escrito.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const DIA_MS = 24 * 60 * 60 * 1000;

test("a ciegas encendido: no se abre con el número del libro sin un conteo ciego registrado", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { openCashSession } = await import("@/lib/caja-actions");
  const { CAMPO_ESPERADO_CONFIRMADO, esperadoParaElFormulario } = await import("@/lib/caja/esperado-del-cajon");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const form = (c: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(c)) fd.set(k, v); return fd; };
  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  const ayer = dateStrInBusinessTz(new Date(Date.now() - DIA_MS));
  for (const n of [a, b]) {
    await duenio.cashMovement.create({
      data: { tenantId: n.id, type: "VENTA", method: "EFECTIVO", amount: 12_000, occurredAt: businessWallTimeToUtc(ayer, "12:00"), createdBy: "seed" },
    });
    await duenio.auditLog.create({
      data: { tenantId: n.id, actor: "operator:qa", action: "interruptor.encender", entity: "Interruptor", entityId: "arqueo-ciego", channel: "operador" },
    });
  }
  const rastro = (tenantId: string) => duenio.auditLog.count({ where: { tenantId, action: "caja.apertura-a-ciegas" } });

  await t.test("(1) lo que manda la pantalla Caja (OpenCajaForm): esperado a la vista y confirmado", async () => {
    const r = await como(a, a.recepcion, () =>
      openCashSession(null, form({ openingFloat: "12.000", [CAMPO_ESPERADO_CONFIRMADO]: esperadoParaElFormulario(12_000) })),
    );
    assert.ok(!r?.ok, `con «arqueo-ciego» encendido abrió desde la pantalla Caja con el número del libro, sin conteo ciego (rastro=${await rastro(a.id)})`);
  });

  await t.test("(2) esperado inventado en el primer envío: el error revela el número y no queda rastro", async () => {
    const r1 = await como(b, b.recepcion, () =>
      openCashSession(null, form({ openingFloat: "10.000", [CAMPO_ESPERADO_CONFIRMADO]: "1" })),
    );
    const revela = !r1?.ok && /12\.000/.test(r1?.error ?? "");
    const filas = await rastro(b.id);
    assert.ok(!(revela && filas === 0), `el primer envío reveló el esperado («${r1 && !r1.ok ? r1.error : ""}») sin registrar el conteo a ciegas de $10.000`);
    const r2 = await como(b, b.recepcion, () =>
      openCashSession(null, form({ openingFloat: "12.000", [CAMPO_ESPERADO_CONFIRMADO]: esperadoParaElFormulario(12_000) })),
    );
    assert.ok(!r2?.ok || (await rastro(b.id)) > 0, `abrió con $12.000 sin motivo tras contar $10.000 a ciegas: ${JSON.stringify(r2)}`);
  });
});
