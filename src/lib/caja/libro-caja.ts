// Aritmética PURA del LIBRO DE CAJA mensual multi-medio.
//
// Reemplaza la planilla de Google Sheets con la que CH Estética lleva la caja hoy:
// una fila por movimiento (fecha · detalle · ingreso/egreso por medio) con SALDO
// corrido, más un bloque RESUMEN arriba que abre por medio de pago.
//
// Vive fuera de las server actions a propósito, igual que cash-register.ts: acá está
// SOLO el cálculo —sin Prisma, sin sesión, sin tenant—, así el libro es unit-testeable
// de punta a punta (ver libro-caja.test.ts). La persistencia vive en
// src/lib/libro-caja-actions.ts y NUNCA duplica esta aritmética.
//
// Relación con el arqueo de turno (cash-register.ts): son dos lecturas del MISMO
// ledger, no dos verdades. El arqueo mira UN turno y SOLO el efectivo (es contar el
// cajón). El libro mira UN MES completo y los TRES medios (es la caja del negocio).
// El signo de cada movimiento lo decide una sola función, `movementSign`, importada
// de cash-register.ts — no se reimplementa acá.

import { round2 } from "@/lib/round";
import { movementSign, type CashMethod, type CashMovementType } from "@/lib/caja/cash-register";
// Las MARCAS que cada camino del sistema deja en `CashMovement.createdBy`. Se importan de
// donde nacen (no se copian los strings): si una cambia, el origen contable la sigue. Todos
// estos módulos son puros (sin Prisma de valor): este archivo lo importa un client component.
import { COMPRA_ACTOR_PREFIX, REINTEGRO_ACTOR_PREFIX, esEgresoDeCompra, esIngresoDeReintegro } from "@/lib/stock/purchase-egreso";
import { COMISION_ACTOR_PREFIX, esEgresoDeComision } from "@/lib/comision-liquidacion";
import { ANULACION_TURNO_ACTOR_PREFIX, esEgresoDeAnulacion } from "@/lib/turnos/anulacion";
import { ANULACION_VENTA_ACTOR_PREFIX } from "@/lib/order-anulacion";
import { APERTURA_TURNO_ACTOR_PREFIX, ARQUEO_TURNO_ACTOR_PREFIX, CIERRE_DIARIO_ACTOR_PREFIX } from "@/lib/caja/cierre-marca";
import { CORTE_INICIAL_ACTOR_PREFIX } from "@/lib/caja/corte-inicial";
import { IMPORT_ACTOR_PREFIX } from "@/lib/caja/import-caja";
// Ciclo de imports: asiento-libro → cierre-diario → este archivo. Por eso la marca de cuenta
// corriente se LEE dentro de las funciones (`marcasDelSistema`, `motivoParaNoBorrar`), nunca
// al cargar el módulo.
import { CUENTA_CORRIENTE_ACTOR_PREFIX, esAsientoDeCuentaCorriente } from "@/lib/settlement/asiento-libro";

// Orden CANÓNICO de los medios: es el orden de las columnas de la planilla y el de
// las columnas de la pantalla. Un solo lugar para que tabla y resumen no se
// desincronicen.
export const CASH_METHODS = ["EFECTIVO", "MP", "TARJETA"] as const;

export const CASH_METHOD_LABEL: Record<CashMethod, string> = {
  EFECTIVO: "Efectivo",
  MP: "MP / Transf.",
  TARJETA: "Tarjeta",
};

// Plata desglosada por medio + total. El total NO se guarda aparte: siempre se deriva
// de los tres medios (`totalOf`), así no puede quedar desfasado del desglose.
export type MethodAmounts = Record<CashMethod, number>;

// De dónde salió una fila del libro. Es la distinción que hace posible la transición
// desde la planilla sin doble conteo: lo que escribió el SISTEMA (una venta del
// mostrador, un turno cobrado) se ve distinto, no se borra desde el libro y sirve para
// avisar cuando alguien intenta tipearlo a mano otra vez.
export type LibroOrigin = "manual" | "pos" | "turno";

