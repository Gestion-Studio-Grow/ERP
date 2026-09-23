// El cierre del mes, EJECUTADO con datos: los ocho pasos, congelar y reabrir, el estado que
// sale de la auditoría, el número del botón y lo que ve el estudio contable.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCION_CONGELAR,
  ACCION_PAQUETE,
  ACCION_REABRIR,
  CIERRE_MES_ENTITY,
  PASOS,
  cierreMesCliente,
  datoCierreDelMes,
  estadoDesdeAuditoria,
  evaluarPasos,
  mesCerrable,
  mesParaCerrar,
  pasosListos,
  sinCallejones,
  validarCongelar,
  validarReabrir,
  type HechosCierreMes,
  type RegistroCierre,
} from "./cierre-mes";
import { contarComisionesDelMes, type TurnoSinLiquidar } from "./comisiones";
import { frozenDayMessage, isFrozenDay } from "@/lib/caja/cierre-diario";
import { PURGE_EXEMPT_ENTITIES, purgeAuditLogs } from "@/lib/audit-retention";

const HOY = new Date("2026-09-03T15:00:00.000Z"); // 03/09/2026, 12:00 en Buenos Aires

/** Una carnicería con todo en orden para agosto. */
const agostoEnOrden = (extra: Partial<HechosCierreMes> = {}): HechosCierreMes => ({
  mes: "2026-08",
  caja: { usaCaja: true, cerradoHasta: "2026-08-31" },
  comprobantes: { total: 40, sinCae: 0, rechazados: 0 },
  anuladasConFactura: 0,
  extracto: { movimientosDelMes: 55, ultimaFecha: "20260829" },
  compras: { total: 6, sinProveedor: 0 },
  comisiones: null,
  recuento: { recuentosDelMes: 12 },
  ...extra,
});

const fila = (action: string, iso: string, changes: Record<string, unknown> = { por: "Ana" }): RegistroCierre => ({
  action,
  createdAt: new Date(iso),
  changes,
});

const ABIERTO = estadoDesdeAuditoria([]);

test("Cierre de agosto: el checklist muestra 8 pasos, en orden", () => {
  const pasos = evaluarPasos(agostoEnOrden(), ABIERTO);
  assert.equal(pasos.length, 8);
  assert.deepEqual(pasos.map((p) => p.id), PASOS.map((p) => p.id));
  assert.deepEqual(
    pasos.map((p) => p.estado),
    ["listo", "listo", "listo", "listo", "listo", "no-aplica", "listo", "pendiente"],
    "con el mes abierto, el paquete todavía no es la versión final",
  );
  assert.equal(pasosListos(pasos), 7);
});

test("cada paso pendiente dice qué pasa, con el número, y adónde ir", () => {
  const pasos = evaluarPasos(
    agostoEnOrden({
      caja: { usaCaja: true, cerradoHasta: "2026-08-20" },
      comprobantes: { total: 40, sinCae: 1, rechazados: 2 },
      anuladasConFactura: 3,
      extracto: { movimientosDelMes: 0, ultimaFecha: null },
      compras: { total: 6, sinProveedor: 2 },
      comisiones: { pendientes: 4, esperanSaldo: 0 },
      recuento: { recuentosDelMes: 0 },
    }),
    ABIERTO,
  );
  const por = Object.fromEntries(pasos.map((p) => [p.id, p]));
  assert.match(por["dias-cerrados"].detalle, /cerrada hasta el 20\/08\/2026: falta cerrar hasta el 31\/08\/2026/);
  assert.equal(por["dias-cerrados"].bloquea, true);
  assert.equal(por["dias-cerrados"].accion?.href, "/admin/caja/cierre?dia=2026-08-31");
  assert.match(por["comprobantes-con-cae"].detalle, /1 comprobante sigue sin CAE · 2 rechazados por ARCA/);
  assert.match(por["anuladas-con-nota-de-credito"].detalle, /3 ventas anuladas tienen factura y ninguna nota de crédito/);
  assert.equal(por["anuladas-con-nota-de-credito"].accion?.href, "/admin/libros?mes=2026-08");
  assert.equal(por["extracto-importado"].accion?.href, "/admin/facturacion/bancos");
  assert.match(por["compras-con-proveedor"].detalle, /2 compras no tienen proveedor/);
  assert.match(por["comisiones-liquidadas"].detalle, /4 turnos de agosto con la comisión sin liquidar/);
  assert.equal(por["recuento"].accion?.href, "/admin/ajustes/recuento");
  // Sólo los días sin cerrar bloquean.
  assert.deepEqual(pasos.filter((p) => p.bloquea).map((p) => p.id), ["dias-cerrados"]);
});

