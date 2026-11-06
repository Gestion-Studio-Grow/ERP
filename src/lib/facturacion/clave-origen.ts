// ============================================================================
// Motor de facturación · CLAVE DE ORIGEN (genérica). PURO.
// ============================================================================
//
// Todo comprobante que nace de algo identificable lleva una clave de origen: lo que se factura UNA
// sola vez. El árbitro es el libro `CobroFacturado` (índice único tenantId + clave, ya aplicado:
// sin migración nueva) con la regla del contrato de estados v1:
//   · nunca dos comprobantes VIVOS (no rechazados) para la misma clave;
//   · si el comprobante de esa clave quedó RECHAZADO, la clave se puede volver a facturar.
//
//   mp:payment:<id>   un pago de Mercado Pago (aviso, sincronización, link de un turno)
//   mp:refund:<id>    una devolución de Mercado Pago (su nota de crédito, PR3)
//   manual:<uuid>     una emisión manual (la pantalla genera el uuid al abrir el formulario:
//                     el doble clic o el reenvío del mismo formulario no emite dos veces)
//   turno:<id> · banco:<hash>   los que ya existían (R1), tal cual
//
// COMPATIBILIDAD (decisión anotada, 06/11/2026): el libro ya tiene filas de pagos de MP escritas
// como `mp:<id>`. Para no reescribir datos ni abrir una ventana de doble factura, la forma que se
// GUARDA de un pago de MP sigue siendo `mp:<id>` (`claveAlmacenada`); `mp:payment:<id>` es su nombre
// canónico y las dos formas se leen igual (`leerClaveOrigen`). `claveCobroMP` es este caso.

export type OrigenFacturable =
  | { tipo: "mp_payment"; id: string }
  | { tipo: "mp_refund"; id: string }
  | { tipo: "manual"; id: string }
  | { tipo: "turno"; id: string }
  | { tipo: "banco"; id: string };

const PREFIJO: Record<OrigenFacturable["tipo"], string> = {
  mp_payment: "mp:payment:",
  mp_refund: "mp:refund:",
  manual: "manual:",
  turno: "turno:",
  banco: "banco:",
};

/** Un uuid (o la clave de 16–64 letras, números o guiones que genera la pantalla sin `randomUUID`). */
const CLAVE_MANUAL = /^[A-Za-z0-9-]{16,64}$/;

export class ClaveOrigenInvalidaError extends Error {
  constructor(motivo: string) {
    super(`Clave de origen inválida: ${motivo}`);
    this.name = "ClaveOrigenInvalidaError";
  }
}

function validarId(o: OrigenFacturable): string {
  const id = (o.id ?? "").trim();
  if (!id) throw new ClaveOrigenInvalidaError(`${o.tipo} sin id`);
  if (id.length > 200 || /\s/.test(id)) throw new ClaveOrigenInvalidaError(`${o.tipo} con id mal formado`);
  if (o.tipo === "manual" && !CLAVE_MANUAL.test(id)) throw new ClaveOrigenInvalidaError("manual necesita un uuid");
  return id;
}

/** La clave canónica (`mp:payment:123`, `manual:<uuid>`…). */
export function claveOrigen(o: OrigenFacturable): string {
  return PREFIJO[o.tipo] + validarId(o);
}

/** La forma con la que se guarda en `CobroFacturado` (un pago de MP, como `mp:<id>`: ver arriba). */
export function claveAlmacenada(o: OrigenFacturable): string {
  return o.tipo === "mp_payment" ? `mp:${validarId(o)}` : claveOrigen(o);
}

/** Lee una clave en cualquiera de sus formas (canónica o la guardada); `null` si no es de ninguna. */
export function leerClaveOrigen(clave: string): OrigenFacturable | null {
  const intentos: [OrigenFacturable["tipo"], string][] = [
    ["mp_payment", "mp:payment:"],
    ["mp_refund", "mp:refund:"],
    ["manual", "manual:"],
    ["turno", "turno:"],
    ["banco", "banco:"],
  ];
  for (const [tipo, prefijo] of intentos) {
    if (clave.startsWith(prefijo)) return probar({ tipo, id: clave.slice(prefijo.length) });
  }
  // La forma guardada de un pago de MP: `mp:<id>` (sin otro «:» adelante).
  if (clave.startsWith("mp:")) return probar({ tipo: "mp_payment", id: clave.slice(3) });
  return null;
}

function probar(o: OrigenFacturable): OrigenFacturable | null {
  try {
    return { tipo: o.tipo, id: validarId(o) } as OrigenFacturable;
  } catch {
    return null;
  }
}

/** Normaliza cualquier forma a la que se guarda (para buscar en el libro). */
export function normalizarParaElLibro(clave: string): string {
  const o = leerClaveOrigen(clave);
  if (!o) throw new ClaveOrigenInvalidaError(clave);
  return claveAlmacenada(o);
}
