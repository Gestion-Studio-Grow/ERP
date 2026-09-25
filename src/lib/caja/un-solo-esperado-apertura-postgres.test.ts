// ADR-101 · un fondo contado que no coincide con el libro: la diferencia se MUESTRA antes de abrir,
// la cajera la confirma, queda asentada UNA vez con quién y cuándo, y el día no la vuelve a asentar.
// Arnés: un-solo-esperado.arnes.ts.
//
// Qué NO prueba: el importe asentado es el mismo que el código viejo asentaba al cerrar el día
// (mismo monto, mismo signo, mismo saldo final). Lo que cambia es cuándo, por quién y que alguien
// lo ve y lo confirma antes. Si el libro estaba mal (efectivo que nunca estuvo), la diferencia no es
// un faltante de plata sino un error del libro, y eso lo decide el negocio, no el sistema. El monto
// es inventado: no reproduce el faltante del laboratorio de MAGRA ($146.578,25), del que no hay datos
// en el repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest } from "@/test/base-efimera";
import { preparar } from "@/lib/caja/un-solo-esperado.arnes";

test("contra Postgres: la diferencia al abrir se muestra, se confirma y queda una vez, con quién y cuándo; el día no la repite; B no se mezcla", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  const c = await preparar(laBase);
  const { a, b } = laBase;

  // El libro de A arrastra $12.345,67 en efectivo de ayer (sin cerrar) que no están en el cajón.
  // B tiene lo suyo, distinto, para que se note si algo se cruza.
  await c.operatorPrisma.cashMovement.createMany({
    data: [
      { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 12_345.67, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
      { tenantId: a.id, type: "VENTA", method: "MP", amount: 5_000, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
      { tenantId: b.id, type: "VENTA", method: "EFECTIVO", amount: 99_999, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
    ],
  });
  const libroDeB = await c.fotoDelLibro(b.id);

  // Antes de abrir, la pantalla ya dice lo que el libro espera en el cajón (lo mismo que lee el servidor).
  assert.equal(await c.esperadoEnPantalla(a), 12_345.67);
  assert.equal(await c.esperadoEnPantalla(b), 99_999, "B ve lo suyo");

  // Una pantalla vieja (vio $0 esperados) no abre: lo confirmado tiene que ser lo que se asienta.
  const vieja = await c.abrir(a, "0", 0);
  assert.equal(vieja?.ok, false);
  assert.match((vieja as { error: string }).error, /Mientras contabas cambió el efectivo esperado en el cajón: ahora es \$ ?12\.345,67/);
  assert.equal(await c.operatorPrisma.cashSession.count({ where: { tenantId: a.id } }), 0, "no se abrió");
  assert.equal((await c.conMarca(a.id, c.marcas.APERTURA_TURNO_ACTOR_PREFIX)).length, 0, "no se asentó nada");

  // La cajera cuenta el cajón vacío, ve «faltan $12.345,67», lo confirma y abre con $0.
  const antes = new Date();
  assert.deepEqual(await c.abrir(a, "0"), { ok: true });
  const despues = new Date();
  const turno = await c.operatorPrisma.cashSession.findFirstOrThrow({ where: { tenantId: a.id, status: "OPEN" } });

  // La diferencia al abrir: UNA fila, faltante por lo que el libro decía de más, en efectivo,
  // atada al turno que la encontró (quién: su `openedBy`; cuándo: `occurredAt`).
  const aperturas = await c.conMarca(a.id, c.marcas.APERTURA_TURNO_ACTOR_PREFIX);
  assert.equal(aperturas.length, 1, "la diferencia de apertura se asienta una sola vez");
  const ap = aperturas[0];
  assert.equal(ap.type, "EGRESO");
  assert.equal(ap.method, "EFECTIVO");
  assert.equal(ap.amount, 12_345.67);
  assert.equal(ap.createdBy, c.marcas.aperturaTurnoMarker(turno.id));
  assert.equal(turno.openedBy, `user:${a.duenia.id}`, "quién la encontró");
  assert.ok(ap.occurredAt >= antes && ap.occurredAt <= despues, "cuándo: al abrir");
  const auditoria = await c.operatorPrisma.auditLog.findFirstOrThrow({ where: { tenantId: a.id, entity: "CashSession", entityId: turno.id, action: "open" } });
  assert.deepEqual(
    (auditoria.changes as { saldoDelLibro?: number; diferenciaDeApertura?: number }).diferenciaDeApertura,
    -12_345.67,
    "la auditoría de la apertura dice la diferencia",
  );

  // B no puede cerrar el turno de A ni ve su caja.
  assert.deepEqual(await c.cerrarTurno(b, "0"), { ok: false, error: "No hay una caja abierta para cerrar." });
  assert.equal((await c.operatorPrisma.cashSession.findUniqueOrThrow({ where: { id: turno.id } })).status, "OPEN");

  // Vende $1.000 en efectivo en el turno y al cerrar cuenta $1.000: cuadra.
  await c.operatorPrisma.cashMovement.create({
    data: { tenantId: a.id, sessionId: turno.id, type: "VENTA", method: "EFECTIVO", amount: 1_000, createdBy: `user:${a.duenia.id}` },
  });
  assert.deepEqual(await c.cerrarTurno(a, "1000"), { ok: true });
  const cerrado = await c.operatorPrisma.cashSession.findUniqueOrThrow({ where: { id: turno.id } });
  assert.equal(cerrado.closingExpected, 1_000);
  assert.equal(cerrado.closingDiff, 0);
  assert.equal((await c.conMarca(a.id, c.marcas.ARQUEO_TURNO_ACTOR_PREFIX)).length, 0, "un turno que cuadra no escribe ajuste");

  // El cierre del día con el mismo cajón ($1.000) cuadra y no escribe nada: la diferencia ya quedó
  // al abrir. (El código viejo la asentaba acá, por el mismo monto; ver el encabezado.)
  const cierre = await c.cerrarElDia(a, c.hoy, "1000");
  assert.equal(cierre?.ok, true, JSON.stringify(cierre));
  assert.match((cierre as { message: string }).message, /No hubo diferencias\./);
  assert.equal((await c.conMarca(a.id, c.marcas.CIERRE_DIARIO_ACTOR_PREFIX)).length, 0, "el día no inventa faltante");
  assert.equal((await c.conMarca(a.id, c.marcas.APERTURA_TURNO_ACTOR_PREFIX)).length, 1, "y la diferencia sigue estando una sola vez");

  // Nada de todo esto tocó a B.
  assert.deepEqual(await c.fotoDelLibro(b.id), libroDeB, "el libro de B quedó igual");
  assert.equal(await c.operatorPrisma.cashSession.count({ where: { tenantId: b.id } }), 0);
});
