// ============================================================================
// CATÁLOGO DE ÍTEMS DE NAV DEL BACKOFFICE — dato PURO, una sola fuente de verdad.
// ============================================================================
//
// `ALL_ITEMS` vivía embebido en `AdminShell.tsx` (client). Se extrajo acá para que
// DOS consumidores compartan EXACTAMENTE la misma lista sin duplicarla:
//   1. `AdminShell` (client) — pinta la navegación filtrada por rol × módulo × perfil.
//   2. El gating por-URL del producto Comerciante (server, en el layout del dashboard) —
//      mapea ruta → módulo para no dejar entrar por tecleo a un módulo que el tenant no
//      tiene asignado (ADR-054/055). Antes esa lista solo existía en el client → una URL
//      directa (/admin/turnos, /admin/caja…) evadía el ocultamiento de la nav.
//
// Client-safe: además de los TIPOS (Capability/Perfil/NavGroupId) importa DOS
// selectores PUROS y sin runtime de servidor (`visibleNavItems` de @/modules/perfil,
// `readyEnterpriseNavItems` de @/modules/nav-groups) — los necesita `menuItemsParaTenant`,
// abajo. Ninguno de los dos toca Prisma/tenant/`@/modules` (barrel), así que este archivo
// lo puede seguir importando tanto el client component como el layout server. Si algún día
// alguno deja de ser puro, se rompe el AdminShell: la regla es que acá NO entra servidor.
// (El encabezado anterior decía "SOLO importa TIPOS" — quedó viejo con esta función.)

import type { Capability, Role } from "@/lib/capabilities";
import type { Perfil } from "@/modules/perfil";
import { visibleNavItems } from "@/modules/perfil";
import type { NavGroupId } from "@/modules/nav-groups";
import { readyEnterpriseNavItems } from "@/modules/nav-groups";

// Cada ítem declara la capacidad que lo habilita; se filtra por el rol del
// usuario. Ocultar en el front es UX (ADR-017 §2.e) — la seguridad real la aplican
// los guardas server-side (`requireCapability`) en cada loader/acción.
// `module` (opcional) ata el ítem a un módulo del catálogo (src/modules): cuando el
// gating está encendido (flag), el ítem se esconde si ese módulo está apagado para el
// tenant. Los ítems SIN `module` son core/config (Inicio, Ajustes, Usuarios, la propia
// vidriera de Módulos…) y nunca se gatean por módulo — solo por rol.
// `perfilMin`/`grupo` son opcionales: los 18 ítems base no los traen (viven en el set
// Comercio y su grupo lo resuelve `NAV_ITEM_GROUPS`); los ítems Empresa
// (`ENTERPRISE_NAV_ITEMS`) sí, para gatearse por perfil y caer en su grupo.
export type ShellItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  cap: Capability;
  module?: string;
  perfilMin?: Perfil;
  grupo?: NavGroupId;
  // Eje RUBRO (Magra carnicería/retail). `retailOnly`: solo tenants retail/mostrador →
  // NO se muestra en servicios (CH byte-idéntico). `carniceriaOnly`: además exige la
  // migración cárnica aplicada y un rubro de perecederos (lotesYDespieceListos). AdminShell los filtra por
  // isRetail/carniceriaReady; el gating por-URL los trata como su `module` (catalog).
  // Ambos default undefined → los ítems base no cambian.
  retailOnly?: boolean;
  carniceriaOnly?: boolean;
  // `agendaOnly`: el ESPEJO de `retailOnly`. La pantalla sólo tiene sentido donde se
  // trabaja con TURNOS; en un mostrador es un callejón sin salida, no una pantalla vacía.
  // No es opinión: el blueprint retail lo dice ("NO incluye agenda: el retail de mostrador
  // no trabaja por turnos", src/blueprints/retail/index.ts:18) y su seeder crea SOLO
  // Products — ni un Service ni un Professional. Con eso, en un tenant retail:
  //   · /admin/espera tiene `<Select name="serviceId" required>` sin una sola opción →
  //     el formulario no se puede enviar NUNCA (espera/page.tsx:52-59);
  //   · /admin/recordatorios arma sus avisos por servicio y su alta de novedades pide un
  //     `professionalId` required, también sin opciones (recordatorios/page.tsx:55-61);
  //   · /admin/resenas no puede tener una sola fila: `Review.appointmentId` es obligatorio
  //     y único (schema.prisma:667) → sin turnos no hay reseña posible;
  //   · /admin/turnos necesita servicio + profesional para dar de alta algo.
  // Por qué un booleano nuevo y no reusar lo que hay: `module` no sirve (con el registro
  // apagado `moduleGateAllows` deja pasar todo, y prenderlo deja sin menú a beauty-spa);
  // derivarlo de `defaultModulesForBlueprint` tampoco (es el default del ALTA, no el estado
  // del tenant: se pelearía con `Tenant.modules` si el dueño enciende algo, y de paso se
  // llevaría puestas pantallas que SÍ andan en retail, como Campañas o Facturación).
  // Usa la MISMA prop `isRetail` que ya recibe el shell: cero plomería nueva.
  // ESCONDER NO ES PROHIBIR: esto es UX (ADR-017 §2.e). La ruta sigue existiendo y sigue
  // guardada por su capability server-side; acá sólo se saca de la vista de quien nunca la
  // va a poder usar.
  agendaOnly?: boolean;
  // Palabras con las que el usuario REAL busca la pantalla, más allá del rótulo:
  // "afip" para Facturación, "stock" para Inventario, "mermas" para Ajustes. Las
  // consume el buscador de la barra (`@/modules/nav-search`) y NO afectan a la
  // nav ni al gating por-URL: un alias no habilita nada, solo ayuda a encontrar
  // lo que el rol YA puede ver.
  alias?: readonly string[];
};

