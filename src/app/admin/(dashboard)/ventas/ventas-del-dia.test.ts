// ============================================================================
// VENTAS DEL DÍA — quién ve qué día, el mismo `where` que el Inicio y el tile de la dueña.
// ============================================================================
//
// El criterio del brief: "Ventas del día muestra la venta; al anularla con motivo, el tile de
// la dueña dice quién anuló". Se ejecutan los loaders REALES del Inicio contra una base falsa
// que devuelve las filas que deja `anularVentaCore`, y los filtros reales de la pantalla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import {
  whereVentasCobradas,
  whereVentasAnuladas,
  whereAnulacionesDelDia,
  leerAnulacion,
  porQuien,
  resumirAnulaciones,
  wherePedidosAbiertos,
} from "@/lib/order-anulacion";
import { LOADERS_MOSTRADOR, whereVentasDeHoy, resumirPedidos } from "@/apps/kpis/mostrador.server";
import { cargarKpiCon, type ContextoLoader, type DbKpi } from "@/apps/kpis/nucleo.server";
import { appPorId } from "@/apps/registro";
import { leerFiltros, notaDeDescuento, resumenDeVentas } from "./filtros";

const HOY = "2026-09-23";
const DESDE = businessWallTimeToUtc(HOY, "00:00");

function dbFalsa(respuestas: Record<string, unknown>) {
  const llamadas: { clave: string; args: Record<string, unknown> }[] = [];
  const db = new Proxy(
    {},
    {
      get: (_, modelo) =>
        new Proxy(
          {},
          {
            get: (__, op) => async (args: Record<string, unknown>) => {
              const clave = `${String(modelo)}.${String(op)}`;
              llamadas.push({ clave, args });
              return respuestas[clave] ?? [];
            },
          },
        ),
    },
  );
  return { db: db as unknown as DbKpi, llamadas };
}

function ctx(db: DbKpi, monto: boolean): ContextoLoader {
  return {
    db,
    tenantId: "t_magra",
    hoy: HOY,
    ahora: new Date("2026-09-23T15:00:00.000Z"),
    esMostrador: true,
    sustantivo: { uno: "corte", varios: "cortes" },
    monto,
  };
}

/** Las filas que deja `anularVentaCore` (order-actions.ts) al anular. */
const ANULO_JUAN = {
  entityId: "ord_40",
  actor: "user:u_juan",
  changes: { status: "CANCELLED", code: 40, motivo: "se pesó mal", rol: "RECEPTION", por: "Juan", montoRevertido: 23436 },
};
const ANULO_ANA = {
  entityId: "ord_41",
  actor: "user:u_ana",
  changes: { status: "CANCELLED", code: 41, motivo: "cliente arrepentido", rol: "OWNER", por: "Ana", montoRevertido: 7564 },
};

test("el tile de Ventas del día dice cuántas se anularon hoy y QUIÉN; la plata, sólo con reports:read", async () => {
  const conPlata = dbFalsa({ "auditLog.findMany": [ANULO_JUAN, ANULO_ANA] });
  const dueña = await LOADERS_MOSTRADOR["ventas-del-dia"](ctx(conPlata.db, true));
  assert.deepEqual(dueña, {
    valor: "2",
    detalle: "anulaciones hoy, por Juan y Ana",
    monto: "$31.000 anulados",
  });
  assert.equal(conPlata.llamadas.length, 1, "una sola consulta por tile");
  assert.deepEqual(conPlata.llamadas[0].args.where, whereAnulacionesDelDia("t_magra", DESDE), "el where de la pantalla");

  const sinPlata = dbFalsa({ "auditLog.findMany": [ANULO_JUAN] });
  assert.deepEqual(await LOADERS_MOSTRADOR["ventas-del-dia"](ctx(sinPlata.db, false)), {
    valor: "1",
    detalle: "anulación hoy, por Juan",
  });

  // Sin anulaciones es un 0 real (no falta el dato).
  const nada = dbFalsa({});
  assert.deepEqual(await LOADERS_MOSTRADOR["ventas-del-dia"](ctx(nada.db, true)), { valor: "0", detalle: "anulaciones hoy" });
});

test("recepción ve el número del tile pero no la plata: lo decide el registro, no el loader", async () => {
  const app = appPorId("ventas-del-dia");
  const deps = (db: DbKpi) => ({
    loaders: LOADERS_MOSTRADOR,
    negocio: async () => ({ ...ctx(db, true) }),
    log: { info: () => undefined, warn: () => undefined },
    reloj: () => 0,
  });
  const r1 = dbFalsa({ "auditLog.findMany": [ANULO_JUAN] });
  const recepcion = await cargarKpiCon(app, "RECEPTION", deps(r1.db));
  assert.deepEqual(recepcion, { estado: "ok", valor: "1", detalle: "anulación hoy, por Juan" });
  const r2 = dbFalsa({ "auditLog.findMany": [ANULO_JUAN] });
  const duenia = await cargarKpiCon(app, "OWNER", deps(r2.db));
  assert.ok(duenia && duenia.estado === "ok");
  assert.equal(duenia.monto, "$23.436 anulado");
});