test("lo que el negocio no usa no aplica (y cuenta como hecho); la caja cerrada hasta fin de mes, siempre", () => {
  const estetica = evaluarPasos(
    agostoEnOrden({
      caja: { usaCaja: false, cerradoHasta: null },
      comprobantes: { total: 0, sinCae: 0, rechazados: 0 },
      extracto: null,
      compras: { total: 0, sinProveedor: 0 },
      comisiones: { pendientes: 0, esperanSaldo: 0 },
      recuento: null,
    }),
    ABIERTO,
  );
  assert.deepEqual(
    estetica.map((p) => p.estado),
    ["pendiente", "no-aplica", "no-aplica", "no-aplica", "no-aplica", "listo", "no-aplica", "pendiente"],
  );
  // Sin movimientos de caja en el mes igual hay que cerrar el 31 (con $0): si no, un gasto
  // del 15 entraría después con el mes "congelado".
  const dias = estetica[0];
  assert.equal(dias.bloquea, true);
  assert.match(dias.detalle, /No hubo movimientos de caja hasta el 31\/08\/2026: cerrá igual ese día \(con \$0\)/);
  assert.deepEqual(dias.accion, { texto: "Cerrar la caja hasta el 31/08/2026", href: "/admin/caja/cierre?dia=2026-08-31" });
  assert.equal(pasosListos(estetica), 6);
});

test("congelado el mes, un gasto con fecha 15/08 se rechaza: no se congela sin la caja cerrada hasta el 31", () => {
  const conDiasAbiertos = agostoEnOrden({ caja: { usaCaja: true, cerradoHasta: "2026-08-14" } });
  const v = validarCongelar({
    mes: "2026-08",
    hoy: HOY,
    pasos: evaluarPasos(conDiasAbiertos, ABIERTO),
    estado: ABIERTO,
    confirmaPendientes: true, // ni confirmando: los días abiertos bloquean
  });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && /falta cerrar hasta el 31\/08\/2026/.test(v.error), !v.ok ? v.error : "");

  // Con la caja cerrada hasta el 31, se congela; y ese mismo cierre es el que hace que el
  // libro de caja rechace un gasto fechado el 15/08 (la regla de `addLibroEntry`).
  const listo = agostoEnOrden();
  assert.deepEqual(
    validarCongelar({ mes: "2026-08", hoy: HOY, pasos: evaluarPasos(listo, ABIERTO), estado: ABIERTO, confirmaPendientes: false }),
    { ok: true },
  );
  assert.equal(isFrozenDay("2026-08-15", listo.caja.cerradoHasta), true);
  assert.match(frozenDayMessage("2026-08-15", listo.caja.cerradoHasta!), /No se puede cargar ni borrar nada con esa fecha/);
});

test("congelar: el mes tiene que haber terminado, no puede estar congelado, y los pendientes se confirman", () => {
  const pasosOk = evaluarPasos(agostoEnOrden(), ABIERTO);
  const sept = validarCongelar({ mes: "2026-09", hoy: HOY, pasos: pasosOk, estado: ABIERTO, confirmaPendientes: true });
  assert.ok(!sept.ok && /todavía no terminó/.test(sept.error));

  const congelado = estadoDesdeAuditoria([fila(ACCION_CONGELAR, "2026-09-02T12:00:00Z")]);
  const dos = validarCongelar({ mes: "2026-08", hoy: HOY, pasos: pasosOk, estado: congelado, confirmaPendientes: true });
  assert.ok(!dos.ok && /ya está congelado/.test(dos.error));

  const conPendientes = evaluarPasos(agostoEnOrden({ comprobantes: { total: 40, sinCae: 0, rechazados: 1 } }), ABIERTO);
  const sinConfirmar = validarCongelar({ mes: "2026-08", hoy: HOY, pasos: conPendientes, estado: ABIERTO, confirmaPendientes: false });
  assert.ok(!sinConfirmar.ok && /Queda 1 paso pendiente/.test(sinConfirmar.error), !sinConfirmar.ok ? sinConfirmar.error : "");
  assert.deepEqual(
    validarCongelar({ mes: "2026-08", hoy: HOY, pasos: conPendientes, estado: ABIERTO, confirmaPendientes: true }),
    { ok: true },
  );
  assert.equal(mesCerrable("2026-08", HOY), true);
  assert.equal(mesCerrable("2026-09", HOY), false);
  assert.equal(mesParaCerrar(HOY), "2026-08");
});