export const ALL_ITEMS: ShellItem[] = [
  { href: "/admin", label: "Inicio", icon: "dashboard", exact: true, cap: "dashboard:read", alias: ["tablero", "panel", "home", "resumen"] },
  { href: "/admin/turnos", label: "Agenda", icon: "agenda", cap: "agenda:read", module: "agenda", agendaOnly: true, alias: ["turnos", "reservas", "calendario", "citas"] },
  { href: "/admin/clientes", label: "Clientes", icon: "clientes", cap: "clients:read", module: "clients", alias: ["fichas", "base de clientes", "historial del cliente"] },
  { href: "/admin/espera", label: "Lista de espera", icon: "espera", cap: "waitlist:manage", module: "waitlist", agendaOnly: true, alias: ["cola", "waitlist", "anotados para un hueco"] },
  { href: "/admin/pedidos", label: "Pedidos", icon: "pedidos", cap: "orders:read", module: "pos", alias: ["ventas", "mostrador", "comandas"] },
  // LAS TRES CAJAS. Un QA de recorrido las encontró como tres ítems hermanos, planos y con
  // el MISMO ícono, y la primera es la que una persona sin explicación abre primero. Los
  // íconos ya se separaron. Lo que cambió después es QUÉ es cada una:
  //
  //   · Caja (`/admin/caja`) — la pantalla del día de quien atiende: qué entró hoy por cada
  //     medio, los movimientos del día, y los gastos o retiros sueltos. Es CORE: la tiene
  //     todo negocio que maneje plata. El TURNO DE CAJERO que vive adentro (fondo inicial,
  //     arqueo del cajón, relevo) es lo único de mostrador, y la propia pantalla lo muestra
  //     sólo si el tenant tiene cajón físico — el eje `retailOnly` acá arriba habría sacado
  //     la pantalla entera, que no es lo que sobra.
  //   · Libro (`/admin/caja/libro`) — el mes, los tres medios, con export. La vista de la
  //     dueña y de la contadora.
  //   · Cierre del día (`/admin/caja/cierre`) — el arqueo REAL de un negocio de servicios:
  //     cuenta los tres medios, congela el día y asienta la diferencia en el libro.
  //
  // Ninguna de las tres lleva `module: "pos"`. Ese módulo es "vende en mostrador", y el
  // preset de un negocio de servicios NO lo incluye (`src/blueprints/presets-meta.ts:37`,
  // "SIN pos (no es mostrador)"): el día que se encienda el registro de módulos, la dueña de
  // CH perdería del menú las tres pantallas con las que le reemplazamos la planilla. El rol
  // ya las acota con `orders:read`. Lo que sí es `pos` es la venta de productos, y esa vive
  // en `/admin/pedidos`, que conserva su módulo.
  //
  // El alias "arqueo" se lo queda el Cierre del día, no la Caja: buscar "arqueo" en un
  // negocio de servicios tiene que devolver el que cuenta los tres medios.
  { href: "/admin/caja", label: "Caja", icon: "caja", cap: "orders:read", alias: ["mostrador", "cobrar", "caja de hoy", "efectivo del dia", "fondo inicial", "contar el cajon", "relevo", "gasto", "retiro"] },
  { href: "/admin/caja/libro", label: "Libro de caja", icon: "contabilidad", cap: "orders:read", alias: ["planilla", "excel", "google sheets", "caja diaria", "ingresos y egresos", "mensual", "saldo"] },
  { href: "/admin/caja/cierre", label: "Cierre del día", icon: "cierre", cap: "orders:read", alias: ["cerrar la caja", "cierre de caja", "arqueo", "arqueo del día", "contar la plata", "diferencia de caja", "cuadrar"] },
  { href: "/admin/catalogo", label: "Catálogo", icon: "catalogo", cap: "catalog:manage", module: "catalog", alias: ["servicios", "precios", "productos", "tratamientos", "profesionales", "horarios"] },
  { href: "/admin/compras", label: "Compras", icon: "compras", cap: "catalog:manage", module: "catalog", alias: ["proveedores", "reposicion", "remitos"] },
  { href: "/admin/inventario", label: "Inventario", icon: "inventario", cap: "catalog:read", module: "catalog", retailOnly: true, alias: ["stock", "existencias"] },
  { href: "/admin/lotes", label: "Lotes / Vacío", icon: "lotes", cap: "catalog:manage", module: "catalog", carniceriaOnly: true, alias: ["vencimientos", "envasado al vacio", "trazabilidad"] },
  { href: "/admin/despiece", label: "Despiece", icon: "despiece", cap: "catalog:manage", module: "catalog", carniceriaOnly: true, alias: ["cortes", "media res", "rendimiento"] },
  { href: "/admin/ajustes", label: "Ajustes", icon: "ajustes", cap: "catalog:manage", module: "catalog", alias: ["mermas", "rotura", "recuento", "vencidos"] },
  { href: "/admin/resenas", label: "Reseñas", icon: "resenas", cap: "reviews:manage", module: "reviews", agendaOnly: true, alias: ["opiniones", "comentarios", "estrellas"] },
  { href: "/admin/recordatorios", label: "Recordatorios", icon: "recordatorios", cap: "reminders:manage", module: "reminders", agendaOnly: true, alias: ["whatsapp", "avisos", "mensajes"] },
  { href: "/admin/facturacion", label: "Facturación", icon: "facturacion", cap: "billing:manage", module: "arca", alias: ["arca", "afip", "comprobantes", "iva", "factura"] },
  { href: "/admin/reportes", label: "Reportes", icon: "reportes", cap: "reports:read", module: "reports", alias: ["informes", "estadisticas", "rentabilidad", "comisiones", "ingresos"] },
  { href: "/admin/campania", label: "Campañas", icon: "clientes", cap: "clients:read", module: "campanias", alias: ["obsequio", "promociones", "leads", "anotados", "apertura"] },
  // El ítem SIGUE declarado —la ruta necesita estar en el mapa para el gating por
  // módulos— pero ya no lo ve nadie: `modules:manage` dejó de estar en las
  // capacidades del dueño. Aprovisionar módulos es decidir qué producto compró
  // el cliente, no operación diaria. Cuando exista el rol IMPLEMENTADOR, esa
  // capacidad se le asigna a él y el ítem reaparece sólo para ese rol.
  { href: "/admin/modulos", label: "Módulos", icon: "modulos", cap: "modules:manage", alias: ["apps", "tienda de modulos", "activar"] },
  { href: "/admin/auditoria", label: "Auditoría", icon: "auditoria", cap: "audit:read", alias: ["log", "historial", "quien hizo que", "registro"] },
  { href: "/admin/usuarios", label: "Usuarios", icon: "usuarios", cap: "users:manage", alias: ["empleados", "permisos", "roles", "accesos", "contrasena"] },
  { href: "/admin/localizacion", label: "Localización", icon: "localizacion", cap: "location:manage", alias: ["direccion", "ubicacion", "contacto", "sucursal", "telefono"] },
  { href: "/admin/apariencia", label: "Apariencia", icon: "apariencia", cap: "appearance:manage", alias: ["tema", "color", "modo oscuro", "marca"] },
];

