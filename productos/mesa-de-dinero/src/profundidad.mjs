/**
 * Profundidad — VWAP ejecutable por libro de órdenes (GSG Mesa de Dinero)
 *
 * El error #1 del arbitraje amateur: mirar el mejor bid/ask como si tuviera tamaño
 * infinito. Acá se BARRE el libro nivel por nivel y se calcula el precio promedio
 * ponderado por volumen (VWAP) que realmente conseguirías para un nocional dado,
 * más el slippage contra el top-of-book.
 *
 * Convención de libro normalizado:
 *   { bids: [[precio, cantidad], ...] (desc), asks: [[precio, cantidad], ...] (asc), ts, fuente }
 *   precio en QUOTE por unidad de BASE; cantidad en BASE.
 */

/** Ordena y castea un libro crudo a números. Idempotente. */
export function normalizarLibro(libro) {
  const num = (n) => [Number(n[0]), Number(n[1])];
  const bids = (libro.bids ?? []).map(num).filter(([p, q]) => p > 0 && q > 0).sort((a, b) => b[0] - a[0]);
  const asks = (libro.asks ?? []).map(num).filter(([p, q]) => p > 0 && q > 0).sort((a, b) => a[0] - b[0]);
  return { ...libro, bids, asks };
}

export function mejorBid(libro) { return libro.bids[0]?.[0] ?? NaN; }
export function mejorAsk(libro) { return libro.asks[0]?.[0] ?? NaN; }
export function precioMedio(libro) { return (mejorBid(libro) + mejorAsk(libro)) / 2; }

/**
 * Barre niveles hasta cubrir la cantidad pedida.
 *   - { quote: X } → gasta X de quote (típico: comprar contra asks con USD).
 *   - { base: Y }  → mueve Y de base (típico: vender base contra bids, o comprar Y base contra asks).
 *
 * Devuelve:
 *   precioPromedio  VWAP conseguido
 *   base, quote     cantidades efectivamente cruzadas
 *   completo        false si el libro no alcanzó (se ejecutó lo que había)
 *   topOfBook       precio del primer nivel
 *   slippage        |VWAP − top| / top  (fracción, siempre ≥ 0)
 *   nivelesUsados   cuántos niveles se consumieron
 */
export function barrer(niveles, pedido) {
  if (!Array.isArray(niveles) || niveles.length === 0) {
    return { precioPromedio: NaN, base: 0, quote: 0, completo: false, topOfBook: NaN, slippage: NaN, nivelesUsados: 0 };
  }
  const porQuote = pedido.quote !== undefined;
  let restante = porQuote ? pedido.quote : pedido.base;
  if (!(restante > 0)) throw new Error('barrer: la cantidad pedida debe ser > 0');

  const topOfBook = niveles[0][0];
  let base = 0, quote = 0, usados = 0;

  for (const [precio, cantidad] of niveles) {
    if (restante <= 0) break;
    usados++;
    const disponibleQuote = precio * cantidad;
    if (porQuote) {
      const tomoQuote = Math.min(restante, disponibleQuote);
      quote += tomoQuote;
      base += tomoQuote / precio;
      restante -= tomoQuote;
    } else {
      const tomoBase = Math.min(restante, cantidad);
      base += tomoBase;
      quote += tomoBase * precio;
      restante -= tomoBase;
    }
  }

  const completo = restante <= 1e-12;
  const precioPromedio = base > 0 ? quote / base : NaN;
  const slippage = Number.isFinite(precioPromedio) ? Math.abs(precioPromedio - topOfBook) / topOfBook : NaN;
  return { precioPromedio, base, quote, completo, topOfBook, slippage, nivelesUsados: usados };
}

/** Comprar BASE gastando `nocionalQuote` contra los asks del libro. */
export function comprarPorNocional(libro, nocionalQuote) {
  return barrer(libro.asks, { quote: nocionalQuote });
}

/** Vender `cantidadBase` contra los bids del libro. */
export function venderCantidad(libro, cantidadBase) {
  return barrer(libro.bids, { base: cantidadBase });
}

/** Comprar `cantidadBase` contra los asks del libro. */
export function comprarCantidad(libro, cantidadBase) {
  return barrer(libro.asks, { base: cantidadBase });
}

/**
 * Spread cruzado: comprar en `libroCompra` (asks) y vender en `libroVenta` (bids)
 * para un nocional en quote. Devuelve top-of-book vs ejecutable, lado a lado.
 *
 * spread = (precioVenta − precioCompra) / precioCompra   (fracción; >0 = a favor)
 */
export function spreadEjecutable(libroCompra, libroVenta, nocionalQuote) {
  const topCompra = mejorAsk(libroCompra);
  const topVenta = mejorBid(libroVenta);
  const spreadTop = (topVenta - topCompra) / topCompra;

  const compra = comprarPorNocional(libroCompra, nocionalQuote);
  const venta = compra.base > 0 ? venderCantidad(libroVenta, compra.base) : null;
  const completo = compra.completo && !!venta?.completo;
  const spreadEjec = venta && venta.base > 0
    ? (venta.precioPromedio - compra.precioPromedio) / compra.precioPromedio
    : NaN;

  return {
    nocional: nocionalQuote,
    top: { compra: topCompra, venta: topVenta, spread: spreadTop },
    ejecutable: {
      compra: compra.precioPromedio,
      venta: venta?.precioPromedio ?? NaN,
      spread: spreadEjec,
      completo,
      baseCruzada: Math.min(compra.base, venta?.base ?? 0),
    },
    slippage: {
      compra: compra.slippage,
      venta: venta?.slippage ?? NaN,
      total: (compra.slippage || 0) + (venta?.slippage || 0),
    },
    /** cuánto se derrumbó el spread por profundidad (top − ejecutable) */
    derrumbe: Number.isFinite(spreadEjec) ? spreadTop - spreadEjec : NaN,
  };
}

/**
 * Curva "spread ejecutable vs nocional": la evidencia visual de cómo el spread se
 * derrumba cuando sube el tamaño. Lo que se grafica en la consola.
 */
export function curvaSpread(libroCompra, libroVenta, nocionales = NOCIONALES_CURVA) {
  return nocionales.map((n) => {
    const r = spreadEjecutable(libroCompra, libroVenta, n);
    return {
      nocional: n,
      spreadTop: r.top.spread,
      spreadEjecutable: r.ejecutable.spread,
      slippage: r.slippage.total,
      completo: r.ejecutable.completo,
    };
  });
}

export const NOCIONALES_CURVA = Object.freeze([100, 500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000]);

/** Liquidez total (en quote) disponible en un lado del libro. */
export function liquidezQuote(niveles) {
  return niveles.reduce((acc, [p, q]) => acc + p * q, 0);
}
