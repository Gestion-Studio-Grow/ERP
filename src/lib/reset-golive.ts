// RESETEO DE GO-LIVE — la PLANIFICACIÓN, pura y testeable (sin base).
//
// Después del día de pruebas reales en producción, el go-live borra los datos TRANSACCIONALES de
// UN negocio y deja intactos los MAESTROS. Decisión del dueño: docs/agent/DECISIONS.md D7.5,
// opción A — "reset permitido de ventas, turnos y caja de prueba, nunca de facturas con CAE ni de
// días cerrados, con respaldo previo y autorización del dueño cada vez". Base: CLAUDE.md
// ("un reset futuro puede tocar datos transaccionales, nunca maestros ni servicios").
//
// Este archivo decide QUÉ se borra y EN QUÉ ORDEN a partir de una FOTO del negocio (ids y
// enlaces, nada más). Leer la foto y ejecutar el plan vive en `reset-golive-db.ts`; la línea de
// comandos, en `scripts/reset-golive.ts`. Runbook: docs/runbooks/reset-golive.md.
//
// LO QUE SE CONSERVA SIEMPRE (y por qué):
//   · Todo lo maestro: no está en la foto, así que no hay forma de que entre al plan.
//   · Comprobantes con CAE: inmutables por trigger (20260925150000_comprobante_autorizado_inmutable).
//     Y TAMBIÉN SU VENTA (pedido o turno, con su caja y sus cobros): un CAE es un hecho fiscal real,
//     se anula con nota de crédito por el circuito normal, que parte de la venta. Borrar la venta
//     (la FK dejaría el enlace en NULL) esconde el comprobante del freno de anulación (ENG-023) y
//     pierde el rastro a su cliente: una segunda corrida ya no sabría que ese cliente tiene CAE.
//     También se conservan sus envíos y el comprobante al que apunta una nota.
//   · Días de caja CERRADOS (opción A): todo movimiento con fecha ≤ frontera (corte inicial o
//     cierre diario, la MISMA regla de `frontera-cierre.ts`), y las filas con marca de corte
//     inicial, de cierre diario o del histórico importado de la planilla.
//   · Lo que cuelga de algo conservado: si se conserva un movimiento de caja, se conserva su
//     pedido, su cobro y su turno (y al revés), para no dejar un libro que apunta a la nada.
//   · Movimientos de stock de tipo AJUSTE (stock inicial y recuentos: son el stock CONTADO).
//   · Clientes, salvo `clientesCreadosDesde` (y aun así, nunca uno con CAE o con algo colgando).

import { compareDayKeys, type DayKey } from "@/lib/caja/cierre-diario";
import { CORTE_INICIAL_ACTOR_PREFIX } from "@/lib/caja/corte-inicial";
import { CIERRE_DIARIO_ACTOR_PREFIX } from "@/lib/caja/cierre-marca";
import { IMPORT_ACTOR_PREFIX } from "@/lib/caja/import-caja";
import { round3 } from "@/lib/stock/ledger";

/** Quién queda escrito en `AuditLog` y en los movimientos que agrega el reseteo. */
export const ACTOR_RESETEO = "operator:reset-golive";
export const ACCION_RESETEO = "reset-golive";
export const MOTIVO_AJUSTE_STOCK = "Ajuste al go-live: se conserva el stock contado tras borrar los movimientos de prueba";

/** Marcas de `CashMovement.createdBy` que NUNCA se borran (estado de caja, no prueba). */
export const MARCAS_DE_CAJA_PROTEGIDAS = [CORTE_INICIAL_ACTOR_PREFIX, CIERRE_DIARIO_ACTOR_PREFIX, IMPORT_ACTOR_PREFIX] as const;

/** Tipos de movimiento de stock que nacen de una operación (los AJUSTE se conservan). */
export const TIPOS_DE_STOCK_TRANSACCIONALES = ["VENTA", "CONSUMO", "COMPRA", "REPOSICION", "DEVOLUCION_PROVEEDOR"] as const;

/**
 * ORDEN DE BORRADO: hijos antes que padres. Cada paso es un `deleteMany` por id dentro de la
 * misma transacción. Las FK que obligan el orden (RESTRICT) van anotadas; el resto es SET NULL
 * o CASCADE y el orden igual va de hijo a padre para que nada se borre "de rebote" sin contarlo.
 */
