// ============================================================================
// Catálogo de eventos de dominio v1 (P2) — `dominio.hecho@N`
// ============================================================================
//
// Fuente: plataforma-integraciones.md §7.3 (retail y club) + PLAN-REINGENIERIA-N2 §4.1.2.
// Es la ÚNICA fuente: `emitirEvento` valida contra esto, el tipo de `datos` sale de acá y
// docs/integrations/eventos.md se genera desde acá (`npx tsx src/eventos/generar-doc.ts`).
//
// Reglas (§7.3):
//   1. Agregar un campo OPCIONAL no sube la versión; sacar, renombrar o cambiar el tipo sí
//      (`@2`), y el emisor publica las dos durante una ventana (cada una con su fila: la clave
//      guardada de una `@N≥2` lleva el sufijo `@N`, ver emitir.ts).
//   2. Todo evento tiene `clave` única por hecho: reemitir es gratis, duplicar es imposible.
//   3. Los de plata (`pedido.cobrado`, `pago.*`, `factura.*`, `cuota.cobrada`, `caja.*`) se
//      emiten SÓLO dentro de la transacción que los produce.
//   4. Datos personales: ids y montos. Teléfono/documento NUNCA en claro; enmascarado
//      (`telefonoEnmascarado`, `remitenteEnmascarado`) y los textos que escribe una persona
//      (`textoLibre`) se redactan al emitir. El catálogo.test.ts lo revisa campo por campo.
//
// `emision`: dónde se emite HOY. "P2" = cableado en esta tanda; "pendiente · <tanda>" = está en
// el catálogo (los suscriptores ya pueden contar con su forma) pero lo emite esa tanda.
// ============================================================================

import { e, type Esquema, type TipoDe } from "./esquema";

export type Familia = "retail" | "club" | "compartido" | "n2";

export interface DefinicionEvento<D> {
  tipo: string;
  version: number;
  familia: Familia;
  /** Cuándo pasa / punto de emisión. */
  cuando: string;
  /** "P2" si ya se emite; "pendiente · <tanda>" si no. */
  emision: string;
  /** Lleva plata: se emite dentro de la transacción del hecho (regla 3). */
  plata?: boolean;
  /** Cómo se arma la clave del hecho (documentación). */
  clave: string;
  esquema: Esquema<D>;
  ejemplo: D;
  /** Sólo por API local, nunca por webhook (balanza). */
  soloApiLocal?: boolean;
}

type DefinicionCon<E extends Esquema<unknown>> = Omit<DefinicionEvento<TipoDe<E>>, "esquema" | "ejemplo"> & {
  esquema: E;
  ejemplo: NoInfer<TipoDe<E>>;
};

// El tipo sale del ESQUEMA (no del ejemplo): el ejemplo tiene que cumplirlo, y el test lo valida.
function def<E extends Esquema<unknown>>(d: DefinicionCon<E>): DefinicionCon<E> {
  return d;
}

// ── Piezas comunes ────────────────────────────────────────────────────────────

const MEDIO = e.uno(["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"] as const);
const CANAL_PEDIDO = e.uno(["MOSTRADOR", "ONLINE", "API", "WHATSAPP"] as const);
const ENTREGA = e.uno(["RETIRA", "DELIVERY"] as const);
const ITEM_PEDIDO = e.objeto({
  productoId: e.nulo(e.id()),
  sku: e.nulo(e.texto()),
  nombre: e.textoLibre(),
  cantidad: e.numero(),
  precioUnitario: e.monto(),
});
const CLASE = e.objeto({
  claseId: e.id(),
  alumnoId: e.id(),
  empiezaEn: e.fecha(),
  estado: e.texto(),
  pagoEstado: e.texto(),
});
const SOCIO = e.objeto({ socioId: e.id(), categoria: e.texto(), desde: e.fecha() });
const CREDITO = e.objeto({ socioId: e.id(), monto: e.monto(), saldo: e.monto(), origen: e.texto() });
const ESPERA = e.objeto({
  esperaId: e.id(),
  turnoId: e.opcional(e.id()),
  ofrecidoA: e.lista(e.id()),
  venceEn: e.fecha(),
});
const REPARTO = e.objeto({
  repartoId: e.id(),
  cadeteId: e.id(),
  envios: e.entero(),
  efectivoEsperado: e.monto(),
  efectivoEntregado: e.monto(),
});
const LOTE = e.objeto({ loteId: e.id(), productoId: e.id(), vence: e.fecha(), kg: e.numero() });

