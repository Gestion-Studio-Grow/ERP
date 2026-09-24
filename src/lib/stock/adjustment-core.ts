// Núcleo PURO de AJUSTES / MERMAS de stock (F2) — el tercer flujo que mueve
// inventario, además de la venta (order-core) y la compra/reposición (purchase-core).
//
// Un ajuste corrige el stock por fuera del ciclo venta/compra: recuento físico,
// merma, rotura, vencimiento u otra corrección manual. A diferencia de la compra
// (que siempre SUMA) y la venta (que siempre RESTA), el ajuste lleva un delta
// FIRMADO: puede subir o bajar el stock. Se asienta como StockMovement tipo AJUSTE
// (ver src/lib/stock/ledger.ts) con `reason` OBLIGATORIO — un ajuste sin motivo no
// es auditable, y esa trazabilidad es justamente para qué existe el ledger.
//
// Este archivo es PURO (sin DB, sin tenant): toda la aritmética de signo vive acá
// para poder unit-testearla Y reusarla en el formulario (preview del delta en vivo)
// sin arrastrar Prisma al bundle del cliente. La persistencia está en
// `adjustment-insert.ts`, que se apoya en estos helpers.

import { round3 } from "@/lib/stock/ledger";
import { leerCantidad, type LecturaCantidad } from "@/lib/pos-peso";
import type { Role } from "@/lib/capabilities";

// Motivo del ajuste (categoría). Es lo que hace `reason` obligatorio: siempre hay
// uno. Cada motivo fija CÓMO se interpreta el número que carga el operador:
//   RECUENTO    → cuenta física: carga el stock REAL contado (absoluto) y el delta
//                 sale de la diferencia contra el stock TEÓRICO a la hora del conteo.
//   MERMA/ROTURA/VENCIMIENTO y los de perecederos → baja: carga la cantidad PERDIDA
//                 (magnitud) y siempre resta.
//   OTRO        → corrección libre: carga el delta FIRMADO (+ suma / − resta); exige nota.
export type AdjustmentMotivo =
  | "RECUENTO"
  | "MERMA"
  | "ROTURA"
  | "VENCIMIENTO"
  | "DECOMISO"
  | "CONSUMO_INTERNO"
  | "DEGUSTACION"
  | "OTRO";

// Los motivos de siempre, en su orden: es lo que ve un negocio de servicios (CH), igual que
// antes de que existieran los de perecederos.
export const ADJUSTMENT_MOTIVOS: readonly AdjustmentMotivo[] = [
  "RECUENTO",
  "MERMA",
  "ROTURA",
  "VENCIMIENTO",
  "OTRO",
];

// Un mostrador de perecederos (la carnicería, la fiambrería) pierde mercadería por más
// caminos que "se rompió" o "se venció": el decomiso de bromatología, lo que consume el
// personal y lo que se da a probar. Sin un motivo propio todo eso iba a "Merma" u "Otro" y
// el dueño no podía ver cuánto se le iba en degustaciones. En una tienda de velas o de pádel
// esos motivos no existen: ofrecerlos es ruido. En un mostrador la merma va primero: el
// recuento tiene su propia app (Recuento, /admin/ajustes/recuento).
const MOTIVOS_DE_MOSTRADOR: readonly AdjustmentMotivo[] = ["MERMA", "VENCIMIENTO", "ROTURA", "RECUENTO", "OTRO"];
const MOTIVOS_DE_PERECEDEROS: readonly AdjustmentMotivo[] = [
  "MERMA",
  "VENCIMIENTO",
  "ROTURA",
  "DECOMISO",
  "CONSUMO_INTERNO",
  "DEGUSTACION",
  "RECUENTO",
  "OTRO",
];

/** Todos los motivos que el servidor acepta, en cualquier negocio. */
export const TODOS_LOS_MOTIVOS: readonly AdjustmentMotivo[] = MOTIVOS_DE_PERECEDEROS;

