// ============================================================================
// TEST-GATE · LA PLATA QUE MENTÍA EN LA BANDEJA DE PEDIDOS
// ============================================================================
//
// Cuatro agujeros, y lo que pasaba antes con cada uno:
//
//  · ANULAR. «Cancelar» anulaba de un toque, sin motivo, y cualquiera con permiso de pedidos
//    podía anular una venta de cualquier día sin cerrar: la plata de un arqueo ajeno se movía
//    sin dejar escrito por qué.
//  · ENTREGAR. No pedía el cobro: el pedido pasaba a entregado sin cobrar, caía a "Cerrados"
//    sin botones y esa plata no llegaba nunca a la caja.
//  · LA BANDEJA. Una sola consulta con `take: 100`: con 100 tickets de mostrador, el pedido
//    online de ayer quedaba fuera del corte y desaparecía.
//  · LA TIENDA. Tres de las cuatro vidrieras no mandaban la clave anti-duplicado: el doble
//    toque del celular creaba dos pedidos y descontaba el stock dos veces.
//
// Sin base (ADR-026): se ejecutan las funciones REALES —`reglasDeAnulacion` +
// `anularVentaInTx` en el mismo orden que `anularVentaCore`, `entregarPedidoGuarded`,
// `insertOrderGuarded`, los `where` de la bandeja— contra dobles que hacen respetar lo que
// hace respetar Postgres (compare-and-set, índice único de la clave).
//
// Vive junto a la pantalla y no en src/lib/ porque es el frente de la bandeja el que lo
// escribe; lo que prueba son los módulos puros que la pantalla usa.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anularVentaInTx,
  AnulacionVentaRechazada,
  reglasDeAnulacion,
  MOTIVO_ANULACION_SIN_TEXTO,
  planDeEntrega,
  entregarPedidoGuarded,
  wherePedidosAbiertos,
  wherePedidosCerrados,
  whereEntregadosSinCobrar,
  type AnulacionVentaTx,
} from "@/lib/order-anulacion";
import { alcanceDeAnulacion, type Role } from "@/lib/capabilities";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { medioDeCobroRequerido, mensajeYaCobrado, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { insertOrderGuarded } from "@/lib/order-core";

// Un tick de la cola de eventos: con esto, dos llamadas en `Promise.all` leen las dos antes
// de que cualquiera escriba, que es la carrera real del doble toque.
const pausa = () => new Promise<void>((r) => setImmediate(r));

// ── 1. ANULAR: quién, qué día y con qué motivo ──────────────────────────────

type Fila = Record<string, unknown>;

const HOY = "2026-09-23";
const AYER_AL_MEDIODIA = new Date("2026-09-22T15:00:00Z");
const HOY_AL_MEDIODIA = new Date("2026-09-23T15:00:00Z");

function mundoDeVenta(opts: { cobradaEl?: Date | null; creadaEl?: Date; ventaAparece?: "despues-del-bloqueo" }) {
  const m = {
    order: {
      id: "ord_1",
      code: 42,
      status: "DELIVERED",
      createdAt: opts.creadaEl ?? opts.cobradaEl ?? HOY_AL_MEDIODIA,
      items: [{ productId: "prod_vacio", name: "Vacío al vacío", quantity: 1.24, product: { trackStock: true } }],
    },
    caja: [] as Fila[],
    stockMovs: [] as Fila[],
    stock: 10,
    lecturasDeCaja: 0,
  };
  const venta: Fila | null =
    opts.cobradaEl === null
      ? null
      : {
          id: "cm_venta",
          orderId: "ord_1",
          type: "VENTA",
          method: "EFECTIVO",
          amount: 23436,
          sessionId: "sess_7",
          occurredAt: opts.cobradaEl ?? HOY_AL_MEDIODIA,
        };
  if (venta && opts.ventaAparece !== "despues-del-bloqueo") m.caja.push(venta);
  return { m, venta };
}

function txDe({ m, venta }: ReturnType<typeof mundoDeVenta>, opts: { ventaAparece?: "despues-del-bloqueo" } = {}) {
  const tx = {
    // Estas ventas no tienen cupón: la anulación busca la fila del cupón y no la encuentra.
    auditLog: { findFirst: async () => null },
    order: {
      findFirst: async () => ({ ...m.order }),
      updateMany: async (args: { where: { status?: { not?: string } }; data: { status: string } }) => {
        if (args.where.status?.not === "CANCELLED" && m.order.status === "CANCELLED") return { count: 0 };
        m.order.status = args.data.status;
        // Un «Cobrar» de otra pestaña que estaba esperando el bloqueo de la fila escribe su
        // VENTA justo ahora: la próxima lectura de la caja ya la ve.
        if (opts.ventaAparece === "despues-del-bloqueo" && venta) m.caja.push(venta);
        return { count: 1 };
      },
    },
    cashMovement: {
      findFirst: async (args: { where: { type?: string } }) => {
        m.lecturasDeCaja += 1;
        return m.caja.find((c) => c.type === args.where.type) ?? null;
      },
      create: async (args: { data: Fila }) => {
        const fila = { id: `cm_${m.caja.length + 1}`, ...args.data };
        m.caja.push(fila);
        return fila;
      },
    },
    product: {
      updateMany: async (args: { data: { stock: { increment: number } } }) => {
        m.stock += args.data.stock.increment;
        return { count: 1 };
      },
      findUnique: async () => ({ stock: m.stock }),
    },
    stockMovement: {
      create: async (args: { data: Fila }) => {
        m.stockMovs.push(args.data);
        return args.data;
      },
    },
  };
  return tx as unknown as AnulacionVentaTx;
}

/** El mismo orden que `anularVentaCore`: primero las reglas del rol, después la transacción. */
async function anularComo(
  rol: Role,
  mundo: ReturnType<typeof mundoDeVenta>,
  opts: { motivo: string; diaCerradoHasta?: string | null; ventaAparece?: "despues-del-bloqueo" },
) {
  const reglas = reglasDeAnulacion({ alcance: alcanceDeAnulacion(rol), motivo: opts.motivo, hoy: HOY });
  if (!reglas.ok) return { ok: false as const, error: reglas.error };
  try {
    const r = await anularVentaInTx(txDe(mundo, opts), "t1", {
      orderId: "ord_1",
      motivo: reglas.motivo,
      actor: "user:u_caja",
      devuelveStock: true,
      diaCerradoHasta: opts.diaCerradoHasta ?? null,
      esDiaCerrado: isFrozenDay,
      diaDe: (d: Date) => d.toISOString().slice(0, 10),
      soloDelDia: reglas.soloDelDia,
    });
    return { ok: true as const, r };
  } catch (e) {
    if (e instanceof AnulacionVentaRechazada) return { ok: false as const, error: e.message, motivo: e.motivo };
    throw e;
  }
}

function nadaSeMovio(m: ReturnType<typeof mundoDeVenta>["m"]) {
  assert.equal(m.order.status, "DELIVERED", "el pedido no puede quedar anulado");
  assert.equal(m.caja.filter((c) => c.type === "EGRESO").length, 0, "no puede haber egreso");
  assert.equal(m.stock, 10, "el stock no puede volver");
  assert.equal(m.stockMovs.length, 0);
}

test("recepción NO anula una venta cobrada ayer, y no se mueve nada", async () => {
  const mundo = mundoDeVenta({ cobradaEl: AYER_AL_MEDIODIA });
  const res = await anularComo("RECEPTION", mundo, { motivo: "Se pesó mal, eran 1,310" });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && "motivo" in res ? res.motivo : null, "solo-hoy");
  assert.match(!res.ok ? res.error : "", /22\/09\/2026/, "el mensaje dice de qué día es la plata");
  assert.match(!res.ok ? res.error : "", /dueño/, "y a quién pedírselo");
  nadaSeMovio(mundo.m);
});

