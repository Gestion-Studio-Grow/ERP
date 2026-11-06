// ============================================================================
// PUESTA A PUNTO — el único lugar de configuración de la facturación, con semáforo
// ============================================================================
//
// docs/facturacion/ux-v2-diseno.md §2: un checklist (Tus datos · Punto de venta · Conexión con ARCA ·
// Factura A sólo si es inscripto · Topes con la barra del mes), una cabecera «Listo para facturar» o
// «Te faltan N pasos» y un botón al primer pendiente. El mismo bloque va de banner en la lista de
// comprobantes cuando no está listo. PURA: recibe lo leído (puesta-a-punto.server.ts) y decide.

export type IdPasoPuesta = "datos" | "punto-de-venta" | "conexion" | "factura-a" | "topes";

/** listo = verde · falta y prueba = cuentan como pendientes · atencion = ámbar sin bloquear · no-aplica = gris. */
export type EstadoPasoPuesta = "listo" | "falta" | "prueba" | "atencion" | "no-aplica";

export interface PasoPuesta {
  id: IdPasoPuesta;
  titulo: string;
  estado: EstadoPasoPuesta;
  detalle: string;
  accion: { etiqueta: string; href: string } | null;
  /** Sólo en «Topes»: lo facturado en el mes contra el tope (sin tope, `limite: null`). */
  barra?: { usadas: number; limite: number | null; porcentaje: number };
}

export interface EntradaPuesta {
  cuit: string | null;
  condicionIva: string | null;
  puntoVenta: number | null;
  /** El punto de venta lo cargó el estudio contable del negocio (hay delegación). */
  puntoVentaDelContador: boolean;
  certificado: "ninguno" | "pruebas" | "produccion" | "con-problema";
  /** true = ARCA en modo de prueba para este negocio. */
  modoDePrueba: boolean;
  /** La clase de Factura A cargada (sólo cuenta para el inscripto). */
  regimenFacturaA: "A" | "A_CON_LEYENDA" | "M" | null;
  mes: { usadas: number; limite: number | null };
  /** Dónde vive la puesta a punto (los botones llevan a `${base}#paso-…`). */
  base: string;
  /** wa.me para avisarle al contador (o a nuestro equipo); null = sin número. */
  avisoAlContador?: string | null;
  /** wa.me a nuestro equipo; null = sin número cargado. */
  ayuda?: string | null;
  /** Donde se cambia de plan, si el negocio tiene uno con tope. */
  planes?: string | null;
}

export interface PuestaAPunto {
  listo: boolean;
  faltan: number;
  titulo: string;
  texto: string;
  pasos: PasoPuesta[];
  /** El botón de la cabecera: lleva al primer pendiente. null = todo listo. */
  cta: { etiqueta: string; href: string } | null;
}

const CUENTAN: ReadonlySet<EstadoPasoPuesta> = new Set(["falta", "prueba"]);

function ancla(base: string, id: IdPasoPuesta): string {
  return `${base}#paso-${id}`;
}