export type LibroMovement = {
  id: string;
  occurredAt: Date;
  type: CashMovementType;
  method: CashMethod;
  amount: number; // siempre > 0; el signo lo aplica `movementSign`
  detail: string;
  origin?: LibroOrigin; // ausente = "manual" (compatibilidad con las filas demo y los fixtures)
  // Clase CONTABLE de la fila y su referencia (ver `clasificarOrigen`). Las completa el
  // loader del libro, que es el único que lee `createdBy`; ausentes en demo y fixtures, y
  // el CSV las deriva de `type` y `origin` (`origenDeFila`).
  origenContable?: OrigenContable;
  referencia?: string;
};

// Origen de un movimiento a partir de lo que el ledger ya guarda. `VENTA` es el tipo que el
// libro RESERVA para lo que escribe el sistema (no se puede tipear a mano, ver LIBRO_TYPES en
// libro-caja-actions.ts): con `orderId` es una venta del mostrador (cash-sale.ts); sin
// `orderId` es un cobro de turno (cobro-turno.ts, rastro por `paymentId`). Derivarlo así
// evita leer `paymentId` en la pantalla, que tiene su migración escrita y sin aplicar.
export function libroOrigin(m: { type: CashMovementType; orderId?: string | null }): LibroOrigin {
  if (m.type !== "VENTA") return "manual";
  return m.orderId ? "pos" : "turno";
}

export const LIBRO_ORIGIN_LABEL: Record<Exclude<LibroOrigin, "manual">, string> = {
  pos: "Venta del mostrador",
  turno: "Turno cobrado",
};

// --- Origen CONTABLE: de dónde salió cada peso, para quien imputa ---
//
// `libroOrigin` separa sistema de manual para la pantalla. La contadora necesita más:
// distinguir un egreso que asentó el sistema (una compra a proveedor, una comisión
// liquidada, la reversa de una anulación, la diferencia de un cierre) de uno TIPEADO a
// mano, que es justo el que tiene que respaldar con comprobante. El dato ya existe: son
// las marcas que cada camino deja en `CashMovement.createdBy`.
//
// Se mira `createdBy` ANTES que `type`: la anulación de una venta es un EGRESO que además
// trae `orderId`, y por tipo solo pasaría por un egreso manual o por una venta.

export type OrigenContable =
  | "venta-mostrador"
  | "cobro-turno"
  | "ingreso-manual"
  | "egreso-manual"
  | "retiro"
  | "compra"
  | "comision"
  | "anulacion"
  | "diferencia-caja"
  | "corte-importacion"
  | "apertura"
  | "cobro-cuenta-corriente"
  | "pago-cuenta-corriente"
  | "reintegro-proveedor";

/** Orden canónico: el de la columna y el del subtotal del RESUMEN. */
export const ORIGENES_CONTABLES: readonly OrigenContable[] = [
  "venta-mostrador",
  "cobro-turno",
  "ingreso-manual",
  "egreso-manual",
  "retiro",
  "compra",
  "comision",
  "anulacion",
  "diferencia-caja",
  "corte-importacion",
  "apertura",
  "cobro-cuenta-corriente",
  "pago-cuenta-corriente",
  "reintegro-proveedor",
];

export const ORIGEN_CONTABLE_LABEL: Record<OrigenContable, string> = {
  "venta-mostrador": "Venta mostrador",
  "cobro-turno": "Cobro turno",
  "ingreso-manual": "Ingreso manual",
  "egreso-manual": "Egreso manual",
  retiro: "Retiro de caja",
  compra: "Compra a proveedor",
  comision: "Comisión",
  anulacion: "Anulación",
  "diferencia-caja": "Diferencia de caja",
  "corte-importacion": "Corte/Importación",
  apertura: "Apertura de turno",
  "cobro-cuenta-corriente": "Cobro de cuenta corriente",
  "pago-cuenta-corriente": "Pago a proveedor",
  // La plata que devuelve un proveedor por mercadería devuelta (supplier-return.ts). Antes
  // salía como "Ingreso manual" y la contadora la buscaba como un cobro sin respaldo: no es
  // una venta ni un aporte, es una compra que se achica.
  "reintegro-proveedor": "Reintegro de proveedor",
};