test("recepción anula una venta de HOY SIN motivo → rechazo, y no se mueve nada", async () => {
  for (const motivo of ["", "   ", "asd"]) {
    const mundo = mundoDeVenta({ cobradaEl: HOY_AL_MEDIODIA });
    const res = await anularComo("RECEPTION", mundo, { motivo });
    assert.equal(res.ok, false, `motivo «${motivo}» no puede alcanzar`);
    nadaSeMovio(mundo.m);
  }
});

test("recepción anula una venta de hoy CON motivo: egreso asentado, firmado y con el motivo", async () => {
  const mundo = mundoDeVenta({ cobradaEl: HOY_AL_MEDIODIA });
  const res = await anularComo("RECEPTION", mundo, { motivo: "Se pesó mal, eran 1,310" });
  assert.equal(res.ok, true);
  assert.equal(mundo.m.order.status, "CANCELLED");
  const egresos = mundo.m.caja.filter((c) => c.type === "EGRESO");
  assert.equal(egresos.length, 1);
  assert.equal(egresos[0].amount, 23436);
  assert.match(String(egresos[0].reason), /Se pesó mal, eran 1,310/);
  assert.match(String(egresos[0].createdBy), /user:u_caja$/, "el egreso dice quién anuló");
  assert.equal(mundo.m.stock, 11.24, "los kilos vuelven");
});