test("reabrir exige OWNER y motivo", () => {
  const congelado = estadoDesdeAuditoria([fila(ACCION_CONGELAR, "2026-09-02T12:00:00Z")]);
  const recepcion = validarReabrir({ mes: "2026-08", estado: congelado, role: "RECEPTION", motivo: "falta una factura de compra" });
  assert.ok(!recepcion.ok && /dueña o el dueño/.test(recepcion.error));
  const sinMotivo = validarReabrir({ mes: "2026-08", estado: congelado, role: "OWNER", motivo: "  error " });
  assert.ok(!sinMotivo.ok && /Escribí por qué/.test(sinMotivo.error));
  assert.deepEqual(validarReabrir({ mes: "2026-08", estado: congelado, role: "OWNER", motivo: "Faltaba la compra del 28 al frigorífico" }), { ok: true });
  const abierto = validarReabrir({ mes: "2026-08", estado: ABIERTO, role: "OWNER", motivo: "Faltaba la compra del 28" });
  assert.ok(!abierto.ok && /no está congelado/.test(abierto.error));
});

test("el estado sale de la auditoría en orden, sin importar cómo llegan las filas; lo ajeno no cuenta", () => {
  const filas = [
    fila(ACCION_PAQUETE, "2026-09-05T12:00:00Z", { por: "Juan (Estudio Norte)" }),
    fila(ACCION_REABRIR, "2026-09-04T12:00:00Z", { por: "Ana", motivo: "Faltaba una compra" }),
    fila(ACCION_CONGELAR, "2026-09-02T12:00:00Z", { por: "Ana", listos: 6 }),
    fila(ACCION_CONGELAR, "2026-09-04T18:00:00Z", { por: "Ana", listos: 7 }),
    // Forjada o de otro módulo: no decide nada.
    fila("cierre-mes.otra-cosa", "2026-09-06T12:00:00Z"),
  ];
  const e = estadoDesdeAuditoria(filas);
  assert.equal(e.congelado, true);
  assert.equal(e.listosAlCongelar, 7);
  assert.equal(e.reabiertoPor, "Ana");
  assert.equal(e.motivoReapertura, "Faltaba una compra");
  assert.deepEqual(e.ultimaDescarga?.por, "Juan (Estudio Norte)");
  assert.equal(e.descargadoDespuesDeCongelar, true);

  // El paquete sólo está "listo" si se bajó DESPUÉS de congelar.
  const antes = estadoDesdeAuditoria([fila(ACCION_PAQUETE, "2026-09-01T12:00:00Z"), fila(ACCION_CONGELAR, "2026-09-02T12:00:00Z")]);
  assert.equal(antes.descargadoDespuesDeCongelar, false);
  assert.equal(evaluarPasos(agostoEnOrden(), antes).at(-1)?.estado, "pendiente");
  assert.equal(evaluarPasos(agostoEnOrden(), e).at(-1)?.estado, "listo");
  assert.match(evaluarPasos(agostoEnOrden(), e).at(-1)!.detalle, /Descargado por Juan \(Estudio Norte\) el 05\/09/);
});

test("el botón: 'Agosto · 8 de 8 pasos listos · paquete descargado por la contadora el 03/09'", () => {
  const filas = [
    fila(ACCION_CONGELAR, "2026-09-02T12:00:00Z", { por: "Ana", listos: 7 }),
    fila(ACCION_PAQUETE, "2026-09-03T13:00:00Z", { por: "Marta (Estudio Sur)" }),
  ];
  assert.deepEqual(datoCierreDelMes(filas, HOY, 3), {
    valor: "Agosto",
    detalle: "8 de 8 pasos listos · paquete descargado por Marta (Estudio Sur) el 03/09",
  });
  const sinBajar = datoCierreDelMes([filas[0]], HOY, 3);
  assert.equal(sinBajar.detalle, "7 de 8 pasos listos · falta descargar el paquete");
  assert.equal(sinBajar.alerta, undefined, "congelado: no pide nada hoy");
});

test("el botón sin congelar: los primeros días no alerta; desde el 3, 'Agosto sin cerrar' va a Para atender hoy", () => {
  const dia2 = datoCierreDelMes([], new Date("2026-09-02T15:00:00.000Z"), 2);
  assert.deepEqual(dia2, { valor: "Agosto", detalle: "sin congelar: entrá para ver qué falta" });
  const dia3 = datoCierreDelMes([], HOY, 3);
  assert.deepEqual(dia3.alerta, { valor: "Agosto", texto: "sin cerrar" });
});

test("lo que ve el estudio contable de un cliente", () => {
  assert.deepEqual(cierreMesCliente("2026-08", []), { mes: "2026-08", congelado: false, congeladoEl: null, paquete: null });
  const c = cierreMesCliente("2026-08", [
    fila(ACCION_CONGELAR, "2026-09-02T12:00:00.000Z"),
    fila(ACCION_PAQUETE, "2026-09-03T12:00:00.000Z", { por: "Marta (Estudio Sur)" }),
  ]);
  assert.deepEqual(c, {
    mes: "2026-08",
    congelado: true,
    congeladoEl: "2026-09-02T12:00:00.000Z",
    paquete: { el: "2026-09-03T12:00:00.000Z", por: "Marta (Estudio Sur)" },
  });
  // Filas incompletas (sin acción ni fecha) no rompen ni deciden nada.
  assert.equal(cierreMesCliente("2026-08", [{ entityId: "2026-08-21" } as unknown as RegistroCierre]).congelado, false);
});