/**
 * Los motivos que ofrece la pantalla de Mermas en este negocio. Un negocio de servicios (CH)
 * ve los de siempre, en su orden; un mostrador arranca en Merma, y si vende comida fresca
 * suma los de perecederos. PURA.
 *
 * `perecederos` es el dato del blueprint (`RetailRubro.perecederos`, que resuelve la página con
 * `rubroConPerecederos`): antes había acá una lista propia de rubros, una segunda verdad que
 * podía no coincidir con la que prende Lotes y Despiece. Se recibe ya resuelto y no se importa
 * el blueprint porque este módulo viaja al navegador (el formulario de Mermas lo usa) y el
 * blueprint arrastra el catálogo semilla de cada rubro.
 */
export function motivosDeAjuste(negocio: { esMostrador: boolean; perecederos?: boolean }): readonly AdjustmentMotivo[] {
  if (!negocio.esMostrador) return ADJUSTMENT_MOTIVOS;
  return negocio.perecederos ? MOTIVOS_DE_PERECEDEROS : MOTIVOS_DE_MOSTRADOR;
}

/** El motivo que llega del formulario, o `null` si no es uno de los que existen. PURA. */
export function leerMotivo(raw: unknown): AdjustmentMotivo | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return (TODOS_LOS_MOTIVOS as readonly string[]).includes(v) ? (v as AdjustmentMotivo) : null;
}

// Etiqueta legible del motivo, para el `reason` persistido y la UI. El tablero de merma
// (merma-core.ts) reconoce la merma por ESTA etiqueta al principio del `reason`: cambiar un
// texto acá es cambiar cómo se clasifica lo ya registrado.
export function motivoLabel(m: AdjustmentMotivo): string {
  switch (m) {
    case "RECUENTO":
      return "Recuento";
    case "MERMA":
      return "Merma";
    case "ROTURA":
      return "Rotura";
    case "VENCIMIENTO":
      return "Vencimiento";
    case "DECOMISO":
      return "Decomiso";
    case "CONSUMO_INTERNO":
      return "Consumo interno";
    case "DEGUSTACION":
      return "Degustación";
    case "OTRO":
      return "Otro";
  }
}

// Cómo se interpreta el valor que carga el operador para cada motivo.
//   COUNT  → valor = stock real contado (absoluto). Delta = contado − actual.
//   LOSS   → valor = cantidad perdida (magnitud). Delta = −|valor| (siempre baja).
//   SIGNED → valor = delta firmado tal cual (+ suma / − resta).
export type AdjustmentMode = "COUNT" | "LOSS" | "SIGNED";

export function motivoMode(m: AdjustmentMotivo): AdjustmentMode {
  switch (m) {
    case "RECUENTO":
      return "COUNT";
    case "MERMA":
    case "ROTURA":
    case "VENCIMIENTO":
    case "DECOMISO":
    case "CONSUMO_INTERNO":
    case "DEGUSTACION":
      return "LOSS";
    case "OTRO":
      return "SIGNED";
  }
}

// ¿El motivo OTRO exige nota? Sí: es el único sin categoría descriptiva, así que la
// nota es lo que da el "por qué". Para el resto la nota es opcional (el motivo ya
// describe). Espeja la validación de la UI y la de la acción.
export function requiresNote(m: AdjustmentMotivo): boolean {
  return m === "OTRO";
}

// Delta FIRMADO que aplica una línea de ajuste, dado el modo, el valor cargado y el
// stock actual del producto. Puro y testeable. `current` sólo se usa en COUNT
// (recuento); en LOSS/SIGNED se ignora. Redondeado a 3 decimales (stock fraccional).
export function adjustmentDelta(
  mode: AdjustmentMode,
  value: number,
  current: number,
): number {
  if (!Number.isFinite(value)) return 0;
  switch (mode) {
    case "COUNT":
      return round3(value - current);
    case "LOSS":
      return round3(-Math.abs(value));
    case "SIGNED":
      return round3(value);
  }
}