test("el dueño anula una venta de ayer si ese día no está cerrado", async () => {
  const mundo = mundoDeVenta({ cobradaEl: AYER_AL_MEDIODIA });
  const res = await anularComo("OWNER", mundo, { motivo: "Devolución del cliente" });
  assert.equal(res.ok, true);
  assert.equal(mundo.m.caja.filter((c) => c.type === "EGRESO").length, 1);
  // La contrapartida va al día de la venta: ayer vuelve a cerrar en cero.
  const egreso = mundo.m.caja.find((c) => c.type === "EGRESO")!;
  assert.equal((egreso.occurredAt as Date).getTime(), AYER_AL_MEDIODIA.getTime());
});

test("el dueño tampoco anula un día ya cerrado", async () => {
  const mundo = mundoDeVenta({ cobradaEl: AYER_AL_MEDIODIA });
  const res = await anularComo("OWNER", mundo, { motivo: "Devolución del cliente", diaCerradoHasta: "2026-09-22" });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && "motivo" in res ? res.motivo : null, "dia-cerrado");
  nadaSeMovio(mundo.m);
});

test("recepción con venta de ayer en un día cerrado: gana el día cerrado (no la manda al dueño)", async () => {
  const mundo = mundoDeVenta({ cobradaEl: AYER_AL_MEDIODIA });
  const res = await anularComo("RECEPTION", mundo, { motivo: "Se pesó mal", diaCerradoHasta: "2026-09-22" });
  assert.equal(!res.ok && "motivo" in res ? res.motivo : null, "dia-cerrado");
});

test("el dueño sin motivo: se anula y queda escrito que no hubo motivo", async () => {
  const mundo = mundoDeVenta({ cobradaEl: HOY_AL_MEDIODIA });
  const res = await anularComo("OWNER", mundo, { motivo: "" });
  assert.equal(res.ok, true);
  const egreso = mundo.m.caja.find((c) => c.type === "EGRESO")!;
  assert.ok(String(egreso.reason).includes(MOTIVO_ANULACION_SIN_TEXTO));
});

test("el dueño con un motivo de 3 letras: rechazo (si lo escribe, que explique algo)", async () => {
  const mundo = mundoDeVenta({ cobradaEl: HOY_AL_MEDIODIA });
  const res = await anularComo("OWNER", mundo, { motivo: "asd" });
  assert.equal(res.ok, false);
  nadaSeMovio(mundo.m);
});

test("el profesional no anula nada", async () => {
  const mundo = mundoDeVenta({ cobradaEl: HOY_AL_MEDIODIA });
  const res = await anularComo("PROFESSIONAL", mundo, { motivo: "Se pesó mal" });
  assert.equal(res.ok, false);
  nadaSeMovio(mundo.m);
});

test("recepción SÍ anula un pedido sin cobrar de ayer: no hay plata que mover, sólo vuelve el stock", async () => {
  // El pedido online de ayer que el cliente canceló no puede quedar trabado en la bandeja
  // hasta que aparezca el dueño: no toca ningún arqueo.
  const mundo = mundoDeVenta({ cobradaEl: null, creadaEl: AYER_AL_MEDIODIA });
  const res = await anularComo("RECEPTION", mundo, { motivo: "El cliente no lo quiere más" });
  assert.equal(res.ok, true);
  assert.equal(mundo.m.caja.length, 0);
  assert.equal(mundo.m.stock, 11.24);
});

