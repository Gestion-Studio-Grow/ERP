// ============================================================================
// VENDER — qué se le dice al cajero cuando el cobro no salió, y si puede reintentar.
// ============================================================================
//
// El mostrador de MAGRA cobra con el celular y el wifi del local se corta. Antes, el cobro que
// no llegaba al servidor mostraba un aviso de 4 segundos abajo a la derecha —justo encima del
// botón de cobrar en el celular— y desaparecía: el cajero no sabía si la venta se había
// grabado, y lo natural era cargarla de nuevo desde cero, con otra clave, y cobrarla dos veces.
//
// Lo que decide este módulo (DATO PURO: sin React, sin servidor; lo importa VenderForm):
//   · Sin señal ANTES de mandar (el navegador sabe que está desconectado): no se manda nada y
//     se dice que la venta NO salió. Lo cargado queda en pantalla.
//   · Se mandó y no volvió respuesta: NO se sabe si se grabó. Se dice eso, sin mentir, y se
//     ofrece reintentar con LA MISMA venta: viaja la misma clave de ticket y el servidor, si ya
//     la tenía, contesta "ya estaba registrada" en vez de cobrarla otra vez (createOrder, A-1).
//   · El servidor contestó que no (sin stock, día cerrado, descuento de más): su texto ya dice
//     qué hacer; se muestra entero y se corrige lo cargado, no se "reintenta" igual.
//
// La clave del ticket se renueva cuando el ticket se limpia después de un cobro bueno
// (`claveParaCobrar`), cuando el cajero declara que es otra venta, y después de un rechazo de
// negocio sin ningún envío en duda (`renovarClaveTrasRechazo`). Si se renovara al fallar la red,
// el reintento de una venta que sí se había grabado (respuesta perdida) la cobraría dos veces.
//
// La pantalla NO es la defensa de verdad: el servidor compara lo que llega con lo grabado
// (reintento-de-venta.ts) y, si no coincide, no graba nada y contesta «ya-grabada-distinta». La
// firma de acá sirve para no mandar algo que va a volver así, y para decirlo antes.

import { fmtTime } from "@/lib/datetime";
import { tituloDeYaGrabada, detalleDeYaGrabada, type VentaYaGrabada } from "@/lib/reintento-de-venta";

/**
 * Cuánto se espera la respuesta del cobro antes de decir que no sabemos si se grabó. Sin tope,
 * un servidor que nunca contesta dejaba «Cobrando…» deshabilitado y sin salida. 25 s: por arriba
 * de un alta lenta de verdad (transacción con stock, caja y cupón contra Neon) y por debajo de lo
 * que un cajero con la fila esperando aguanta mirando un botón gris.
 *
 * Next despacha las Server Actions DE A UNA (la cola del router, app-router-instance.js): el
 * envío colgado no se puede cancelar desde acá, y el reintento queda en fila detrás de él hasta
 * que el navegador lo suelte. Por eso el reintento también tiene tope, y viaja con la MISMA
 * clave: si el colgado se grabó, el reintento lo encuentra y no se cobra dos veces.
 */
export const TIEMPO_MAXIMO_DEL_COBRO_MS = 25_000;

/** Lo que vuelve de esperar el cobro con tope: la respuesta, o que no llegó a tiempo. */
export type EsperaDelCobro<T> = { tipo: "respuesta"; valor: T } | { tipo: "sin-respuesta" };

/**
 * Espera `promesa` hasta `ms`. Si no llega, devuelve `sin-respuesta` (no cancela nada: no se
 * puede). Un error de la promesa se propaga (la pantalla lo trata como corte). El reloj se
 * inyecta para probarlo sin esperar.
 */
