// ============================================================================
// «No encontramos esta página» (404): a dónde se vuelve, según la superficie.
// ============================================================================
//
// El 404 de Next viene en inglés y sin ningún enlace: en el panel de un negocio, en la consola del
// operador o en el panel del contador, la persona queda sin camino de vuelta. Esta decisión, pura,
// dice qué 404 se muestra a partir de la ruta pedida (header `x-pathname` que pone src/proxy.ts) y
// del interruptor «Diseño nuevo» del negocio:
//   - consola del operador: siempre el nuevo (la consola va siempre con el diseño nuevo);
//   - panel de un negocio, contador o Facturita: el nuevo SÓLO con el interruptor prendido;
//     apagado (CH hoy) → `null` = el 404 de Next de siempre, sin cambios;
//   - vidriera y el resto del sitio público: `null` (no es parte del rediseño del panel).

export type EnlaceDeVuelta = { href: string; etiqueta: string };

export type NoEncontrada = {
  superficie: "operador" | "negocio";
  enlaces: [EnlaceDeVuelta, ...EnlaceDeVuelta[]];
};

const bajo = (ruta: string, base: string) => ruta === base || ruta.startsWith(`${base}/`);

export function noEncontradaPara(ruta: string | null | undefined, nuevo: boolean): NoEncontrada | null {
  const r = ruta ?? "";
  if (bajo(r, "/operador")) {
    return { superficie: "operador", enlaces: [{ href: "/operador", etiqueta: "Volver a Negocios" }] };
  }
  if (!nuevo) return null;
  if (bajo(r, "/admin")) {
    return { superficie: "negocio", enlaces: [{ href: "/admin", etiqueta: "Volver al inicio del panel" }] };
  }
  if (bajo(r, "/contador")) {
    // Quien llega acá puede ser del estudio contable o del negocio (la dueña que abrió /contador sin
    // tener ese panel): se ofrecen los dos, el del negocio primero.
    return {
      superficie: "negocio",
      enlaces: [
        { href: "/admin", etiqueta: "Ir a tu panel" },
        { href: "/contador", etiqueta: "Ir al panel del estudio contable" },
      ],
    };
  }
  if (bajo(r, "/facturita")) {
    return { superficie: "negocio", enlaces: [{ href: "/facturita/app", etiqueta: "Volver a Facturita" }] };
  }
  return null;
}