test("un «Cobrar» que entra mientras se anula no deja la plata sin contrapartida", async () => {
  // La primera lectura no ve la VENTA (el cobro de la otra pestaña todavía no terminó); el
  // compare-and-set espera el bloqueo de la fila y, cuando lo obtiene, la VENTA ya está. Sin
  // la relectura, el pedido quedaba anulado y su plata seguía contando en la caja.
  const mundo = mundoDeVenta({ cobradaEl: HOY_AL_MEDIODIA, ventaAparece: "despues-del-bloqueo" });
  const res = await anularComo("OWNER", mundo, { motivo: "Devolución del cliente", ventaAparece: "despues-del-bloqueo" });
  assert.equal(res.ok, true);
  assert.equal(mundo.m.lecturasDeCaja, 2, "la caja se vuelve a leer con la fila bloqueada");
  assert.equal(mundo.m.caja.filter((c) => c.type === "EGRESO").length, 1, "la venta que apareció tiene su egreso");
  if (res.ok && res.r.applied) assert.equal(res.r.montoRevertido, 23436);
});

test("con la venta leída de entrada, la caja no se relee (el camino de todos los días no suma consultas)", async () => {
  const mundo = mundoDeVenta({ cobradaEl: HOY_AL_MEDIODIA });
  await anularComo("OWNER", mundo, { motivo: "Devolución del cliente" });
  assert.equal(mundo.m.lecturasDeCaja, 1);
});

// ── 2. ENTREGAR: cobro o «queda a cobrar», nunca ninguno ────────────────────

test("planDeEntrega: sin cobrar, entregar exige medio o «queda a cobrar»", () => {
  const listo = { existe: true, status: "READY", paid: false };
  assert.deepEqual(planDeEntrega({ ...listo, medioElegido: false, quedaACobrar: false }), { ok: false, motivo: "falta-cobro" });
  assert.deepEqual(planDeEntrega({ ...listo, medioElegido: true, quedaACobrar: false }), { ok: true, cobrar: true, quedaACobrar: false });
  assert.deepEqual(planDeEntrega({ ...listo, medioElegido: false, quedaACobrar: true }), { ok: true, cobrar: false, quedaACobrar: true });
  assert.deepEqual(planDeEntrega({ ...listo, medioElegido: true, quedaACobrar: true }), { ok: false, motivo: "cobro-y-a-cobrar" });
});

test("planDeEntrega: ya cobrado se entrega directo; lo que no está listo, no", () => {
  assert.deepEqual(
    planDeEntrega({ existe: true, status: "READY", paid: true, medioElegido: false, quedaACobrar: false }),
    { ok: true, cobrar: false, quedaACobrar: false },
  );
  for (const status of ["PENDING", "CONFIRMED", "PREPARING"]) {
    assert.deepEqual(
      planDeEntrega({ existe: true, status, paid: true, medioElegido: false, quedaACobrar: false }),
      { ok: false, motivo: "no-esta-listo" },
    );
  }
  assert.deepEqual(
    planDeEntrega({ existe: true, status: "CANCELLED", paid: false, medioElegido: true, quedaACobrar: false }),
    { ok: false, motivo: "anulado" },
  );
  assert.deepEqual(
    planDeEntrega({ existe: false, status: "", paid: false, medioElegido: true, quedaACobrar: false }),
    { ok: false, motivo: "no-existe" },
  );
});

// El pedido y sus tres operaciones, con la semántica de las reales: `cobrar` es la de
// setOrderPaidCore (medio obligatorio, compare-and-set sobre `paid`, "ya estaba cobrado"), y
// `marcarEntregado` el compare-and-set sobre READY.
function mundoDeEntrega(inicial: { status: string; paid: boolean; paymentMethod?: MedioDeCobro | null; cobroRechazado?: string }) {
  const m = {
    tenantId: "t1",
    status: inicial.status,
    paid: inicial.paid,
    paymentMethod: inicial.paymentMethod ?? (null as string | null),
    asientos: [] as string[],
  };
  const ports = {
    leer: async () => {
      await pausa();
      return { code: 7, status: m.status, paid: m.paid };
    },
    cobrar: async (medioRaw: string) => {
      await pausa();
      if (inicial.cobroRechazado) return { ok: false as const, error: inicial.cobroRechazado };
      const medio = medioDeCobroRequerido({ paid: true, paymentMethod: medioRaw, contexto: "cobro" });
      if (!medio.ok) return medio;
      if (m.paid) return mensajeYaCobrado({ code: 7, medioRegistrado: m.paymentMethod, medioElegido: medio.paymentMethod! });
      m.paid = true;
      m.paymentMethod = medio.paymentMethod;
      m.asientos.push(medio.paymentMethod!);
      return { ok: true as const, mensaje: "Pedido #7 cobrado: $ 23.436,00." };
    },
    marcarEntregado: async () => {
      await pausa();
      if (m.status !== "READY") return false;
      m.status = "DELIVERED";
      return true;
    },
  };
  return { m, ports };
}

