// ============================================================================
// CON QUÉ SE COBRÓ — la regla que le saca al sistema la costumbre de asumir efectivo.
// ============================================================================
//
// QUÉ PASABA. El POS arrancaba con `<Select name="paymentMethod" defaultValue="EFECTIVO">` y
// «Cobrado» tildado, la bandeja de pedidos tenía el mismo `defaultValue="EFECTIVO"`, y el
// servidor remataba con tres rellenos propios: `setOrderPaidCore` convertía cualquier valor
// desconocido o vacío en EFECTIVO, y `cobrarPedido` y `setOrderPaid` completaban con
// `|| "EFECTIVO"`. Cinco lugares, la misma suposición.
//
// POR QUÉ IMPORTA. `cashMethodFromPaymentMethod` (cierre-diario.ts) manda EFECTIVO a la
// columna EFECTIVO del libro y MERCADOPAGO/TRANSFERENCIA a la columna MP. Una venta que el
// cliente pagó con Mercado Pago y que el que atiende no cambió en el select queda asentada
// como plata en el cajón: el arqueo espera ese importe ENTERO en efectivo y no está, y el
// extracto de MP tiene un ingreso que el libro no conoce. No es un redondeo: es el ticket
// completo, mal columnado, y nadie se entera hasta el cierre. (Es el mismo error que d63afd4
// sacó de compras y comisiones; el mostrador había quedado afuera.)
//
// LA REGLA. Si la venta se cobra, el medio se ELIGE; no se infiere, no se completa y no se
// recuerda el último (recordar el último medio es volver a asumir, con otra excusa). Si no se
// cobra —pedido con retiro o envío que se paga después, o la venta que se deja sin cobrar
// porque la caja del día ya está cerrada—, el medio no se pide y se descarta: el que vale es
// el que se elija al cobrarlo.
//
// DÓNDE SE LLAMA, Y DÓNDE NO. En `createOrder` (el alta del mostrador) y en `setOrderPaidCore`
// (cobrar un pedido desde la bandeja). NUNCA en `insertOrder`: ese núcleo lo comparten la
// vidriera pública y la ingesta externa (external-orders.ts), que crean pedidos sin cobrar y
// no tienen una persona delante a la que preguntarle. La regla es del que cobra, no del que
// arma la orden.
//
// Sin Prisma, sin DB, sin React: se importa igual desde el POS (client component) y desde la
// Server Action. Por eso los medios van como string literals y NO como el enum PaymentMethod
// de `@/generated/prisma`: importar un VALOR de ese módulo en un cliente rompe el build de
// Turbopack, y tsc no lo ve.

/** Los medios que hoy existen en `PaymentMethod` (prisma/schema.prisma). */
export type MedioDeCobro = "EFECTIVO" | "MERCADOPAGO" | "TRANSFERENCIA";

/**
 * Lo que ve la persona que cobra. «Mercado Pago» para TODOS los tenants: CH lleva una columna
 * TARJETA aparte en su libro y concilia la columna MP contra el extracto de Mercado Pago; si
 * el botón dijera «tarjeta», cada venta con tarjeta de CH caería en MP y ese extracto dejaría
 * de cuadrar. La opción Tarjeta necesita migrar el enum y queda en el backlog.
 */
export const MEDIOS_DE_COBRO: readonly { valor: MedioDeCobro; etiqueta: string }[] = [
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "MERCADOPAGO", etiqueta: "Mercado Pago" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
];

/** Lee el medio que llegó del formulario. Lo que no es uno de los tres es `null`, no EFECTIVO. */
export function leerMedioDeCobro(raw: unknown): MedioDeCobro | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return MEDIOS_DE_COBRO.some((m) => m.valor === s) ? (s as MedioDeCobro) : null;
}

export function etiquetaDeMedio(medio: string | null | undefined): string {
  if (medio === TARJETA) return MEDIO_TARJETA.etiqueta;
  return MEDIOS_DE_COBRO.find((m) => m.valor === medio)?.etiqueta ?? "un medio sin identificar";
}

// ── Tarjeta (N2 · M1-C1) ────────────────────────────────────────────────────
//
// Débito o crédito con el posnet. En el libro tiene columna desde siempre (`CashMethod.TARJETA`);
// en `PaymentMethod` (el medio del pedido y del cobro) recién existe con el paquete Gate 2
// (prisma/pending-gate2/N2_enums.sql) Y con el cliente de Prisma generado con el valor
// (prisma/schema.prisma, línea `// N2-enum: TARJETA`). Hacen falta LAS DOS cosas: con el valor en
// la base y un cliente que no lo conoce, Prisma rechaza el alta («Expected PaymentMethod») y, peor,
// un pedido con TARJETA escrito por otro lado rompe toda lectura de pedidos («Value 'TARJETA' not
// found in enum»). Medido contra Postgres (medio-cobro-tarjeta-postgres.test.ts).
//
// Por eso Tarjeta NO entra en `MEDIOS_DE_COBRO` ni en `MedioDeCobro` (lo usan 20 archivos con
// tipos cerrados: ampliarlo es el paso de M10/encendido): se ofrece aparte, sólo con
// `tarjetaHabilitadaPor(...)` en true, y `leerMedioDeCobro` la sigue rechazando con su mensaje de
// siempre hasta ese día. Lo decide el servidor (`tarjetaHabilitada`, caja-actions.ts).

