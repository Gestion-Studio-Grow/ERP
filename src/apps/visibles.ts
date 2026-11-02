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
//     negocio sin el interruptor "Trabaja por apps" o con la asignación vacía. Ningún conjunto
//     de módulos por defecto reproduce lo que CH ve hoy, así que prender el gate con
//     defaults le sacaría pantallas al único cliente en producción.
//   · piloto (interruptor "Trabaja por apps" prendido + asignación no vacía) → los módulos que resuelve
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
import { ENTERPRISE_NAV_ITEMS, NAV_ITEM_GROUPS, type NavGroupId } from "@/modules/nav-groups";
import type { AppDescriptor, NombreIcono } from "./contract";
import { ordenDeEspacio, ordenDentroDelEspacio } from "./espacios";
import { REGISTRO_APPS } from "./registro";
import { appDeRuta } from "./rutas";
import { esAppOcultable } from "@/cambios/interruptores";

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
 * El gate por módulo de ESTE negocio, o `null` si no hay gate (idéntico a hoy).
 * PURA: recibe la fila del tenant, los flags y el catálogo; no lee nada. `enInicioPorApps` es el
 * interruptor del negocio, ya leído (src/cambios/interruptores.server.ts en el panel,
 * negocio.server.ts en la consola). Reemplaza a la variable de deploy APPS_INICIO, retirada.
 */