export function conTiempoMaximo<T>(
  promesa: Promise<T>,
  ms: number,
  reloj: { setTimeout: (f: () => void, ms: number) => unknown; clearTimeout: (id: unknown) => void } = {
    setTimeout: (f, t) => setTimeout(f, t),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
): Promise<EsperaDelCobro<T>> {
  return new Promise((resolver, rechazar) => {
    const id = reloj.setTimeout(() => resolver({ tipo: "sin-respuesta" }), ms);
    promesa.then(
      (valor) => {
        reloj.clearTimeout(id);
        resolver({ tipo: "respuesta", valor });
      },
      (e) => {
        reloj.clearTimeout(id);
        rechazar(e);
      },
    );
  });
}

export type FallaDeCobro = {
  /** Qué pasó, en una frase. */
  titulo: string;
  /** Cómo seguir. */
  comoSeguir: string;
  /** ¿El botón pasa a ser «Reintentar cobro» con la misma venta? */
  reintentar: boolean;
};

/** Lo que dice el botón de cobrar cuando hay que reintentar (en la venta, con el total al lado). */
export function etiquetaDeReintento(esPedido = false): string {
  return esPedido ? "Reintentar el pedido" : "Reintentar cobro";
}

/**
 * Antes de mandar: con el navegador desconectado no se manda nada (el pedido se quedaría
 * colgado hasta que el sistema operativo lo corte). `enLinea` es `navigator.onLine`: cuando
 * dice `false` es seguro que no hay red; cuando dice `true` puede mentir, y ahí decide la falla
 * del envío.
 */
export function antesDeCobrar(enLinea: boolean, esPedido = false): FallaDeCobro | null {
  if (enLinea) return null;
  const que = esPedido ? "El pedido no se registró" : "La venta no se cobró";
  return {
    titulo: `No hay conexión. ${que}.`,
    comoSeguir: `Lo que cargaste sigue acá. Cuando vuelva la señal, tocá «${etiquetaDeReintento(esPedido)}».`,
    reintentar: true,
  };
}

/**
 * El cobro no salió por falta de señal y la señal ya volvió: no se mandó nada, así que no hay
 * duda que aclarar. Sólo falta tocar el botón.
 */
export function volvioLaSenal(esPedido = false): FallaDeCobro {
  return {
    titulo: esPedido ? "Volvió la conexión. El pedido todavía no se registró." : "Volvió la conexión. La venta todavía no se cobró.",
    comoSeguir: `Lo que cargaste sigue acá: tocá «${etiquetaDeReintento(esPedido)}».`,
    reintentar: true,
  };
}

/**
 * Se mandó y no volvió respuesta (se cortó la señal a mitad del cobro, el servidor tardó más que
 * el tope, o falló algo que no es un rechazo). `enLinea` es cómo está la conexión AHORA: el texto
 * dice si ya se puede reintentar. `restaurado`: la duda quedó de antes de recargar o volver a la
 * pantalla (la hora en que se mandó), y el título lo dice.
 */
export function fallaDeRed(enLinea: boolean, esPedido = false, restaurado: { hora: string; total: string } | null = null): FallaDeCobro {
  const cosa = esPedido ? "el pedido" : "la venta";
  const boton = `«${etiquetaDeReintento(esPedido)}»`;
  // Un pedido sin cobrar no mueve plata: lo que se evita es que quede dos veces en la bandeja.
  const garantia = esPedido
    ? `si ${cosa} ya se había grabado, no se registra dos veces`
    : `si ${cosa} ya se había grabado, no se cobra dos veces`;
  return {
    titulo: restaurado
      ? `Quedó ${esPedido ? "un pedido" : "un cobro"} sin confirmar: ${restaurado.total}, de las ${restaurado.hora}. No sabemos si ${cosa} se grabó.`
      : `Se cortó la conexión y no sabemos si ${cosa} se grabó.`,
    comoSeguir: enLinea
      ? `Lo que cargaste sigue acá. Tocá ${boton}: ${garantia}.`
      : `Lo que cargaste sigue acá. Cuando vuelva la señal, tocá ${boton}: ${garantia}.`,
    reintentar: true,
  };
}

/**
 * El servidor contestó que no. Su texto ya dice qué pasó y qué hacer ("Sin stock suficiente de
 * Vacío…", "El día está cerrado…"): se muestra entero. No es para reintentar igual: es para
 * corregir lo cargado y cobrar.
 */
export function rechazoDelServidor(error: string, esPedido = false, trasCorte = false): FallaDeCobro {
  if (trasCorte) {
    // Hubo antes un envío sin respuesta con esta misma venta. El servidor puede rechazar ANTES de
    // mirar la clave (día cerrado, medio inválido: createOrder valida primero), así que este "no"
    // no prueba que la cortada no se haya grabado. No se afirma lo que no se sabe.
    const cosa = esPedido ? "el pedido" : "la venta";
    const donde = esPedido ? "Pedidos para preparar" : "Ventas del día";
    return {
      titulo: `No se aceptó el reintento, y no sabemos si ${cosa} cortada se grabó.`,
      comoSeguir: `${error.trim() || "Revisá lo cargado."} Antes de volver a intentar, fijate si está en ${donde}.`,
      reintentar: false,
    };
  }
  return {
    titulo: esPedido ? "El pedido no se registró." : "La venta no se cobró.",
    comoSeguir: error.trim() || "Revisá lo cargado y volvé a intentar.",
    reintentar: false,
  };
}

/**
 * La clave con la que viaja ESTE cobro: la que ya tenía el ticket (un reintento es la misma
 * venta) o una nueva si el ticket todavía no intentó cobrarse.
 */
export function claveParaCobrar(actual: string, nueva: () => string): string {
  return actual || nueva();
}

// ── Si después del corte se cambió la venta ─────────────────────────────────────────────────
//
// El reintento viaja con la MISMA clave, y si la venta cortada sí se había grabado el servidor
// contesta "ya estaba registrada" SIN mirar lo que llega (createOrder, A-1). Si en el medio el
// cajero sumó un corte, cambió el medio o hizo un descuento, cobraría lo nuevo y en el sistema
// quedaría lo viejo: la caja descuadrada y el stock del corte agregado sin mover. Por eso el
// reintento sólo se ofrece mientras lo cargado sea lo MISMO que se mandó; si cambió, se frena y
// se pide decidir (volver a dejarlo como estaba, o declarar que es otra venta con otra clave).

/**
 * Lo que define un cobro, en una cadena comparable: TODO lo que el servidor compara con lo
 * grabado (`diferenciasConLoGrabado`, reintento-de-venta.ts). La plata y el stock (líneas, medio,
 * total), a QUIÉN (teléfono y nombre: una venta a cuenta es deuda de alguien), CÓMO se descontó
 * (cupón o descuento a mano: un 10 % a mano del mismo monto que un cupón no es el mismo cobro,
 * el cupón gasta un uso) y, en un pedido, la entrega.
 */
export function firmaDelCobro(v: {
  lineas: readonly { productId: string; cantidad: number }[];
  manuales: readonly { nombre: string; importe: number }[];
  /** El medio, o "A_CUENTA" si queda a cuenta; "" si todavía no se eligió. */
  medio: string;
  total: number;
  esPedido: boolean;
  cliente: { telefono: string; nombre: string };
  /** El código del cupón aplicado (o `null`) y el descuento en pesos. */
  descuento: { cupon: string | null; monto: number };
  /** Sólo en un pedido; en la venta, `null`. `horario` tal cual lo da el campo. */
  entrega: { tipo: string; direccion: string; horario: string; nota: string } | null;
}): string {
  const texto = (s: string) => s.trim().replace(/\s+/g, " ");
  return JSON.stringify([
    v.esPedido ? "pedido" : "venta",
    v.lineas.map((l) => [l.productId, l.cantidad]),
    v.manuales.map((m) => [m.nombre.trim().toLowerCase(), m.importe]),
    v.medio,
    v.total,
    [v.cliente.telefono.replace(/\D/g, ""), texto(v.cliente.nombre).toLowerCase()],
    [v.descuento.cupon ?? "", v.descuento.monto],
    v.entrega ? [v.entrega.tipo, texto(v.entrega.direccion), v.entrega.horario, texto(v.entrega.nota)] : null,
  ]);
}

/** ¿Lo cargado ahora es lo mismo que se mandó cuando se cortó? Si no, no se reintenta así. */
export function cambioDespuesDelCorte(firmaMandada: string, firmaActual: string): boolean {
  return firmaMandada !== firmaActual;
}

/**
 * Qué se dice cuando la venta cortada se cambió antes de reintentar. `totalMandado` es el total
 * de la que se cortó, ya escrito en pesos. No es para reintentar: el botón queda frenado hasta que
 * el cajero la deje como estaba (vuelve «Reintentar») o toque «Es otra venta».
 */
export function avisoDeCambioDespuesDelCorte(totalMandado: string, esPedido = false): FallaDeCobro {
  const cosa = esPedido ? "El pedido" : "La venta";
  const donde = esPedido ? "Pedidos para preparar" : "Ventas del día";
  const boton = `«${etiquetaDeOtraVenta(esPedido)}»`;
  return {
    titulo: `Cambiaste ${esPedido ? "el pedido" : "la venta"} después del corte.`,
    comoSeguir:
      `${cosa} que se cortó era de ${totalMandado} y puede haberse grabado. Fijate en ${donde}: si está, ` +
      `dejá acá sólo lo que falta y tocá ${boton}; si no está, tocá ${boton} con todo. ` +
      `Si lo dejás como estaba, se reintenta ${esPedido ? "el mismo" : "la misma"}.`,
    reintentar: false,
  };
}

/** El botón que declara que lo cargado es otra venta (viaja con otra clave). */
export function etiquetaDeOtraVenta(esPedido = false): string {
  return esPedido ? "Es otro pedido" : "Es otra venta";
}

// ── Lo que se mandó y no tuvo respuesta ────────────────────────────────────────────────────
//
// Se recuerda APARTE de la última falla: la falla cambia con cada intento (un reintento sin señal
// la pasa a "sin señal", un rechazo a "rechazo"), pero la duda de si la cortada se grabó no se va
// hasta que el ticket se limpie (cobro bueno) o el cajero declare que es otra venta. Si se guardara
// sólo con la falla "red", el reintento sin señal la borraba: se podía sumar un corte, el botón
// ofrecía «Reintentar cobro» con el total nuevo y el servidor devolvía la cortada ("ya estaba
// registrada") — el corte sumado quedaba cobrado sin venta ni stock.

/**
 * Lo que viajó en un envío que no tuvo respuesta: su firma, su total, cuándo salió (ISO) y si se
 * trajo de antes de recargar la pantalla (`restaurado`).
 */
export type EnvioSinRespuesta = { firma: string; total: number; desde?: string; restaurado?: boolean };

/**
 * Otro envío sin respuesta con la misma clave: se queda el PRIMERO (es el que puede haberse
 * grabado; un reintento sólo sale si lo cargado es igual, así que no hay otro distinto que guardar).
 */
export function recordarEnvioSinRespuesta(previo: EnvioSinRespuesta | null, este: EnvioSinRespuesta): EnvioSinRespuesta {
  return previo ?? este;
}

/**
 * Qué se le dice al cajero, con todo junto: la última falla, si hay un envío sin respuesta (y si
 * lo cargado cambió desde entonces) y la señal de AHORA.
 *   · Cambió lo cargado después de un envío sin respuesta → se frena, pase lo que pase después.
 *   · Mientras haya un envío sin respuesta, nunca se dice "no se cobró": se dice que no se sabe.
 *   · Sin envío sin respuesta, "sin señal" es seguro que no salió.
 */
export function avisoDelCobro(e: {
  falla: { tipo: "sin-senal" } | { tipo: "red" } | { tipo: "rechazo"; error: string } | null;
  /** `restaurado`: la hora en que salió el envío en duda que quedó de antes de recargar. */
  sinRespuesta: { cambio: boolean; totalMandado: string; restaurado?: string | null } | null;
  enLinea: boolean;
  esPedido?: boolean;
}): FallaDeCobro | null {
  const esPedido = e.esPedido ?? false;
  if (e.sinRespuesta?.cambio) return avisoDeCambioDespuesDelCorte(e.sinRespuesta.totalMandado, esPedido);
  if (e.falla?.tipo === "rechazo") return rechazoDelServidor(e.falla.error, esPedido, e.sinRespuesta !== null);
  if (e.sinRespuesta) {
    const r = e.sinRespuesta.restaurado;
    return fallaDeRed(e.enLinea, esPedido, r ? { hora: r, total: e.sinRespuesta.totalMandado } : null);
  }
  if (e.falla?.tipo === "sin-senal") return e.enLinea ? volvioLaSenal(esPedido) : antesDeCobrar(false, esPedido);
  // "red" sin envío recordado no pasa (se recuerdan juntos); si pasara, se dice lo prudente.
  if (e.falla?.tipo === "red") return fallaDeRed(e.enLinea, esPedido);
  return null;
}

// ── Después de un rechazo de negocio ───────────────────────────────────────────────────────

/**
 * ¿Se estrena clave después de un rechazo del servidor? Sí, si no hay ningún envío en duda con
 * la clave actual. Por qué es seguro: un rechazo de negocio (`RechazoDeDominio`, o los "no"
 * explícitos de `createOrder`) sale ANTES de escribir o dentro de la transacción que se deshace;
 * los errores que no prueban eso vuelven como `sin-confirmar`, no como rechazo
 * (`motivoDelRechazoDelAlta`, order-core.ts). Si ningún envío anterior quedó sin respuesta, con
 * esa clave no hay nada grabado, y lo que el cajero corrija es un envío nuevo: con clave nueva,
 * el servidor no lo compara contra una venta que no existe. Si hay un envío en duda, la clave
 * se QUEDA: es la única forma de que el reintento encuentre la cortada si se grabó.
 */
export function renovarClaveTrasRechazo(hayEnvioEnDuda: boolean): boolean {
  return !hayEnvioEnDuda;
}

// ── La venta ya estaba grabada y lo que llegó no es lo mismo ────────────────────────────────

/** Las dos salidas de «ya grabada»: la etiqueta del botón que cobra lo que falta como otra. */
export function etiquetaDeCobrarLoQueFalta(g: Pick<VentaYaGrabada, "anulada" | "esPedido">): string {
  if (g.anulada) return g.esPedido ? "Registrarlo como otro pedido" : "Cobrarla como otra venta";
  return g.esPedido ? "Registrar lo que falta como otro pedido" : "Cobrar lo que falta como otra venta";
}

/** "Ver la venta #42" / "Ver el pedido #42". */
export function etiquetaDeVerGrabada(g: Pick<VentaYaGrabada, "code" | "esPedido">): string {
  return g.esPedido ? `Ver el pedido #${g.code}` : `Ver la venta #${g.code}`;
}

/**
 * Qué se dice cuando el servidor contesta «ya-grabada-distinta»: cuál es la que quedó (#N, total,
 * cómo, cliente; si está anulada, se dice), qué NO se registró, y cómo seguir. No es para
 * reintentar: lo cargado no se va a grabar con esta clave.
 */
export function avisoDeYaGrabada(g: VentaYaGrabada): FallaDeCobro {
  const donde = g.esPedido ? "Pedidos para preparar" : "Ventas del día";
  const falta = `«${etiquetaDeCobrarLoQueFalta(g)}»`;
  const comoSeguir = g.anulada
    ? `${detalleDeYaGrabada(g)} Si hay que ${g.esPedido ? "registrarlo" : "cobrarla"}, tocá ${falta}.`
    : `${detalleDeYaGrabada(g)} Si falta ${g.esPedido ? "registrar" : "cobrar"} algo, dejá acá sólo eso y tocá ${falta}. ` +
      `Si la #${g.code} quedó mal (otro cliente, otro medio), anulala en ${donde} y cargala de nuevo.`;
  return { titulo: tituloDeYaGrabada(g), comoSeguir, reintentar: false };
}

// ── La duda sobrevive a recargar la pantalla ───────────────────────────────────────────────
//
// El envío en duda vivía sólo en la memoria de la pantalla: recargar, ir a otra pantalla y
// volver, o que el celular descarte la pestaña al ir a la app de Mercado Pago lo borraba, y el
// cajero cargaba la misma venta con otra clave: un cobro, dos ventas. Ahora se guarda en el
// `sessionStorage` de la pestaña, por negocio: la clave, la firma, el total y lo cargado mínimo
// para volver a mostrarlo. Se borra cuando la duda se resuelve (cobro confirmado, «ya grabada»,
// «Es otra venta», limpiar). Todo acceso al almacén va con try/catch: en modo privado, con el
// almacén lleno o bloqueado, la pantalla sigue como antes (la duda vive en memoria).

/** Lo cargado, lo justo para volver a mostrarlo igual (la firma se recalcula de acá). */
export type CargadoDelCobro = {
  esPedido: boolean;
  lineas: { productId: string; qtyText: string }[];
  manuales: { nombre: string; importeText: string; motivo: string }[];
  paid: boolean;
  medio: string;
  aCuenta: boolean;
  conCliente: boolean;
  telefono: string;
  nombre: string;
  /** La ficha se había encontrado (a cuenta la exige). */
  fichaEncontrada: boolean;
  descuento: {
    abierto: boolean;
    tipo: "porcentaje" | "monto" | "cupon";
    texto: string;
    cupon: { codigo: string; tipo: string; valor: number } | null;
    cuponTexto: string;
  };
  entrega: { tipo: "PICKUP" | "DELIVERY"; horario: string; direccion: string; nota: string };
};

export type CobroSinConfirmar = {
  v: 1;
  clave: string;
  firma: string;
  total: number;
  /** ISO: cuándo salió el envío. */
  desde: string;
  cargado: CargadoDelCobro;
};

/** Lo mínimo del `Storage` del navegador que se usa (se inyecta en los tests). */
export type AlmacenDeSesion = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** El `sessionStorage` de la pestaña, o `null` si no se puede usar (tirar al leerlo es posible). */
export function almacenDeSesion(): AlmacenDeSesion | null {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** La clave del almacén, una por negocio (el mismo navegador puede atender dos). */
export function claveDelAlmacen(negocio: string): string {
  return `gsg:vender:cobro-sin-confirmar:${negocio}`;
}

export function guardarCobroSinConfirmar(almacen: AlmacenDeSesion | null, negocio: string, c: CobroSinConfirmar): boolean {
  if (!almacen) return false;
  try {
    almacen.setItem(claveDelAlmacen(negocio), JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

export function borrarCobroSinConfirmar(almacen: AlmacenDeSesion | null, negocio: string): void {
  if (!almacen) return;
  try {
    almacen.removeItem(claveDelAlmacen(negocio));
  } catch {
    // sin almacén: no hay nada que borrar que se pueda leer después
  }
}

const esTexto = (x: unknown): x is string => typeof x === "string";
const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * La duda guardada de este negocio, o `null` si no hay, o si lo guardado no se entiende (otra
 * versión, a medio escribir, tocado a mano): una duda ilegible no se inventa.
 */
export function leerCobroSinConfirmar(almacen: AlmacenDeSesion | null, negocio: string): CobroSinConfirmar | null {
  if (!almacen) return null;
  let crudo: string | null;
  try {
    crudo = almacen.getItem(claveDelAlmacen(negocio));
  } catch {
    return null;
  }
  if (!crudo) return null;
  try {
    const c = JSON.parse(crudo) as Partial<CobroSinConfirmar> | null;
    const k = c?.cargado as Partial<CargadoDelCobro> | undefined;
    if (!c || c.v !== 1 || !esTexto(c.clave) || !c.clave || !esTexto(c.firma) || !esNumero(c.total) || !esTexto(c.desde)) return null;
    if (!k || typeof k.esPedido !== "boolean" || !Array.isArray(k.lineas) || !Array.isArray(k.manuales)) return null;
    if (!k.lineas.every((l) => l && esTexto(l.productId) && esTexto(l.qtyText))) return null;
    if (!k.manuales.every((m) => m && esTexto(m.nombre) && esTexto(m.importeText) && esTexto(m.motivo))) return null;
    if (!esTexto(k.medio) || !esTexto(k.telefono) || !esTexto(k.nombre) || !k.descuento || !k.entrega) return null;
    return c as CobroSinConfirmar;
  } catch {
    return null;
  }
}

/** La hora en que salió el envío en duda, para el aviso ("13:15"). */
export function horaDelEnvio(desde: string | undefined): string | null {
  if (!desde) return null;
  const d = new Date(desde);
  return Number.isNaN(d.getTime()) ? null : fmtTime(d);
}
