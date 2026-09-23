// ============================================================================
// QUIÉN VE QUÉ APP — la decisión, pura y testeable sin base.
// ============================================================================
//
// Una sola función decide si una persona puede abrir una app (`motivoNoDisponible`), y de
// ella salen tres cosas que antes se decidían por separado:
//   · el Inicio y la barra (`appsVisibles`);
//   · la guardia de cada página (`requireApp`, src/lib/require-app.ts);
//   · el porqué de "App no disponible" (rol, módulo, rubro, edición).
// Si la barra y la guardia usaran reglas distintas, una pantalla podría estar en el menú y
// rebotar al abrirla, o no estar en el menú y abrirse igual tecleando la URL.
//
// EL GATE POR MÓDULO ES POR NEGOCIO (`resolverContextoApps`), no global:
//   · contexto `null` → sin gate por módulo, idéntico a hoy. Es el caso de CH y de todo
//     negocio fuera del piloto (`APPS_INICIO`) o con la asignación vacía. Ningún conjunto
//     de módulos por defecto reproduce lo que CH ve hoy, así que prender el gate con
//     defaults le sacaría pantallas al único cliente en producción.
//   · piloto (`APPS_INICIO` + asignación no vacía) → los módulos que resuelve
//     `resolverActivacion` (existen, son del rubro y tienen sus dependencias).
//   · producto con tienda (Comerciante) → `Tenant.modules` tal cual, como hace hoy el layout,
//     y con el módulo con que la barra de hoy filtra cada pantalla (`menuDeHoy.moduloDeHoy`):
//     el Comerciante ya tenía gate y su barra no puede cambiar.
//   · `MODULE_REGISTRY_ENABLED` prendido → la resolución global de hoy. Sigue apagado.
//
// Client-safe: no importa Prisma ni nada de servidor. El catálogo de módulos entra por
// parámetro (`resolverContextoApps`) para no arrastrarlo al bundle del navegador.

import { homeRoute, roleHasCapability, type Role } from "@/lib/capabilities";
import { perfilGateAllows, type Perfil } from "@/modules/perfil";
import { resolverActivacion } from "@/modules/activation";
import type { ModuleRegistry } from "@/modules/registry";
import { derivarProducto, productoUsaTienda } from "@/lib/producto-identidad";
import { searchNavItems } from "@/modules/nav-search";
import { ENTERPRISE_NAV_ITEMS, NAV_ITEM_GROUPS, type NavGroupId } from "@/modules/nav-groups";
import type { AppDescriptor, NombreIcono } from "./contract";
import { ordenDeEspacio, ordenDentroDelEspacio } from "./espacios";
import { REGISTRO_APPS } from "./registro";
import { appDeRuta } from "./rutas";

// ── Contexto del gate por módulo ─────────────────────────────────────────────

/** De dónde sale el gate por módulo. Decide si el perfil (edición) sigue mandando. */
export type OrigenGate = "registro" | "producto" | "piloto";

export interface ContextoApps {
  /** Módulos que habilitan apps en este negocio. */
  modulos: ReadonlySet<string>;
  origen: OrigenGate;
}

/** Lo que hace falta de la fila `Tenant` para decidir el gate. */
export interface TenantParaApps {
  id: string;
  slug: string | null;
  blueprintId: string | null;
  modules: readonly string[];
}

/**
 * ¿El negocio está en `APPS_INICIO`? El valor es una lista de slugs separada por comas
 * ("magra,shinevelas,adosmanos") o "*" para todos. Vacío o ausente = ninguno. Sacar un slug
 * devuelve a ese negocio al Inicio y al menú de hoy sin tocar un dato.
 */
export function negocioEnAppsInicio(slug: string | null, valorFlag: string | undefined): boolean {
  const v = valorFlag?.trim();
  if (!slug || !v) return false;
  if (v === "*") return true;
  const buscado = slug.trim().toLowerCase();
  return v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .some((s) => s === buscado);
}

/**
 * El gate por módulo de ESTE negocio, o `null` si no hay gate (idéntico a hoy).
 * PURA: recibe la fila del tenant, los flags y el catálogo; no lee nada.
 */