/** Lo que el ledger guarda de una fila y alcanza para clasificarla. */
export type FilaParaOrigen = {
  type: CashMovementType;
  createdBy?: string | null;
  orderId?: string | null;
  collectionId?: string | null;
  /** El `Payment` 1:1 del cobro de turno previo a los cobros parciales (cobro-turno.ts). */
  paymentId?: string | null;
  /** Pista para filas sin `orderId` a mano (demo, fixtures): "pos" = venta de mostrador. */
  origin?: LibroOrigin;
};

/**
 * Marcas del SISTEMA en `createdBy`, con la clase que le toca a cada una y, cuando el id
 * de lo que la originó VIVE en la marca (compra, comisión, cierre, arqueo, corte, import),
 * la referencia. En las anulaciones la marca termina en el ACTOR ("user:<id>"): ahí la
 * referencia sale de columnas (`orderId`; `collectionId` o `paymentId`), nunca de la marca.
 *
 * Es una FUNCIÓN y no una constante del módulo a propósito: corte-inicial, cierre-diario
 * (vía purchase-egreso y las anulaciones) importan este archivo, así que hay ciclos. Una
 * constante armada al cargar el módulo leería esas marcas antes de que existan, según qué
 * módulo se cargue primero; leídas al clasificar, ya están todas.
 */
function marcasDelSistema(): readonly {
  prefijo: string;
  origen: OrigenContable;
  /** La clase si la fila es un EGRESO, cuando la misma marca asienta los dos sentidos. */
  origenSiEgreso?: OrigenContable;
  referenciaEnMarca: boolean;
}[] {
  return [
    { prefijo: COMPRA_ACTOR_PREFIX, origen: "compra", referenciaEnMarca: true }, // purchaseId
    // El INGRESO del reintegro de una devolución a proveedor: `devolucion-proveedor:<purchaseId>`
    // (supplier-return.ts). La referencia es la compra devuelta.
    { prefijo: REINTEGRO_ACTOR_PREFIX, origen: "reintegro-proveedor", referenciaEnMarca: true }, // purchaseId
    // Cobro de una cuenta a cobrar (INGRESO) o pago de una cuenta a pagar (EGRESO), con la
    // marca `cuenta-corriente:<collectionId>` (settlement/asiento-libro.ts).
    {
      prefijo: CUENTA_CORRIENTE_ACTOR_PREFIX,
      origen: "cobro-cuenta-corriente",
      origenSiEgreso: "pago-cuenta-corriente",
      referenciaEnMarca: true,
    }, // collectionId
    { prefijo: COMISION_ACTOR_PREFIX, origen: "comision", referenciaEnMarca: true }, // payoutId
    { prefijo: ANULACION_VENTA_ACTOR_PREFIX, origen: "anulacion", referenciaEnMarca: false },
    { prefijo: ANULACION_TURNO_ACTOR_PREFIX, origen: "anulacion", referenciaEnMarca: false },
    { prefijo: CIERRE_DIARIO_ACTOR_PREFIX, origen: "diferencia-caja", referenciaEnMarca: true }, // día
    { prefijo: ARQUEO_TURNO_ACTOR_PREFIX, origen: "diferencia-caja", referenciaEnMarca: true }, // sessionId
    // La diferencia entre el fondo contado al abrir un turno y el libro (ADR-101).
    { prefijo: APERTURA_TURNO_ACTOR_PREFIX, origen: "diferencia-caja", referenciaEnMarca: true }, // sessionId
    { prefijo: CORTE_INICIAL_ACTOR_PREFIX, origen: "corte-importacion", referenciaEnMarca: true }, // día
    { prefijo: IMPORT_ACTOR_PREFIX, origen: "corte-importacion", referenciaEnMarca: true }, // hash del CSV
  ];
}

