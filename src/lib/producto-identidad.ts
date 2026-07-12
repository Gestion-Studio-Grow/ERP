// ============================================================================
// IDENTIDAD POR PRODUCTO — un motor, tres productos, SIN forks (ADR-054/055).
// ============================================================================
//
// EL PROBLEMA: Comerciante, Contador y Facturita entraban al MISMO shell genérico
// "Mi negocio" con la MISMA navegación de 17 ítems y el MISMO login neutro. Los tres
// se percibían como el mismo backoffice. Este módulo declara la IDENTIDAD de cada
// producto y la DERIVA del tenant (blueprint + set de módulos) — nunca por código
// distinto ni por un fork: el "producto" es una lectura del dato maestro del tenant.
//
// DERIVACIÓN (pura, sin DB — testeable):
//   - `facturita`  ⇐ blueprintId === "facturita" (empaquetado liviano, ADR-076).
//   - `contador`   ⇐ el tenant tiene el módulo `cartera` ASIGNADO (ADR-055): solo los
//                     estudios contables lo llevan, así que es señal inequívoca.
//   - `comerciante`⇐ blueprintId === "generico": el empaquetado de facturación desde
//                     banco/MP corre sobre el blueprint genérico (no es un vertical).
//   - `vertical`   ⇐ cualquier otro blueprint (servicios, carniceria, retail, agenda,
//                     oficios, gastronomia…): los tenants ERP tradicionales
//                     (chestetica, magra, adosmanos, shinevelas). Comportamiento LEGADO
//                     intacto — este módulo NO cambia nada para ellos.
//
// SUPUESTO ANOTADO (provisional a confirmar): hoy el blueprint `generico` está
// reservado al producto Comerciante. Es también el FALLBACK del selector de rubro
// (blueprints/index.ts) — si algún día un vertical genérico real cae en `generico`, se
// lo reclasificaría con un rubro propio o se movería el fallback, para no colapsarlo en
// la experiencia de un producto de facturación. Los verticales vivos NO usan `generico`.
//
// Este es un LEAF client-safe: solo tipos y datos, cero dependencias de servidor
// (Prisma/next). La resolución con DB vive en `@/lib/producto` (server).

// `import type` — se borra en compilación, así este leaf no arrastra Prisma/pg al bundle.
import type { AccentPreset } from "./branding";

/** Los tres productos de la suite de facturación + el ERP vertical tradicional. */
export type Producto = "comerciante" | "contador" | "facturita" | "vertical";

/** Productos con identidad propia (todo menos el ERP vertical, que conserva su marca de tenant). */
export type ProductoConMarca = Exclude<Producto, "vertical">;

/** Lo mínimo del tenant para derivar el producto — así se testea sin DB ni request. */
export type TenantProductoInput = {
  blueprintId: string | null;
  modules: readonly string[];
};

/**
 * IDENTIDAD declarada de un producto: cómo se llama, cómo se ve y a dónde entra.
 * Es DATO (no componentes): la consumen el login, el shell y el ruteo post-login.
 */
export type ProductoIdentidad = {
  producto: ProductoConMarca;
  /** Nombre visible del producto (reemplaza el "Mi negocio" genérico en su login/shell). */
  nombre: string;
  /** Monograma de respaldo (glifo sobre el acento) cuando no hay logo real del tenant. */
  monograma: string;
  /** Acento por defecto del producto; el color elegido por el tenant (team-accent) SIEMPRE gana. */
  acento: AccentPreset;
  /** Frase corta de identidad (primera impresión del login). */
  tagline: string;
  /** Casa del producto: a dónde entra el usuario después de loguearse. */
  home: string;
  /** Copy propio del login (que "corresponda al producto", no genérico). */
  login: { eyebrow: string; titulo: string; subtitulo: string };
  /**
   * Prefijos de ruta que el producto POSEE. Se usan para el ruteo post-login (honrar el
   * `next` solo si cae en su área) y como base del gating por producto.
   */
  areas: string[];
};