const ejClase = { claseId: "cls_01", alumnoId: "cli_01", empiezaEn: "2026-10-28T19:00:00-03:00", estado: "PEDIDA", pagoEstado: "PENDIENTE" };
const ejEspera = { esperaId: "esp_01", turnoId: "trn_01", ofrecidoA: ["cli_01", "cli_02"], venceEn: "2026-10-28T18:30:00-03:00" };
const ejReparto = { repartoId: "rep_01", cadeteId: "usr_07", envios: 6, efectivoEsperado: 48500, efectivoEntregado: 48500 };
const ejLote = { loteId: "lot_01", productoId: "prd_01", vence: "2026-10-31", kg: 12.5 };

// ── El catálogo ───────────────────────────────────────────────────────────────

export const CATALOGO = {
  // ── Retail (§7.3) ──
  "pedido.creado@1": def({
    tipo: "pedido.creado", version: 1, familia: "retail", emision: "P2",
    cuando: "insertOrder / createExternalOrder (src/lib/order-core.ts, external-orders.ts), en la transacción del alta",
    clave: "pedido:<pedidoId>:creado",
    esquema: e.objeto({
      pedidoId: e.id(),
      codigo: e.entero(),
      canal: CANAL_PEDIDO,
      entrega: ENTREGA,
      total: e.monto(),
      items: e.lista(ITEM_PEDIDO),
      clienteId: e.nulo(e.id()),
      externalRef: e.nulo(e.texto()),
    }),
    ejemplo: {
      pedidoId: "ord_01", codigo: 1042, canal: "MOSTRADOR", entrega: "RETIRA", total: 18900,
      items: [{ productoId: "prd_01", sku: null, nombre: "Vacío", cantidad: 1.5, precioUnitario: 12600 }],
      clienteId: "cli_01", externalRef: null,
    },
  }),
  "pedido.confirmado@1": def({
    tipo: "pedido.confirmado", version: 1, familia: "retail", emision: "pendiente · tanda de avanzar-pedido",
    cuando: "avance PENDING→CONFIRMED (avanzar-pedido)", clave: "pedido:<pedidoId>:confirmado",
    esquema: e.objeto({ pedidoId: e.id(), codigo: e.entero(), listoEstimado: e.opcional(e.fecha()) }),
    ejemplo: { pedidoId: "ord_01", codigo: 1042, listoEstimado: "2026-10-28T13:30:00-03:00" },
  }),
  "pedido.listo@1": def({
    tipo: "pedido.listo", version: 1, familia: "retail", emision: "pendiente · tanda de avanzar-pedido",
    cuando: "avance →READY", clave: "pedido:<pedidoId>:listo",
    esquema: e.objeto({ pedidoId: e.id(), codigo: e.entero(), entrega: ENTREGA }),
    ejemplo: { pedidoId: "ord_01", codigo: 1042, entrega: "DELIVERY" },
  }),
  "pedido.entregado@1": def({
    tipo: "pedido.entregado", version: 1, familia: "retail", emision: "pendiente · tanda de avanzar-pedido",
    cuando: "avance →DELIVERED", clave: "pedido:<pedidoId>:entregado",
    esquema: e.objeto({ pedidoId: e.id(), codigo: e.entero(), entregadoEn: e.fecha() }),
    ejemplo: { pedidoId: "ord_01", codigo: 1042, entregadoEn: "2026-10-28T14:10:00-03:00" },
  }),
  "pedido.cancelado@1": def({
    tipo: "pedido.cancelado", version: 1, familia: "retail", emision: "P2", plata: true,
    cuando: "anulación de la venta (anularVentaInTx, src/lib/order-anulacion.ts), en su transacción",
    clave: "pedido:<pedidoId>:cancelado",
    esquema: e.objeto({ pedidoId: e.id(), codigo: e.entero(), motivo: e.textoLibre(), reintegro: e.opcional(e.monto()) }),
    ejemplo: { pedidoId: "ord_01", codigo: 1042, motivo: "El cliente se arrepintió", reintegro: 18900 },
  }),
  "pedido.cobrado@1": def({
    tipo: "pedido.cobrado", version: 1, familia: "retail", emision: "P2", plata: true,
    cuando:
      "botón «Cobrar» y aviso de pago de MP (cobrarPedidoEnTx, que usa cobros-actions vía cobrarPedidoPorAvisoDePago), " +
      "venta de mostrador que nace cobrada (insertOrder) y cobro parcial que salda el pedido o la deuda de su fiado " +
      "(applyCollectionInTx, src/lib/settlement/collection-repo.ts: monto = total del pedido, medio = el del cobro que cierra el saldo); " +
      "en la transacción del cobro. Entregar al fiado (clientes/fiado.ts) y la venta a cuenta NO emiten: no entró plata",
    clave: "pedido:<pedidoId>:cobrado",
    esquema: e.objeto({
      pedidoId: e.id(),
      codigo: e.entero(),
      monto: e.monto(),
      medio: MEDIO,
      pagoExterno: e.opcional(e.id()),
      cobradoEn: e.fecha(),
    }),
    ejemplo: { pedidoId: "ord_01", codigo: 1042, monto: 18900, medio: "MP", pagoExterno: "1325478890", cobradoEn: "2026-10-28T14:03:11-03:00" },
  }),
  "pago.acreditado@1": def({
    tipo: "pago.acreditado", version: 1, familia: "compartido", emision: "pendiente · ingesta MP (P5)", plata: true,
    cuando: "ingesta de Mercado Pago (ingest.ts)", clave: "pago:<proveedor>:<pagoExterno>:acreditado",
    esquema: e.objeto({
      pagoExterno: e.id(),
      proveedor: e.texto(),
      monto: e.monto(),
      estado: e.texto(),
      referencia: e.objeto({ tipo: e.texto(), id: e.id() }),
    }),
    ejemplo: { pagoExterno: "1325478890", proveedor: "mercadopago", monto: 18900, estado: "approved", referencia: { tipo: "pedido", id: "ord_01" } },
  }),
  "pago.devuelto@1": def({
    tipo: "pago.devuelto", version: 1, familia: "compartido", emision: "pendiente · ingesta MP (P5)", plata: true,
    cuando: "EstadoPago = refunded", clave: "pago:<proveedor>:<pagoExterno>:devuelto",
    esquema: e.objeto({ pagoExterno: e.id(), monto: e.monto() }),
    ejemplo: { pagoExterno: "1325478890", monto: 18900 },
  }),
  "factura.autorizada@1": def({
    tipo: "factura.autorizada", version: 1, familia: "compartido", emision: "P2", plata: true,
    cuando: "registerFiscalDocument (src/lib/invoice-core.ts), en la transacción que guarda el CAE. InvoiceCreated (v0, ARCA) sigue igual",
    clave: "factura:<facturaId>:autorizada",
    esquema: e.objeto({
      facturaId: e.id(),
      tipoComprobante: e.entero(),
      puntoVenta: e.entero(),
      numero: e.entero(),
      cae: e.texto(),
      caeVencimiento: e.fechaArca(),
      /** Por el tipo de comprobante de ARCA: una nota de crédito RESTA (un suscriptor contable no la suma como venta). */
      clase: e.uno(["FACTURA", "NOTA_DEBITO", "NOTA_CREDITO", "OTRO"] as const),
      total: e.monto(),
      pedidoId: e.opcional(e.id()),
      turnoId: e.opcional(e.id()),
    }),
    ejemplo: {
      facturaId: "inv_01", tipoComprobante: 6, puntoVenta: 3, numero: 1287, cae: "76123456789012",
      caeVencimiento: "20261107", clase: "FACTURA", total: 18900, pedidoId: "ord_01",
    },
  }),
  "factura.rechazada@1": def({
    tipo: "factura.rechazada", version: 1, familia: "compartido", emision: "P2", plata: true,
    cuando: "markInvoiceRejected (src/lib/invoice-core.ts), en la transacción que registra el rechazo",
    clave: "factura:<facturaId>:rechazada:<envioId> (una factura reabierta puede rechazarse otra vez)",
    esquema: e.objeto({ facturaId: e.id(), motivo: e.textoLibre() }),
    ejemplo: { facturaId: "inv_01", motivo: "10015: el documento del receptor no es válido" },
  }),
  "stock.bajo@1": def({
    tipo: "stock.bajo", version: 1, familia: "retail", emision: "pendiente · tanda de inventario",
    cuando: "tras cada movimiento del ledger (src/lib/inventario) si disponible <= minimo", clave: "stock:<productoId>:bajo:<movimientoId>",
    esquema: e.objeto({
      productoId: e.id(), sku: e.nulo(e.texto()), nombre: e.texto(), disponible: e.numero(), minimo: e.numero(), deposito: e.opcional(e.id()),
    }),
    ejemplo: { productoId: "prd_01", sku: null, nombre: "Vacío", disponible: 2.5, minimo: 5 },
  }),
  "stock.ajustado@1": def({
    tipo: "stock.ajustado", version: 1, familia: "retail", emision: "pendiente · tanda de inventario",
    cuando: "stock-adjustment-actions.ts / mermas", clave: "stock:movimiento:<movimientoId>",
    esquema: e.objeto({ productoId: e.id(), delta: e.numero(), motivo: e.textoLibre(), movimientoId: e.id() }),
    ejemplo: { productoId: "prd_01", delta: -0.8, motivo: "Merma por recorte", movimientoId: "smv_01" },
  }),
  "producto.actualizado@1": def({
    tipo: "producto.actualizado", version: 1, familia: "retail", emision: "pendiente · tanda de catálogo",
    cuando: "catálogo: precio o estado (aumento-core.ts)", clave: "producto:<productoId>:<cambioId>",
    esquema: e.objeto({ productoId: e.id(), sku: e.nulo(e.texto()), precio: e.nulo(e.monto()), activo: e.bool(), cambios: e.lista(e.texto()) }),
    ejemplo: { productoId: "prd_01", sku: null, precio: 13200, activo: true, cambios: ["precio"] },
  }),
  "cliente.creado@1": def({
    tipo: "cliente.creado", version: 1, familia: "compartido", emision: "pendiente · tanda de client-actions",
    cuando: "client-actions.ts", clave: "cliente:<clienteId>:creado",
    esquema: e.objeto({ clienteId: e.id(), nombre: e.textoLibre(), telefonoEnmascarado: e.nulo(e.enmascarado()) }),
    ejemplo: { clienteId: "cli_01", nombre: "Marta G.", telefonoEnmascarado: "******7788" },
  }),
  "deuda.vencida@1": def({
    tipo: "deuda.vencida", version: 1, familia: "retail", emision: "pendiente · tanda de debts (barrido)", plata: true,
    cuando: "barrido diario de cuentas a cobrar (src/lib/debts)", clave: "deuda:<deudaId>:vencida:<AAAA-MM-DD>",
    esquema: e.objeto({ clienteId: e.id(), deudaId: e.id(), monto: e.monto(), venciaEl: e.fecha(), diasVencida: e.entero() }),
    ejemplo: { clienteId: "cli_01", deudaId: "ar_01", monto: 32000, venciaEl: "2026-10-20", diasVencida: 8 },
  }),
  "caja.cerrada@1": def({
    tipo: "caja.cerrada", version: 1, familia: "compartido", emision: "pendiente · M1 (cierre-diario)", plata: true,
    cuando: "cierre del día (cierre-diario.ts)", clave: "caja:<cierreId>:cerrada",
    esquema: e.objeto({
      cierreId: e.id(), fecha: e.fecha(), esperado: e.monto(), contado: e.monto(), diferencia: e.monto(),
      porMedio: e.objeto({
        EFECTIVO: e.opcional(e.monto()), MP: e.opcional(e.monto()), TRANSFERENCIA: e.opcional(e.monto()), TARJETA: e.opcional(e.monto()),
      }),
    }),
    ejemplo: { cierreId: "cie_01", fecha: "2026-10-28", esperado: 412300, contado: 412000, diferencia: -300, porMedio: { EFECTIVO: 210000, MP: 202000 } },
  }),
  "caja.abierta@1": def({
    tipo: "caja.abierta", version: 1, familia: "retail", emision: "pendiente · M1 (caja)", plata: true,
    cuando: "corte inicial", clave: "caja:<cierreId>:abierta",
    esquema: e.objeto({ cierreId: e.id(), fecha: e.fecha(), inicial: e.monto() }),
    ejemplo: { cierreId: "cie_01", fecha: "2026-10-28", inicial: 20000 },
  }),
  "balanza.lectura@1": def({
    tipo: "balanza.lectura", version: 1, familia: "retail", emision: "pendiente · opcional (pos-peso.ts)", soloApiLocal: true,
    cuando: "sólo si el negocio lo pide (pos-peso.ts); nunca por webhook, sólo API local", clave: "balanza:<balanzaId>:<lecturaId>",
    esquema: e.objeto({ peso: e.numero(), unidad: e.uno(["kg", "g"] as const), productoId: e.opcional(e.id()) }),
    ejemplo: { peso: 1.234, unidad: "kg", productoId: "prd_01" },
  }),

  // ── Club (§7.3) ──
  "turno.reservado@1": def({
    tipo: "turno.reservado", version: 1, familia: "club", emision: "pendiente · B1 (booking-core)",
    cuando: "booking-core.ts (y createBooking del bot WA)", clave: "turno:<turnoId>:reservado",
    esquema: e.objeto({
      turnoId: e.id(), servicioId: e.id(), profesionalId: e.opcional(e.id()), recursoId: e.opcional(e.id()),
      inicio: e.fecha(), fin: e.fecha(), clienteId: e.id(), canal: e.texto(), sena: e.opcional(e.monto()),
    }),
    ejemplo: { turnoId: "trn_01", servicioId: "srv_01", recursoId: "cancha_2", inicio: "2026-10-28T19:00:00-03:00", fin: "2026-10-28T20:30:00-03:00", clienteId: "cli_01", canal: "WHATSAPP", sena: 6000 },
  }),
  "turno.confirmado@1": def({
    tipo: "turno.confirmado", version: 1, familia: "club", emision: "pendiente · B1",
    cuando: "confirmación por WhatsApp/panel", clave: "turno:<turnoId>:confirmado",
    esquema: e.objeto({ turnoId: e.id(), confirmadoEn: e.fecha(), canal: e.texto() }),
    ejemplo: { turnoId: "trn_01", confirmadoEn: "2026-10-28T12:00:00-03:00", canal: "WHATSAPP" },
  }),
  "turno.cancelado@1": def({
    tipo: "turno.cancelado", version: 1, familia: "club", emision: "pendiente · B1",
    cuando: "cancelación (panel o whatsapp/route.ts)", clave: "turno:<turnoId>:cancelado",
    esquema: e.objeto({
      turnoId: e.id(), motivo: e.textoLibre(), quien: e.uno(["CLIENTE", "NEGOCIO"] as const), fueraDeTermino: e.bool(), reintegroSena: e.opcional(e.monto()),
    }),
    ejemplo: { turnoId: "trn_01", motivo: "Lluvia", quien: "NEGOCIO", fueraDeTermino: false, reintegroSena: 6000 },
  }),
  "turno.reprogramado@1": def({
    tipo: "turno.reprogramado", version: 1, familia: "club", emision: "pendiente · B1",
    cuando: "reprogramación", clave: "turno:<turnoId>:reprogramado:<inicioNuevo>",
    esquema: e.objeto({ turnoId: e.id(), inicioAnterior: e.fecha(), inicioNuevo: e.fecha() }),
    ejemplo: { turnoId: "trn_01", inicioAnterior: "2026-10-28T19:00:00-03:00", inicioNuevo: "2026-10-29T19:00:00-03:00" },
  }),
  "turno.completado@1": def({
    tipo: "turno.completado", version: 1, familia: "club", emision: "pendiente · B1",
    cuando: "cierre del turno", clave: "turno:<turnoId>:completado",
    esquema: e.objeto({ turnoId: e.id(), montoCobrado: e.opcional(e.monto()) }),
    ejemplo: { turnoId: "trn_01", montoCobrado: 24000 },
  }),
  "turno.ausente@1": def({
    tipo: "turno.ausente", version: 1, familia: "club", emision: "pendiente · B1",
    cuando: "no-show", clave: "turno:<turnoId>:ausente",
    esquema: e.objeto({ turnoId: e.id() }),
    ejemplo: { turnoId: "trn_01" },
  }),
  "turno.recordatorio.enviado@1": def({
    tipo: "turno.recordatorio.enviado", version: 1, familia: "club", emision: "pendiente · B1",
    cuando: "cron/reminders (reminder-sweep.ts)", clave: "turno:<turnoId>:recordatorio:<plantilla>",
    esquema: e.objeto({ turnoId: e.id(), canal: e.texto(), plantilla: e.texto() }),
    ejemplo: { turnoId: "trn_01", canal: "WHATSAPP", plantilla: "recordatorio_turno" },
  }),
  "clase.pedida@1": def({
    tipo: "clase.pedida", version: 1, familia: "club", emision: "pendiente · B1 (padel/core.ts)",
    cuando: "padel/core.ts (PadelClase)", clave: "clase:<claseId>:pedida", esquema: CLASE, ejemplo: ejClase,
  }),
  "clase.confirmada@1": def({
    tipo: "clase.confirmada", version: 1, familia: "club", emision: "pendiente · B1 (padel/core.ts)",
    cuando: "padel/core.ts (PadelClase)", clave: "clase:<claseId>:confirmada", esquema: CLASE, ejemplo: { ...ejClase, estado: "CONFIRMADA" },
  }),
  "clase.cancelada@1": def({
    tipo: "clase.cancelada", version: 1, familia: "club", emision: "pendiente · B1 (padel/core.ts)",
    cuando: "padel/core.ts (PadelClase)", clave: "clase:<claseId>:cancelada", esquema: CLASE, ejemplo: { ...ejClase, estado: "CANCELADA" },
  }),
  "clase.pagada@1": def({
    tipo: "clase.pagada", version: 1, familia: "club", emision: "pendiente · B1 (padel/core.ts)", plata: true,
    cuando: "cobro de la clase", clave: "clase:<claseId>:pagada",
    esquema: e.objeto({ claseId: e.id(), monto: e.monto(), medio: MEDIO }),
    ejemplo: { claseId: "cls_01", monto: 15000, medio: "TRANSFERENCIA" },
  }),
  "socio.alta@1": def({
    tipo: "socio.alta", version: 1, familia: "club", emision: "pendiente · módulo club",
    cuando: "alta de socio", clave: "socio:<socioId>:alta:<desde>", esquema: SOCIO,
    ejemplo: { socioId: "soc_01", categoria: "ACTIVO", desde: "2026-10-01" },
  }),
  "socio.baja@1": def({
    tipo: "socio.baja", version: 1, familia: "club", emision: "pendiente · módulo club",
    cuando: "baja de socio", clave: "socio:<socioId>:baja:<desde>", esquema: SOCIO,
    ejemplo: { socioId: "soc_01", categoria: "ACTIVO", desde: "2026-10-31" },
  }),
  "cuota.generada@1": def({
    tipo: "cuota.generada", version: 1, familia: "club", emision: "pendiente · módulo club",
    cuando: "generación mensual", clave: "cuota:<cuotaId>:generada",
    esquema: e.objeto({ cuotaId: e.id(), socioId: e.id(), periodo: e.texto(), monto: e.monto(), vence: e.fecha() }),
    ejemplo: { cuotaId: "cuo_01", socioId: "soc_01", periodo: "2026-11", monto: 18000, vence: "2026-11-10" },
  }),
  "cuota.cobrada@1": def({
    tipo: "cuota.cobrada", version: 1, familia: "club", emision: "pendiente · módulo club", plata: true,
    cuando: "cobro de la cuota", clave: "cuota:<cuotaId>:cobrada",
    esquema: e.objeto({ cuotaId: e.id(), monto: e.monto(), medio: MEDIO, pagoExterno: e.opcional(e.id()) }),
    ejemplo: { cuotaId: "cuo_01", monto: 18000, medio: "MP", pagoExterno: "1325478891" },
  }),
  "cuota.vencida@1": def({
    tipo: "cuota.vencida", version: 1, familia: "club", emision: "pendiente · módulo club (barrido)",
    cuando: "barrido diario", clave: "cuota:<cuotaId>:vencida:<AAAA-MM-DD>",
    esquema: e.objeto({ cuotaId: e.id(), socioId: e.id(), diasVencida: e.entero(), monto: e.monto() }),
    ejemplo: { cuotaId: "cuo_01", socioId: "soc_01", diasVencida: 5, monto: 18000 },
  }),
  "credito.cargado@1": def({
    tipo: "credito.cargado", version: 1, familia: "club", emision: "pendiente · módulo club (credito-core.ts)", plata: true,
    cuando: "buffet / cuenta corriente (club/credito-core.ts)", clave: "credito:<movimientoId>", esquema: CREDITO,
    ejemplo: { socioId: "soc_01", monto: 10000, saldo: 25000, origen: "carga en mostrador" },
  }),
  "credito.consumido@1": def({
    tipo: "credito.consumido", version: 1, familia: "club", emision: "pendiente · módulo club (credito-core.ts)", plata: true,
    cuando: "buffet / cuenta corriente (club/credito-core.ts)", clave: "credito:<movimientoId>", esquema: CREDITO,
    ejemplo: { socioId: "soc_01", monto: 3500, saldo: 21500, origen: "buffet" },
  }),
  "buffet.pedido.creado@1": def({
    tipo: "buffet.pedido.creado", version: 1, familia: "club", emision: "pendiente · módulo club (buffet-core.ts)",
    cuando: "club/buffet-core.ts", clave: "buffet:<pedidoId>:creado",
    esquema: e.objeto({ pedidoId: e.id(), socioId: e.opcional(e.id()), items: e.lista(ITEM_PEDIDO), total: e.monto() }),
    ejemplo: { pedidoId: "buf_01", socioId: "soc_01", items: [{ productoId: "prd_09", sku: null, nombre: "Gatorade", cantidad: 2, precioUnitario: 1750 }], total: 3500 },
  }),
  "mensaje.recibido@1": def({
    tipo: "mensaje.recibido", version: 1, familia: "club", emision: "pendiente · P6 (webhook WhatsApp)",
    cuando: "webhook WhatsApp (ya canónico en E3)", clave: "mensaje:<idMensaje>:recibido",
    esquema: e.objeto({ conexionId: e.id(), remitenteEnmascarado: e.enmascarado(), clase: e.texto(), idMensaje: e.id() }),
    ejemplo: { conexionId: "con_01", remitenteEnmascarado: "******7788", clase: "texto", idMensaje: "wamid.HBg…" },
  }),
  "mensaje.estado@1": def({
    tipo: "mensaje.estado", version: 1, familia: "club", emision: "pendiente · P6 (statuses de Meta)",
    cuando: "statuses de Meta", clave: "mensaje:<idMensaje>:<estado>",
    esquema: e.objeto({ idMensaje: e.id(), estado: e.texto() }),
    ejemplo: { idMensaje: "wamid.HBg…", estado: "read" },
  }),

  // ── Agregados por el plan N2 (§4.1.2) ──
  "turno.sena.pagada@1": def({
    tipo: "turno.sena.pagada", version: 1, familia: "n2", emision: "pendiente · B1", plata: true,
    cuando: "B1 al aplicar senaPagada", clave: "turno:<turnoId>:sena:<ref>",
    esquema: e.objeto({ turnoId: e.id(), ref: e.texto(), monto: e.monto(), medio: MEDIO, pagoExterno: e.opcional(e.id()) }),
    ejemplo: { turnoId: "trn_01", ref: "sena-trn_01", monto: 6000, medio: "MP", pagoExterno: "1325478892" },
  }),
  "turno.garantia.ejecutada@1": def({
    tipo: "turno.garantia.ejecutada", version: 1, familia: "n2", emision: "pendiente · B7", plata: true,
    cuando: "B7", clave: "turno:<turnoId>:garantia",
    esquema: e.objeto({ fijoId: e.id(), turnoId: e.id(), monto: e.monto(), motivo: e.textoLibre() }),
    ejemplo: { fijoId: "fij_01", turnoId: "trn_01", monto: 12000, motivo: "Ausente sin aviso" },
  }),
  "espera.ofrecida@1": def({
    tipo: "espera.ofrecida", version: 1, familia: "n2", emision: "pendiente · B8",
    cuando: "B8", clave: "espera:<esperaId>:ofrecida:<turnoId>", esquema: ESPERA, ejemplo: ejEspera,
  }),
  "espera.asignada@1": def({
    tipo: "espera.asignada", version: 1, familia: "n2", emision: "pendiente · B8",
    cuando: "B8", clave: "espera:<esperaId>:asignada", esquema: ESPERA, ejemplo: ejEspera,
  }),
  "caja.turno.cerrada@1": def({
    tipo: "caja.turno.cerrada", version: 1, familia: "n2", emision: "pendiente · B4 (club) y M1 (retail)", plata: true,
    cuando: "B4 (club) y M1 (retail, cierre de turno)", clave: "caja:turno:<cierreId>:cerrada",
    esquema: e.objeto({
      cierreId: e.id(), turno: e.texto(), quien: e.id(), esperado: e.monto(), contado: e.monto(), diferencia: e.monto(), motivo: e.opcional(e.textoLibre()),
    }),
    ejemplo: { cierreId: "cie_01", turno: "mañana", quien: "usr_03", esperado: 120000, contado: 119500, diferencia: -500, motivo: "Faltó cambio" },
  }),
  "reparto.salio@1": def({
    tipo: "reparto.salio", version: 1, familia: "n2", emision: "pendiente · M6", plata: true,
    cuando: "M6", clave: "reparto:<repartoId>:salio", esquema: REPARTO, ejemplo: ejReparto,
  }),
  "reparto.rendido@1": def({
    tipo: "reparto.rendido", version: 1, familia: "n2", emision: "pendiente · M6", plata: true,
    cuando: "M6", clave: "reparto:<repartoId>:rendido", esquema: REPARTO, ejemplo: ejReparto,
  }),
  "pedido.transferencia.verificada@1": def({
    tipo: "pedido.transferencia.verificada", version: 1, familia: "n2", emision: "pendiente · M2", plata: true,
    cuando: "M2", clave: "pedido:<pedidoId>:transferencia-verificada",
    esquema: e.objeto({ pedidoId: e.id(), verificadoPor: e.id(), verificadoEn: e.fecha() }),
    ejemplo: { pedidoId: "ord_01", verificadoPor: "usr_03", verificadoEn: "2026-10-28T14:05:00-03:00" },
  }),
  "lote.por.vencer@1": def({
    tipo: "lote.por.vencer", version: 1, familia: "n2", emision: "pendiente · M3a (barrido diario)",
    cuando: "M3a (barrido diario)", clave: "lote:<loteId>:por-vencer", esquema: LOTE, ejemplo: ejLote,
  }),
  "lote.vencido@1": def({
    tipo: "lote.vencido", version: 1, familia: "n2", emision: "pendiente · M3a (barrido diario)",
    cuando: "M3a (barrido diario)", clave: "lote:<loteId>:vencido", esquema: LOTE, ejemplo: ejLote,
  }),
  "club.luz.cambio@1": def({
    tipo: "club.luz.cambio", version: 1, familia: "n2", emision: "pendiente · B1 (comando luz)",
    cuando: "B1 (comando luz)", clave: "luz:<canchaId>:<cambioId>",
    esquema: e.objeto({ canchaId: e.id(), encendida: e.bool(), turnoId: e.opcional(e.id()) }),
    ejemplo: { canchaId: "cancha_2", encendida: true, turnoId: "trn_01" },
  }),
  "producto.balanza.sincronizada@1": def({
    tipo: "producto.balanza.sincronizada", version: 1, familia: "n2", emision: "pendiente · M5",
    cuando: "M5", clave: "balanza:<balanzaId>:sync:<confirmadaEn>",
    esquema: e.objeto({ balanzaId: e.id(), productos: e.entero(), confirmadaEn: e.fecha() }),
    ejemplo: { balanzaId: "bal_01", productos: 184, confirmadaEn: "2026-10-28T07:00:00-03:00" },
  }),
} as const;