/** El estado de la puesta a punto. PURA. */
export function estadoDePuesta(e: EntradaPuesta): PuestaAPunto {
  const datosOk = !!e.cuit && !!e.condicionIva;
  const ayuda = (etiqueta: string) => (e.ayuda ? { etiqueta, href: e.ayuda } : null);
  const inscripto = e.condicionIva === "RESPONSABLE_INSCRIPTO";

  const datos: PasoPuesta = {
    id: "datos",
    titulo: "Tus datos",
    estado: datosOk ? "listo" : "falta",
    detalle: datosOk
      ? "CUIT y condición frente al IVA cargados, iguales a los de ARCA."
      : `Falta ${[!e.cuit && "el CUIT", !e.condicionIva && "la condición frente al IVA"].filter(Boolean).join(" y ")}. Lo carga nuestro equipo para que coincida con ARCA.`,
    accion: datosOk ? null : ayuda("Pedírselo a nuestro equipo"),
  };

  const pv: PasoPuesta = {
    id: "punto-de-venta",
    titulo: "Punto de venta",
    estado: e.puntoVenta ? "listo" : "falta",
    detalle: e.puntoVenta
      ? `Punto de venta ${e.puntoVenta}.${e.puntoVentaDelContador ? " Lo definió tu contador." : ""}`
      : "Falta el punto de venta que habilitaste en ARCA para facturar desde acá.",
    accion: e.puntoVenta ? null : ayuda("Pedírselo a nuestro equipo"),
  };

  let conexion: PasoPuesta;
  if (!datosOk || !e.puntoVenta) {
    conexion = { id: "conexion", titulo: "Conexión con ARCA", estado: "falta", detalle: "Primero hacen falta tus datos y el punto de venta.", accion: null };
  } else if (e.certificado === "produccion" && !e.modoDePrueba) {
    conexion = { id: "conexion", titulo: "Conexión con ARCA", estado: "listo", detalle: "Conectado: cada factura sale con CAE de ARCA y validez fiscal.", accion: null };
  } else if (e.certificado === "ninguno" || e.certificado === "con-problema") {
    conexion = {
      id: "conexion",
      titulo: "Conexión con ARCA",
      estado: "falta",
      detalle:
        e.certificado === "ninguno"
          ? "Falta conectar el negocio con ARCA: se hace una vez, con tu clave fiscal o con tu contador."
          : "La conexión con ARCA tiene un problema: hay que volver a cargar el certificado.",
      accion: { etiqueta: "Conectar con ARCA", href: ancla(e.base, "conexion") },
    };
  } else {
    conexion = {
      id: "conexion",
      titulo: "Conexión con ARCA",
      estado: "prueba",
      detalle: "Estás en modo de prueba: las facturas salen sin validez fiscal.",
      accion: { etiqueta: "Pasar a facturar en serio", href: ancla(e.base, "conexion") },
    };
  }

  let facturaA: PasoPuesta;
  if (!inscripto) {
    facturaA = { id: "factura-a", titulo: "Factura A", estado: "no-aplica", detalle: "Sólo para responsables inscriptos: vos hacés Factura B o C.", accion: null };
  } else if (e.regimenFacturaA === "A") {
    facturaA = { id: "factura-a", titulo: "Factura A", estado: "listo", detalle: "Lista: a inscriptos y monotributistas les sale Factura A.", accion: null };
  } else if (e.regimenFacturaA === null) {
    facturaA = {
      id: "factura-a",
      titulo: "Factura A",
      estado: "falta",
      detalle: "Falta saber qué Factura A te asignó ARCA (A común, A con leyenda o M). Mientras tanto, la B sale igual.",
      accion: e.avisoAlContador ? { etiqueta: "Avisar a mi contador", href: e.avisoAlContador } : null,
    };
  } else {
    facturaA = {
      id: "factura-a",
      titulo: "Factura A",
      estado: "atencion",
      detalle: `ARCA te asignó Factura A ${e.regimenFacturaA === "M" ? "M" : "con leyenda"}: por ahora esa se hace desde ARCA. La B sale desde acá.`,
      accion: null,
    };
  }

  const { usadas, limite } = e.mes;
  const lleno = limite != null && usadas >= limite;
  const topes: PasoPuesta = {
    id: "topes",
    titulo: "Topes",
    estado: lleno ? "falta" : limite != null && usadas >= limite - 1 ? "atencion" : "listo",
    detalle:
      limite == null
        ? `Sin tope de comprobantes. Este mes llevás ${usadas}.`
        : lleno
          ? `Este mes ya facturaste el máximo de tu plan (${limite}).`
          : `Este mes llevás ${usadas} de ${limite}.`,
    accion: lleno && e.planes ? { etiqueta: "Ver planes", href: e.planes } : null,
    barra: { usadas, limite, porcentaje: limite ? Math.min(100, Math.round((usadas / limite) * 100) /* no-es-plata: porcentaje de comprobantes usados */) : 0 },
  };

  const pasos = [datos, pv, conexion, facturaA, topes];
  const pendientes = pasos.filter((p) => CUENTAN.has(p.estado));
  const faltan = pendientes.length;
  const primero = pendientes[0] ?? null;
  return {
    listo: faltan === 0,
    faltan,
    pasos,
    titulo: faltan === 0 ? "Listo para facturar" : `Te ${faltan === 1 ? "falta 1 paso" : `faltan ${faltan} pasos`}`,
    texto:
      faltan === 0
        ? "Todo en orden: cada factura sale con CAE de ARCA."
        : primero!.estado === "prueba" && faltan === 1
          ? "Ya podés hacer facturas de prueba. Para que tengan validez fiscal, terminá la conexión con ARCA."
          : `Lo próximo: ${primero!.titulo.toLowerCase()}.`,
    cta: primero ? (primero.accion && primero.id !== "conexion" ? primero.accion : { etiqueta: primero.estado === "prueba" ? "Pasar a facturar en serio" : `Completar: ${primero.titulo.toLowerCase()}`, href: ancla(e.base, primero.id) }) : null,
  };
}
