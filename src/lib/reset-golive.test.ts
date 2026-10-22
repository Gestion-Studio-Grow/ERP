// Planificación del reseteo de go-live (pura): qué tablas, en qué orden, qué se excluye.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDEN_DE_BORRADO,
  conteoPorTabla,
  esPoolerDeNeon,
  parsearArgs,
  planificarReseteo,
  totalABorrar,
  type FotoNegocio,
  type PasoTabla,
} from "@/lib/reset-golive";

const AHORA = new Date("2026-10-18T15:00:00Z");

function fotoVacia(over: Partial<FotoNegocio> = {}): FotoNegocio {
  return {
    frontera: null, ahora: AHORA, appointments: [], payments: [], reviews: [], collections: [], orders: [], orderItems: [],
    cashMovements: [], cashSessions: [], invoices: [], envios: [], cobrosFacturados: [], commissionPayouts: [], stockMovements: [], stockPurchases: [],
    stockPurchaseItems: [], payables: [], cheques: [], receivables: [], outbox: [], eventosIntegracion: [], conversaciones: [],
    mensajes: [], mensajesConExtracto: [], importaciones: [], movimientosImportados: [], leads: [], waitlist: [],
    professionalBlocks: [], boxBlocks: [], clients: [], clientesConOtrosModulos: [], coupons: [], cuponesDePedidos: [], products: [],
    ...over,
  };
}

const SIN_OPCIONES = { clientesCreadosDesde: null, conservarFuturo: false };
const ids = (plan: ReturnType<typeof planificarReseteo>, paso: PasoTabla) => plan.pasos.find((p) => p.paso === paso)!.ids.sort();
const pos = (paso: PasoTabla) => ORDEN_DE_BORRADO.indexOf(paso);

test("orden de borrado: cada hijo antes que su padre (las FK RESTRICT no pueden fallar)", () => {
  const antes: [PasoTabla, PasoTabla][] = [
    ["EnvioComprobante", "Invoice"], ["CobroFacturado", "Invoice"], ["CobroFacturado", "InvoiceNota"], ["InvoiceNota", "Invoice"], ["Invoice", "Order"], ["Invoice", "Appointment"],
    ["EventoIntegracion", "OutboxEvent"], ["MensajeWhatsapp", "ConversacionWhatsapp"], ["MovimientoImportado", "ImportacionBancaria"],
    ["Review", "Appointment"], ["CashMovement", "CashSession"], ["CashMovement", "Order"], ["CashMovement", "Payment"],
    ["CashMovement", "Collection"], ["Collection", "Order"], ["Collection", "Appointment"], ["Payment", "Appointment"],
    ["StockPurchaseItem", "StockPurchase"], ["PayableCheque", "AccountPayable"], ["AccountReceivable", "Client"],
    ["OrderItem", "Order"], ["Order", "Client"], ["Appointment", "Client"], ["Appointment", "CommissionPayout"],
  ];
  for (const [hijo, padre] of antes) assert.ok(pos(hijo) < pos(padre), `${hijo} tiene que ir antes que ${padre}`);
  assert.equal(new Set(ORDEN_DE_BORRADO).size, ORDEN_DE_BORRADO.length, "sin pasos repetidos");
});

test("R1 · CobroFacturado: se borra con su comprobante (antes, por la FK RESTRICT) y se conserva con el que tiene CAE", () => {
  const plan = planificarReseteo(
    fotoVacia({
      invoices: [
        { id: "inv-cae", orderId: null, appointmentId: null, conCae: true, status: "AUTHORIZED", comprobanteAsociadoId: null, docNro: "0" },
        { id: "inv-pend", orderId: null, appointmentId: null, conCae: false, status: "PENDING", comprobanteAsociadoId: null, docNro: "0" },
      ],
      cobrosFacturados: [{ id: "cf-cae", invoiceId: "inv-cae" }, { id: "cf-pend", invoiceId: "inv-pend" }],
    }),
    SIN_OPCIONES,
  );
  assert.deepEqual(ids(plan, "CobroFacturado"), ["cf-pend"]);
  assert.deepEqual(ids(plan, "Invoice"), ["inv-pend"]);
  assert.ok(pos("CobroFacturado") < pos("InvoiceNota") && pos("CobroFacturado") < pos("Invoice"));
  assert.ok(plan.conserva.some((c) => c.tabla === "CobroFacturado" && c.cantidad === 1));
});