/**
 * Clase contable y referencia de una fila del libro. PURA.
 *
 * La referencia NUNCA es un actor: si lo que queda después de la marca es "user:<id>" o
 * contiene un "user:", se descarta. Ese CSV sale hacia el estudio contable, y los ids de
 * los usuarios del negocio no tienen por qué cruzar.
 */
export function clasificarOrigen(m: FilaParaOrigen): { origen: OrigenContable; referencia: string } {
  const marca = String(m.createdBy ?? "");
  const hallada = marcasDelSistema().find((x) => marca.startsWith(x.prefijo));
  if (hallada) {
    const origen = hallada.origenSiEgreso && m.type === "EGRESO" ? hallada.origenSiEgreso : hallada.origen;
    const referencia = hallada.referenciaEnMarca
      ? marca.slice(hallada.prefijo.length)
      : hallada.prefijo === ANULACION_VENTA_ACTOR_PREFIX
        ? (m.orderId ?? "")
        : delCobroDeTurno(m);
    return { origen, referencia: sinActor(referencia) };
  }
  switch (m.type) {
    case "VENTA":
      return m.orderId || m.origin === "pos"
        ? { origen: "venta-mostrador", referencia: m.orderId ?? "" }
        : { origen: "cobro-turno", referencia: delCobroDeTurno(m) };
    case "INGRESO":
      return { origen: "ingreso-manual", referencia: "" };
    case "EGRESO":
      return { origen: "egreso-manual", referencia: "" };
    case "RETIRO":
      return { origen: "retiro", referencia: "" };
    case "APERTURA":
      return { origen: "apertura", referencia: "" };
    default:
      return { origen: "ingreso-manual", referencia: "" };
  }
}

/** Sólo la clase (atajo de `clasificarOrigen`). PURA. */
export function origenContable(m: FilaParaOrigen): OrigenContable {
  return clasificarOrigen(m).origen;
}

// --- Qué NO se borra desde el libro ---
//
// Lo que escribió el SISTEMA no se borra desde el libro (dirección única: la venta, el cobro,
// la compra, la liquidación y el cierre escriben en el libro; el libro nunca los toca a
// ellos). Borrar una de esas filas dejaría un pedido, un turno, una compra o una cuenta
// corriente con su plata fuera del libro y un arqueo descuadrado. La corrección es siempre
// un movimiento en contra con la fecha de hoy.

/**
 * Por qué esta fila NO se puede borrar desde el libro, o `null` si es un movimiento tipeado a
 * mano y se puede. PURA: la usa `deleteLibroEntry` (libro-caja-actions.ts) antes de borrar; el
 * candado de día cerrado va aparte, porque depende de la frontera del cierre.
 */