test("anulaciones viejas sin nombre: el de la pantalla (por el usuario) o el rol en el tile", () => {
  const vieja = { entityId: "ord_9", actor: "user:u_juan", changes: { status: "CANCELLED", motivo: "x", rol: "RECEPTION", montoRevertido: 100 } };
  assert.equal(leerAnulacion(vieja).quien, "recepción");
  assert.equal(leerAnulacion(vieja, new Map([["u_juan", "Juan Pérez"]])).quien, "Juan Pérez");
  // Una fila rara no tira: monto 0, sin código.
  assert.deepEqual(leerAnulacion({ actor: "system", changes: null }), {
    orderId: null,
    code: null,
    monto: 0,
    motivo: "",
    quien: "alguien del equipo",
  });
  assert.deepEqual(resumirAnulaciones([ANULO_JUAN, ANULO_JUAN, ANULO_ANA]), { cantidad: 3, monto: 54436, quienes: ["Juan", "Ana"] });
  assert.equal(porQuien(["Juan", "Ana", "Pedro", "Luz"]), "por Juan, Ana y 2 más");
  assert.equal(porQuien([]), "");
});

test("hoy, la lista de ventas cobradas usa el MISMO where que el número de Vender en el Inicio", () => {
  assert.deepEqual(whereVentasCobradas("t_magra", DESDE), whereVentasDeHoy("t_magra", DESDE));
  // Otro día: con tope al día siguiente. Las anuladas siguen en la lista, marcadas.
  const hasta = businessWallTimeToUtc("2026-09-23", "00:00");
  const ayer = businessWallTimeToUtc("2026-09-22", "00:00");
  assert.deepEqual(whereVentasCobradas("t", ayer, hasta), {
    tenantId: "t",
    paid: true,
    status: { not: "CANCELLED" },
    createdAt: { gte: ayer, lt: hasta },
  });
  assert.deepEqual(whereVentasAnuladas("t", ayer, hasta), {
    tenantId: "t",
    paid: true,
    status: "CANCELLED",
    createdAt: { gte: ayer, lt: hasta },
  });
});

test("recepción ve sólo hoy aunque teclee otro día en la URL; la dueña, cualquier día pasado", () => {
  const recep = leerFiltros({ dia: "2026-09-01", medio: "EFECTIVO", canal: "COUNTER" }, { hoy: HOY, otrosDias: false });
  assert.deepEqual(recep, { dia: HOY, medio: "EFECTIVO", canal: "COUNTER" });
  const duenia = { hoy: HOY, otrosDias: true };
  assert.equal(leerFiltros({ dia: "2026-09-01" }, duenia).dia, "2026-09-01");
  assert.equal(leerFiltros({ dia: "2026-10-01" }, duenia).dia, HOY, "un día futuro cae a hoy");
  assert.equal(leerFiltros({ dia: "2026-02-30" }, duenia).dia, HOY, "una fecha que no existe cae a hoy");
  assert.deepEqual(leerFiltros({ medio: "TARJETA", canal: "PUERTA" }, duenia), { dia: HOY, medio: null, canal: null });
  assert.deepEqual(leerFiltros({ dia: ["2026-09-02", "x"] }, duenia).dia, "2026-09-02");
});

test("resumen: total y ticket promedio; sin ventas no hay promedio (no es 0)", () => {
  assert.deepEqual(resumenDeVentas([{ total: 28912.5 }, { total: 15500 }]), { cantidad: 2, total: 44412.5, promedio: 22206.25 });
  assert.deepEqual(resumenDeVentas([]), { cantidad: 0, total: 0, promedio: null });
});

test("Pedidos: 'para hoy' sale de la misma consulta de la bandeja, por el horario en la zona del negocio", async () => {
  const hoy10 = new Date("2026-09-23T13:00:00.000Z");
  const manana = new Date("2026-09-24T13:00:00.000Z");
  const { db, llamadas } = dbFalsa({
    "order.groupBy": [
      { status: "PREPARING", paid: false, scheduledFor: hoy10, _count: { _all: 2 } },
      { status: "PENDING", paid: false, scheduledFor: manana, _count: { _all: 1 } },
      { status: "DELIVERED", paid: false, scheduledFor: hoy10, _count: { _all: 1 } },
      { status: "READY", paid: true, scheduledFor: null, _count: { _all: 1 } },
    ],
  });
  assert.deepEqual(await LOADERS_MOSTRADOR.pedidos(ctx(db, true)), {
    valor: "5",
    detalle: "abiertos · 2 para hoy",
    alerta: { valor: "1", texto: "entregado sin cobrar" },
  });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args.where, wherePedidosAbiertos("t_magra"));
  // Sin horario, nada es "para hoy".
  assert.deepEqual(resumirPedidos([{ status: "PENDING", paid: false, _count: { _all: 3 } }]), {
    abiertos: 3,
    entregadosSinCobrar: 0,
    paraHoy: 0,
  });
});

test("la nota del descuento dice lo que se COBRÓ: después de pesar y ajustar, el monto del pedido y su %", () => {
  // Alta con el 10 % sobre $125.000 ($12.500); se pesó a 1 kg antes de cobrar y quedó $1.250.
  assert.equal(
    notaDeDescuento({ subtotal: 12500, discount: 1250 }, "Mostrador MAGRA"),
    "Descuento de $1.250,00 (10 %), lo aplicó Mostrador MAGRA.",
  );
  assert.equal(notaDeDescuento({ subtotal: 32625, discount: 3262.5 }, null), "Descuento de $3.262,50 (10 %).");
  assert.equal(notaDeDescuento({ subtotal: 32625, discount: 0 }, "Ana"), null);
});