// El `reason` que se persiste en cada movimiento: etiqueta del motivo + nota opcional.
// Nunca vacío (el motivo siempre está) → cumple "reason obligatorio".
export function buildReason(motivo: AdjustmentMotivo, note: string | null): string {
  const n = note?.trim();
  return n ? `${motivoLabel(motivo)} — ${n}` : motivoLabel(motivo);
}

// ── Leer lo que se tipea en cada línea ─────────────────────────────────────
//
// El recuento era un `<input type="number">` leído con `Number()`. Con la coma, el navegador
// se la traga (medido: tipear "4,350" entrega "4350", ver la cabecera de pos-peso.ts), así
// que un recuento de cuatro kilos trescientos cincuenta dejaba el corte en 4350 kg, con un
// AJUSTE "Recuento" por esa diferencia en el ledger (y el preview en verde, porque el delta
// salía positivo). Ahora el
// campo es texto y se lee con la misma regla que el POS (`leerCantidad`, coma y punto valen
// lo mismo, precisión de gramos), en el formulario Y en la Server Action.
//
// La única diferencia con el POS es el SIGNO: en OTRO el número es un delta firmado ("-2,5"
// resta), y `leerCantidad` rechaza el "-" a propósito (no se vende −1 kg). Acá el signo se
// separa antes, y SÓLO en el modo que lo admite: en un recuento o una merma, "-3" sigue
// siendo un error de tipeo y se marca, no se convierte en otra cosa.
export function leerValorDeAjuste(mode: AdjustmentMode, raw: string | null | undefined): LecturaCantidad {
  const s = String(raw ?? "").trim();
  if (mode !== "SIGNED") return leerCantidad(s);
  // "−" (U+2212) es el menos que pega un teclado de celular o un copiar de planilla.
  const m = /^([+\-\u2212])\s*(.*)$/.exec(s);
  if (!m) return leerCantidad(s);
  const l = leerCantidad(m[2]);
  if (l.estado !== "ok") return l.estado === "vacio" ? { estado: "invalida" } : l;
  return { estado: "ok", valor: m[1] === "+" ? l.valor : -l.valor };
}

// Las líneas que llegan a la Server Action (arrays paralelos productId[]/value[]). Misma
// lectura que la pantalla, con una diferencia: lo ilegible LANZA con un mensaje en vez de
// descartarse. Antes un valor que no era número llegaba como NaN y `insertStockAdjustment`
// lo filtraba callado: se registraba el ajuste de las otras líneas y la persona no se
// enteraba de que ésa no había entrado. Una línea sin producto (la fila vacía del final) no
// es un error: no se pidió nada.
//
// En un RECUENTO cada línea puede traer además la HORA DEL CONTEO (`horas`, arrays paralelos,
// en el reloj del TELÉFONO) y el formulario manda la hora del teléfono al tocar Guardar
// (`enviadoA`): con las dos se sabe hace cuánto se contó cada línea (`horaDelConteo`). El
// stock contra el que se compara es el que el sistema tenía a esa hora, no el del momento de
// guardar (ver `stockTeorico`). Y un mismo producto no puede estar dos veces en un recuento:
// dos conteos del mismo corte se contradicen, y guardar el segundo encima del primero
// escondería el error.
export function leerLineasDeAjuste(
  mode: AdjustmentMode,
  productIds: readonly string[],
  values: readonly string[],
  opts: { horas?: readonly string[]; enviadoA?: string | null; ahora?: Date } = {},
): { productId: string; value: number; contadoA?: Date }[] {
  if (productIds.length !== values.length) {
    throw new Error("El ajuste llegó incompleto (productos y valores no coinciden). Volvé a cargarlo.");
  }
  const out: { productId: string; value: number; contadoA?: Date }[] = [];
  const vistos = new Map<string, number>();
  productIds.forEach((productId, i) => {
    if (!productId) return;
    const l = leerValorDeAjuste(mode, values[i]);
    if (l.estado === "vacio") {
      throw new Error(`Línea ${i + 1}: falta el valor. Cargalo o quitá la línea.`);
    }
    if (l.estado === "invalida") {
      throw new Error(
        `Línea ${i + 1}: "${String(values[i]).slice(0, 24)}" no es una cantidad. Escribila con coma decimal (4,350).`,
      );
    }
    if (mode === "COUNT") {
      const antes = vistos.get(productId);
      if (antes !== undefined) {
        throw new Error(`Línea ${i + 1}: ese producto ya está contado en la línea ${antes}. Dejá un solo conteo.`);
      }
      vistos.set(productId, i + 1);
      const hora = opts.horas?.[i];
      if (hora !== undefined && String(hora).trim() !== "") {
        out.push({ productId, value: l.valor, contadoA: horaDelConteo(hora, opts.enviadoA, opts.ahora ?? new Date()) });
        return;
      }
    }
    out.push({ productId, value: l.valor });
  });
  return out;
}