export function motivoParaNoBorrar(m: { type: CashMovementType; orderId?: string | null; createdBy?: string | null }): string | null {
  const origen = libroOrigin({ type: m.type, orderId: m.orderId });
  if (origen === "turno") {
    return `Ese movimiento es un ${LIBRO_ORIGIN_LABEL.turno.toLowerCase()}: lo registró el sistema al confirmar el pago. Si está mal, corregilo desde Turnos, no desde el libro.`;
  }
  if (origen === "pos" || m.orderId) {
    return "Ese movimiento viene de un pedido cobrado. Corregí el pedido, no el libro.";
  }
  if (m.type !== "INGRESO" && m.type !== "EGRESO") {
    return "Ese movimiento lo generó la caja del mostrador. Corregilo desde el turno, no desde el libro.";
  }
  const marca = String(m.createdBy ?? "");
  // El corte inicial es lo que ata el saldo del sistema al conteo físico.
  if (marca.startsWith(CORTE_INICIAL_ACTOR_PREFIX)) {
    return "Ese movimiento es el ajuste del corte inicial. No se borra: es lo que ata el saldo del sistema al conteo físico.";
  }
  if (marca.startsWith(CIERRE_DIARIO_ACTOR_PREFIX)) {
    return "Ese movimiento es la diferencia que dejó un cierre de caja. No se borra: si estuvo mal, va una corrección con la fecha de hoy.";
  }
  // La diferencia del arqueo de TURNO se asienta como INGRESO/EGRESO (es lo que el libro sabe
  // sumar): sin este candado quedaría borrable y el saldo se desataría del conteo del cajón.
  if (marca.startsWith(ARQUEO_TURNO_ACTOR_PREFIX)) {
    return "Ese movimiento es la diferencia que dejó el arqueo de un turno. No se borra: si estuvo mal, va una corrección con la fecha de hoy.";
  }
  // La diferencia al ABRIR un turno (ADR-101): borrarla desataría el libro del fondo contado y el
  // cierre del día volvería a esperar plata que no estaba.
  if (marca.startsWith(APERTURA_TURNO_ACTOR_PREFIX)) {
    return "Ese movimiento es la diferencia que se encontró al abrir un turno, entre lo contado en el cajón y el libro. No se borra: si estuvo mal, va una corrección con la fecha de hoy.";
  }
  // La reversa de un cobro anulado: borrarla le devolvería al libro plata que el sistema ya
  // decidió que NO entró.
  if (esEgresoDeAnulacion(m)) {
    return "Ese egreso lo asentó la anulación de un cobro. No se borra desde el libro: si la anulación estuvo mal, cargá una corrección con la fecha de hoy.";
  }
  if (esEgresoDeComision(m)) {
    return "Ese egreso lo asentó una liquidación de comisión. No se borra desde el libro: si el importe está mal, cargá una corrección con la fecha de hoy.";
  }
  if (esEgresoDeCompra(m)) {
    return "Ese egreso lo asentó el registro de una compra a proveedor. No se borra desde el libro: si el importe o el medio están mal, cargá una corrección con la fecha de hoy.";
  }
  // El reintegro de una devolución a proveedor: borrarlo dejaría la devolución hecha (el stock
  // ya salió) y la plata que devolvió el proveedor fuera de la caja.
  if (esIngresoDeReintegro(m)) {
    return "Ese ingreso lo asentó el reintegro de una devolución a proveedor. No se borra desde el libro: si el importe o el medio están mal, cargá una corrección con la fecha de hoy.";
  }
  // El cobro de un fiado o el pago a un proveedor por cuenta corriente: borrarlo dejaría la
  // cuenta saldada y la plata fuera del libro.
  if (esAsientoDeCuentaCorriente(m)) {
    return "Ese movimiento lo asentó un cobro o pago de cuenta corriente. No se borra desde el libro: si estuvo mal, cargá una corrección con la fecha de hoy.";
  }
  return null;
}

function sinActor(ref: string): string {
  return ref.includes("user:") ? "" : ref;
}

// El cobro de turno se identifica por el cobro parcial (`collectionId`, el vigente) o, en
// los asientos anteriores a los cobros parciales, por el `Payment` 1:1 (`paymentId`).
// cobro-turno.ts escribe uno u otro, nunca los dos.
function delCobroDeTurno(m: Pick<FilaParaOrigen, "collectionId" | "paymentId">): string {
  return m.collectionId || m.paymentId || "";
}

/** Una fila de `CashMovement` como la trae el loader del libro. */
export type FilaLedger = {
  id: string;
  occurredAt: Date;
  type: CashMovementType;
  method: CashMethod;
  amount: number;
  reason: string | null;
  orderId: string | null;
  createdBy: string;
  collectionId?: string | null;
  paymentId?: string | null;
};