export function resolverContextoApps(
  t: TenantParaApps,
  opts: { registroGlobal: boolean; appsInicio: string | undefined },
  catalogoModulos: ModuleRegistry,
): ContextoApps | null {
  const resueltos = () =>
    new Set(
      resolverActivacion(
        { tenantId: t.id, blueprintId: t.blueprintId, modules: [...t.modules] },
        catalogoModulos,
        { enforced: true },
      ).activos.map((d) => d.id),
    );

  // El flag global manda sobre todo, igual que en el layout de hoy (`activeModuleIds ??`).
  if (opts.registroGlobal) return { origen: "registro", modulos: resueltos() };
  // Comerciante: el set asignado tal cual, sin resolver (lo mismo que hace layout.tsx).
  if (productoUsaTienda(derivarProducto({ blueprintId: t.blueprintId, modules: [...t.modules] }))) {
    return { origen: "producto", modulos: new Set(t.modules) };
  }
  // Piloto: sólo con asignación. Un negocio del piloto con `modules` vacío queda sin gate:
  // vacío no significa "nada", significa "todavía no se fijó" (el caso de CH).
  if (t.modules.length > 0 && negocioEnAppsInicio(t.slug, opts.appsInicio)) {
    return { origen: "piloto", modulos: resueltos() };
  }
  return null;
}

// ── La decisión por app ──────────────────────────────────────────────────────

/** Todo lo que decide si una persona de un negocio puede abrir una app. */
export interface NegocioApps {
  role: Role;
  /** Gate por módulo, o `null` (sin gate: idéntico a hoy). */
  contexto: ContextoApps | null;
  /**
   * `Tenant.modules` crudo. Lo usan sólo las apps `moduloDuro` cuando no hay gate: esas
   * exigen su módulo siempre, y sin esto no habría contra qué compararlo.
   */
  modulosAsignados: readonly string[];
  /** Perfil activo, o `null` con el motor de perfiles apagado (hoy). */
  perfil: Perfil | null;
  /** ¿Local de mostrador? (`resolveRubroId(tenant) != null`, el mismo dato que la barra). */
  esMostrador: boolean;
  /** ¿Está aplicada la migración cárnica? (`hasCarniceriaSchema`). */
  carniceriaLista: boolean;
}

/**
 * Por qué una app no está disponible. El orden importa: primero lo que la persona no
 * puede resolver por su cuenta (su rol), después lo del negocio.
 *   rol            → su usuario no tiene la capability: se lo pide a la dueña o al dueño.
 *   en-preparacion → la app existe pero todavía no se ofrece.
 *   modulo         → el negocio no la tiene activada: la activa GSG.
 *   rubro          → no aplica a este tipo de negocio (turnos en un mostrador, etc.).
 *   edicion        → es de la edición por perfiles y el negocio no la tiene.
 */
export type MotivoNoDisponible = "rol" | "en-preparacion" | "modulo" | "rubro" | "edicion";

/** ¿El rol alcanza para entrar? `capability: null` = alcanza con la sesión. */
export function rolPuedeEntrar(app: AppDescriptor, role: Role): boolean {
  return app.capability === null || roleHasCapability(role, app.capability);
}

/**
 * El módulo que decide esta app en este gate. En el Comerciante (origen "producto") es el
 * de la barra de hoy, si difiere: ahí Compras se filtraba con `catalog` y Cuentas a pagar
 * con ninguno, y cambiarlo le sacaría pantallas a un negocio que ya las tenía. En el piloto
 * y con el flag global manda el módulo de la app. `moduloDuro` nunca se afloja.
 */
function moduloQueDecide(app: AppDescriptor, origen: OrigenGate): string | null {
  if (app.moduloDuro || origen !== "producto" || !app.menuDeHoy) return app.modulo;
  return app.menuDeHoy.moduloDeHoy === undefined ? app.modulo : app.menuDeHoy.moduloDeHoy;
}

function moduloPermite(app: AppDescriptor, n: NegocioApps): boolean {
  if (app.modulo === null) return true;
  if (app.moduloDuro) {
    // Lee datos de otro negocio: el módulo se exige SIEMPRE. Sin gate, contra la
    // asignación cruda; con gate, contra lo resuelto (que ya pasó dependencias y rubro).
    const modulos = n.contexto ? n.contexto.modulos : new Set(n.modulosAsignados);
    return modulos.has(app.modulo);
  }
  if (n.contexto === null) return true;
  const modulo = moduloQueDecide(app, n.contexto.origen);
  return modulo === null || n.contexto.modulos.has(modulo);
}

function rubroPermite(app: AppDescriptor, n: NegocioApps): boolean {
  switch (app.rubro) {
    case undefined:
      return true;
    case "servicios":
      return !n.esMostrador;
    case "mostrador":
      return n.esMostrador;
    case "carniceria":
      return n.esMostrador && n.carniceriaLista;
  }
}

