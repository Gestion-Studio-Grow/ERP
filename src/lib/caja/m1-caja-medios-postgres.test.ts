// N2 · M1 (Magra) — caja y medios, EJECUTADO contra Postgres con RLS (app_rls) y las Server Actions
// reales, con dos negocios. Plata y datos: cada asiento se cuenta en la base, desde afuera.
//
//   · C3  apertura a ciegas: cuenta antes de ver, la diferencia pide motivo, doble envío → UNA vez;
//   · C1  Tarjeta en los dos estados del enum (sin y con N2_enums.sql aplicada en ESTA base):
//         sólo se habilita con el valor en la base Y en el cliente de Prisma; sin romper nada;
//   · C2  columnas EFECTIVO · MP · TRANSFERENCIA · TARJETA con su esperado del libro;
//   · C4  el cierre reusa el conteo del turno; C5 turno abierto → rechazo con nombre;
//   · C6  causas probables; C8 recepción no cierra; doble envío del cierre → un solo cierre;
//   · C7  reabrir: sólo la dueña, con motivo, una vez, vuelve a congelar al cerrar, nunca un mes
//         congelado; Auditoría legible;
//   · B no se mezcla en ningún paso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const DIA_MS = 24 * 60 * 60 * 1000;

test("contra Postgres: caja y medios de M1 (a ciegas, Tarjeta en los dos estados, columnas, conteo único, reabrir) sin mezclar negocios", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;

  const { openCashSession, closeCashSession, tarjetaHabilitada } = await import("@/lib/caja-actions");
  const { cerrarDia, getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { reabrirDiaAction } = await import("@/lib/cierre-mes/acciones");
  const { CAMPO_ESPERADO_CONFIRMADO } = await import("@/lib/caja/esperado-del-cajon");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const { cierreMarker, APERTURA_TURNO_ACTOR_PREFIX } = await import("@/lib/caja/cierre-marca");
  const { CERRAR_DIA_SIN_PERMISO, REABRIR_DIA_ACTION, CIERRE_DIARIO_REABIERTO_ACTION } = await import("@/lib/caja/cierre-diario");
  const { hayValorEnum, olvidarSchemaProbe } = await import("@/lib/schema-probe");
  const { PaymentMethod } = await import("@/generated/prisma/enums");
  const { describirAccion } = await import("@/app/admin/(dashboard)/auditoria/frase");

  const hoy = dateStrInBusinessTz(new Date());
  const ayer = dateStrInBusinessTz(new Date(Date.now() - DIA_MS));
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(negocio: NegocioDePrueba, usuario: UsuarioDePrueba, accion: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario }, accion);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  const libroDe = async (tenantId: string) =>
    (await duenio.cashMovement.findMany({ where: { tenantId }, orderBy: { id: "asc" }, select: { id: true, type: true, method: true, amount: true, createdBy: true, reason: true } }));
  const cierresActivos = (tenantId: string, dia: string) =>
    duenio.auditLog.count({ where: { tenantId, entity: "CierreDiario", action: "caja.cierre-diario", entityId: dia } });

  // ── Semilla ────────────────────────────────────────────────────────────────
  // A: $12.000 de efectivo de ayer (sin cerrar) y el interruptor «arqueo-ciego» prendido por la consola.
  // B: lo suyo, distinto, con el interruptor apagado.
  await duenio.cashMovement.createMany({
    data: [
      { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 12_000, occurredAt: businessWallTimeToUtc(ayer, "12:00"), createdBy: "seed" },
      { tenantId: b.id, type: "VENTA", method: "EFECTIVO", amount: 7_777, occurredAt: businessWallTimeToUtc(ayer, "12:00"), createdBy: "seed" },
    ],
  });
  await duenio.auditLog.create({
    data: { tenantId: a.id, actor: "operator:qa", action: "interruptor.encender", entity: "Interruptor", entityId: "arqueo-ciego", channel: "operador" },
  });

  // ── C1 · Tarjeta SIN el valor en el enum ───────────────────────────────────
  olvidarSchemaProbe();
  assert.equal(await hayValorEnum("PaymentMethod", "DEBITO"), false, "la base nace sin DEBITO en PaymentMethod");
  assert.equal(await como(a, a.duenia, () => tarjetaHabilitada()), false, "sin el valor, Tarjeta no se ofrece");
  const deBSinEnum = await como(b, b.duenia, () => getCierreDiarioData(hoy));
  assert.deepEqual(deBSinEnum.columnas, ["EFECTIVO", "MP", "TRANSFERENCIA"], "sin Tarjeta habilitada y sin plata por tarjeta, la columna no aparece");

  // ── C3 · apertura a ciegas ─────────────────────────────────────────────────
  const aCiegas = await como(a, a.duenia, () => openCashSession(null, form({ openingFloat: "10.000" })));
  assert.ok(aCiegas && !aCiegas.ok && aCiegas.pideMotivo, "contó $10.000 a ciegas: pide motivo");
  assert.deepEqual(aCiegas.pideMotivo, { esperado: 12_000, diferencia: -2_000 }, "recién ahora se ve el esperado");
  assert.match(aCiegas.error.replace(/\s/g, " "), /Contaste \$ ?10\.000.*libro dice \$ ?12\.000.*faltan \$ ?2\.000/);
  assert.equal(await duenio.cashSession.count({ where: { tenantId: a.id } }), 0, "no se grabó nada");

  const sinMotivo = await como(a, a.duenia, () => openCashSession(null, form({ openingFloat: "10.000", [CAMPO_ESPERADO_CONFIRMADO]: "12000" })));
  assert.ok(sinMotivo && !sinMotivo.ok && sinMotivo.pideMotivo, "a ciegas la diferencia SIEMPRE lleva motivo");

  // Doble envío con motivo (doble toque): abre una vez, asienta −$2.000 una vez.
  const conMotivo = () =>
    como(a, a.duenia, () => openCashSession(null, form({ openingFloat: "10.000", [CAMPO_ESPERADO_CONFIRMADO]: "12000", motivo: "faltó el cambio de ayer" })));
  const [r1, r2] = await Promise.all([conMotivo(), conMotivo()]);
  const oks = [r1, r2].filter((r) => r?.ok);
  assert.equal(oks.length, 1, "una sola apertura");
  assert.ok([r1, r2].some((r) => r && !r.ok && r.yaAbierta), "el segundo envío ve la caja abierta");
  const difApertura = await duenio.cashMovement.findMany({ where: { tenantId: a.id, createdBy: { startsWith: APERTURA_TURNO_ACTOR_PREFIX } } });
  assert.equal(difApertura.length, 1, "la diferencia de apertura se asienta UNA vez");
  assert.equal(difApertura[0].type, "EGRESO");
  assert.equal(difApertura[0].amount, 2_000);
  assert.match(difApertura[0].reason ?? "", /Motivo: faltó el cambio de ayer/);

  // B (sin interruptor): la apertura de siempre, el motivo es opcional.
  const deB = await como(b, b.duenia, () => openCashSession(null, form({ openingFloat: "7.000", [CAMPO_ESPERADO_CONFIRMADO]: "7777" })));
  assert.equal(deB?.ok, true, "sin el interruptor nada cambia");
  const libroDeB = await libroDe(b.id);

  // ── El día de A: efectivo, Tarjeta (posnet en el libro), MP y transferencia ──
  const turno = await duenio.cashSession.findFirstOrThrow({ where: { tenantId: a.id, status: "OPEN" } });
  const ahora = new Date();
  await duenio.order.update({ where: { id: a.pedidos[1] }, data: { paid: true, paymentMethod: "TRANSFERENCIA", total: 3_000 } });
  await duenio.order.update({ where: { id: a.pedidos[2] }, data: { fulfillment: "DELIVERY", status: "READY", paid: false, total: 8_000 } });
  await duenio.cashMovement.createMany({
    data: [
      { tenantId: a.id, sessionId: turno.id, type: "VENTA", method: "EFECTIVO", amount: 5_000, occurredAt: ahora, createdBy: "pos" },
      { tenantId: a.id, sessionId: turno.id, type: "VENTA", method: "TARJETA", amount: 5_000, occurredAt: ahora, createdBy: "pos", reason: "Venta con posnet" },
      { tenantId: a.id, sessionId: turno.id, type: "VENTA", method: "MP", amount: 4_000, occurredAt: ahora, createdBy: "pos" },
      { tenantId: a.id, sessionId: turno.id, type: "VENTA", method: "MP", amount: 3_000, occurredAt: ahora, createdBy: "pos", orderId: a.pedidos[1] },
    ],
  });
  // Un envío en la calle sin rendir.
  await duenio.auditLog.create({
    data: { tenantId: a.id, actor: "user:x", action: "reparto", entity: "Order", entityId: a.pedidos[2], channel: "admin", changes: { tipo: "salio", reparto: "r1", franja: null, cadete: "Juan" } },
  });

  // ── C5 · con el turno abierto, el día no se cierra (y dice quién lo abrió) ──
  const conTurno = await como(a, a.duenia, () => cerrarDia(form({ day: hoy, declarado_EFECTIVO: "15.000", columnas: "x" })));
  assert.ok(conTurno && !conTurno.ok);
  assert.match(conTurno.errors.join(" "), new RegExp(`turno de caja abierto: lo abrió ${a.duenia.nombre}`));

  // Cierra el turno contando $15.000 (cuadra con el libro).
  const cierreTurno = await como(a, a.duenia, () => closeCashSession(null, form({ counted: "15.000", [CAMPO_ESPERADO_CONFIRMADO]: "15000" })));
  assert.equal(cierreTurno?.ok, true);

  // ── C2 · C4 · C6 · lo que muestra la hoja ──────────────────────────────────
  // Lo mismo que pide cierre/page.tsx: con «arqueo-ciego» prendido y sin turno abierto, sin
  // `esperadoALaVista` el efectivo vendría en blanco (cert F7; eso lo cubre el test «pantalla»).
  const hoja = await como(a, a.duenia, () => getCierreDiarioData(hoy, { conTurnosSinCerrar: true, esperadoALaVista: true }));
  assert.deepEqual(hoja.columnas, ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"], "Tarjeta aparece: se movió plata por tarjeta en el libro");
  assert.deepEqual(
    hoja.columnas.map((c) => hoja.preview.porColumna[c].expected),
    [15_000, 4_000, 3_000, 5_000],
    "esperado por columna, del libro; Transferencia separada de MP",
  );
  assert.equal(hoja.preview.porMedio.MP.expected, 7_000, "MP del libro = Mercado Pago + Transferencia");
  assert.equal(hoja.turnoAbierto, null);
  assert.equal(hoja.puedeCerrar, true);
  assert.ok(hoja.conteoDelTurno?.vigente, "el conteo del turno sigue valiendo: no se recuenta");
  assert.equal(hoja.conteoDelTurno?.contado, 15_000);
  assert.deepEqual(hoja.hechos?.repartoSinRendir, { cantidad: 1, monto: 8_000 }, "rendición de reparto pendiente");
  assert.deepEqual(hoja.hechos?.cuadernoConFechaVieja, { cantidad: 1, monto: 12_000 }, "la venta de ayer cargada hoy");
  assert.deepEqual(hoja.hechos?.ventasSinCobrar, { cantidad: 2, monto: 8_000 });

  // ── C8 · recepción no cierra ───────────────────────────────────────────────
  const hojaRecepcion = await como(a, a.recepcion, () => getCierreDiarioData(hoy));
  assert.equal(hojaRecepcion.puedeCerrar, false);
  assert.equal(hojaRecepcion.hechos, null, "sin la opción de la pantalla del cierre no se leen las causas");
  const deRecepcion = await como(a, a.recepcion, () => cerrarDia(form({ day: hoy, declarado_EFECTIVO: "15.000", columnas: "x" })));
  assert.deepEqual(deRecepcion, { ok: false, errors: [CERRAR_DIA_SIN_PERMISO] });

  // ── Doble envío del cierre: un solo cierre, un solo ajuste ─────────────────
  const cerrar = (transferencia: string) =>
    como(a, a.duenia, () =>
      cerrarDia(
        form({
          day: hoy,
          columnas: "EFECTIVO,MP,TRANSFERENCIA,TARJETA",
          declarado_EFECTIVO: "15.000",
          declarado_MP: "4.000",
          declarado_TRANSFERENCIA: transferencia,
          declarado_TARJETA: "5.000",
          note: "falta una transferencia",
        }),
      ),
    );
  const [c1, c2] = await Promise.all([cerrar("2.500"), cerrar("2.500")]);
  assert.equal([c1, c2].filter((r) => r?.ok).length, 1, "un solo cierre");
  assert.equal(await cierresActivos(a.id, hoy), 1);
  const ajustes = await duenio.cashMovement.findMany({ where: { tenantId: a.id, createdBy: cierreMarker(hoy) } });
  assert.equal(ajustes.length, 1, "la diferencia se asienta una vez");
  assert.deepEqual([ajustes[0].type, ajustes[0].method, ajustes[0].amount], ["EGRESO", "MP", 500], "Transferencia vive en MP del libro");
  assert.match(ajustes[0].reason ?? "", /faltante en Transferencia/);
  const filaCierre = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: a.id, entity: "CierreDiario", action: "caja.cierre-diario", entityId: hoy } });
  const porColumna = (filaCierre.changes as { porColumna?: Record<string, { diferencia: number | null }> }).porColumna;
  assert.equal(porColumna?.TRANSFERENCIA?.diferencia, -500, "el comprobante guarda la columna");

  // ── C7 · reabrir el día ────────────────────────────────────────────────────
  const cerrado = await como(a, a.duenia, () => getCierreDiarioData(hoy));
  assert.equal(cerrado.yaCerrado, true);
  assert.deepEqual(cerrado.reabrir, { puede: true }, "la dueña ve «Reabrir el día»");
  assert.equal((await como(a, a.recepcion, () => getCierreDiarioData(hoy))).reabrir, null, "recepción no lo ve");

  const reabrir = (u: UsuarioDePrueba, motivo: string) => como(a, u, () => reabrirDiaAction(null, form({ day: hoy, motivo })));
  const porRecepcion = await reabrir(a.recepcion, "faltó cargar una venta del cuaderno");
  assert.ok(porRecepcion && !porRecepcion.ok && /Sólo la dueña o el dueño/.test(porRecepcion.error));
  const corto = await reabrir(a.duenia, "porque sí");
  assert.ok(corto && !corto.ok && /Escribí por qué/.test(corto.error));
  assert.equal(await cierresActivos(a.id, hoy), 1, "sin motivo no se reabre nada");

  const [x1, x2] = await Promise.all([reabrir(a.duenia, "faltó cargar una venta del cuaderno"), reabrir(a.duenia, "faltó cargar una venta del cuaderno")]);
  assert.equal([x1, x2].filter((r) => r?.ok).length, 1, "se reabre una vez");
  assert.ok([x1, x2].some((r) => r && !r.ok && /ya está abierto/.test(r.error)));
  assert.equal(await cierresActivos(a.id, hoy), 0, "la frontera ya no cuenta ese cierre");
  assert.equal(await duenio.auditLog.count({ where: { tenantId: a.id, entity: "CierreDiario", action: CIERRE_DIARIO_REABIERTO_ACTION, entityId: hoy } }), 1);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, createdBy: cierreMarker(hoy) } }), 0, "se quitaron los ajustes de ese cierre");
  const filaReabrir = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: a.id, action: REABRIR_DIA_ACTION, entityId: hoy } });
  const frase = describirAccion({ ...filaReabrir, entityId: filaReabrir.entityId ?? null } as Parameters<typeof describirAccion>[0]);
  assert.match(frase.frase, /^Reabrió la caja del /, "Auditoría legible");
  assert.ok(frase.detalle.some((d) => d.includes("faltó cargar una venta del cuaderno")));

  // Carga lo que faltaba (la transferencia del cuaderno) y cierra de nuevo: cuadra, se congela otra vez.
  await duenio.order.update({ where: { id: a.pedidos[0] }, data: { paid: true, paymentMethod: "TRANSFERENCIA", total: 500 } });
  await duenio.cashMovement.create({ data: { tenantId: a.id, type: "VENTA", method: "MP", amount: 500, occurredAt: new Date(), createdBy: "pos", orderId: a.pedidos[0] } });
  const deNuevo = await cerrar("3.500");
  assert.equal(deNuevo?.ok, true, (deNuevo && !deNuevo.ok && deNuevo.errors.join(" ")) || "");
  assert.equal(await cierresActivos(a.id, hoy), 1, "vuelve a congelar");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, createdBy: cierreMarker(hoy) } }), 0, "cuadró: sin ajuste");

  // Nunca un mes congelado.
  await duenio.auditLog.create({
    data: { tenantId: a.id, actor: `user:${a.duenia.id}`, action: "cierre-mes.congelar", entity: "CierreMes", entityId: hoy.slice(0, 7), channel: "admin", changes: { por: "Dueña" } },
  });
  const mesCerrado = await reabrir(a.duenia, "faltó cargar otra venta del cuaderno");
  assert.ok(mesCerrado && !mesCerrado.ok && /mes congelado/.test(mesCerrado.error));
  assert.equal(await cierresActivos(a.id, hoy), 1, "el mes congelado no se toca");

  // ── C1 · Tarjeta CON el valor en el enum (N2_enums.sql, sólo en esta base efímera) ──
  const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/N2_enums.sql"), "utf8");
  const pasos = sql.split("\n").filter((l) => /^ALTER TYPE/.test(l.trim()));
  assert.equal(pasos.length, 5, "los ADD VALUE del paquete, cada uno en su paso");
  for (const paso of pasos) await duenio.$executeRawUnsafe(paso);
  olvidarSchemaProbe();
  assert.equal(await hayValorEnum("PaymentMethod", "DEBITO"), true, "aplicada: el probe lo ve");
  assert.equal(await hayValorEnum("PaymentMethod", "CREDITO"), true, "aplicada: el probe lo ve");
  const clienteConoce = ["DEBITO", "CREDITO"].every((v) => (Object.values(PaymentMethod) as string[]).includes(v));
  assert.equal(
    await como(a, a.duenia, () => tarjetaHabilitada()),
    clienteConoce,
    "con el valor en la base, Tarjeta se habilita SÓLO si el cliente de Prisma también lo conoce (schema.prisma `DEBITO`/`CREDITO // N2-enum-encendido:`)",
  );
  // Nada se rompe con el valor aplicado: los pedidos se leen y la hoja de B sigue sin Tarjeta si no hay cómo cobrarla.
  assert.equal((await duenio.order.findMany({ where: { tenantId: a.id }, select: { paymentMethod: true } })).length, 3);
  const deBConEnum = await como(b, b.duenia, () => getCierreDiarioData(hoy));
  assert.deepEqual(deBConEnum.columnas, clienteConoce ? ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"] : ["EFECTIVO", "MP", "TRANSFERENCIA"]);

  // ── B no se mezcló ─────────────────────────────────────────────────────────
  assert.deepEqual(await libroDe(b.id), libroDeB, "el libro de B no cambió con nada de A");
  assert.equal(await duenio.auditLog.count({ where: { tenantId: b.id, entity: "CierreDiario" } }), 0, "B no tiene cierres");
  assert.equal(deBConEnum.yaCerrado, false, "el cierre de A no congela a B");
});