export const ORDEN_DE_BORRADO = [
  "EnvioComprobante", // → Invoice RESTRICT
  "InvoiceNota", // Invoice que apunta a otro comprobante (comprobanteAsociado RESTRICT): primero las notas
  "Invoice", // sin CAE
  "EventoIntegracion", // → OutboxEvent RESTRICT
  "OutboxEvent",
  "MensajeWhatsapp", // → ConversacionWhatsapp CASCADE
  "ConversacionWhatsapp",
  "MovimientoImportado", // → ImportacionBancaria CASCADE
  "ImportacionBancaria",
  "LeadCampania",
  "WaitlistEntry",
  "Review", // → Appointment CASCADE
  "CashMovement", // → CashSession CASCADE, → Order/Payment/Collection SET NULL
  "CashSession",
  "Collection", // → Order/Appointment SET NULL
  "Payment", // → Appointment RESTRICT
  "StockMovement",
  "StockPurchaseItem", // → StockPurchase CASCADE
  "StockPurchase",
  "PayableCheque", // → AccountPayable CASCADE
  "AccountPayable",
  "AccountReceivable", // → Client RESTRICT
  "OrderItem", // → Order CASCADE
  "Order", // → Client SET NULL; Invoice → SET NULL (una venta con CAE no llega acá: se conserva)
  "Appointment", // → Client RESTRICT; Invoice → SET NULL (ídem)
  "CommissionPayout", // ← Appointment SET NULL
  "ProfessionalBlock",
  "BoxBlock",
  "Client", // sólo con `clientesCreadosDesde`
] as const;

export type PasoTabla = (typeof ORDEN_DE_BORRADO)[number];

/** La tabla real de cada paso (dos pasos borran de `Invoice`). */
export function tablaDelPaso(paso: PasoTabla): string {
  return paso === "InvoiceNota" ? "Invoice" : paso;
}

// ── La foto ─────────────────────────────────────────────────────────────────

type Id = string;
type N = string | null;

export interface FotoNegocio {
  /** Último día de caja cerrado (corte inicial o cierre diario), o null. */
  frontera: DayKey | null;
  ahora: Date;
  appointments: { id: Id; clientId: Id; startsAt: Date; commissionPayoutId: N; couponCode: N }[];
  payments: { id: Id; appointmentId: Id }[];
  reviews: { id: Id; appointmentId: Id }[];
  collections: { id: Id; orderId: N; appointmentId: N; originType: string; originId: Id }[];
  orders: { id: Id; clientId: N }[];
  orderItems: { id: Id; orderId: Id }[];
  /** `dia` = fecha de negocio de `occurredAt` (zona del negocio). */
  cashMovements: { id: Id; sessionId: N; orderId: N; paymentId: N; collectionId: N; createdBy: string; dia: DayKey }[];
  cashSessions: { id: Id; diaApertura: DayKey; status: string }[];
  invoices: { id: Id; orderId: N; appointmentId: N; conCae: boolean; status: string; comprobanteAsociadoId: N; docNro: string }[];
  envios: { id: Id; invoiceId: Id }[];
  commissionPayouts: { id: Id }[];
  stockMovements: { id: Id; productId: N; type: string; qty: number; orderId: N; appointmentId: N; purchaseId: N }[];
  stockPurchases: { id: Id }[];
  stockPurchaseItems: { id: Id; purchaseId: Id }[];
  payables: { id: Id; purchaseId: N }[];
  cheques: { id: Id; payableId: Id }[];
  receivables: { id: Id; clientId: Id }[];
  outbox: { id: Id; pendiente: boolean }[];
  eventosIntegracion: { id: Id }[];
  conversaciones: { id: Id }[];
  mensajes: { id: Id; conversacionId: Id }[];
  /** Mensajes que un `ExtractoRecibido` referencia (FK RESTRICT): no se pueden borrar. */
  mensajesConExtracto: Id[];
  importaciones: { id: Id }[];
  movimientosImportados: { id: Id; importacionId: Id }[];
  leads: { id: Id }[];
  waitlist: { id: Id }[];
  professionalBlocks: { id: Id; endsAt: Date }[];
  boxBlocks: { id: Id; endsAt: Date }[];
  clients: { id: Id; createdAt: Date; docNro: N }[];
  /** Clientes con algo de otro módulo colgando (taller, inmobiliaria): nunca se borran. */
  clientesConOtrosModulos: Id[];
  coupons: { id: Id; code: string; usedCount: number }[];
  /** Cupón con el que se tomó cada pedido (AuditLog `cupon-del-pedido`). */
  cuponesDePedidos: { orderId: Id; codigo: string; cuponId: N }[];
  products: { id: Id; name: string; stock: number }[];
}