test("nunca hay un paso sobre una tabla maestra ni sobre AuditLog", () => {
  const maestras = [
    "Tenant", "TenantFiscalCredential", "BusinessSettings", "User", "ServiceCategory", "Service", "Product", "ServiceProduct",
    "Professional", "WorkingHours", "ProfessionalServiceCommission", "Box", "Resource", "ServiceResource", "MessageTemplate",
    "Supplier", "ReglaClasificacionBancoTenant", "IntegracionConexion", "IntegracionCredencial", "Coupon", "AuditLog",
    "ReceptorFiscal", "ArcaAuthTicket", "ExtractoRecibido", "CarteraCliente",
  ];
  for (const m of maestras) assert.ok(!(ORDEN_DE_BORRADO as readonly string[]).includes(m), `${m} no puede estar en el orden de borrado`);
});

test("negocio de prueba típico: borra ventas, turnos, caja, stock y mensajería; deja la venta con CAE, maestros y clientes", () => {
  const foto = fotoVacia({
    appointments: [{ id: "ap1", clientId: "c1", startsAt: new Date("2026-10-17T13:00:00Z"), commissionPayoutId: "po1", couponCode: "BIENVENIDA" }],
    payments: [{ id: "pay1", appointmentId: "ap1" }],
    reviews: [{ id: "rv1", appointmentId: "ap1" }],
    commissionPayouts: [{ id: "po1" }],
    orders: [{ id: "o1", clientId: "c1" }, { id: "o2", clientId: null }, { id: "o3", clientId: "c1" }],
    orderItems: [{ id: "oi1", orderId: "o1" }, { id: "oi2", orderId: "o2" }, { id: "oi3", orderId: "o3" }],
    collections: [{ id: "col1", orderId: "o1", appointmentId: null, originType: "ORDER", originId: "o1" }],
    cashSessions: [{ id: "s1", diaApertura: "2026-10-17", status: "CLOSED" }],
    cashMovements: [
      { id: "cm1", sessionId: "s1", orderId: "o1", paymentId: null, collectionId: null, createdBy: "user:u1", dia: "2026-10-17" },
      { id: "cm2", sessionId: "s1", orderId: null, paymentId: "pay1", collectionId: null, createdBy: "user:u1", dia: "2026-10-17" },
      { id: "cm3", sessionId: null, orderId: "o3", paymentId: null, collectionId: null, createdBy: "user:u1", dia: "2026-10-17" },
    ],
    invoices: [
      { id: "inv-cae", orderId: "o3", appointmentId: null, conCae: true, status: "AUTHORIZED", comprobanteAsociadoId: null, docNro: "0" },
      { id: "inv-pend", orderId: "o2", appointmentId: null, conCae: false, status: "PENDING", comprobanteAsociadoId: null, docNro: "0" },
      { id: "nc-rech", orderId: null, appointmentId: null, conCae: false, status: "REJECTED", comprobanteAsociadoId: "inv-cae", docNro: "0" },
    ],
    envios: [{ id: "env-cae", invoiceId: "inv-cae" }, { id: "env-pend", invoiceId: "inv-pend" }],
    stockMovements: [
      { id: "sm-ini", productId: "p1", type: "AJUSTE", qty: 10, orderId: null, appointmentId: null, purchaseId: null },
      { id: "sm-vta", productId: "p1", type: "VENTA", qty: -2, orderId: "o1", appointmentId: null, purchaseId: null },
    ],
    products: [{ id: "p1", name: "Vela", stock: 8 }],
    clients: [{ id: "c1", createdAt: new Date("2026-10-01T00:00:00Z"), docNro: null }],
    coupons: [{ id: "cu1", code: "BIENVENIDA", usedCount: 1 }],
    outbox: [{ id: "ob1", pendiente: false }],
    eventosIntegracion: [{ id: "ev1" }],
    leads: [{ id: "l1" }],
    waitlist: [{ id: "w1" }],
    professionalBlocks: [{ id: "pb1", endsAt: new Date("2026-12-01T00:00:00Z") }],
  });
  const plan = planificarReseteo(foto, SIN_OPCIONES);

  assert.deepEqual(ids(plan, "Appointment"), ["ap1"]);
  assert.deepEqual(ids(plan, "Payment"), ["pay1"]);
  assert.deepEqual(ids(plan, "Review"), ["rv1"]);
  assert.deepEqual(ids(plan, "CommissionPayout"), ["po1"]);
  assert.deepEqual(ids(plan, "Order"), ["o1", "o2"]);
  assert.deepEqual(ids(plan, "OrderItem"), ["oi1", "oi2"]);
  assert.deepEqual(ids(plan, "CashMovement"), ["cm1", "cm2"]);
  assert.deepEqual(ids(plan, "CashSession"), ["s1"]);
  assert.deepEqual(ids(plan, "Collection"), ["col1"]);
  // Comprobantes: el de CAE queda; la nota rechazada que lo asocia va en su paso propio, antes.
  assert.deepEqual(ids(plan, "Invoice"), ["inv-pend"]);
  assert.deepEqual(ids(plan, "InvoiceNota"), ["nc-rech"]);
  assert.deepEqual(ids(plan, "EnvioComprobante"), ["env-pend"], "el envío del comprobante con CAE se conserva");
  // La venta con CAE queda entera (pedido, ítems, caja): se anula con nota de crédito, no se borra.
  assert.deepEqual(plan.comprobantesConCae, [{ id: "inv-cae", enlazadoA: "pedido o3 (se conserva con su caja y cobros)" }]);
  assert.ok(plan.conserva.some((c) => c.tabla === "Order" && c.cantidad === 1));
  // Stock: la venta se borra, el AJUSTE inicial queda, y se asienta la diferencia con el stock contado.
  assert.deepEqual(ids(plan, "StockMovement"), ["sm-vta"]);
  assert.deepEqual(plan.ajustesStock, [{ productId: "p1", nombre: "Vela", qty: -2, stock: 8 }]);
  // Cupón: vuelve a 0.
  assert.deepEqual(plan.cupones, [{ id: "cu1", code: "BIENVENIDA", de: 1, a: 0 }]);
  // Sin --clientes-creados-desde no se borra ningún cliente.
  assert.deepEqual(ids(plan, "Client"), []);
  assert.deepEqual(ids(plan, "ProfessionalBlock"), ["pb1"]);
  assert.ok(plan.avisos.some((a) => a.includes("PENDIENTE")), "avisa del comprobante pendiente sin CAE (revisar en ARCA)");
  assert.equal(conteoPorTabla(plan).Invoice, 2, "las dos pasadas de Invoice se suman en la auditoría");
});