test("entregar sin medio ni «queda a cobrar» → bloqueado, y no se mueve nada", async () => {
  const { m, ports } = mundoDeEntrega({ status: "READY", paid: false });
  const r = await entregarPedidoGuarded({ medio: "", quedaACobrar: false, ...ports });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /Queda a cobrar/);
  assert.equal(m.status, "READY");
  assert.equal(m.asientos.length, 0);
});

test("entregar con «queda a cobrar» → entregado sin cobrar, y SIGUE en la bandeja", async () => {
  const { m, ports } = mundoDeEntrega({ status: "READY", paid: false });
  const r = await entregarPedidoGuarded({ medio: "", quedaACobrar: true, ...ports });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.entregado, true);
  assert.equal(r.ok && r.quedaACobrar, true);
  assert.equal(m.status, "DELIVERED");
  assert.equal(m.paid, false);
  assert.equal(m.asientos.length, 0);
  // Y la condición de la bandeja lo sigue mostrando: no se pierde en "Cerrados".
  const fila = { tenantId: "t1", status: m.status, paid: m.paid };
  assert.equal(cumple(wherePedidosAbiertos("t1"), fila), true);
  assert.equal(cumple(whereEntregadosSinCobrar("t1"), fila), true);
  assert.equal(cumple(wherePedidosCerrados("t1"), fila), false);
});

test("entregar eligiendo el medio → se cobra UNA vez y se entrega", async () => {
  const { m, ports } = mundoDeEntrega({ status: "READY", paid: false });
  const r = await entregarPedidoGuarded({ medio: "EFECTIVO", quedaACobrar: false, ...ports });
  assert.equal(r.ok, true);
  assert.deepEqual(m.asientos, ["EFECTIVO"]);
  assert.equal(m.status, "DELIVERED");
  assert.match(r.ok ? r.mensaje : "", /cobrado.*entregado/i);
});

test("doble toque en «Cobrar y entregar», uno detrás del otro → un solo cobro", async () => {
  const { m, ports } = mundoDeEntrega({ status: "READY", paid: false });
  const a = await entregarPedidoGuarded({ medio: "EFECTIVO", quedaACobrar: false, ...ports });
  const b = await entregarPedidoGuarded({ medio: "EFECTIVO", quedaACobrar: false, ...ports });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true, "el segundo toque contesta 'ya está', no un error");
  assert.equal(b.ok && b.entregado, false);
  assert.deepEqual(m.asientos, ["EFECTIVO"]);
});

test("doble toque SIMULTÁNEO en «Cobrar y entregar» → un solo cobro, una sola entrega", async () => {
  const { m, ports } = mundoDeEntrega({ status: "READY", paid: false });
  const [a, b] = await Promise.all([
    entregarPedidoGuarded({ medio: "MERCADOPAGO", quedaACobrar: false, ...ports }),
    entregarPedidoGuarded({ medio: "MERCADOPAGO", quedaACobrar: false, ...ports }),
  ]);
  assert.equal(a.ok && b.ok, true);
  assert.deepEqual(m.asientos, ["MERCADOPAGO"], "la plata entra una sola vez");
  assert.equal(m.status, "DELIVERED");
  assert.equal([a, b].filter((r) => r.ok && r.entregado).length, 1, "una sola llamada lo entregó");
});

test("si el cobro se rechaza (día cerrado), la mercadería NO se da por entregada", async () => {
  const { m, ports } = mundoDeEntrega({
    status: "READY",
    paid: false,
    cobroRechazado: "El día de caja ya está cerrado…",
  });
  const r = await entregarPedidoGuarded({ medio: "EFECTIVO", quedaACobrar: false, ...ports });
  assert.equal(r.ok, false);
  assert.equal(m.status, "READY");
});

test("ya cobrado: se entrega de un toque y no se vuelve a cobrar", async () => {
  const { m, ports } = mundoDeEntrega({ status: "READY", paid: true, paymentMethod: "EFECTIVO" });
  const r = await entregarPedidoGuarded({ medio: "", quedaACobrar: false, ...ports });
  assert.equal(r.ok, true);
  assert.equal(m.status, "DELIVERED");
  assert.equal(m.asientos.length, 0);
});