export interface OpcionesReseteo {
  /** Borra los clientes creados desde esta fecha (sin CAE ni nada colgando). Null = no borra clientes. */
  clientesCreadosDesde: Date | null;
  /** Conserva turnos que todavía no pasaron y bloqueos de agenda vigentes. */
  conservarFuturo: boolean;
}

export interface PasoDeBorrado {
  paso: PasoTabla;
  tabla: string;
  ids: Id[];
}

export interface PlanReseteo {
  pasos: PasoDeBorrado[];
  /** Qué queda, por tabla y por qué (lo que se informa en el modo prueba). */
  conserva: { tabla: string; cantidad: number; motivo: string }[];
  comprobantesConCae: { id: Id; enlazadoA: string }[];
  cupones: { id: Id; code: string; de: number; a: number }[];
  ajustesStock: { productId: Id; nombre: string; qty: number; stock: number }[];
  clientesConservados: { id: Id; motivo: string }[];
  avisos: string[];
}

// ── Planificación ───────────────────────────────────────────────────────────

export function esMarcaProtegida(createdBy: string): boolean {
  return MARCAS_DE_CAJA_PROTEGIDAS.some((p) => createdBy.startsWith(p));
}

/** Documentos que no identifican a nadie (consumidor final sin datos). */
function docIdentifica(doc: string | null | undefined): doc is string {
  const d = (doc ?? "").trim();
  return d !== "" && /[1-9]/.test(d);
}

/**
 * Qué se borra, qué se conserva y en qué orden. PURA: no toca la base. Lo que se conserva se
 * calcula como un cierre: se parte de lo protegido (días cerrados, marcas, CAE, futuro) y se
 * propaga por los enlaces hasta que no cambia nada. Todo lo demás de la foto se borra.
 */