// --- Columnas de REFERENCIA que pueden faltar en la base ---
//
// `paymentId` y `collectionId` las agregan dos migraciones distintas
// (`20260907120000_add_cash_movement_payment_id` y `20260907180000_add_appointment_partial_collections`)
// y el runbook (docs/runbooks/migracion-caja-neon.md) nombra estados intermedios en que una
// está aplicada y la otra no. Nombrar en el select una columna que no existe falla con P2022
// y por una columna de REFERENCIA el libro entero no puede caerse: se vuelve a leer sin
// ella, y esas filas salen sin referencia.

/** Las columnas de referencia que el libro lee si existen. */
export const COLUMNAS_REFERENCIA = ["collectionId", "paymentId"] as const;
export type ColumnaReferencia = (typeof COLUMNAS_REFERENCIA)[number];

/**
 * Lee con todas las columnas de referencia y, si la base avisa que falta una, reintenta sin
 * ESA (una por vuelta: Postgres nombra la primera que no encuentra). Cualquier otro error
 * sube tal cual. PURA salvo por los puertos: `leer` es la consulta y `faltaColumna` el
 * clasificador de errores (en producción, `isColumnMissing` de prisma-errors.ts), que entran
 * por parámetro para que este módulo no importe valores de Prisma — lo usan pantallas.
 */
export async function leerSinColumnasFaltantes<T>(
  leer: (columnas: readonly ColumnaReferencia[]) => Promise<T>,
  faltaColumna: (err: unknown, columna: ColumnaReferencia) => boolean,
): Promise<{ filas: T; faltantes: ColumnaReferencia[] }> {
  let columnas: ColumnaReferencia[] = [...COLUMNAS_REFERENCIA];
  const faltantes: ColumnaReferencia[] = [];
  for (;;) {
    try {
      return { filas: await leer(columnas), faltantes };
    } catch (err) {
      const falta = columnas.find((c) => faltaColumna(err, c));
      if (!falta) throw err;
      faltantes.push(falta);
      columnas = columnas.filter((c) => c !== falta);
    }
  }
}

/**
 * Fila del ledger → fila del libro, ya clasificada. PURA.
 *
 * `createdBy` entra SÓLO para clasificar y NO sale: la fila del libro no lo lleva. El
 * loader que la usa es un endpoint ("use server") y sus filas terminan en el CSV que va al
 * estudio contable; el actor "user:<id>" no tiene por qué viajar.
 */
export function movimientoDelLedger(r: FilaLedger): LibroMovement {
  const { origen, referencia } = clasificarOrigen(r);
  return {
    id: r.id,
    occurredAt: r.occurredAt,
    type: r.type,
    method: r.method,
    amount: r.amount,
    detail: r.reason ?? "",
    origin: libroOrigin(r),
    origenContable: origen,
    referencia,
  };
}

/** Clase de una fila ya armada: la que trae el loader o, si no la trae, por tipo y origen. */
export function origenDeFila(m: LibroMovement): OrigenContable {
  return m.origenContable ?? origenContable({ type: m.type, origin: m.origin });
}

/**
 * EGRESOS del período abiertos por origen y por medio (lo que la contadora imputa). Sólo
 * los orígenes con algún egreso, en el orden canónico. PURA.
 */
export function egresosPorOrigen(
  movements: readonly LibroMovement[],
): { origen: OrigenContable; egresos: MethodAmounts }[] {
  const acc = new Map<OrigenContable, MethodAmounts>();
  for (const m of movements) {
    if (!usable(m.amount) || movementSign(m.type) >= 0) continue;
    const o = origenDeFila(m);
    const a = acc.get(o) ?? zeroAmounts();
    a[m.method] += m.amount;
    acc.set(o, a);
  }
  return ORIGENES_CONTABLES.filter((o) => acc.has(o)).map((o) => {
    const a = acc.get(o)!;
    for (const k of CASH_METHODS) a[k] = round2(a[k]);
    return { origen: o, egresos: a };
  });
}