// ── Recuento contra el stock teórico a la hora del conteo ───────────────────
//
// POR QUÉ. El recuento se hace con el local abierto: se cuenta a las 10:00, a las 10:05 se
// vende un kilo y a las 10:10 se guarda la planilla. Comparado contra el stock AL GUARDAR, el
// kilo vendido aparecía como sobrante (el sistema ya lo había descontado y lo contado lo
// incluía), y el ajuste le devolvía al stock un kilo que ya se había ido. La comparación
// correcta es contra lo que el sistema creía que había A LA HORA DEL CONTEO: el stock actual
// menos todo lo que se movió después (el registro de movimientos es lo único que cambia el
// stock, así que la cuenta es exacta).

/** Cuánto hacia atrás se acepta una hora de conteo: una planilla se cuenta y se guarda el mismo día. */
export const VENTANA_DE_CONTEO_MS = 24 * 60 * 60 * 1000;

/** Una hora que manda el teléfono (milisegundos o ISO), o `null` si no se entiende. PURA. */
function leerHoraDelTelefono(raw: string | number | null | undefined): number | null {
  const txt = String(raw ?? "").trim();
  if (!txt) return null;
  const ms = /^\d+$/.test(txt) ? Number(txt) : Date.parse(txt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * La hora del conteo, en el reloj del SERVIDOR.
 *
 * POR QUÉ ASÍ. El teléfono manda dos horas de SU reloj: cuándo se tipeó lo contado (`tipeo`) y
 * cuándo se tocó Guardar (`envio`). Lo único que se usa es la diferencia entre las dos, "hace
 * cuánto se contó", y se le resta a la hora del servidor al recibir. Así no importa si el
 * teléfono atrasa o adelanta, ni cuándo se armó la página. Antes se corregía el reloj del
 * teléfono con la hora a la que el servidor había armado la pantalla, y eso fallaba al volver
 * con Atrás: Next muestra la copia guardada de la página, con la hora de cuando se armó, y el
 * conteo quedaba corrido hacia atrás todo lo que había pasado (medido por el revisor: una
 * venta de ANTES del conteo se descontaba otra vez).
 *
 * Sin `envio` (un envío sin JavaScript) o sin `tipeo` legible → `ahora`: se compara contra el
 * stock de ahora, como antes de la ola 2. Si el reloj del teléfono fue para atrás entre el
 * tipeo y el envío → `ahora` también. Más de un día → error: ese conteo ya no describe el
 * local. PURA.
 */
export function horaDelConteo(
  tipeo: string | number | null | undefined,
  envio: string | number | null | undefined,
  ahora: Date,
): Date {
  const t = leerHoraDelTelefono(tipeo);
  const e = leerHoraDelTelefono(envio);
  if (t === null || e === null) return ahora;
  const hace = e - t;
  if (!(hace > 0)) return ahora;
  if (hace > VENTANA_DE_CONTEO_MS) {
    throw new Error("El conteo tiene más de un día. Volvé a contar esos productos y guardalo en el momento.");
  }
  return new Date(ahora.getTime() - hace);
}

/**
 * Cuándo arranca un conteo en el formulario: con el primer número tipeado en un campo vacío.
 * Seguir tipeando o corregir un dígito no lo mueve (el conteo se hizo cuando se empezó a
 * anotar); borrar todo y volver a escribir es contar de nuevo. `ahoraTelefono` es `Date.now()`
 * del teléfono. PURA.
 */
export function marcaDeConteo(
  anterior: { texto: string; contadoA: number | null } | undefined,
  texto: string,
  ahoraTelefono: number,
): number | null {
  if (texto.trim() === "") return null;
  if (anterior && anterior.texto.trim() !== "" && anterior.contadoA !== null) return anterior.contadoA;
  return ahoraTelefono;
}

/**
 * El stock que el sistema tenía a la hora del conteo: el actual menos lo que se movió
 * después (`movidoDespues` = suma FIRMADA de los movimientos posteriores; una venta resta, así
 * que restarla la devuelve). PURA.
 */
export function stockTeorico(stockActual: number, movidoDespues: number): number {
  return round3(stockActual - (Number.isFinite(movidoDespues) ? movidoDespues : 0));
}

/** Suma firmada de los movimientos de un producto posteriores a `desde`. PURA. */
export function movidoDespuesDe(
  movimientos: readonly { productId: string | null; qty: number; createdAt: Date }[],
  productId: string,
  desde: Date,
): number {
  let s = 0;
  for (const m of movimientos) {
    if (m.productId === productId && m.createdAt.getTime() > desde.getTime()) s += m.qty;
  }
  return round3(s);
}

/**
 * ¿El producto ya se RECONTÓ después de `desde`? Un AJUSTE cuyo motivo empieza con "Recuento"
 * (con diferencia o sin ella: el que coincide queda en 0) posterior a la hora de este conteo.
 * Si pasó, este conteo es viejo: otro recuento (el mismo, reenviado desde un borrador cuya
 * respuesta se perdió, o el de otra persona) ya fijó el stock después, y aplicarlo descontaría
 * la misma diferencia otra vez. PURA.
 */
export function recontadoDespuesDe(
  movimientos: readonly { productId: string | null; type?: string; reason?: string | null; createdAt: Date }[],
  productId: string,
  desde: Date,
): boolean {
  const prefijo = motivoLabel("RECUENTO");
  return movimientos.some(
    (m) =>
      m.productId === productId &&
      m.type === "AJUSTE" &&
      typeof m.reason === "string" &&
      m.reason.startsWith(prefijo) &&
      m.createdAt.getTime() > desde.getTime(),
  );
}

/** El rechazo de un recuento con conteos viejos, con los nombres de los productos. */
export function mensajeDeYaRecontado(nombres: readonly string[]): string {
  return nombres.length === 1
    ? `${nombres[0]} ya se recontó después de este conteo, así que no se guardó nada. Recargá la pantalla: lo que ya quedó guardado no vuelve a aparecer.`
    : `${nombres.join(", ")} ya se recontaron después de este conteo, así que no se guardó nada. Recargá la pantalla: lo que ya quedó guardado no vuelve a aparecer.`;
}

// ── Tope de merma por carga ──────────────────────────────────────────────────
//
// El encargado (RECEPTION) carga mermas, pero no sin límite: una carga que se lleva más de
// $50.000 de mercadería la tiene que hacer la dueña. El control es por lo que queda escrito
// (quién cargó qué y cuánto valía, con el costo guardado en la fila), no por pedir su clave:
// frenar el cierre de la heladera un sábado para que la dueña tipee una contraseña es peor.
// El monto es PROVISIONAL A CONFIRMAR con la dueña de MAGRA.

/** Tope de merma por carga para quien no es la dueña, en pesos. Provisional a confirmar. */
export const TOPE_MERMA_POR_CARGA = 50_000;

/**
 * Hasta cuánto puede dar de baja en una carga este rol. `null` = sin tope (la dueña). Mismo
 * criterio que `alcanceDeAnulacion` (capabilities.ts): cualquier rol que no sea OWNER arranca
 * con el límite puesto. PURA.
 */
export function topeDeMermaPorCarga(role: Role): number | null {
  return role === "OWNER" ? null : TOPE_MERMA_POR_CARGA;
}

/**
 * Cuánto vale lo que da de baja una carga: las líneas que RESTAN, a costo vigente. Una
 * corrección "Otro" que resta cuenta, y el FALTANTE de un recuento también.
 *
 * Por qué el recuento cuenta (QA de la integración de la ola 2, medido): si el recuento no
 * pasaba por el tope, la baja que el tope frenaba como merma entraba igual cargada como
 * "Recuento" en Mermas o desde la app Recuento: contar 0 kg de un corte que tiene 10 lo deja en
 * 0 igual que una merma de 10 kg, sin que la dueña se entere. El sobrante de un recuento no
 * compensa el faltante de otro producto (sumar de más lo barato no puede habilitar a dar de baja
 * lo caro): sólo las líneas que restan. Las líneas sin costo no suman (no se pueden valuar) y se
 * informan aparte. PURA.
 */
export function valorDeLaBaja(lineas: readonly { delta: number; costo: number | null }[]): { pesos: number; sinCosto: number } {
  let pesos = 0;
  let sinCosto = 0;
  for (const l of lineas) {
    if (!(l.delta < 0)) continue;
    if (l.costo === null || !(l.costo > 0)) sinCosto++;
    else pesos += -l.delta * l.costo;
  }
  return { pesos: Math.round(pesos * 100) / 100, sinCosto };
}

/** ¿La carga pasa el tope? `tope` null = sin tope. PURA. */
export function superaElTope(pesos: number, tope: number | null): boolean {
  return tope !== null && pesos > tope;
}

/**
 * El mensaje cuando una carga pasa el tope. Los PESOS sólo van para quien ve costos: el
 * encargado (RECEPTION, sin `costs:read`) que carga "1000 kg de vacío" y lee "da de baja
 * $6.543.000" acaba de averiguar el costo por kilo, y como no se graba nada lo puede repetir
 * con cada corte. Por eso quien no ve costos recibe el mismo rechazo sin montos. Tampoco se
 * sugiere partir la carga: el tope es por carga justamente para que una baja grande pase por la
 * dueña. PURA.
 */
export function mensajeDeTope(
  baja: { pesos: number; tope: number },
  conCostos: boolean,
  formato: (n: number) => string,
  motivo?: AdjustmentMotivo,
): string {
  // Un recuento no "carga" nada: lo que pasa el tope es el faltante que encontró. El paso a
  // seguir también cambia: lo cuenta la dueña (o con ella), no lo "carga".
  if (motivo !== undefined && motivoMode(motivo) === "COUNT") {
    const siga = "No se registró nada: pedile a la dueña o al dueño que lo cuente con vos y lo guarde.";
    if (!conCostos) return `El faltante de este recuento pasa tu tope por carga. ${siga}`;
    return `El faltante de este recuento vale ${formato(baja.pesos)} a costo y tu tope por carga es ${formato(baja.tope)}. ${siga}`;
  }
  const siga = "No se registró nada: pedile a la dueña o al dueño que la cargue.";
  if (!conCostos) return `Esta carga pasa tu tope por carga. ${siga}`;
  return `Esta carga da de baja ${formato(baja.pesos)} a costo y tu tope por carga es ${formato(baja.tope)}. ${siga}`;
}

// Qué productos ofrece la pantalla de ajustes: los activos, y además el que llega preelegido
// desde el "Recontar" del catálogo AUNQUE esté inactivo. El catálogo ya no deja tipear el
// stock en la edición (lo pisaba con el número de cuando se abrió la pantalla), así que este
// recuento es el único camino para corregir el stock de un producto dado de baja. Es un
// filtro de Prisma en forma de objeto plano (sin importar Prisma: este módulo lo usa el
// cliente); el loader le suma `tenantId` y `deletedAt: null`.
export function filtroDeAjustables(
  preelegido?: string | null,
): { active: true } | { OR: [{ active: true }, { id: string }] } {
  const id = typeof preelegido === "string" ? preelegido.trim() : "";
  return id ? { OR: [{ active: true }, { id }] } : { active: true };
}