// ── Tipos derivados ───────────────────────────────────────────────────────────

type Catalogo = typeof CATALOGO;
/** "tipo@N" de todo el catálogo. */
export type ClaveCatalogo = keyof Catalogo;
type TipoDeClave<K> = K extends `${infer T}@${number}` ? T : never;
/** Los tipos de evento (`pedido.creado`, …). */
export type TipoEvento = TipoDeClave<ClaveCatalogo>;
/** Las versiones publicadas de un tipo. */
export type VersionDe<T extends TipoEvento> = {
  [K in ClaveCatalogo]: K extends `${T}@${infer N extends number}` ? N : never;
}[ClaveCatalogo];
/** El `datos` de `tipo@version`, tal como lo pide el catálogo. */
export type DatosDe<T extends TipoEvento, V extends number> = `${T}@${V}` extends ClaveCatalogo
  ? TipoDe<Catalogo[`${T}@${V}`]["esquema"]>
  : never;

/** La definición de `tipo@version`, o null si no está en el catálogo. */
export function definicionDe(tipo: string, version: number): DefinicionEvento<unknown> | null {
  const def = (CATALOGO as Record<string, DefinicionEvento<unknown>>)[`${tipo}@${version}`];
  return def ?? null;
}

/** Todas las definiciones, en el orden del catálogo. */
export function definiciones(): DefinicionEvento<unknown>[] {
  return Object.values(CATALOGO) as DefinicionEvento<unknown>[];
}