// Una fila del libro tal como se pinta: el movimiento + el saldo TOTAL acumulado
// hasta esa fila inclusive. `signedAmount` es el monto ya con signo (+ entra, − sale),
// para no recalcular el signo en la UI.
export type LibroRow = LibroMovement & {
  signedAmount: number;
  runningTotal: number;
};

// El bloque RESUMEN de la planilla, con la misma semántica columna por columna.
export type LibroSummary = {
  opening: MethodAmounts; // Saldo inicial (arrastre de lo anterior al período)
  ingresos: MethodAmounts; // Ingresos (+) del período
  egresos: MethodAmounts; // Egresos (−) del período
  saldo: MethodAmounts; // SALDO ACTUAL = opening + ingresos − egresos
};

export type Libro = {
  rows: LibroRow[];
  summary: LibroSummary;
};

export function zeroAmounts(): MethodAmounts {
  return { EFECTIVO: 0, MP: 0, TARJETA: 0 };
}

// Total de un desglose. Única forma de obtener el total en todo el módulo.
export function totalOf(a: MethodAmounts): number {
  return round2(a.EFECTIVO + a.MP + a.TARJETA);
}

// Solo montos positivos y finitos cuentan (mismo blindaje que el arqueo: un dato
// basura nunca corrompe el saldo). La validación de entrada vive en la acción.
function usable(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

// Monto con signo según el TIPO: +entra, −sale, 0 la apertura. Delegado a
// `movementSign` para que exista UNA sola tabla de signos en el sistema.
export function signedAmount(m: { type: CashMovementType; amount: number }): number {
  if (!usable(m.amount)) return 0;
  return round2(movementSign(m.type) * m.amount);
}

// Suma los movimientos separando lo que ENTRA de lo que SALE, cada uno abierto por
// medio. La APERTURA no cae en ninguno de los dos (signo 0): en el libro el fondo
// inicial es el `opening`, no un ingreso del período — si contara como ingreso, el
// arrastre entre meses se sumaría dos veces.
export function splitByMethod(movements: readonly LibroMovement[]): {
  ingresos: MethodAmounts;
  egresos: MethodAmounts;
} {
  const ingresos = zeroAmounts();
  const egresos = zeroAmounts();
  for (const m of movements) {
    if (!usable(m.amount)) continue;
    const sign = movementSign(m.type);
    if (sign > 0) ingresos[m.method] += m.amount;
    else if (sign < 0) egresos[m.method] += m.amount;
  }
  for (const k of CASH_METHODS) {
    ingresos[k] = round2(ingresos[k]);
    egresos[k] = round2(egresos[k]);
  }
  return { ingresos, egresos };
}

// Saldo de arrastre: aplica TODOS los movimientos anteriores al período sobre un
// saldo cero, por medio. Es lo que la planilla llama "Saldo inicial" y que hoy se
// copia a mano de un mes al siguiente — acá se deriva, así no puede quedar mal
// tipeado ni desfasarse cuando se corrige una fila de un mes anterior.
export function openingFromHistory(previous: readonly LibroMovement[]): MethodAmounts {
  const acc = zeroAmounts();
  for (const m of previous) {
    if (!usable(m.amount)) continue;
    acc[m.method] += movementSign(m.type) * m.amount;
  }
  for (const k of CASH_METHODS) acc[k] = round2(acc[k]);
  return acc;
}

// Arma el libro del período: filas con saldo corrido + bloque resumen.
//
// El SALDO de cada fila es el TOTAL acumulado (los tres medios juntos), igual que la
// columna SALDO de la planilla, y arranca en el total del saldo inicial. Los
// movimientos se ordenan por fecha contable (`occurredAt`) y, a igualdad, por `id`,
// para que el saldo corrido sea ESTABLE: dos cargas del mismo día siempre rinden el
// mismo orden y el mismo acumulado, sin importar en qué orden las devolvió la base.
export function buildLibro(
  opening: MethodAmounts,
  movements: readonly LibroMovement[],
): Libro {
  const ordered = [...movements].sort((a, b) => {
    const d = a.occurredAt.getTime() - b.occurredAt.getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  let running = totalOf(opening);
  const rows: LibroRow[] = ordered.map((m) => {
    const signed = signedAmount(m);
    running = round2(running + signed);
    return { ...m, signedAmount: signed, runningTotal: running };
  });

  const { ingresos, egresos } = splitByMethod(ordered);
  const saldo = zeroAmounts();
  for (const k of CASH_METHODS) {
    saldo[k] = round2(opening[k] + ingresos[k] - egresos[k]);
  }

  return { rows, summary: { opening, ingresos, egresos, saldo } };
}

// --- Transición desde la planilla: gemelas del sistema ---
//
// Mientras el negocio se acostumbra a que los turnos y las ventas entran solos al libro,
// va a seguir tipeando algunos cobros a mano: el mismo cobro queda DOS veces (una del
// sistema, una manual) y el saldo se infla. La guarda de `addLibroEntry` frena al tipear;
// esta función cubre el otro orden (se tipeó primero y el sistema asentó después) y los
// "guardar igual": marca las filas MANUALES que entran plata y tienen una gemela del
// sistema el mismo día del negocio, por el mismo medio y el mismo monto. Es una señal
// para revisar y borrar la manual — nunca borra ni resta nada sola.
//
// `dayOf` traduce el instante al día calendario del negocio (la fila manual se ancla al
// mediodía; la del sistema lleva la hora real del cobro): se compara por DÍA, no por hora.
export function flagPossibleDuplicates(
  rows: readonly LibroMovement[],
  dayOf: (d: Date) => string,
): Set<string> {
  const key = (m: LibroMovement) => `${dayOf(m.occurredAt)}|${m.method}|${round2(m.amount)}`;
  const delSistema = new Set<string>();
  for (const m of rows) {
    if ((m.origin ?? "manual") !== "manual" && movementSign(m.type) > 0) delSistema.add(key(m));
  }
  const marcadas = new Set<string>();
  if (delSistema.size === 0) return marcadas;
  for (const m of rows) {
    if ((m.origin ?? "manual") !== "manual" || movementSign(m.type) <= 0) continue;
    if (delSistema.has(key(m))) marcadas.add(m.id);
  }
  return marcadas;
}

// --- Período mensual ---

// "2026-08" → { year: 2026, month: 8 }. Devuelve null si no es un mes válido: la
// pantalla lee el mes de la query string, que es entrada de usuario.
export function parseMonth(raw: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

// Mes siguiente/anterior, sin desbordar el año. Para la navegación « mes ».
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 };
}

export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "agosto 2026" — rótulo humano del período, en español y sin depender del locale
// del navegador de quien mira (mismo criterio que datetime.ts).
export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? "?"} ${year}`;
}

// ¿La fecha (YYYY-MM-DD) cae dentro del mes (YYYY-MM) que se está mirando?
//
// Es la guarda que atrapa dos errores REALES de la planilla que reemplaza: 25 filas
// fechadas un año antes (mayo 2025 en vez de 2026), y filas cargadas con la fecha de
// hoy mientras se miraba otro mes. Las dos entran sin ruido en una hoja de cálculo;
// acá la acción frena y pide confirmación. Devuelve `true` cuando no hay mes contra
// el cual comparar (no hay nada que advertir).
export function dateBelongsToMonth(dateStr: string, monthKey: string): boolean {
  if (!parseMonth(monthKey)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return true;
  return dateStr.slice(0, 7) === monthKey;
}
