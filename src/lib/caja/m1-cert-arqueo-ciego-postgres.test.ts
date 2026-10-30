// M1-C3 · arqueo a ciegas (caso de la certificación, F3; arreglado: el conteo ciego queda escrito y ata el
// recuento). Ataque: el primer conteo a ciegas ($10.000) devuelve el esperado
// ($12.000). Si el cajero cambia el número (la tarjeta lo permite: «Volver a contar» o editar el campo,
// que borra `pideMotivo` y vuelve a mandar SIN esperado), abre con $12.000, sin diferencia, sin motivo
// y sin rastro del conteo a ciegas. El faltante de $2.000 desaparece: el «a ciegas» no ata nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const DIA_MS = 24 * 60 * 60 * 1000;

test("a ciegas: el conteo ciego que no cuadró deja rastro y no se puede «recontar» al número del libro sin diferencia", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a } = laBase;
  const { openCashSession } = await import("@/lib/caja-actions");
  const { CAMPO_ESPERADO_CONFIRMADO } = await import("@/lib/caja/esperado-del-cajon");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const form = (c: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(c)) fd.set(k, v); return fd; };
  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };

  const ayer = dateStrInBusinessTz(new Date(Date.now() - DIA_MS));
  await duenio.cashMovement.create({
    data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 12_000, occurredAt: businessWallTimeToUtc(ayer, "12:00"), createdBy: "seed" },
  });
  await duenio.auditLog.create({
    data: { tenantId: a.id, actor: "operator:qa", action: "interruptor.encender", entity: "Interruptor", entityId: "arqueo-ciego", channel: "operador" },
  });

  // 1) Cuenta a ciegas $10.000 → el servidor revela el esperado.
  const ciego = await como(a, a.recepcion, () => openCashSession(null, form({ openingFloat: "10.000" })));
  assert.ok(ciego && !ciego.ok && ciego.pideMotivo, "pide motivo");

  // 2) Lo que manda AbrirCajaEnLinea tras editar el campo (onChange → setPideMotivo(null) → sin esperado):
  //    $12.000, sin esperado, sin motivo.
  const recontado = await como(a, a.recepcion, () => openCashSession(null, form({ openingFloat: "12.000" })));

  const difApertura = await duenio.cashMovement.count({ where: { tenantId: a.id, createdBy: { startsWith: "apertura-turno:" } } });
  const rastroDelCiego = await duenio.auditLog.count({
    where: { tenantId: a.id, OR: [{ changes: { path: ["openingFloat"], equals: 10_000 } }, { changes: { path: ["contadoACiegas"], equals: 10_000 } }] },
  });
  assert.ok(
    !recontado?.ok || difApertura === 1 || rastroDelCiego > 0,
    `abrió (${JSON.stringify(recontado)}) con el número del libro después de verlo: diferencias asentadas=${difApertura}, rastro del conteo ciego de $10.000=${rastroDelCiego}`,
  );

  // Lo que exige el arreglo: el conteo ciego quedó en la Auditoría desde el primer envío…
  const filaCiega = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: a.id, action: "caja.apertura-a-ciegas" } });
  assert.deepEqual(
    { contado: (filaCiega.changes as Record<string, unknown>).contadoACiegas, esperado: (filaCiega.changes as Record<string, unknown>).esperado },
    { contado: 10_000, esperado: 12_000 },
  );
  // …el recuento que cuadra igual pide motivo, y dice los dos números…
  assert.ok(recontado && !recontado.ok && recontado.pideMotivo, `el recuento sin motivo no abre: ${JSON.stringify(recontado)}`);
  assert.equal(recontado.pideMotivo.primerConteo, 10_000);
  assert.match(recontado.error, /A ciegas contaste \$ ?10\.000.*ahora contaste \$ ?12\.000/);
  assert.equal(await duenio.cashSession.count({ where: { tenantId: a.id } }), 0, "no se abrió nada todavía");
  // …y con el motivo abre: sin diferencia (cuadra), pero el asiento y la Auditoría llevan los dos números.
  const conMotivo = await como(a, a.recepcion, () =>
    openCashSession(null, form({ openingFloat: "12.000", [CAMPO_ESPERADO_CONFIRMADO]: "12000", motivo: "conté mal el primer fajo" })),
  );
  assert.deepEqual(conMotivo, { ok: true });
  const apertura = await duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, type: "APERTURA" } });
  assert.match(apertura.reason ?? "", /A ciegas se contó \$ ?10\.000 \(el libro decía \$ ?12\.000\); al abrir, \$ ?12\.000\. Motivo: conté mal el primer fajo/);
  const filaOpen = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: a.id, entity: "CashSession", action: "open" } });
  assert.equal((filaOpen.changes as Record<string, unknown>).contadoACiegas, 10_000);
  assert.equal((filaOpen.changes as Record<string, unknown>).motivo, "conté mal el primer fajo");
});