test("días cerrados (opción A) y marcas de caja: no se tocan, ni lo que cuelga de ellos", () => {
  const foto = fotoVacia({
    frontera: "2026-10-16",
    orders: [{ id: "o-cerrado", clientId: null }, { id: "o-prueba", clientId: null }],
    orderItems: [{ id: "oi-c", orderId: "o-cerrado" }, { id: "oi-p", orderId: "o-prueba" }],
    cashSessions: [{ id: "s-cerrada", diaApertura: "2026-10-16", status: "CLOSED" }, { id: "s-prueba", diaApertura: "2026-10-17", status: "OPEN" }],
    cashMovements: [
      { id: "hist", sessionId: null, orderId: null, paymentId: null, collectionId: null, createdBy: "import:caja-historica:abcd1234", dia: "2026-09-30" },
      { id: "corte", sessionId: null, orderId: null, paymentId: null, collectionId: null, createdBy: "corte-inicial:2026-10-16", dia: "2026-10-16" },
      { id: "cierre", sessionId: null, orderId: null, paymentId: null, collectionId: null, createdBy: "cierre-diario:2026-10-17", dia: "2026-10-17" },
      { id: "vta-cerrada", sessionId: "s-cerrada", orderId: "o-cerrado", paymentId: null, collectionId: null, createdBy: "user:u", dia: "2026-10-16" },
      { id: "anul-posterior", sessionId: "s-prueba", orderId: "o-cerrado", paymentId: null, collectionId: null, createdBy: "user:u", dia: "2026-10-17" },
      { id: "vta-prueba", sessionId: "s-prueba", orderId: "o-prueba", paymentId: null, collectionId: null, createdBy: "user:u", dia: "2026-10-17" },
    ],
  });
  const plan = planificarReseteo(foto, SIN_OPCIONES);
  assert.deepEqual(ids(plan, "CashMovement"), ["vta-prueba"]);
  assert.deepEqual(ids(plan, "Order"), ["o-prueba"]);
  assert.deepEqual(ids(plan, "OrderItem"), ["oi-p"]);
  // La sesión de prueba conserva un movimiento (la anulación de un pedido de día cerrado): no se borra.
  assert.deepEqual(ids(plan, "CashSession"), []);
  assert.ok(plan.avisos.some((a) => a.includes("CERRADO")));
});

