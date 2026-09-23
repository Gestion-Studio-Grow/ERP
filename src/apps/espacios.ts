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