test("paso 6: pendiente es sólo lo que la liquidación puede liquidar; con saldo o al 0% no", () => {
  const cobrado = (precio: number, cobrado: number) => ({ precio, cobros: [{ amount: cobrado, method: "EFECTIVO" }] });
  const turnos: TurnoSinLiquidar[] = [
    { professionalId: "ana", serviceId: "facial", ...cobrado(20000, 20000) }, // saldado, 40% → se liquida
    { professionalId: "ana", serviceId: "facial", ...cobrado(20000, 5000) }, // seña: espera el saldo
    { professionalId: "ana", serviceId: "cejas", ...cobrado(8000, 8000) }, // override 0%: nunca
    { professionalId: "recep", serviceId: "facial", ...cobrado(20000, 20000) }, // 0% general: nunca
    { professionalId: "ana", serviceId: "facial", precio: 20000, cobros: [], pagoLegado: { status: "APPROVED", amount: 20000 } }, // pago viejo, saldado
  ];
  const r = contarComisionesDelMes(
    turnos,
    new Map([["ana", 40], ["recep", 0]]),
    new Map([["ana", new Map([["cejas", 0]])]]),
  );
  assert.deepEqual(r, { pendientes: 2, esperanSaldo: 1 });

  // Con eso, el paso: pendiente con el botón, y los que esperan el saldo dichos aparte.
  const con = evaluarPasos(agostoEnOrden({ comisiones: r }), ABIERTO).find((p) => p.id === "comisiones-liquidadas")!;
  assert.equal(con.estado, "pendiente");
  assert.match(con.detalle, /^2 turnos de agosto con la comisión sin liquidar\. 1 turno más tiene saldo por cobrar/);
  // Sólo quedan los que esperan el saldo: "Liquidar comisiones" no los resuelve, así que el
  // paso no puede quedar pendiente por ellos (sería un pendiente sin salida).
  const soloSaldo = evaluarPasos(agostoEnOrden({ comisiones: { pendientes: 0, esperanSaldo: 3 } }), ABIERTO).find(
    (p) => p.id === "comisiones-liquidadas",
  )!;
  assert.equal(soloSaldo.estado, "listo");
  assert.match(soloSaldo.detalle, /3 turnos más tienen saldo por cobrar: su comisión se liquida cuando se cobre/);
});

test("un pendiente no termina en 'App no disponible': sin Libro IVA en el negocio, el paso 3 va sin botón y lo dice", () => {
  const pasos = evaluarPasos(agostoEnOrden({ anuladasConFactura: 2 }), ABIERTO);
  const sinLibros = sinCallejones(pasos, (href) => (href.startsWith("/admin/libros") ? "Libro IVA" : null));
  const p3 = sinLibros.find((p) => p.id === "anuladas-con-nota-de-credito")!;
  assert.equal(p3.accion, undefined);
  assert.match(p3.detalle, /\(Libro IVA no está habilitada en tu negocio: pedísela a GSG si la necesitás\.\)$/);
  assert.equal(p3.estado, "pendiente", "sigue pendiente: sólo se saca el botón");
  // Los demás botones quedan como estaban.
  const p8 = sinLibros.find((p) => p.id === "dias-cerrados")!;
  assert.deepEqual(p8, pasos.find((p) => p.id === "dias-cerrados"));
  // Con todas las apps, nada cambia.
  assert.deepEqual(sinCallejones(pasos, () => null), pasos);
});

test("la purga de auditoría (18 meses) no borra el cierre del mes: si no, un mes congelado vuelve a 'sin congelar'", async () => {
  assert.ok((PURGE_EXEMPT_ENTITIES as readonly string[]).includes(CIERRE_MES_ENTITY));
  const wheres: { entity?: { notIn?: string[] } }[] = [];
  const fake = {
    auditLog: {
      count: async (a: { where: (typeof wheres)[number] }) => (wheres.push(a.where), 0),
      deleteMany: async (a: { where: (typeof wheres)[number] }) => (wheres.push(a.where), { count: 0 }),
    },
  };
  await purgeAuditLogs(fake as unknown as Parameters<typeof purgeAuditLogs>[0], { dryRun: true });
  await purgeAuditLogs(fake as unknown as Parameters<typeof purgeAuditLogs>[0], { dryRun: false });
  assert.equal(wheres.length, 2);
  for (const w of wheres) assert.ok(w.entity?.notIn?.includes(CIERRE_MES_ENTITY), "la purga tiene que dejar las filas del cierre del mes");
});