test("una sesión que se borra nunca arrastra por CASCADE un movimiento que se conserva", () => {
  const foto = fotoVacia({
    frontera: "2026-10-16",
    cashSessions: [{ id: "s1", diaApertura: "2026-10-17", status: "CLOSED" }],
    cashMovements: [
      { id: "a", sessionId: "s1", orderId: null, paymentId: null, collectionId: null, createdBy: "arqueo-turno:s1", dia: "2026-10-17" },
      { id: "b", sessionId: "s1", orderId: null, paymentId: null, collectionId: null, createdBy: "cierre-diario:2026-10-17", dia: "2026-10-17" },
    ],
  });
  const plan = planificarReseteo(foto, SIN_OPCIONES);
  const sesionesBorradas = new Set(ids(plan, "CashSession"));
  const borrados = new Set(ids(plan, "CashMovement"));
  for (const m of foto.cashMovements) {
    if (m.sessionId && sesionesBorradas.has(m.sessionId)) assert.ok(borrados.has(m.id), `${m.id} caería por CASCADE sin estar planificado`);
  }
  assert.deepEqual([...borrados], ["a"]);
});

test("--conservar-futuro: el turno que viene queda con su pago, su caja y su cupón", () => {
  const foto = fotoVacia({
    appointments: [
      { id: "pasado", clientId: "c1", startsAt: new Date("2026-10-17T13:00:00Z"), commissionPayoutId: null, couponCode: "X" },
      { id: "futuro", clientId: "c2", startsAt: new Date("2026-10-25T13:00:00Z"), commissionPayoutId: null, couponCode: "X" },
    ],
    payments: [{ id: "pay-f", appointmentId: "futuro" }, { id: "pay-p", appointmentId: "pasado" }],
    cashMovements: [{ id: "sena", sessionId: null, orderId: null, paymentId: "pay-f", collectionId: null, createdBy: "user:u", dia: "2026-10-17" }],
    coupons: [{ id: "cx", code: "X", usedCount: 2 }],
    professionalBlocks: [{ id: "vacaciones", endsAt: new Date("2026-12-31T00:00:00Z") }, { id: "viejo", endsAt: new Date("2026-10-01T00:00:00Z") }],
  });
  const plan = planificarReseteo(foto, { clientesCreadosDesde: null, conservarFuturo: true });
  assert.deepEqual(ids(plan, "Appointment"), ["pasado"]);
  assert.deepEqual(ids(plan, "Payment"), ["pay-p"]);
  assert.deepEqual(ids(plan, "CashMovement"), []);
  assert.deepEqual(plan.cupones, [{ id: "cx", code: "X", de: 2, a: 1 }]);
  assert.deepEqual(ids(plan, "ProfessionalBlock"), ["viejo"]);

  const sinOpcion = planificarReseteo(foto, SIN_OPCIONES);
  assert.ok(sinOpcion.avisos.some((a) => a.includes("FUTURO")), "sin la opción avisa que borra turnos futuros");
});

