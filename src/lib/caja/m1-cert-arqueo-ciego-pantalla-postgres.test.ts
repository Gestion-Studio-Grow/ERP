// Cert M1 F6 (vuelta 2; arreglado: a ciegas, un esperado «confirmado» sin conteo a ciegas escrito no
// se confirma — si cuadra no abre, si no cuadra queda escrito el conteo — y la pantalla Caja ya no
// muestra ni manda el esperado). (1) lo que mandaba OpenCajaForm: esperado a la vista y confirmado;
// (2) un esperado inventado en el primer envío revelaba el número sin dejar el conteo escrito.
// (3) F7 (vuelta 3): el resumen del día de la MISMA pantalla (`getCierreDiarioData`, «Lo que hay ahora» /
// «Queda») seguía mostrando el efectivo del libro al lado del formulario a ciegas.
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
  const { openCashSession, closeCashSession, getCajaData } = await import("@/lib/caja-actions");
  const { getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
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

  await t.test("(3) F7: el resumen del día de la pantalla Caja, a ciegas y sin turno, no entrega el efectivo del libro", async () => {
    const caja = await como(a, a.recepcion, () => getCajaData());
    assert.equal(caja.aperturaACiegas, true, "getCajaData no marcó la apertura a ciegas");
    assert.equal(caja.esperadoEnElCajon, null, "getCajaData mandó el esperado");
    // Lo que page.tsx (ResumenDelDia) y CajaRenglon (PorMedio) reciben en el mismo render que OpenCajaForm.
    const dia = await como(a, a.recepcion, () => getCierreDiarioData());
    assert.equal(dia.efectivoACiegas, true, "el loader no marcó el efectivo a ciegas");
    const ef = dia.preview.porMedio.EFECTIVO;
    assert.deepEqual(
      { expected: ef.expected, opening: ef.opening, ingresos: ef.ingresos, egresos: ef.egresos },
      { expected: 0, opening: 0, ingresos: 0, egresos: 0 },
      "la fila EFECTIVO salió con números: «al abrir + entró − salió» reconstruye el esperado",
    );
    assert.equal(dia.preview.porColumna.EFECTIVO.expected, 0);
    assert.equal(dia.preview.total.expected, 0, "el total incluye el efectivo");
    assert.equal(dia.conteoDelTurno, null);
    // Los otros medios siguen como siempre (van al banco; no se cuentan en el cajón).
    assert.equal(dia.preview.porMedio.MP.expected, 0);
    // El ataque de la cert: abrir con el número que muestra la pantalla. Ya no es el del libro: no abre.
    const r = await como(a, a.recepcion, () => openCashSession(null, form({ openingFloat: String(ef.expected) })));
    assert.ok(!r?.ok, `abrió con el número de la pantalla: ${JSON.stringify(r)}`);
    assert.equal(await duenio.cashSession.count({ where: { tenantId: a.id } }), 0);
    // La pantalla del cierre pide el esperado a la vista: ahí sigue (lo decide el dueño si cambia).
    const cierre = await como(a, a.duenia, () => getCierreDiarioData(undefined, { esperadoALaVista: true }));
    assert.equal(cierre.efectivoACiegas, false);
    assert.equal(cierre.preview.porMedio.EFECTIVO.expected, 12_000);
  });

  await t.test("(4) F8: segundo turno del día, a ciegas y sin turno: lo serializado no trae el esperado ni sus sumandos", async () => {
    // Turno mañana: cuenta 12.000 a ciegas (cuadra), vende 3.000 en efectivo, cierra contando 15.000.
    // (En (3) ya contó $0 a ciegas: ahora cuadra, pero queda pedido el motivo de aquel conteo.)
    const ab = await como(a, a.recepcion, () =>
      openCashSession(null, form({ openingFloat: "12.000", motivo: "recontado", [CAMPO_ESPERADO_CONFIRMADO]: esperadoParaElFormulario(12_000) })),
    );
    assert.equal(ab?.ok, true, `no abrió el turno mañana: ${JSON.stringify(ab)}`);
    await duenio.cashMovement.create({
      data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 3_000, occurredAt: new Date(), createdBy: "seed" },
    });
    const ce = await como(a, a.recepcion, () => closeCashSession(null as never, form({ counted: "15.000", [CAMPO_ESPERADO_CONFIRMADO]: esperadoParaElFormulario(15_000) })));
    assert.equal(ce?.ok, true, `no cerró el turno mañana: ${JSON.stringify(ce)}`);
    // Lo que la pantalla Caja recibe en el mismo render que OpenCajaForm, tal como viaja (serializado).
    const numeros = (x: unknown): number[] => JSON.stringify(x, (_k, v) => v).match(/-?\d+(?:\.\d+)?(?=[,}\]])/g)?.map(Number) ?? [];
    const pantalla = { dia: await como(a, a.recepcion, () => getCierreDiarioData()), caja: await como(a, a.recepcion, () => getCajaData()) };
    assert.equal(pantalla.dia.efectivoACiegas, true);
    const salen = numeros(pantalla);
    for (const n of [15_000, 12_000, 3_000, -3_000]) assert.ok(!salen.includes(n), `a ciegas, a la pantalla Caja llegó ${n} (esperado del libro o un sumando)`);
    // Con el turno abierto, todo como siempre: montos y esperado a la vista.
    const ab2 = await como(a, a.recepcion, () => openCashSession(null, form({ openingFloat: "15.000" })));
    assert.equal(ab2?.ok, true, `no abrió el turno tarde contando lo que había: ${JSON.stringify(ab2)}`);
    const conTurno = await como(a, a.recepcion, () => getCierreDiarioData());
    assert.equal(conTurno.efectivoACiegas, false);
    assert.equal(conTurno.preview.porMedio.EFECTIVO.expected, 15_000);
    assert.ok(conTurno.movements.some((m) => m.method === "EFECTIVO" && m.amount === 3_000));
    const cajaConTurno = await como(a, a.recepcion, () => getCajaData());
    assert.equal(cajaConTurno.esperadoEnElCajon, 15_000);
    assert.ok(cajaConTurno.recentClosed.length > 0, "con turno abierto, los turnos cerrados se ven como siempre");
  });
});