function edicionPermite(app: AppDescriptor, n: NegocioApps): boolean {
  if (!app.perfilMin) return true;
  // En el piloto manda el módulo asignado: si el negocio tiene `libros`, ve el Libro IVA,
  // sin el callejón de hoy (el menú no lo muestra y la página dice "edición Empresa").
  if (n.contexto?.origen === "piloto") return true;
  // Hoy las pantallas de edición sólo se suman con el motor de perfiles prendido
  // (`menuItemsParaTenant`: ENTERPRISE_NAV_ITEMS sólo si `activeProfile !== null`).
  if (n.perfil === null) return false;
  return perfilGateAllows(app.perfilMin, n.perfil);
}

/** Por qué la persona no puede abrir la app, o `null` si puede. */
export function motivoNoDisponible(app: AppDescriptor, n: NegocioApps): MotivoNoDisponible | null {
  if (!rolPuedeEntrar(app, n.role)) return "rol";
  if (app.estado !== "lista") return "en-preparacion";
  if (!moduloPermite(app, n)) return "modulo";
  if (!rubroPermite(app, n)) return "rubro";
  if (!edicionPermite(app, n)) return "edicion";
  return null;
}

/** ¿Puede abrirla? Es la regla de `requireApp`. */
export function appPermitida(app: AppDescriptor, n: NegocioApps): boolean {
  return motivoNoDisponible(app, n) === null;
}

/**
 * Las apps que la persona ve en el Inicio, la barra y el buscador: las que puede abrir,
 * menos las que no se ofrecen (`enLanzador: false`). Ordenadas por espacio y, dentro del
 * espacio, por el orden decidido en src/apps/espacios.ts.
 */
export function appsVisibles(
  n: NegocioApps,
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): AppDescriptor[] {
  return apps
    .map((app, i) => ({ app, i }))
    .filter(({ app }) => app.enLanzador !== false && appPermitida(app, n))
    .sort(
      (a, b) =>
        ordenDeEspacio(a.app.espacio) - ordenDeEspacio(b.app.espacio) ||
        ordenDentroDelEspacio(a.app.espacio, a.app.id) - ordenDentroDelEspacio(b.app.espacio, b.app.id) ||
        a.i - b.i,
    )
    .map(({ app }) => app);
}

// ── El número del botón: qué parte ve cada rol ───────────────────────────────

/**
 * Qué parte del número de una app puede ver este rol. El loader del botón lo consulta
 * ANTES de calcular: si `monto` es false, la plata ni se lee. `null` = la app no tiene
 * número. Supone que el rol ya puede abrir la app (sale de `appsVisibles`).
 */
export function partesDelKpi(app: AppDescriptor, role: Role): { numero: boolean; monto: boolean } | null {
  const kpi = app.kpi;
  if (!kpi) return null;
  const numero = kpi.capability === undefined || roleHasCapability(role, kpi.capability);
  const monto = numero && kpi.monto !== undefined && roleHasCapability(role, kpi.monto.capability);
  return { numero, monto };
}

// ── La barra de HOY, proyectada desde el registro ────────────────────────────
//
// Mientras conviven el menú viejo y el Inicio por apps, la barra de CH se arma desde acá y
// tiene que dar EXACTAMENTE lo mismo que `menuItemsParaTenant` (mismos href, rótulos,
// íconos, grupos y orden). Lo prueba el test de paridad dorada. Se borra en la limpieza.

/** Forma de un ítem de la barra de hoy (la misma que pinta AdminShell). */
export interface ItemMenuDeHoy {
  href: string;
  label: string;
  icon: NombreIcono;
  exact?: true;
  alias?: readonly string[];
  /** Grupo de la barra agrupada (`NAV_GROUPING_ENABLED`). */
  grupo?: NavGroupId;
}

function grupoDeHoy(href: string): NavGroupId | undefined {
  return NAV_ITEM_GROUPS[href] ?? ENTERPRISE_NAV_ITEMS.find((e) => e.href === href)?.grupo;
}

/**
 * La barra de hoy a partir de las apps visibles: sólo las que ya estaban en la barra
 * (`menuDeHoy`), en su orden y con su rótulo de hoy.
 */
export function proyectarMenuDeHoy(visibles: readonly AppDescriptor[]): ItemMenuDeHoy[] {
  return visibles
    .flatMap((app) => (app.menuDeHoy ? [{ app, menu: app.menuDeHoy }] : []))
    .sort((a, b) => a.menu.orden - b.menu.orden)
    .map(({ app, menu }) => {
      const item: ItemMenuDeHoy = { href: app.ruta, label: menu.etiqueta, icon: app.icono };
      if (app.exacta) item.exact = true;
      if (app.palabras) item.alias = app.palabras;
      const grupo = grupoDeHoy(app.ruta);
      if (grupo) item.grupo = grupo;
      return item;
    });
}

