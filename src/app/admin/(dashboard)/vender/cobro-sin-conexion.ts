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
// La clave del ticket se renueva SÓLO cuando el ticket se limpia después de un cobro bueno
// (`claveParaCobrar`). Si se renovara al fallar, el reintento de una venta que sí se había
// grabado (respuesta perdida) la cobraría dos veces.

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
 * Se mandó y no volvió respuesta (se cortó la señal a mitad del cobro, o el servidor tardó
 * demasiado). `enLinea` es cómo está la conexión AHORA: el texto dice si ya se puede reintentar.
 */
export function fallaDeRed(enLinea: boolean, esPedido = false): FallaDeCobro {
  const cosa = esPedido ? "el pedido" : "la venta";
  const boton = `«${etiquetaDeReintento(esPedido)}»`;
  // Un pedido sin cobrar no mueve plata: lo que se evita es que quede dos veces en la bandeja.
  const garantia = esPedido
    ? `si ${cosa} ya se había grabado, no se registra dos veces`
    : `si ${cosa} ya se había grabado, no se cobra dos veces`;
  return {
    titulo: `Se cortó la conexión y no sabemos si ${cosa} se grabó.`,
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

/** Lo que define la plata y el stock de un cobro, en una cadena comparable. */
export function firmaDelCobro(v: {
  lineas: readonly { productId: string; cantidad: number }[];
  manuales: readonly { nombre: string; importe: number }[];
  /** El medio, o "A_CUENTA" si queda a cuenta; "" si todavía no se eligió. */
  medio: string;
  total: number;
  esPedido: boolean;
}): string {
  return JSON.stringify([
    v.esPedido ? "pedido" : "venta",
    v.lineas.map((l) => [l.productId, l.cantidad]),
    v.manuales.map((m) => [m.nombre.trim().toLowerCase(), m.importe]),
    v.medio,
    v.total,
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

/** Lo que viajó en un envío que no tuvo respuesta: su firma y su total. */
export type EnvioSinRespuesta = { firma: string; total: number };

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
  sinRespuesta: { cambio: boolean; totalMandado: string } | null;
  enLinea: boolean;
  esPedido?: boolean;
}): FallaDeCobro | null {
  const esPedido = e.esPedido ?? false;
  if (e.sinRespuesta?.cambio) return avisoDeCambioDespuesDelCorte(e.sinRespuesta.totalMandado, esPedido);
  if (e.falla?.tipo === "rechazo") return rechazoDelServidor(e.falla.error, esPedido, e.sinRespuesta !== null);
  if (e.sinRespuesta) return fallaDeRed(e.enLinea, esPedido);
  if (e.falla?.tipo === "sin-senal") return e.enLinea ? volvioLaSenal(esPedido) : antesDeCobrar(false, esPedido);
  // "red" sin envío recordado no pasa (se recuerdan juntos); si pasara, se dice lo prudente.
  if (e.falla?.tipo === "red") return fallaDeRed(e.enLinea, esPedido);
  return null;
}