// ============================================================================
// EL MENÚ QUE VE ESTE TENANT — una sola función, la que usa el AdminShell.
// ============================================================================
//
// Vivía inline dentro del `AdminShell` (un `.filter` con cinco condiciones). Se
// extrajo acá por una razón concreta: un menú con ítems que no llevan a ningún lado
// es un costo de atención en el mostrador, y esa decisión no se podía probar sin
// renderizar React. Ahora la decisión se ejecuta en un test (src/lib/nav-rubro.test.ts)
// con los ítems REALES y los rubros REALES, y el shell no tiene lógica propia que
// pueda irse de sincronía con lo testeado.

/** Lo que el rubro del tenant necesita saber para decidir qué ítems tienen sentido. */
export interface RubroGateCtx {
  /** ¿Es un local de MOSTRADOR? (`getCurrentTenantRubro().isRetail`, layout.tsx:54). */
  isRetail: boolean;
  /** ¿Lotes y despiece listos: migración cárnica aplicada y rubro de perecederos? (`lotesYDespieceListos`). */
  carniceriaReady: boolean;
}

/**
 * Eje RUBRO, en sus DOS sentidos. PURA.
 *
 *   · MOSTRAR — `retailOnly` (Inventario) sólo en un local de mostrador;
 *     `carniceriaOnly` (Lotes, Despiece) además exige el schema cárnico aplicado:
 *     sin él la pantalla es un cartel de "En preparación" (lotes/page.tsx:16).
 *   · ESCONDER — `agendaOnly` (Agenda, Lista de espera, Reseñas, Recordatorios) se cae
 *     del menú de un mostrador. NO es cosmético: en un tenant retail no hay un solo
 *     `Service` ni `Professional` (el seeder crea sólo Products, blueprints/retail/index.ts:31),
 *     y esas cuatro pantallas los piden `required` para poder hacer algo → son cuatro
 *     callejones sin salida. El detalle, con archivo y línea, está en la declaración de
 *     `agendaOnly` arriba.
 *
 * ESCONDER NO ES PROHIBIR: esto es UX (ADR-017 §2.e). La ruta sigue existiendo y sigue
 * guardada server-side por su capability. Acá sólo se saca de la vista de quien nunca la
 * va a poder usar. Si alguna vez hace falta PROHIBIRLA, se hace en el guarda, no acá.
 *
 * En un tenant de SERVICIOS (`isRetail: false`, el caso de beauty-spa) las tres reglas
 * se comportan como antes de que existiera el eje: `agendaOnly` no filtra nada y los otros
 * dos siguen apagados → menú byte-idéntico al legado.
 */