// ── Buscador ─────────────────────────────────────────────────────────────────

/**
 * Busca entre las apps que la persona YA ve. Recibe la salida de `appsVisibles` (que el
 * servidor calcula y le pasa al cliente): buscar nunca puede hacer aparecer una app oculta,
 * ni tecleando su nombre exacto. Busca por nombre, por las palabras y por el rótulo de hoy
 * ("Ajustes" sigue encontrando Mermas).
 */
export function buscarApps(visibles: readonly AppDescriptor[], query: string): AppDescriptor[] {
  const items = visibles
    .filter((app) => app.enLanzador !== false)
    .map((app) => ({
      app,
      href: app.ruta,
      label: app.nombre,
      alias: [
        ...(app.palabras ?? []),
        ...(app.menuDeHoy && app.menuDeHoy.etiqueta !== app.nombre ? [app.menuDeHoy.etiqueta] : []),
      ],
    }));
  return searchNavItems(items, query).map((i) => i.app);
}

// ── "App no disponible": el porqué, a quién pedírsela y por dónde volver ─────

export interface ExplicacionNoDisponible {
  titulo: string;
  /** Qué pasa, en una frase. */
  porque: string;
  /** A quién pedírsela. Nunca vacío: toda pantalla de rechazo dice cómo seguir. */
  aQuien: string;
}

const A_LA_DUENIA = "Si la necesitás para tu trabajo, pedísela a la dueña o al dueño del negocio.";
const A_GSG = "Si querés sumarla, escribinos a Gestión Studio Grow.";

/**
 * El texto de "App no disponible". Quien puede pedir un cambio de módulo o de edición es
 * la dueña o el dueño (OWNER), y se lo pide a GSG; el resto del equipo se lo pide a ella.
 * `app` ausente = el `?app=` no es una app registrada (URL vieja o tecleada a mano).
 */
export function explicarNoDisponible(
  app: AppDescriptor | undefined,
  motivo: MotivoNoDisponible | null,
  n: Pick<NegocioApps, "role" | "esMostrador">,
): ExplicacionNoDisponible {
  if (!app) {
    return {
      titulo: "Esta pantalla no está disponible",
      porque: "La dirección que abriste no corresponde a ninguna app de tu negocio.",
      aQuien: "Volvé a tu inicio y buscala desde ahí.",
    };
  }
  const titulo = `${app.nombre} no está disponible`;
  const pedido = n.role === "OWNER" ? A_GSG : A_LA_DUENIA;
  switch (motivo) {
    case null:
      return {
        titulo: `${app.nombre} ya está disponible`,
        porque: "Ya podés abrirla.",
        aQuien: "Tocá el botón para entrar.",
      };
    case "rol":
      return { titulo, porque: "Tu usuario no tiene acceso a esta app.", aQuien: A_LA_DUENIA };
    case "en-preparacion":
      return {
        titulo,
        porque: "La estamos terminando: todavía no se puede usar.",
        aQuien: "Cuando esté lista, va a aparecer en tu inicio.",
      };
    case "modulo":
      return { titulo, porque: "Tu negocio no tiene esta app activada.", aQuien: pedido };
    case "edicion":
      return { titulo, porque: "Esta app no está incluida en lo que tiene tu negocio hoy.", aQuien: pedido };
    case "rubro": {
      const porque =
        app.rubro === "servicios"
          ? "Esta app es para negocios que trabajan con turnos."
          : app.rubro === "mostrador"
            ? "Esta app es para locales de mostrador, que venden productos con stock."
            : n.esMostrador
              ? "Todavía no está habilitada en tu negocio: falta preparar la base para lotes y despiece."
              : "Esta app es para carnicerías.";
      return { titulo, porque, aQuien: pedido };
    }
  }
}

/**
 * El botón de vuelta: la casa del rol (Inicio; la agenda para PROFESSIONAL), pero SÓLO si
 * la persona puede abrirla. Si no puede (un PROFESSIONAL en un negocio sin agenda), no hay
 * botón: uno que volviera a mandar acá sería un loop hecho a mano. Ahí queda cerrar sesión.
 */
export function destinoDeVuelta(n: NegocioApps): { href: string; etiqueta: string } | null {
  const href = homeRoute(n.role);
  const app = appDeRuta(href);
  if (!app || !appPermitida(app, n)) return null;
  return { href, etiqueta: n.role === "PROFESSIONAL" ? "Ir a mi agenda" : "Ir al inicio" };
}
