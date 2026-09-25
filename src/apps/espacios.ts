// ============================================================================
// ESPACIOS — cómo se ordenan las apps en el Inicio, según el trabajo de cada persona.
// ============================================================================
//
// Un espacio NO es un permiso ni un módulo: es un estante. La app declara en qué estante
// va (`AppDescriptor.espacio`) y el Inicio arma una sección por espacio con las apps que
// esa persona ve. Por eso un espacio aparece sólo si el usuario ve al menos una app de él:
// RECEPTION no ve "Finanzas" porque no ve ninguna app de finanzas, no porque el espacio
// tenga una regla propia. Si hiciera falta una regla por espacio, iría en la app.
//
// Reemplaza a los 5 grupos de la barra (`NavGroupId`, src/modules/nav-groups.ts), que
// siguen vivos sólo para el menú de hoy hasta la limpieza posterior a la ola 4.
//
// Dato puro: lo importan el servidor, el cliente y los tests.

/** Los estantes del Inicio. El orden de `ESPACIOS` es el orden en pantalla. */
export type EspacioId =
  | "mostrador"
  | "caja"
  | "clientes"
  | "precios"
  | "stock"
  | "finanzas"
  | "administracion"
  | "locales"
  | "contador"
  | "plataforma";

export interface EspacioMeta {
  id: EspacioId;
  /** Nombre en pantalla. */
  nombre: string;
  /**
   * Nombre en un negocio de SERVICIOS (turnos), si cambia. Una estética no tiene
   * "Mostrador": tiene "Recepción". Es la misma sección con las mismas apps.
   */
  nombreEnServicios?: string;
  /**
   * ¿Se pinta como sección del Inicio? `plataforma` no (son el propio Inicio, el buscador
   * y la pantalla de "App no disponible"); `contador` tampoco, porque el estudio contable
   * trabaja en su propia consola (/contador), no en el Inicio de un negocio.
   */
  enInicio: boolean;
  /**
   * Orden de las apps DENTRO del espacio, decidido de antemano para todas las olas (así
   * un frente que suma una app no tiene que tocar este archivo ni pelear el orden con
   * otro). Una app registrada que no figure acá va al final de su espacio, en el orden del
   * registro: no desaparece. No decide visibilidad: sólo el orden.
   */
  apps: readonly string[];
}

export const ESPACIOS: readonly EspacioMeta[] = [
  {
    id: "mostrador",
    nombre: "Mostrador",
    nombreEnServicios: "Recepción",
    enInicio: true,
    apps: ["vender", "pedidos", "ventas-del-dia", "agenda", "confirmar-manana", "lista-de-espera", "tienda-online", "devoluciones-y-cambios"],
  },
  { id: "caja", nombre: "Caja", enInicio: true, apps: ["caja-del-dia", "cierre-del-dia", "libro-de-caja"] },
  {
    id: "clientes",
    nombre: "Clientes",
    enInicio: true,
    apps: ["clientes", "para-contactar-hoy", "clientas-por-recuperar", "unificar-fichas", "campanias", "recordatorios", "resenas"],
  },
  {
    id: "precios",
    nombre: "Catálogo y precios",
    enInicio: true,
    apps: ["catalogo", "actualizar-precios", "etiquetas-de-precio", "promociones", "listas-de-precio"],
  },
  {
    id: "stock",
    nombre: "Stock y compras",
    enInicio: true,
    apps: [
      "inventario", "movimientos", "recuento", "mermas", "recibir-mercaderia", "proveedores", "sugerido-de-compra",
      "devoluciones-a-proveedor", "lotes-y-vencimientos", "despiece", "pedidos-a-proveedor", "talles-y-colores",
    ],
  },
  {
    id: "finanzas",
    nombre: "Finanzas",
    enInicio: true,
    apps: [
      "facturacion", "facturacion-automatica", "cierre-del-mes", "libro-iva", "cuentas-a-cobrar", "cuentas-a-pagar",
      "reportes", "margen", "resultado-del-mes", "flujo-de-fondos", "retenciones-y-percepciones", "comisiones",
      "conciliacion", "monotributo", "datos-fiscales",
    ],
  },
  {
    id: "administracion",
    nombre: "Administración",
    enInicio: true,
    apps: ["usuarios", "auditoria", "datos-del-negocio", "apariencia"],
  },
  // Sólo en la casa de una marca con varios locales: sus apps exigen el módulo
  // `multilocal` aun con el gate apagado (`moduloDuro`), así que en un negocio suelto
  // el espacio queda vacío y no se pinta.
  {
    id: "locales",
    nombre: "Mis locales",
    enInicio: true,
    apps: [
      "mis-locales", "ventas-por-local", "cajas-de-los-locales", "stock-por-local", "catalogo-de-la-marca",
      "traslados", "recibir-traslado", "personas-de-la-red",
    ],
  },
  { id: "contador", nombre: "Estudio contable", enInicio: false, apps: ["mi-cartera"] },
  {
    id: "plataforma",
    nombre: "Plataforma",
    enInicio: false,
    apps: ["inicio", "buscador-de-apps", "app-no-disponible", "apps-fijadas", "apps-del-negocio", "armar-red-de-locales", "abrir-local"],
  },
];