export function resolverContextoApps(
  t: TenantParaApps,
  opts: { registroGlobal: boolean; enInicioPorApps: boolean },
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
  // Piloto: el interruptor "Trabaja por apps" prendido (src/cambios/interruptores.ts) Y una
  // asignación. Un negocio con `modules` vacío queda sin gate aunque el interruptor esté
  // prendido: vacío no significa "nada", significa "todavía no se fijó" (el caso de CH).
  if (t.modules.length > 0 && opts.enInicioPorApps) {
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
  /** El rubro del alta (`Tenant.blueprintId`). Decide un panel cerrado (`appDelPanelCerrado`). */
  blueprintId?: string | null;
  /** Perfil activo, o `null` con el motor de perfiles apagado (hoy). */
  perfil: Perfil | null;
  /** ¿Local de mostrador? (`resolveRubroId(tenant) != null`, el mismo dato que la barra). */
  esMostrador: boolean;
  /** ¿Lotes y despiece listos: migración cárnica aplicada y rubro de perecederos? (`lotesYDespieceListos`). */
  carniceriaLista: boolean;
  /**
   * Las apps que GSG ocultó en este negocio desde la consola (sólo ids de APPS_OCULTABLES cuentan,
   * src/cambios/interruptores.ts). Ausente o vacío = ninguna: idéntico a hoy. Tapa menú, buscador y ruta.
   */
  ocultas?: ReadonlySet<string>;
}

/**
 * Por qué una app no está disponible. El orden importa: primero lo que la persona no
 * puede resolver por su cuenta (su rol), después lo del negocio.
 *   rol            → su usuario no tiene la capability: se lo pide a la dueña o al dueño.
 *   en-preparacion → la app existe pero todavía no se ofrece.
 *   modulo         → el negocio no la tiene activada: la activa GSG.
 *   rubro          → no aplica a este tipo de negocio (turnos en un mostrador, etc.).
 *   edicion        → es de la edición por perfiles y el negocio no la tiene.
 *   oculta         → GSG la ocultó en este negocio (consola, «Apps ocultas»): se la vuelve a mostrar GSG.
 *   panel          → el panel de este negocio es cerrado y no la incluye (`panelCerrado`).
 */
export type MotivoNoDisponible = "rol" | "en-preparacion" | "modulo" | "rubro" | "edicion" | "oculta" | "panel";

/**
 * ¿El rol alcanza para entrar? `capability: null` = alcanza con la sesión. En un local de
 * mostrador del piloto alcanza también `capabilityEnMostrador` (el encargado); sin el negocio
 * (`n` ausente) o fuera del piloto, sólo `capability`, como hoy.
 */
export function rolPuedeEntrar(
  app: AppDescriptor,
  role: Role,
  n?: Pick<NegocioApps, "contexto" | "esMostrador">,
): boolean {
  if (app.capability === null || roleHasCapability(role, app.capability)) return true;
  return (
    app.capabilityEnMostrador !== undefined &&
    !!n &&
    n.contexto?.origen === "piloto" &&
    n.esMostrador &&
    roleHasCapability(role, app.capabilityEnMostrador)
  );
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
  // En el producto con tienda (planes Comerciante y PyME) el plan asigna el módulo de la app: si el
  // negocio lo tiene, la edición es la de su plan. QA vuelta 5: el configurador le da Comerciante a
  // un Responsable inscripto porque necesita el Libro IVA (`libros` viene en el plan), y la guardia
  // pedía además el perfil Empresa, que con el motor de perfiles apagado no tiene nadie: la página
  // decía «no está disponible». Sin el módulo asignado, sigue decidiendo el perfil, como hoy.
  if (n.contexto?.origen === "producto" && app.modulo !== null && n.contexto.modulos.has(app.modulo)) return true;
  // Hoy las pantallas de edición sólo se suman con el motor de perfiles prendido
  // (`menuItemsParaTenant`: ENTERPRISE_NAV_ITEMS sólo si `activeProfile !== null`).
  if (n.perfil === null) return false;
  return perfilGateAllows(app.perfilMin, n.perfil);
}

/**
 * La app que encabeza el panel cerrado de este negocio, o `null` (CH, Magra, …: el backoffice de siempre). PURA.
 * Mira la asignación del módulo, igual que `appCasa`.
 */
export function appDelPanelCerrado(n: NegocioApps, apps: readonly AppDescriptor[] = REGISTRO_APPS): AppDescriptor | null {
  const asignados = n.contexto ? n.contexto.modulos : new Set(n.modulosAsignados);
  return apps.find((a) => a.panelCerrado?.blueprint === n.blueprintId && a.panelCerrado && a.modulo !== null && asignados.has(a.modulo)) ?? null;
}

const entraEnElPanel = (panel: AppDescriptor, app: AppDescriptor): boolean =>
  app.id === panel.id || !!panel.panelCerrado?.apps.includes(app.id);

/** ¿`path` queda fuera del panel cerrado? Una ruta que no es de ninguna app no se toca. PURA. */
export function rutaFueraDelPanel(path: string, panel: AppDescriptor, apps: readonly AppDescriptor[] = REGISTRO_APPS): boolean {
  const app = appDeRuta(path, apps);
  return !!app && !entraEnElPanel(panel, app);
}

/** Por qué la persona no puede abrir la app, o `null` si puede. */
export function motivoNoDisponible(app: AppDescriptor, n: NegocioApps): MotivoNoDisponible | null {
  if (!rolPuedeEntrar(app, n.role, n)) return "rol";
  const panel = appDelPanelCerrado(n);
  if (panel && !entraEnElPanel(panel, app)) return "panel";
  // Sólo un id del catálogo cerrado oculta algo: un Set armado a mano con otra app no la tapa.
  if (n.ocultas?.has(app.id) && esAppOcultable(app.id)) return "oculta";
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

// ── Panel dedicado (`casa`) ─────────────────────────────────────────────────

/** Lo que acompaña a una casa: dar de alta a quien usa el panel. */
const APPS_DE_CUENTA: ReadonlySet<string> = new Set(["usuarios"]);

/**
 * La app que es TODO el panel de este negocio (`casa`), si tiene su módulo asignado; `null` para el resto
 * (CH, Magra, …: el backoffice de siempre). PURA. Mira la asignación, no el rol: quien no puede abrir la casa
 * igual cae en ella y su guardia (`requireApp`) lo manda a «no disponible», nunca al menú general.
 */
export function appCasa(n: NegocioApps, apps: readonly AppDescriptor[] = REGISTRO_APPS): AppDescriptor | null {
  const asignados = n.contexto ? n.contexto.modulos : new Set(n.modulosAsignados);
  return apps.find((a) => a.casa && a.modulo !== null && asignados.has(a.modulo)) ?? null;
}

/** Con casa, lo que se ve: la casa y las apps de cuenta que esta persona puede abrir. PURA. */
export function appsDeLaCasa(casa: AppDescriptor, visibles: readonly AppDescriptor[]): AppDescriptor[] {
  return visibles.filter((a) => a.id === casa.id || APPS_DE_CUENTA.has(a.id));
}

/** ¿`path` es de la casa o de una app de cuenta? Lo demás del backoffice rebota a la casa. PURA. */
export function rutaDeLaCasa(path: string, casa: AppDescriptor, apps: readonly AppDescriptor[] = REGISTRO_APPS): boolean {
  const app = appDeRuta(path, apps);
  return !!app && (app.id === casa.id || APPS_DE_CUENTA.has(app.id));
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
  /** Lo que dice el lanzador de esta entrada, si no es la descripción de su app. */
  descripcion?: string;
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

/** La pantalla de la barra de hoy detrás de la que va «Cierre del mes». */
const RUTA_CIERRE_DEL_DIA = "/admin/caja/cierre";

/**
 * «Cierre del mes» en la barra de hoy de los productos con tienda (Comerciante: los planes que
 * trabajan con un estudio contable). QA 26/09 (vuelta 4) y refutador: la cartera le dice a la
 * contadora «congelalo desde su panel, en Cierre del mes» y el dueño no tenía cómo llegar desde su
 * menú. Va detrás de «Cierre del día», en su mismo grupo, y SÓLO si la app ya es visible para esa
 * persona (rol, módulo, rubro: `appsVisibles`). El ERP vertical (CH) no lo recibe: su barra queda
 * idéntica (paridad-menu.test.ts sigue atando `proyectarMenuDeHoy` a la barra de siempre). PURA.
 */
export function conCierreDelMesEnLaBarra(
  menu: readonly ItemMenuDeHoy[],
  visibles: readonly AppDescriptor[],
  conTienda: boolean,
): ItemMenuDeHoy[] {
  const app = conTienda ? visibles.find((a) => a.id === "cierre-del-mes") : undefined;
  if (!app || menu.some((i) => i.href === app.ruta)) return [...menu];
  const item: ItemMenuDeHoy = { href: app.ruta, label: app.nombre, icon: app.icono };
  if (app.palabras) item.alias = app.palabras;
  const i = menu.findIndex((m) => m.href === RUTA_CIERRE_DEL_DIA);
  const grupo = i >= 0 ? menu[i].grupo : grupoDeHoy(app.ruta);
  if (grupo) item.grupo = grupo;
  const salida = [...menu];
  salida.splice(i >= 0 ? i + 1 : salida.length, 0, item);
  return salida;
}

/** Lo que sale de la barra de CH: Campañas no la usa y Recordatorios todavía es simulado. */
const FUERA_DE_LA_BARRA_DE_CH = new Set(["/admin/campania", "/admin/recordatorios"]);

/**
 * La barra de CH (orden del dueño, UAT venta de productos, 01/11): Comisiones entra; Pedidos se llama
 * «Vender»; salen Campañas y Recordatorios. Es la barra, no el permiso: las pantallas abren igual por
 * su ruta (`appsVisibles` no cambia) y Comisiones entra SÓLO si la app ya es visible para esa persona,
 * así que un rol sin `reports:read` no la ve. Va aparte de `proyectarMenuDeHoy`, que sigue atada a la
 * barra de siempre (paridad-menu.test.ts). PURA.
 */
export function barraDeCH(menu: readonly ItemMenuDeHoy[], visibles: readonly AppDescriptor[]): ItemMenuDeHoy[] {
  const salida = menu
    .filter((i) => !FUERA_DE_LA_BARRA_DE_CH.has(i.href))
    .map((i) =>
      i.href === "/admin/pedidos"
        ? { ...i, label: "Vender", alias: [...(i.alias ?? []), "pedidos"], descripcion: "Cobrar una venta y ver las cerradas, para anularlas si salió mal." }
        : i,
    );
  const comisiones = visibles.find((a) => a.id === "comisiones");
  if (!comisiones || salida.some((i) => i.href === comisiones.ruta)) return salida;
  const i = salida.findIndex((m) => m.href === "/admin/reportes");
  const item: ItemMenuDeHoy = { href: comisiones.ruta, label: comisiones.nombre, icon: comisiones.icono };
  if (comisiones.palabras) item.alias = comisiones.palabras;
  const grupo = i >= 0 ? salida[i].grupo : grupoDeHoy(comisiones.ruta);
  if (grupo) item.grupo = grupo;
  salida.splice(i >= 0 ? i + 1 : salida.length, 0, item);
  return salida;
}

// ── Buscador ─────────────────────────────────────────────────────────────────

// Vive en ./buscar (sin el registro): el buscador es un client component y, importado desde acá,
// arrastraba REGISTRO_APPS entero al bundle del navegador en todas las pantallas (CH incluido).
export { buscarApps } from "./buscar";

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
    case "panel":
      return { titulo, porque: "El panel de tu negocio tiene sólo lo que usa tu trabajo, y esta app no es parte.", aQuien: pedido };
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
    case "oculta":
      return { titulo, porque: "En tu negocio esta app está oculta: no la usan.", aQuien: pedido };
    case "rubro": {
      const porque =
        app.rubro === "servicios"
          ? "Esta app es para negocios que trabajan con turnos."
          : app.rubro === "mostrador"
            ? "Esta app es para locales de mostrador, que venden productos con stock."
            : n.esMostrador
              ? // Un mostrador sin la app: o su rubro no vende perecederos (velas, pádel) o la base
                // todavía no tiene lotes y despiece. El texto vale para los dos casos.
                "Esta app es para negocios que venden mercadería que vence, como una carnicería, y no está habilitada en el tuyo."
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
  const panel = appDelPanelCerrado(n);
  if (panel) return appPermitida(panel, n) ? { href: panel.ruta, etiqueta: `Ir a ${panel.nombre}` } : null;
  const href = homeRoute(n.role);
  const app = appDeRuta(href);
  if (!app || !appPermitida(app, n)) return null;
  return { href, etiqueta: n.role === "PROFESSIONAL" ? "Ir a mi agenda" : "Ir al inicio" };
}

/**
 * Dónde cae cualquier rol al entrar a un negocio de panel cerrado: en la app que lo encabeza, sin pasar por un
 * Inicio pensado para otros rubros. `null` para el resto de los negocios: siguen como siempre. PURA.
 */
export function aterrizajeDelPanel(n: NegocioApps, apps: readonly AppDescriptor[] = REGISTRO_APPS): string | null {
  const panel = appDelPanelCerrado(n, apps);
  if (!panel || !appPermitida(panel, n)) return null;
  const inicio = apps.find((a) => a.id === "gestion-inicio");
  return panel.id === "proyectos" && inicio && appPermitida(inicio, n) ? inicio.ruta : panel.ruta;
}

/**
 * Proyectos en la barra, antes de la Agenda o primero si no hay, sólo para quien ve la app (`appsVisibles`:
 * módulo duro, así que CH y los demás negocios no la reciben y su barra queda idéntica). Mismo criterio que el
 * Cierre del mes: no entra a `menuDeHoy`, que ata la barra al menú viejo sin mirar la asignación del módulo. PURA.
 */
export function conProyectosEnLaBarra(menu: readonly ItemMenuDeHoy[], visibles: readonly AppDescriptor[]): ItemMenuDeHoy[] {
  // Proyectos y las apps de gestión de eventos, en este orden: todas exigen el mismo módulo.
  const ORDEN = ["gestion-inicio", "proyectos", "gestion-diseno", "gestion-calendario", "gestion-proveedores", "gestion-administracion", "gestion-direccion", "gestion-agentes", "gestion-propuesta-ia", "gestion-mi-liquidacion", "gestion-equipo"];
  const apps = ORDEN.map((id) => visibles.find((a) => a.id === id)).filter((a): a is AppDescriptor => !!a && !menu.some((i) => i.href === a.ruta));
  if (apps.length === 0) return [...menu];
  const i = menu.findIndex((m) => m.href === "/admin/turnos");
  const grupo = (i >= 0 ? menu[i] : menu[0])?.grupo;
  const items = apps.map((app) => {
    const item: ItemMenuDeHoy = { href: app.ruta, label: app.nombre, icon: app.icono };
    if (app.palabras) item.alias = app.palabras;
    if (grupo) item.grupo = grupo;
    return item;
  });
  const salida = [...menu];
  salida.splice(Math.max(i, 0), 0, ...items);
  return salida;
}