test("--clientes-creados-desde: sólo los nuevos, y nunca con CAE, con algo conservado ni de otro módulo", () => {
  const desde = new Date("2026-10-17T03:00:00Z");
  const nuevo = (id: string, docNro: string | null = null) => ({ id, createdAt: new Date("2026-10-17T12:00:00Z"), docNro });
  const foto = fotoVacia({
    clients: [{ id: "viejo", createdAt: new Date("2026-09-01T00:00:00Z"), docNro: null }, nuevo("libre"), nuevo("con-cae"), nuevo("cuit-cae", "20123456789"), nuevo("taller")],
    orders: [{ id: "o1", clientId: "con-cae" }],
    invoices: [
      { id: "i1", orderId: "o1", appointmentId: null, conCae: true, status: "AUTHORIZED", comprobanteAsociadoId: null, docNro: "0" },
      { id: "i2", orderId: null, appointmentId: null, conCae: true, status: "AUTHORIZED", comprobanteAsociadoId: null, docNro: "20123456789" },
    ],
    clientesConOtrosModulos: ["taller"],
  });
  const plan = planificarReseteo(foto, { clientesCreadosDesde: desde, conservarFuturo: false });
  assert.deepEqual(ids(plan, "Client"), ["libre"]);
  assert.deepEqual(
    plan.clientesConservados.map((c) => c.id).sort(),
    ["con-cae", "cuit-cae", "taller"],
  );
});

test("WhatsApp: una conversación con un extracto recibido colgando no se borra (FK RESTRICT)", () => {
  const foto = fotoVacia({
    conversaciones: [{ id: "cv1" }, { id: "cv2" }],
    mensajes: [{ id: "m1", conversacionId: "cv1" }, { id: "m2", conversacionId: "cv2" }],
    mensajesConExtracto: ["m1"],
  });
  const plan = planificarReseteo(foto, SIN_OPCIONES);
  assert.deepEqual(ids(plan, "ConversacionWhatsapp"), ["cv2"]);
  assert.deepEqual(ids(plan, "MensajeWhatsapp"), ["m2"]);
});

test("replanificar sobre lo que queda da cero (idempotencia)", () => {
  const foto = fotoVacia({
    frontera: "2026-10-16",
    orders: [{ id: "o1", clientId: null }],
    cashMovements: [{ id: "cm", sessionId: null, orderId: "o1", paymentId: null, collectionId: null, createdBy: "user:u", dia: "2026-10-16" }],
    invoices: [{ id: "cae", orderId: null, appointmentId: null, conCae: true, status: "AUTHORIZED", comprobanteAsociadoId: null, docNro: "0" }],
    stockMovements: [{ id: "aj", productId: "p", type: "AJUSTE", qty: 5, orderId: null, appointmentId: null, purchaseId: null }],
    products: [{ id: "p", name: "P", stock: 5 }],
  });
  const plan = planificarReseteo(foto, SIN_OPCIONES);
  assert.equal(totalABorrar(plan), 0);
  assert.deepEqual(plan.ajustesStock, []);
  assert.deepEqual(plan.cupones, []);
});

test("línea de comandos: modo prueba por defecto; borrar exige --apply y --confirmar con el mismo slug", () => {
  const prueba = parsearArgs(["--tenant", "beauty-spa"]);
  assert.ok(prueba.ok && !prueba.args.apply && prueba.args.stock === "conservar");
  assert.equal(parsearArgs(["--apply", "--tenant", "beauty-spa"]).ok, false);
  assert.equal(parsearArgs(["--tenant", "beauty-spa", "--apply", "--confirmar", "magra"]).ok, false);
  const ok = parsearArgs(["--tenant=beauty-spa", "--apply", "--confirmar=beauty-spa", "--clientes-creados-desde=2026-10-17T00:00:00-03:00"]);
  assert.ok(ok.ok && ok.args.apply && ok.args.clientesCreadosDesde?.toISOString() === "2026-10-17T03:00:00.000Z");
  assert.equal(parsearArgs([]).ok, false);
  assert.equal(parsearArgs(["--tenant", "x", "--clientes-creados-desde", "ayer"]).ok, false);
  assert.equal(parsearArgs(["--tenant", "x", "--stock", "otro"]).ok, false);
  assert.equal(parsearArgs(["--tenant", "x", "--todos"]).ok, false);
});

test("pooler de Neon: se reconoce por el host", () => {
  assert.equal(esPoolerDeNeon("postgresql://app_rls@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb"), true);
  assert.equal(esPoolerDeNeon("postgresql://app_rls@ep-cool-123.us-east-2.aws.neon.tech/neondb"), false);
  assert.equal(esPoolerDeNeon(undefined), false);
});