export function planificarReseteo(foto: FotoNegocio, op: OpcionesReseteo): PlanReseteo {
  const avisos: string[] = [];
  const keep = {
    cm: new Set<Id>(),
    appt: new Set<Id>(),
    pay: new Set<Id>(),
    col: new Set<Id>(),
    order: new Set<Id>(),
    ar: new Set<Id>(),
    ap: new Set<Id>(),
    purchase: new Set<Id>(),
    invoice: new Set<Id>(),
  };
  const motivoCm = new Map<Id, string>();

  // Semillas.
  for (const m of foto.cashMovements) {
    if (esMarcaProtegida(m.createdBy)) {
      keep.cm.add(m.id);
      motivoCm.set(m.id, "marca de corte inicial / cierre diario / histórico importado");
    } else if (foto.frontera && compareDayKeys(m.dia, foto.frontera) <= 0) {
      keep.cm.add(m.id);
      motivoCm.set(m.id, `día de caja cerrado (≤ ${foto.frontera})`);
    }
  }
  if (op.conservarFuturo) {
    for (const a of foto.appointments) if (a.startsAt >= foto.ahora) keep.appt.add(a.id);
  }
  for (const i of foto.invoices) {
    if (!i.conCae) continue;
    if (i.orderId) keep.order.add(i.orderId);
    if (i.appointmentId) keep.appt.add(i.appointmentId);
  }

  // Cierre por enlaces, hasta punto fijo.
  const add = (s: Set<Id>, id: N) => {
    if (id && !s.has(id)) {
      s.add(id);
      return true;
    }
    return false;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of foto.cashMovements) {
      if (keep.cm.has(m.id)) {
        changed = add(keep.order, m.orderId) || changed;
        changed = add(keep.pay, m.paymentId) || changed;
        changed = add(keep.col, m.collectionId) || changed;
      } else if ((m.orderId && keep.order.has(m.orderId)) || (m.paymentId && keep.pay.has(m.paymentId)) || (m.collectionId && keep.col.has(m.collectionId))) {
        changed = add(keep.cm, m.id) || changed;
        if (!motivoCm.has(m.id)) motivoCm.set(m.id, "pertenece a una venta/cobro que se conserva");
      }
    }
    for (const p of foto.payments) {
      if (keep.pay.has(p.id)) changed = add(keep.appt, p.appointmentId) || changed;
      else if (keep.appt.has(p.appointmentId)) changed = add(keep.pay, p.id) || changed;
    }
    for (const c of foto.collections) {
      const origen = (t: string) => (c.originType === t ? c.originId : null);
      if (keep.col.has(c.id)) {
        changed = add(keep.order, c.orderId ?? origen("ORDER")) || changed;
        changed = add(keep.appt, c.appointmentId ?? origen("APPOINTMENT")) || changed;
        changed = add(keep.ar, origen("RECEIVABLE")) || changed;
        changed = add(keep.ap, origen("PAYABLE")) || changed;
      } else {
        const ligado =
          (c.orderId && keep.order.has(c.orderId)) ||
          (c.appointmentId && keep.appt.has(c.appointmentId)) ||
          (c.originType === "ORDER" && keep.order.has(c.originId)) ||
          (c.originType === "APPOINTMENT" && keep.appt.has(c.originId)) ||
          (c.originType === "RECEIVABLE" && keep.ar.has(c.originId)) ||
          (c.originType === "PAYABLE" && keep.ap.has(c.originId));
        if (ligado) changed = add(keep.col, c.id) || changed;
      }
    }
    for (const ap of foto.payables) if (keep.ap.has(ap.id)) changed = add(keep.purchase, ap.purchaseId) || changed;
  }

  // Comprobantes: con CAE siempre; sin CAE, si su venta se conserva; y lo que un conservado asocia.
  for (const i of foto.invoices) {
    if (i.conCae || (i.orderId && keep.order.has(i.orderId)) || (i.appointmentId && keep.appt.has(i.appointmentId))) keep.invoice.add(i.id);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const i of foto.invoices) if (keep.invoice.has(i.id)) changed = add(keep.invoice, i.comprobanteAsociadoId) || changed;
  }
  const comprobantesConCae = foto.invoices
    .filter((i) => i.conCae)
    .map((i) => ({
      id: i.id,
      enlazadoA: i.orderId ? `pedido ${i.orderId} (se conserva con su caja y cobros)` : i.appointmentId ? `turno ${i.appointmentId} (se conserva con su pago)` : "sin venta enlazada",
    }));
  const pendientesSinCae = foto.invoices.filter((i) => !keep.invoice.has(i.id) && i.status === "PENDING");
  if (pendientesSinCae.length > 0) {
    avisos.push(
      `${pendientesSinCae.length} comprobante(s) PENDIENTE(S) sin CAE se van a borrar. Antes de aplicar, confirmá en ARCA ` +
        `(último número autorizado por punto de venta) que ninguno quedó autorizado allá sin registrarse acá.`,
    );
  }

  // Sesiones de caja: se conserva la que tiene algún movimiento conservado o abrió en día cerrado.
  const keepSession = new Set<Id>();
  for (const m of foto.cashMovements) if (keep.cm.has(m.id) && m.sessionId) keepSession.add(m.sessionId);
  for (const s of foto.cashSessions) if (foto.frontera && compareDayKeys(s.diaApertura, foto.frontera) <= 0) keepSession.add(s.id);
  const abiertas = foto.cashSessions.filter((s) => s.status === "OPEN" && !keepSession.has(s.id));
  if (abiertas.length > 0) avisos.push(`${abiertas.length} turno(s) de caja ABIERTO(S) se borran: que nadie esté vendiendo mientras corre el reseteo.`);

  const keepAppt = keep.appt;
  const keepReview = new Set(foto.reviews.filter((r) => keepAppt.has(r.appointmentId)).map((r) => r.id));
  const keepPayout = new Set(foto.appointments.filter((a) => keepAppt.has(a.id) && a.commissionPayoutId).map((a) => a.commissionPayoutId as Id));
  const keepStock = new Set(
    foto.stockMovements
      .filter(
        (s) =>
          !(TIPOS_DE_STOCK_TRANSACCIONALES as readonly string[]).includes(s.type) ||
          (s.orderId && keep.order.has(s.orderId)) ||
          (s.appointmentId && keepAppt.has(s.appointmentId)) ||
          (s.purchaseId && keep.purchase.has(s.purchaseId)),
      )
      .map((s) => s.id),
  );
  const keepCheque = new Set(foto.cheques.filter((c) => keep.ap.has(c.payableId)).map((c) => c.id));
  const keepConv = new Set(foto.mensajes.filter((m) => foto.mensajesConExtracto.includes(m.id)).map((m) => m.conversacionId));
  const keepMsg = new Set(foto.mensajes.filter((m) => keepConv.has(m.conversacionId)).map((m) => m.id));
  const vigente = (b: { endsAt: Date }) => op.conservarFuturo && b.endsAt >= foto.ahora;
  const keepEnvio = new Set(foto.envios.filter((e) => keep.invoice.has(e.invoiceId)).map((e) => e.id));

  // Clientes (sólo con la opción). Nunca: con CAE, con algo conservado colgando, de otro módulo.
  const clientesConservados: { id: Id; motivo: string }[] = [];
  const clientesABorrar: Id[] = [];
  if (op.clientesCreadosDesde) {
    const desde = op.clientesCreadosDesde;
    const conCaePorVenta = new Set<Id>();
    const apptCliente = new Map(foto.appointments.map((a) => [a.id, a.clientId]));
    const orderCliente = new Map(foto.orders.map((o) => [o.id, o.clientId]));
    const docsConCae = new Set<string>();
    for (const i of foto.invoices) {
      if (!i.conCae) continue;
      const c = (i.orderId && orderCliente.get(i.orderId)) || (i.appointmentId && apptCliente.get(i.appointmentId));
      if (c) conCaePorVenta.add(c);
      if (docIdentifica(i.docNro)) docsConCae.add(i.docNro.trim());
    }
    const conAlgoConservado = new Set<Id>([
      ...foto.appointments.filter((a) => keepAppt.has(a.id)).map((a) => a.clientId),
      ...foto.orders.filter((o) => keep.order.has(o.id) && o.clientId).map((o) => o.clientId as Id),
      ...foto.receivables.filter((r) => keep.ar.has(r.id)).map((r) => r.clientId),
    ]);
    const otros = new Set(foto.clientesConOtrosModulos);
    for (const c of foto.clients) {
      if (c.createdAt < desde) continue;
      const motivo = conCaePorVenta.has(c.id) || (docIdentifica(c.docNro) && docsConCae.has(c.docNro.trim()))
        ? "tiene un comprobante con CAE"
        : conAlgoConservado.has(c.id)
          ? "tiene un turno, pedido o fiado que se conserva"
          : otros.has(c.id)
            ? "tiene datos de otro módulo (taller / inmobiliaria)"
            : null;
      if (motivo) clientesConservados.push({ id: c.id, motivo });
      else clientesABorrar.push(c.id);
    }
  }

  const fuera = <T extends { id: Id }>(rows: T[], keepSet: Set<Id>) => rows.filter((r) => !keepSet.has(r.id)).map((r) => r.id);
  const ninguno = new Set<Id>();
  const invoicesABorrar = foto.invoices.filter((i) => !keep.invoice.has(i.id));
  const ids: Record<PasoTabla, Id[]> = {
    EnvioComprobante: fuera(foto.envios, keepEnvio),
    InvoiceNota: invoicesABorrar.filter((i) => i.comprobanteAsociadoId).map((i) => i.id),
    Invoice: invoicesABorrar.filter((i) => !i.comprobanteAsociadoId).map((i) => i.id),
    EventoIntegracion: fuera(foto.eventosIntegracion, ninguno),
    OutboxEvent: fuera(foto.outbox, ninguno),
    MensajeWhatsapp: fuera(foto.mensajes, keepMsg),
    ConversacionWhatsapp: fuera(foto.conversaciones, keepConv),
    MovimientoImportado: fuera(foto.movimientosImportados, ninguno),
    ImportacionBancaria: fuera(foto.importaciones, ninguno),
    LeadCampania: fuera(foto.leads, ninguno),
    WaitlistEntry: fuera(foto.waitlist, ninguno),
    Review: fuera(foto.reviews, keepReview),
    CashMovement: fuera(foto.cashMovements, keep.cm),
    CashSession: fuera(foto.cashSessions, keepSession),
    Collection: fuera(foto.collections, keep.col),
    Payment: fuera(foto.payments, keep.pay),
    StockMovement: fuera(foto.stockMovements, keepStock),
    StockPurchaseItem: foto.stockPurchaseItems.filter((i) => !keep.purchase.has(i.purchaseId)).map((i) => i.id),
    StockPurchase: fuera(foto.stockPurchases, keep.purchase),
    PayableCheque: fuera(foto.cheques, keepCheque),
    AccountPayable: fuera(foto.payables, keep.ap),
    AccountReceivable: fuera(foto.receivables, keep.ar),
    OrderItem: foto.orderItems.filter((i) => !keep.order.has(i.orderId)).map((i) => i.id),
    Order: fuera(foto.orders, keep.order),
    Appointment: fuera(foto.appointments, keepAppt),
    CommissionPayout: fuera(foto.commissionPayouts, keepPayout),
    ProfessionalBlock: foto.professionalBlocks.filter((b) => !vigente(b)).map((b) => b.id),
    BoxBlock: foto.boxBlocks.filter((b) => !vigente(b)).map((b) => b.id),
    Client: clientesABorrar,
  };
  const pasos = ORDEN_DE_BORRADO.map((paso) => ({ paso, tabla: tablaDelPaso(paso), ids: ids[paso] }));

  // Cupones: el uso vuelve a lo que de verdad queda (0 si no se conserva ninguna venta con él).
  const pedidosConservados = foto.cuponesDePedidos.filter((c) => keep.order.has(c.orderId));
  const cupones = foto.coupons
    .map((c) => {
      const a =
        foto.appointments.filter((x) => keepAppt.has(x.id) && x.couponCode === c.code).length +
        pedidosConservados.filter((p) => (p.cuponId ? p.cuponId === c.id : p.codigo === c.code)).length;
      return { id: c.id, code: c.code, de: c.usedCount, a };
    })
    .filter((c) => c.de !== c.a);

  // Stock: Product.stock NO se toca (stock contado). Para que el historial lo explique, por cada
  // producto que pierde movimientos se asienta un AJUSTE por la diferencia con lo que queda.
  const borrados = new Set(ids.StockMovement);
  const tocados = new Set(foto.stockMovements.filter((s) => borrados.has(s.id) && s.productId).map((s) => s.productId as Id));
  const ajustesStock = foto.products
    .filter((p) => tocados.has(p.id))
    .map((p) => {
      const queda = foto.stockMovements.filter((s) => s.productId === p.id && !borrados.has(s.id)).reduce((t, s) => t + s.qty, 0);
      return { productId: p.id, nombre: p.name, qty: round3(p.stock - queda), stock: p.stock };
    })
    .filter((a) => a.qty !== 0);

  const conserva: PlanReseteo["conserva"] = [];
  const nota = (tabla: string, cantidad: number, motivo: string) => {
    if (cantidad > 0) conserva.push({ tabla, cantidad, motivo });
  };
  const porMotivo = new Map<string, number>();
  for (const id of keep.cm) {
    const m = motivoCm.get(id) ?? "enlazado a algo que se conserva";
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  }
  for (const [m, n] of porMotivo) nota("CashMovement", n, m);
  nota("CashSession", keepSession.size, "turno de caja con movimientos conservados o abierto en día cerrado");
  nota("Invoice", comprobantesConCae.length, "comprobante con CAE (inmutable: se anula con nota de crédito, nunca se borra)");
  nota("Invoice", keep.invoice.size - comprobantesConCae.length, "sin CAE pero de una venta conservada, o asociado por un comprobante conservado");
  nota("EnvioComprobante", keepEnvio.size, "envío de un comprobante que se conserva");
  nota("Appointment", keepAppt.size, `turno con comprobante con CAE${op.conservarFuturo ? ", futuro (--conservar-futuro)" : ""} o enlazado a caja conservada`);
  nota("Order", keep.order.size, "pedido con comprobante con CAE o enlazado a caja conservada");
  nota("Payment", keep.pay.size, "pago de un turno conservado");
  nota("Collection", keep.col.size, "cobro enlazado a algo conservado");
  nota("StockMovement", keepStock.size, "AJUSTE (stock inicial / recuento) o de una venta conservada");
  nota("ConversacionWhatsapp", keepConv.size, "tiene un extracto recibido colgando (FK RESTRICT)");
  nota("ProfessionalBlock", foto.professionalBlocks.length - ids.ProfessionalBlock.length, "bloqueo vigente (--conservar-futuro)");
  nota("BoxBlock", foto.boxBlocks.length - ids.BoxBlock.length, "bloqueo vigente (--conservar-futuro)");
  nota("Client", foto.clients.length - clientesABorrar.length, op.clientesCreadosDesde ? "creado antes de la fecha, o con CAE / algo colgando" : "clientes: no se borran sin --clientes-creados-desde");

  const pendientesOutbox = foto.outbox.filter((o) => o.pendiente).length;
  if (pendientesOutbox > 0) avisos.push(`${pendientesOutbox} evento(s) del outbox todavía PENDIENTES de despacho se borran (no se van a enviar).`);
  if (foto.frontera) {
    const cerradosConVenta = foto.cashMovements.filter((m) => keep.cm.has(m.id) && !esMarcaProtegida(m.createdBy)).length;
    if (cerradosConVenta > 0) {
      avisos.push(
        `${cerradosConVenta} movimiento(s) de caja quedan porque su día está CERRADO (frontera ${foto.frontera}). Opción A: los días ` +
          `cerrados no se tocan. Si ese día era de prueba, es una decisión del dueño aparte (este script no la toma).`,
      );
    }
  }
  if (op.conservarFuturo === false) {
    const futuros = foto.appointments.filter((a) => a.startsAt >= foto.ahora).length;
    if (futuros > 0) avisos.push(`${futuros} turno(s) FUTURO(S) se borran. Si alguno es de un cliente real, corré con --conservar-futuro.`);
  }

  return { pasos, conserva, comprobantesConCae, cupones, ajustesStock, clientesConservados, avisos };
}