test("otro medio elegido sobre un pedido que otra pestaña ya cobró → no se entrega y se dice con qué quedó", async () => {
  // La lectura ve el pedido sin cobrar; entre la lectura y el cobro, otra pestaña lo cobra
  // en efectivo. El cobro contesta "ya estaba cobrado con Efectivo, no con Mercado Pago".
  const { m, ports } = mundoDeEntrega({ status: "READY", paid: false });
  const cobrarOriginal = ports.cobrar;
  ports.cobrar = async (medio: string) => {
    m.paid = true;
    m.paymentMethod = "EFECTIVO";
    return cobrarOriginal(medio);
  };
  const r = await entregarPedidoGuarded({ medio: "MERCADOPAGO", quedaACobrar: false, ...ports });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /Efectivo/);
  assert.equal(m.status, "READY");
});

// ── 3. LA BANDEJA: los abiertos no se pierden detrás de los tickets ─────────

// Evaluador de la forma de `where` que usa la bandeja: igualdad, `{ in: [...] }` y `OR`. Si
// alguien mete un operador que esto no conoce, falla ruidoso en vez de dar un falso verde.
function cumple(where: object, fila: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as object[]).some((w) => cumple(w, fila));
    if (v !== null && typeof v === "object") {
      const ops = Object.keys(v);
      if (ops.length === 1 && ops[0] === "in") return (v as { in: unknown[] }).in.includes(fila[k]);
      throw new Error(`operador no soportado en el test: ${k}: ${JSON.stringify(v)}`);
    }
    return fila[k] === v;
  });
}

type Pedido = { id: string; tenantId: string; status: string; paid: boolean; createdAt: Date };

function dia101Tickets(): Pedido[] {
  const filas: Pedido[] = [
    // El pedido online de ayer, todavía sin preparar: ES el trabajo pendiente.
    { id: "online-ayer", tenantId: "magra", status: "PENDING", paid: false, createdAt: new Date("2026-09-22T20:00:00Z") },
    { id: "entregado-sin-cobrar", tenantId: "magra", status: "DELIVERED", paid: false, createdAt: new Date("2026-09-22T19:00:00Z") },
    { id: "anulado", tenantId: "magra", status: "CANCELLED", paid: true, createdAt: new Date("2026-09-23T10:00:00Z") },
    // Otro negocio en la misma base: nunca aparece.
    { id: "de-otro-negocio", tenantId: "beauty-spa", status: "PENDING", paid: false, createdAt: new Date("2026-09-23T11:00:00Z") },
  ];
  // 101 tickets de mostrador de hoy: nacen cobrados y entregados.
  for (let i = 0; i < 101; i++) {
    filas.push({
      id: `ticket-${i}`,
      tenantId: "magra",
      status: "DELIVERED",
      paid: true,
      createdAt: new Date(Date.UTC(2026, 8, 23, 12, 0, i)),
    });
  }
  return filas;
}

const recientesPrimero = (a: Pedido, b: Pedido) => b.createdAt.getTime() - a.createdAt.getTime();

test("con 101 tickets de mostrador, el pedido abierto de ayer SIGUE en la bandeja", () => {
  const filas = dia101Tickets();

  // Lo de antes, para que quede escrito qué se arregló: los últimos 100 y DESPUÉS separar.
  const antes = filas
    .filter((f) => f.tenantId === "magra")
    .sort(recientesPrimero)
    .slice(0, 100)
    .filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED");
  assert.equal(antes.some((o) => o.id === "online-ayer"), false, "así se perdía");

  const abiertos = filas.filter((f) => cumple(wherePedidosAbiertos("magra"), f)).map((f) => f.id);
  assert.deepEqual(abiertos.sort(), ["entregado-sin-cobrar", "online-ayer"]);
});

test("abiertos y cerrados se reparten TODO sin repetir, y nunca cruzan de negocio", () => {
  const filas = dia101Tickets();
  for (const f of filas.filter((x) => x.tenantId === "magra")) {
    const a = cumple(wherePedidosAbiertos("magra"), f);
    const c = cumple(wherePedidosCerrados("magra"), f);
    assert.equal(a !== c, true, `${f.id} (${f.status}, paid=${f.paid}) tiene que estar en una sola lista`);
  }
  const otro = filas.find((f) => f.id === "de-otro-negocio")!;
  assert.equal(cumple(wherePedidosAbiertos("magra"), otro), false);
  assert.equal(cumple(wherePedidosCerrados("magra"), otro), false);
});