// Identidades declaradas. Acentos DISTINTOS por producto (azul/verde/ámbar) para que,
// sin color de equipo elegido, los tres se vean de familias distintas de entrada.
const IDENTIDADES: Record<ProductoConMarca, ProductoIdentidad> = {
  comerciante: {
    producto: "comerciante",
    nombre: "Comerciante",
    monograma: "C",
    acento: "azul",
    tagline: "Tu facturación, en piloto automático.",
    home: "/admin",
    login: {
      eyebrow: "Comerciante",
      titulo: "Entrá a tu panel",
      subtitulo: "Lo que cobrás por el banco y por Mercado Pago se factura solo.",
    },
    areas: ["/admin"],
  },
  contador: {
    producto: "contador",
    nombre: "Contador",
    monograma: "Co",
    acento: "verde",
    tagline: "La facturación de todos tus clientes, en un solo lugar.",
    home: "/contador",
    login: {
      eyebrow: "Estudio contable",
      titulo: "Entrá a tu estudio",
      subtitulo: "Tu cartera de clientes, cada uno con su facturación al día.",
    },
    areas: ["/contador"],
  },
  facturita: {
    producto: "facturita",
    nombre: "Facturita",
    monograma: "F",
    acento: "ambar",
    tagline: "Emití tu factura en tres clics, con validez de ARCA.",
    home: "/facturita/app",
    login: {
      eyebrow: "Facturita",
      titulo: "Ingresá a facturar",
      subtitulo: "Tu emisor de facturas, simple y al día.",
    },
    areas: ["/facturita/app"],
  },
};

/**
 * Deriva el producto del tenant a partir de su dato maestro (blueprint + módulos).
 * PURA y testeable. Orden importa: facturita (blueprint explícito) → contador (módulo
 * cartera) → comerciante (blueprint genérico) → vertical (todo lo demás).
 */
export function derivarProducto(t: TenantProductoInput): Producto {
  if (t.blueprintId === "facturita") return "facturita";
  if (t.modules.includes("cartera")) return "contador";
  if (t.blueprintId === "generico") return "comerciante";
  return "vertical";
}

/** Identidad del producto, o `null` para el ERP vertical (que conserva su marca de tenant). */
export function identidadProducto(p: Producto): ProductoIdentidad | null {
  return p === "vertical" ? null : IDENTIDADES[p];
}

/** Casa (ruta de entrada post-login) del producto. Vertical → el `/admin` de siempre. */
export function productoHome(p: Producto): string {
  return identidadProducto(p)?.home ?? "/admin";
}

/**
 * ¿El producto es de FACTURACIÓN con TIENDA de módulos (ADR-089)? De Comerciante para
 * arriba: Comerciante, Contador y —a futuro— Pyme. Facturita (commodity de una pantalla) y
 * los verticales tradicionales quedan FUERA → conservan su comportamiento legado, byte-
 * idéntico. Es la señal ÚNICA de "encendido por producto": foco de nav + gating por-URL en
 * `/admin` (Comerciante; Contador y Facturita ya se van por su redirect de casa) y la
 * vidriera agrupada de `/admin/modulos`. Se enciende por identidad de producto, NO por el
 * flag global `MODULE_REGISTRY_ENABLED` (que tocaría a los verticales).
 */
export function productoUsaTienda(p: Producto): boolean {
  // Nota: "pyme" todavía no es un valor de `Producto` (no hay derivación); cuando se sume,
  // entra acá sin más cambios. Facturita y vertical → false (legado intacto).
  return p === "comerciante" || p === "contador";
}

/** Normaliza un path (saca query/hash y colapsa trailing slash) para comparar áreas. */
function normalizarPath(path: string): string {
  const sinQuery = path.split(/[?#]/, 1)[0];
  if (sinQuery.length > 1 && sinQuery.endsWith("/")) return sinQuery.slice(0, -1);
  return sinQuery;
}

/**
 * ¿La ruta `path` pertenece al ÁREA del producto? Base del ruteo/gating por producto:
 * el login honra el `next` solo si cae acá; una URL de otro producto NO corresponde.
 * El ERP vertical posee `/admin` (comportamiento legado). Match por prefijo de segmento
 * (`/admin` cubre `/admin/clientes` pero no `/administracion`).
 */
export function rutaPermitidaParaProducto(p: Producto, path: string): boolean {
  const areas = identidadProducto(p)?.areas ?? ["/admin"];
  const target = normalizarPath(path);
  return areas.some((area) => target === area || target.startsWith(area + "/"));
}