export function rubroGateAllows(
  item: Pick<ShellItem, "retailOnly" | "carniceriaOnly" | "agendaOnly">,
  { isRetail, carniceriaReady }: RubroGateCtx,
): boolean {
  if (item.retailOnly && !isRetail) return false;
  if (item.carniceriaOnly && !(isRetail && carniceriaReady)) return false;
  if (item.agendaOnly && isRetail) return false;
  return true;
}

export type MenuCtx = RubroGateCtx & {
  role: Role;
  /** Set de módulos activos, o `null` (registro apagado → deja pasar todo). */
  activeModules: ReadonlySet<string> | null;
  /** Perfil activo, o `null` (motor de perfiles apagado → deja pasar todo). */
  activeProfile: Perfil | null;
};

/**
 * Los ítems de nav que ve un tenant, componiendo los CUATRO ejes:
 * rol × módulo × perfil (`visibleNavItems`, @/modules/perfil) × RUBRO (`rubroGateAllows`).
 *
 * DEDUP por href antes de filtrar: `/admin/inventario` está declarado en los DOS
 * registros — en `ALL_ITEMS` como ítem de rubro retail (Magra) y en `ENTERPRISE_NAV_ITEMS`
 * como shell del perfil Empresa. Es la MISMA pantalla encendida por dos vías: sin dedup, un
 * tenant retail con perfiles ON la vería dos veces en la barra (y React se quejaría por la
 * key repetida). Gana el ítem base, que es el que trae `retailOnly` — sin él la pantalla se
 * le colaría a un tenant de servicios.
 */