test("cada estado cae donde tiene que caer", () => {
  const abierto = (status: string, paid: boolean) => cumple(wherePedidosAbiertos("t"), { tenantId: "t", status, paid });
  for (const s of ["PENDING", "CONFIRMED", "PREPARING", "READY"]) {
    assert.equal(abierto(s, false), true, s);
    assert.equal(abierto(s, true), true, `${s} cobrado sigue en curso`);
  }
  assert.equal(abierto("DELIVERED", false), true, "entregado sin cobrar: la plata no entró");
  assert.equal(abierto("DELIVERED", true), false);
  assert.equal(abierto("CANCELLED", false), false);
  assert.equal(abierto("CANCELLED", true), false);
});

// ── 4. LA TIENDA: el doble toque en «Enviar pedido» ─────────────────────────
//
// MagraFront, ShineFront y Storefront ahora mandan `idempotencyKey`, y `placeOnlineOrder` se
// la pasa a `insertOrderGuarded`. Acá se ejecuta ese núcleo con un doble que hace lo que hace
// Postgres: el índice único (tenantId, idempotencyKey) y el descuento de stock DENTRO de la
// misma transacción que el pedido (si el alta choca, el descuento tampoco queda).

function mundoDeTienda() {
  const w = { pedidos: [] as { id: string; code: number; key: string | null }[], stock: 10 };
  const altaCon = (key: string | null) =>
    insertOrderGuarded({
      idempotencyKey: key,
      subtotal: 23436,
      lineCount: 1,
      findByKey: async (k) => {
        await pausa();
        const o = w.pedidos.find((p) => p.key === k);
        return o ? { id: o.id, code: o.code, subtotal: 23436, lines: 1, dedup: true } : null;
      },
      runInsert: async (writeKey) => {
        await pausa();
        if (writeKey && w.pedidos.some((p) => p.key === writeKey)) {
          throw Object.assign(new Error("Unique constraint failed"), { choque: "idempotencyKey" });
        }
        const code = w.pedidos.length + 1;
        w.pedidos.push({ id: `ord_${code}`, code, key: writeKey });
        w.stock = Math.round((w.stock - 1.24) * 1000) / 1000;
        return { id: `ord_${code}`, code };
      },
      isMissingKeyColumn: () => false,
      isKeyConflict: (e) => (e as { choque?: string }).choque === "idempotencyKey",
      isCodeConflict: () => false,
    });
  return { w, altaCon };
}

test("doble toque en «Enviar pedido», uno detrás del otro → un solo pedido, stock descontado una vez", async () => {
  const { w, altaCon } = mundoDeTienda();
  const a = await altaCon("clave-del-carrito");
  const b = await altaCon("clave-del-carrito");
  assert.equal(w.pedidos.length, 1);
  assert.equal(w.stock, 8.76);
  assert.equal(a.code, b.code, "los dos envíos llevan a la misma página de gracias");
  assert.equal(b.dedup, true);
});

test("doble toque SIMULTÁNEO en «Enviar pedido» → un solo pedido, stock descontado una vez", async () => {
  const { w, altaCon } = mundoDeTienda();
  const [a, b] = await Promise.all([altaCon("clave-del-carrito"), altaCon("clave-del-carrito")]);
  assert.equal(w.pedidos.length, 1);
  assert.equal(w.stock, 8.76);
  assert.equal(a.code, b.code);
});

test("sin clave —lo que mandaban tres de las cuatro tiendas— el doble toque creaba DOS pedidos", async () => {
  const { w, altaCon } = mundoDeTienda();
  await Promise.all([altaCon(null), altaCon(null)]);
  assert.equal(w.pedidos.length, 2);
  assert.equal(w.stock, 7.52, "y descontaba el stock dos veces");
});

test("con la bolsa cambiada la clave es otra: es otro pedido, no el viejo reciclado", async () => {
  const { w, altaCon } = mundoDeTienda();
  const a = await altaCon("clave-bolsa-1");
  const b = await altaCon("clave-bolsa-2");
  assert.equal(w.pedidos.length, 2);
  assert.notEqual(a.code, b.code);
});