/** Total de filas que borra el plan. */
export function totalABorrar(plan: PlanReseteo): number {
  return plan.pasos.reduce((t, p) => t + p.ids.length, 0);
}

/** Lo que el plan borra, por tabla real (para la auditoría y la verificación). */
export function conteoPorTabla(plan: PlanReseteo): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of plan.pasos) if (p.ids.length > 0) out[p.tabla] = (out[p.tabla] ?? 0) + p.ids.length;
  return out;
}

// ── Línea de comandos (pura, para testearla) ────────────────────────────────

export interface ArgsReseteo {
  tenant: string;
  apply: boolean;
  confirmar: string | null;
  clientesCreadosDesde: Date | null;
  conservarFuturo: boolean;
  stock: "conservar" | "recalcular";
}

/** Lee `--flag valor` o `--flag=valor`. Devuelve un error en castellano o los argumentos. */
export function parsearArgs(argv: string[]): { ok: true; args: ArgsReseteo } | { ok: false; error: string } {
  const val = (flag: string): string | null | undefined => {
    const eq = argv.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1);
    const i = argv.indexOf(flag);
    if (i < 0) return null;
    const v = argv[i + 1];
    return v === undefined || v.startsWith("--") ? undefined : v;
  };
  const conocidos = ["--tenant", "--apply", "--confirmar", "--clientes-creados-desde", "--conservar-futuro", "--stock"];
  const raro = argv.find((a) => a.startsWith("--") && !conocidos.includes(a.split("=")[0]));
  if (raro) return { ok: false, error: `opción desconocida: ${raro}` };

  const tenant = val("--tenant");
  if (!tenant) return { ok: false, error: "falta --tenant <slug> (un negocio por corrida)" };
  const confirmar = val("--confirmar");
  if (confirmar === undefined) return { ok: false, error: "--confirmar necesita el slug del negocio" };
  const desdeRaw = val("--clientes-creados-desde");
  if (desdeRaw === undefined) return { ok: false, error: "--clientes-creados-desde necesita una fecha ISO (ej. 2026-10-17T00:00:00-03:00)" };
  let clientesCreadosDesde: Date | null = null;
  if (desdeRaw !== null) {
    const d = new Date(desdeRaw);
    if (!/^\d{4}-\d{2}-\d{2}/.test(desdeRaw) || Number.isNaN(d.getTime())) return { ok: false, error: `fecha inválida en --clientes-creados-desde: "${desdeRaw}"` };
    clientesCreadosDesde = d;
  }
  const stockRaw = val("--stock") ?? "conservar";
  if (stockRaw !== "conservar" && stockRaw !== "recalcular") return { ok: false, error: `--stock admite "conservar" o "recalcular" (recibido: "${stockRaw}")` };
  const apply = argv.includes("--apply");
  if (apply && confirmar !== tenant) {
    return { ok: false, error: `para borrar hace falta --apply y además --confirmar ${tenant} (el mismo slug, escrito otra vez)` };
  }
  return { ok: true, args: { tenant, apply, confirmar, clientesCreadosDesde, conservarFuturo: argv.includes("--conservar-futuro"), stock: stockRaw } };
}

/** ¿La URL apunta al pooler de Neon? (`-pooler` en el host). */
export function esPoolerDeNeon(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.includes("-pooler");
  } catch {
    return false;
  }
}