export const TARJETA = "TARJETA" as const;
export type MedioConTarjeta = MedioDeCobro | typeof TARJETA;

/** La tecla de Tarjeta: el tipo (débito o crédito) es una nota, no dos medios. */
export const MEDIO_TARJETA = { valor: TARJETA, etiqueta: "Tarjeta", nota: "débito o crédito" } as const;

/** ¿Se puede cobrar con Tarjeta? Valor en la base (probe) Y en el cliente de Prisma. PURA. */
export function tarjetaHabilitadaPor(p: { enLaBase: boolean; enElCliente: boolean }): boolean {
  return p.enLaBase === true && p.enElCliente === true;
}

/** Los medios que ofrece el cobro: los de siempre, más Tarjeta si está habilitada. PURA. */
export function mediosDeCobroDisponibles(conTarjeta: boolean): readonly { valor: MedioConTarjeta; etiqueta: string }[] {
  return conTarjeta ? [...MEDIOS_DE_COBRO, { valor: TARJETA, etiqueta: MEDIO_TARJETA.etiqueta }] : MEDIOS_DE_COBRO;
}

/** `leerMedioDeCobro` con Tarjeta: sólo la acepta si está habilitada; si no, `null` como siempre. PURA. */
export function leerMedioDeCobroConTarjeta(raw: unknown, conTarjeta: boolean): MedioConTarjeta | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === TARJETA) return conTarjeta ? TARJETA : null;
  return leerMedioDeCobro(s);
}

/** Lo que dice el protocolo sin señal del posnet, según se pueda cargar Tarjeta o no. PURA. */
export function textoDelPosnet(conTarjeta: boolean): string {
  return conTarjeta
    ? "posnet: anotá en el cuaderno como TARJETA y, al cargarla, elegí Tarjeta."
    : "posnet: anotá en el cuaderno como TARJETA.";
}

/** Desde dónde se cobra: cambia la SALIDA que ofrece el mensaje, no la regla. */
export type ContextoDeMedio = "alta" | "cobro";

export const MENSAJE_FALTA_MEDIO_BANDEJA =
  "Elegí cómo pagó (Efectivo, Mercado Pago o Transferencia) para cobrar el pedido.";

/**
 * LA DECISIÓN: ¿se puede grabar este cobro con este medio?
 *
 *   · cobrada + medio válido     → pasa, con el medio normalizado.
 *   · cobrada + sin medio/basura → RECHAZA con un mensaje que dice qué hacer. No se graba la
 *                                  venta como no cobrada en silencio: el que atiende cree que
 *                                  cobró y el pedido quedaría "a cobrar" para siempre.
 *   · no cobrada                 → pasa SIN medio (lo que haya llegado se descarta).
 *
 * El canal no cambia la decisión (cobrar exige medio en el mostrador y en un pedido por
 * igual); sólo cambia el mensaje: en un pedido con retiro o envío existe la salida de dejarlo
 * sin cobrar, en la venta de mostrador no hace falta ofrecerla.
 */
export function medioDeCobroRequerido(input: {
  channel?: "COUNTER" | "ONLINE";
  paid: boolean;
  paymentMethod: unknown;
  contexto?: ContextoDeMedio;
}): { ok: true; paymentMethod: MedioDeCobro | null } | { ok: false; error: string } {
  if (!input.paid) return { ok: true, paymentMethod: null };
  const medio = leerMedioDeCobro(input.paymentMethod);
  if (medio) return { ok: true, paymentMethod: medio };
  if (input.contexto === "cobro") return { ok: false, error: MENSAJE_FALTA_MEDIO_BANDEJA };
  return {
    ok: false,
    error:
      input.channel === "ONLINE"
        ? "Elegí cómo pagó (Efectivo, Mercado Pago o Transferencia), o destildá «Cobrado» si el pedido se paga al retirarlo o al recibirlo."
        : "Elegí cómo pagó (Efectivo, Mercado Pago o Transferencia) antes de cobrar.",
  };
}

/**
 * Qué decir cuando se intenta cobrar un pedido que YA estaba cobrado (la segunda pestaña, el
 * segundo clic). No se toca nada —ni el pedido ni el libro—, así que el mensaje tiene que
 * decir con qué medio quedó: si la segunda persona eligió otro, es la única forma de que se
 * entere de que el asiento no es el que ella cree.
 */
export function mensajeYaCobrado(input: {
  code: number;
  medioRegistrado: string | null;
  medioElegido: MedioDeCobro;
}): { ok: true; mensaje: string } | { ok: false; error: string } {
  const registrado = etiquetaDeMedio(input.medioRegistrado);
  if (input.medioRegistrado === input.medioElegido) {
    return { ok: true, mensaje: `El pedido #${input.code} ya estaba cobrado con ${registrado}.` };
  }
  return {
    ok: false,
    error:
      `El pedido #${input.code} ya estaba cobrado con ${registrado}, no con ` +
      `${etiquetaDeMedio(input.medioElegido)}. No se cambió nada.`,
  };
}