const POR_ID = new Map(ESPACIOS.map((e) => [e.id, e]));

/** Metadatos de un espacio. Tira si el id no existe: es un error de programación. */
export function espacio(id: EspacioId): EspacioMeta {
  const e = POR_ID.get(id);
  if (!e) throw new Error(`Espacio desconocido: "${id}"`);
  return e;
}

/**
 * Nombre del espacio para ESTE negocio. `esMostrador` es el mismo dato que ya usa la
 * barra (`getCurrentTenantRubro().isRetail`): en un local de mostrador el primer espacio
 * es "Mostrador"; en una estética, "Recepción".
 */
export function nombreDeEspacio(id: EspacioId, { esMostrador }: { esMostrador: boolean }): string {
  const e = espacio(id);
  return !esMostrador && e.nombreEnServicios ? e.nombreEnServicios : e.nombre;
}

/** Posición del espacio en pantalla (para ordenar secciones). */
export function ordenDeEspacio(id: EspacioId): number {
  return ESPACIOS.findIndex((e) => e.id === id);
}

/**
 * Posición de una app dentro de su espacio. Una app que el espacio no nombra devuelve
 * `Infinity`: va al final (y entre varias así, el orden estable del registro decide).
 */
export function ordenDentroDelEspacio(espacioId: EspacioId, appId: string): number {
  const i = espacio(espacioId).apps.indexOf(appId);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

// ============================================================================
// LA NAVEGACIÓN — los diez espacios por objetivo (diseño v3, ARQUITECTURA §5.2).
// ============================================================================
//
// Los estantes de arriba (`ESPACIOS`) son los del Inicio de siempre y de la barra de espacios del
// piloto con la piel vieja. El diseño nuevo («Renglón», ADR-099) navega por DIEZ espacios, cada uno
// un objetivo del usuario: parte «Finanzas» (facturar, analizar y cobrar/pagar eran trabajos
// distintos) y «Stock y compras» (el trabajo del encargado y el del dueño), y pone cada deuda al
// lado de su contraparte (el fiado en Clientes, las cuentas a pagar en Compras).
//
// Es PRESENTACIÓN: no decide qué app ve cada uno (eso es `appsVisibles`, visibles.ts:212) ni dónde
// se guarda la app. Dice DÓNDE se muestra cada app que la persona ya ve. Cuando el registro mueva
// el `espacio` de sus apps a estos diez (A1 de la arquitectura, archivos compartidos de
// src/apps/catalogo), este mapa se vuelve el propio `espacio` y se borra. Hasta entonces, una app
// que no figura en ninguna lista cae en el espacio que corresponde a su estante (`DESDE_ESTANTE`):
// ninguna se pierde (lo prueba espacios-nav.test.ts con el registro real).

/** Los diez espacios de la navegación, en el orden de la pantalla. */
export type EspacioNavId =
  | "mostrador"
  | "caja"
  | "locales"
  | "clientes"
  | "precios"
  | "stock"
  | "compras"
  | "facturacion"
  | "numeros"
  | "administracion";

export interface EspacioNav {
  id: EspacioNavId;
  /** Nombre en pantalla, en castellano llano, como lo diría el dueño. */
  nombre: string;
  /** En un negocio de servicios, si cambia («Recepción»). */
  nombreEnServicios?: string;
  /** Rótulo corto para la cápsula del celular y la cabecera angosta. */
  rotulo?: string;
  /** El objetivo, en una línea (la página del espacio y la ayuda del buscador). */
  objetivo: string;
  /** Las apps, en orden (las de hoy y las planeadas, así ningún frente pelea el orden). */
  apps: readonly string[];
}

export const ESPACIOS_NAV: readonly EspacioNav[] = [
  {
    id: "mostrador",
    nombre: "Mostrador",
    nombreEnServicios: "Recepción",
    objetivo: "Atender y cobrar",
    apps: [
      "vender", "agenda", "pedidos", "ventas-del-dia", "confirmar-manana", "lista-de-espera", "vales-de-regalo",
      "paquetes-y-abonos", "devoluciones-y-cambios", "presupuestos", "envios-y-reparto", "tienda-online", "huecos-de-la-semana",
    ],
  },
  {
    id: "caja",
    nombre: "Caja",
    objetivo: "Que la plata cierre: el día, el mes, el banco",
    apps: ["caja-del-dia", "cierre-del-dia", "libro-de-caja", "cierre-del-mes", "conciliacion", "costo-de-cobrar"],
  },
  {
    id: "locales",
    nombre: "Mis locales",
    rotulo: "Locales",
    objetivo: "Ver y mover la red",
    apps: ["mis-locales", "ventas-por-local", "cajas-de-los-locales", "stock-por-local", "catalogo-de-la-marca", "traslados", "personas-de-la-red"],
  },
  {
    id: "clientes",
    nombre: "Clientes",
    objetivo: "Que vuelvan y que paguen",
    apps: [
      "clientes", "para-contactar-hoy", "cuentas-a-cobrar", "clientas-por-recuperar", "campanias", "recordatorios", "resenas",
      "unificar-fichas", "ficha-de-tratamiento",
    ],
  },
  {
    id: "precios",
    nombre: "Catálogo y precios",
    rotulo: "Catálogo",
    objetivo: "Qué vendo y a cuánto",
    apps: ["catalogo", "actualizar-precios", "etiquetas-de-precio", "promociones", "listas-de-precio", "precio-segun-como-paga", "kits-y-sets", "lista-para-compartir"],
  },
  {
    id: "stock",
    nombre: "Stock",
    objetivo: "Que no falte ni se pierda",
    apps: ["inventario", "recuento", "movimientos", "mermas", "lotes-y-vencimientos", "despiece", "talles-y-colores", "recetas-y-produccion", "heladeras"],
  },
  {
    id: "compras",
    nombre: "Compras y proveedores",
    rotulo: "Compras",
    objetivo: "Pedir, recibir y pagar",
    apps: [
      "recibir-mercaderia", "proveedores", "sugerido-de-compra", "cuentas-a-pagar", "devoluciones-a-proveedor", "recibir-traslado",
      "fechas-que-venden", "pedidos-a-proveedor",
    ],
  },
  {
    id: "facturacion",
    nombre: "Facturas e impuestos",
    rotulo: "Facturas",
    objetivo: "Emitir, declarar y no pasarse",
    apps: ["facturacion", "facturacion-automatica", "libro-iva", "retenciones-y-percepciones", "datos-fiscales", "monotributo", "vencimientos"],
  },
  {
    id: "numeros",
    nombre: "Números del negocio",
    rotulo: "Números",
    objetivo: "Saber cuánto gano y qué me conviene",
    apps: ["resultado-del-mes", "margen", "flujo-de-fondos", "reportes", "comisiones", "cuenta-con-profesionales"],
  },
  {
    id: "administracion",
    nombre: "Configuración",
    objetivo: "Dejar el negocio andando",
    apps: ["datos-del-negocio", "usuarios", "auditoria", "apariencia", "tu-plan", "integraciones", "traer-datos"],
  },
];

/**
 * El espacio de la navegación de una app que no figura en ninguna lista: el de su estante. Los
 * estantes que no se navegan (el Inicio y la consola del estudio) no tienen espacio.
 */
const DESDE_ESTANTE: Record<EspacioId, EspacioNavId | null> = {
  mostrador: "mostrador",
  caja: "caja",
  clientes: "clientes",
  precios: "precios",
  stock: "stock",
  finanzas: "numeros",
  administracion: "administracion",
  locales: "locales",
  contador: null,
  plataforma: null,
};

const NAV_POR_APP = new Map<string, EspacioNavId>(ESPACIOS_NAV.flatMap((e) => e.apps.map((a) => [a, e.id] as const)));
const NAV_POR_ID = new Map(ESPACIOS_NAV.map((e) => [e.id, e]));

/** Dónde se muestra una app en la navegación nueva. `null` = no se navega (el Inicio, la consola). */
export function espacioNavDeApp(app: { id: string; espacio: EspacioId }): EspacioNavId | null {
  if (DESDE_ESTANTE[app.espacio] === null) return null;
  return NAV_POR_APP.get(app.id) ?? DESDE_ESTANTE[app.espacio];
}

export function espacioNav(id: EspacioNavId): EspacioNav {
  const e = NAV_POR_ID.get(id);
  if (!e) throw new Error(`Espacio de la navegación desconocido: "${id}"`);
  return e;
}

/** Nombre del espacio para ESTE negocio («Recepción» en una estética). */
export function nombreDeEspacioNav(id: EspacioNavId, { esMostrador }: { esMostrador: boolean }): string {
  const e = espacioNav(id);
  return !esMostrador && e.nombreEnServicios ? e.nombreEnServicios : e.nombre;
}

/** Posición del espacio en la navegación. */
export function ordenDeEspacioNav(id: EspacioNavId): number {
  return ESPACIOS_NAV.findIndex((e) => e.id === id);
}

/** Posición de una app dentro de su espacio de la navegación (las no nombradas, al final). */
export function ordenDentroDelEspacioNav(id: EspacioNavId, appId: string): number {
  const i = espacioNav(id).apps.indexOf(appId);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/**
 * Los módulos de la localización argentina. El espacio «Facturas e impuestos» contiene EXACTAMENTE
 * las apps de estos módulos (ARQUITECTURA §7): lo vigila espacios-nav.test.ts.
 */
export const MODULOS_AR: readonly string[] = ["arca", "libros", "bancos", "impuestos-al-dia"];