export function menuItemsParaTenant(ctx: MenuCtx): ShellItem[] {
  const candidatos: ShellItem[] =
    ctx.activeProfile === null ? ALL_ITEMS : [...ALL_ITEMS, ...readyEnterpriseNavItems()];
  const vistos = new Set<string>();
  const unicos = candidatos.filter((i) => (vistos.has(i.href) ? false : (vistos.add(i.href), true)));
  return visibleNavItems(unicos, ctx).filter((i) => rubroGateAllows(i, ctx));
}

/** Normaliza un path: saca query/hash y colapsa trailing slash. */
function normalizarPath(path: string): string {
  const sinQuery = path.split(/[?#]/, 1)[0];
  if (sinQuery.length > 1 && sinQuery.endsWith("/")) return sinQuery.slice(0, -1);
  return sinQuery;
}

/**
 * Ítem de nav cuya ruta CUBRE `path` — match más específico (href más largo) primero,
 * consciente de segmentos: `/admin/facturacion` cubre `/admin/facturacion/bancos` pero
 * NO `/admin/facturacionX`. El ítem Inicio (`exact`) solo matchea `/admin` exacto, así no
 * absorbe todas las sub-rutas. PURA — la usa el gating por-URL del producto.
 */
export function navItemForPath(path: string): ShellItem | undefined {
  const target = normalizarPath(path);
  return [...ALL_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) =>
      i.exact ? target === i.href : target === i.href || target.startsWith(i.href + "/"),
    );
}

/**
 * ¿Un producto con su set de `modules` asignado puede entrar a `path`? Whitelist derivada de
 * `ALL_ITEMS` (la MISMA lista que pinta la nav — sin segunda verdad):
 *   - ruta fuera del set del backoffice (sin ítem que la cubra) → NO (p.ej. /admin/inventario);
 *   - ruta core/config (ítem sin `module`: Inicio, Auditoría, Usuarios, Localización,
 *     Apariencia, Módulos) → SÍ;
 *   - ruta con `module` → SÍ solo si ese módulo está ASIGNADO al tenant (`modules`).
 * Así un OWNER que teclea /admin/turnos · /admin/caja · /admin/catalogo sin tener ese módulo
 * cae de nuevo en su Inicio en vez de ver una pantalla vacía. Inicio (`/admin`) SIEMPRE pasa
 * (no tiene módulo) → el redirect a /admin nunca hace loop.
 *
 * Antes se llamaba `rutaPermitidaComerciante` (hardcodeado al Comerciante); se generalizó a
 * CUALQUIER producto de facturación que focaliza su nav por módulos (ADR-089): la lógica ya
 * era genérica (solo mira `modules`), el rename lo hace explícito.
 */
export function rutaPermitidaParaModulos(path: string, modules: readonly string[]): boolean {
  const item = navItemForPath(path);
  if (!item) return false;
  if (!item.module) return true;
  return modules.includes(item.module);
}
