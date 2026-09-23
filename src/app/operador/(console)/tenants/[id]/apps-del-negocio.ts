// ============================================================================
// APPS DEL NEGOCIO — qué gana y qué pierde un negocio cuando GSG le cambia los módulos.
// ============================================================================
//
// La ficha del negocio en la consola es donde GSG cambia `Tenant.modules` de un negocio ya
// dado de alta (el alta y la cartera del contador los escriben al crearlo). Hasta la ola 1
// escribía el arreglo crudo: sin validar dependencias ni rubro, sin auditoría y con dos
// pestañas pisándose. Mientras los módulos no decidían nada era inocuo; con el Inicio por
// apps (`APPS_INICIO`) deciden qué apps ve cada negocio, y un clic podía sacarle la Agenda a
// un cliente sin dejar rastro.
//
// Acá vive la DECISIÓN, pura y testeable sin base:
//   · el plan del cambio: `planActivar` / `planDesactivar` (src/modules/vista.ts, los mismos
//     que usa la vidriera del dueño) más los candados propios de la consola;
//   · la vista previa en APPS, calculada con `appsVisibles` (src/apps/visibles.ts): la misma
//     función que arma el Inicio, la barra y la guardia de cada página. Si la vista previa
//     usara otra regla, podría prometer una app que después la página rebota;
//   · "Fijar asignación actual": los módulos mínimos que faltan para que, con el Inicio por
//     apps prendido, el negocio vea exactamente las apps que ve hoy.
//
// Sin Prisma ni nada de servidor: la lectura vive en negocio.server.ts y la escritura
// (condicional y auditada) en src/lib/operator-actions.ts.

import type { Role } from "@/lib/capabilities";
import type { Perfil } from "@/modules/perfil";
import type { ModuleRegistry } from "@/modules/registry";
import { planActivar, planDesactivar } from "@/modules/vista";
import { derivarProducto, productoUsaTienda, type Producto } from "@/lib/producto-identidad";
import type { AppDescriptor } from "@/apps/contract";
import { REGISTRO_APPS } from "@/apps/registro";
import { ordenDeEspacio, ordenDentroDelEspacio } from "@/apps/espacios";
import {
  appsVisibles,
  negocioEnAppsInicio,
  resolverContextoApps,
  type ContextoApps,
  type OrigenGate,
} from "@/apps/visibles";

// ── Lo que hace falta saber del negocio ─────────────────────────────────────

/** El negocio, con todo lo que decide qué apps ve cada rol. Lo arma negocio.server.ts. */
export interface NegocioParaActivar {
  id: string;
  slug: string | null;
  blueprintId: string | null;
  /** `Tenant.modules` tal cual está en la base. */
  modules: readonly string[];
  /** ¿Local de mostrador? El mismo dato que usa la barra (`resolveRubroId`). */
  esMostrador: boolean;
  /** ¿Está aplicada la migración cárnica? (lotes y despiece). */
  carniceriaLista: boolean;
  /** Perfil activo, o `null` con el motor de perfiles apagado (hoy). */
  perfil: Perfil | null;
}

/** Los flags del deploy que deciden el gate (se leen del entorno en negocio.server.ts). */
export interface FlagsDeApps {
  registroGlobal: boolean;
  appsInicio: string | undefined;
}

const ROLES: readonly Role[] = ["OWNER", "RECEPTION", "PROFESSIONAL"];

// ── El candado de CH ─────────────────────────────────────────────────────────

/**
 * Negocios cuyos módulos no se tocan desde la consola hasta que el dueño de GSG lo apruebe.
 * CH Estética es el único cliente vivo en producción y tiene que ver exactamente lo de hoy.
 * Sus módulos hoy no deciden nada (está fuera del Inicio por apps; su asignación está vacía
 * en la base de QA y según la documentación, sin medir en Neon), pero una asignación a medias
 * es una bomba: el día que entre al Inicio por apps (o
 * que `APPS_INICIO` pase a "*") perdería todas las apps de los módulos que falten. Por eso
 * el candado cubre también los cambios de a un módulo, no sólo "Fijar asignación actual".
 * Sacar un slug de acá es la forma de dar el OK.
 */
export const REQUIEREN_OK_DEL_DUENIO: ReadonlySet<string> = new Set(["beauty-spa"]);

export const MOTIVO_OK_DEL_DUENIO =
  "Requiere OK del dueño: es un cliente vivo en producción y sus apps no cambian sin su aprobación.";

export function requiereOkDelDuenio(slug: string | null): boolean {
  return !!slug && REQUIEREN_OK_DEL_DUENIO.has(slug.trim().toLowerCase());
}

// ── Módulos que no pueden convivir ───────────────────────────────────────────

/**
 * `cartera` (el estudio contable) y `multilocal` (la casa de una marca) guardan su vínculo
 * con otros negocios en la misma tabla (CarteraCliente). Un negocio con los dos mezclaría
 * los locales de la marca con los clientes del estudio, y podría emitir facturas por sus
 * locales. Se rechaza acá, en la ficha del negocio. El alta todavía no lo valida.
 */
const EXCLUYENTES: readonly (readonly [string, string])[] = [["cartera", "multilocal"]];

function choqueDeExcluyentes(modules: readonly string[], registry: ModuleRegistry): string | null {
  const set = new Set(modules);
  for (const [a, b] of EXCLUYENTES) {
    if (set.has(a) && set.has(b)) {
      const na = registry.buscar(a)?.nombre ?? a;
      const nb = registry.buscar(b)?.nombre ?? b;
      return (
        `“${na}” y “${nb}” no pueden estar juntos en el mismo negocio: los dos guardan su ` +
        `vínculo con otros negocios en el mismo lugar y se mezclarían. Sacá uno antes de poner el otro.`
      );
    }
  }
  return null;
}

// ── Apps que ve el negocio ───────────────────────────────────────────────────

/** Mismo conjunto de módulos, sin importar el orden ni los repetidos. */
export function mismoConjunto(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/**
 * Con qué gate se mira al negocio:
 *   · "real": los flags del deploy tal como están (lo que ve apenas se confirma);
 *   · "con-inicio": como si ya estuviera en `APPS_INICIO` (lo que va a ver cuando GSG se lo
 *     prenda);
 *   · "menu-de-siempre": como si NO estuviera en `APPS_INICIO`. Es la vara del "0 apps
 *     perdidas": antes de prenderlo coincide con lo que ve hoy, y después sigue siendo el menú
 *     al que vuelve si se lo saca de la lista. En el Comerciante incluye su gate de producto,
 *     que es su menú de siempre.
 */
type Mirada = "real" | "con-inicio" | "menu-de-siempre";

function contextoDe(
  n: NegocioParaActivar,
  modules: readonly string[],
  flags: FlagsDeApps,
  registry: ModuleRegistry,
  mirada: Mirada,
): ContextoApps | null {
  const appsInicio =
    mirada === "real" ? flags.appsInicio : mirada === "con-inicio" ? (n.slug ?? undefined) : undefined;
  return resolverContextoApps(
    { id: n.id, slug: n.slug, blueprintId: n.blueprintId, modules },
    { registroGlobal: flags.registroGlobal, appsInicio },
    registry,
  );
}

/**
 * Las apps del negocio: las que ve al menos uno de sus roles (dueña, recepción,
 * profesional). El gate por módulo no depende del rol, así que si una app se pierde por un
 * módulo se pierde para todos: alcanza con comparar esta unión. Ordenadas como el Inicio.
 */
function appsDelNegocio(
  n: NegocioParaActivar,
  modules: readonly string[],
  contexto: ContextoApps | null,
  apps: readonly AppDescriptor[],
): AppDescriptor[] {
  const vistas = new Set<string>();
  for (const role of ROLES) {
    const visibles = appsVisibles(
      {
        role,
        contexto,
        modulosAsignados: modules,
        perfil: n.perfil,
        esMostrador: n.esMostrador,
        carniceriaLista: n.carniceriaLista,
      },
      apps,
    );
    for (const app of visibles) vistas.add(app.id);
  }
  return apps
    .map((app, i) => ({ app, i }))
    .filter(({ app }) => vistas.has(app.id))
    .sort(
      (a, b) =>
        ordenDeEspacio(a.app.espacio) - ordenDeEspacio(b.app.espacio) ||
        ordenDentroDelEspacio(a.app.espacio, a.app.id) - ordenDentroDelEspacio(b.app.espacio, b.app.id) ||
        a.i - b.i,
    )
    .map(({ app }) => app);
}

export interface DiferenciaDeApps {
  gana: AppDescriptor[];
  pierde: AppDescriptor[];
}

function diferencia(antes: readonly AppDescriptor[], despues: readonly AppDescriptor[]): DiferenciaDeApps {
  const idsAntes = new Set(antes.map((a) => a.id));
  const idsDespues = new Set(despues.map((a) => a.id));
  return {
    gana: despues.filter((a) => !idsAntes.has(a.id)),
    pierde: antes.filter((a) => !idsDespues.has(a.id)),
  };
}

/** De dónde sale hoy el gate de este negocio. `sin-gate` = ve el menú de siempre. */
export type EstadoGate = "sin-gate" | OrigenGate;

// ── La foto de hoy (la tarjeta de la ficha) ──────────────────────────────────

export interface EstadoAppsDelNegocio {
  gate: EstadoGate;
  /** ¿El slug ya está en `APPS_INICIO`? */
  enInicioPorApps: boolean;
  /** Las apps que ve hoy (unión de sus roles). Es la N de "N apps activas". */
  hoy: AppDescriptor[];
  /** Sin módulos asignados: el Inicio por apps no filtra por módulo (queda igual que hoy). */
  sinAsignacion: boolean;
  /**
   * Con el Inicio por apps prendido y la asignación de hoy, contra su menú de siempre (sin el
   * Inicio por apps). Es el chequeo de antes de sumarlo a `APPS_INICIO`: tiene que dar 0 apps
   * perdidas.
   */
  conInicioFrenteAlMenu: DiferenciaDeApps;
}

export function estadoDeApps(
  n: NegocioParaActivar,
  flags: FlagsDeApps,
  registry: ModuleRegistry,
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): EstadoAppsDelNegocio {
  const ctxHoy = contextoDe(n, n.modules, flags, registry, "real");
  const menu = appsDelNegocio(n, n.modules, contextoDe(n, n.modules, flags, registry, "menu-de-siempre"), apps);
  const conInicio = appsDelNegocio(n, n.modules, contextoDe(n, n.modules, flags, registry, "con-inicio"), apps);
  return {
    gate: ctxHoy ? ctxHoy.origen : "sin-gate",
    enInicioPorApps: negocioEnAppsInicio(n.slug, flags.appsInicio),
    hoy: appsDelNegocio(n, n.modules, ctxHoy, apps),
    sinAsignacion: n.modules.length === 0,
    conInicioFrenteAlMenu: diferencia(menu, conInicio),
  };
}

// ── Activar o desactivar un módulo ───────────────────────────────────────────

export type AccionModulo = "activar" | "desactivar";

export interface CambioDeModulo {
  accion: AccionModulo;
  modulo: string;
}

export type PlanDeCambio =
  | {
      ok: true;
      antes: string[];
      despues: string[];
      /** Dependencias que se suman solas al activar (para avisar). */
      incluidos: string[];
      /** El módulo ya estaba (o ya no estaba): no hay nada que escribir. */
      sinCambios: boolean;
    }
  | { ok: false; motivo: string };

/**
 * ¿Se puede hacer este cambio? Lo usa la vista previa para mostrarlo y la action para
 * volver a decidirlo con la base fresca: el botón deshabilitado no protege nada.
 */
export function validarCambio(
  n: Pick<NegocioParaActivar, "slug" | "blueprintId" | "modules">,
  cambio: CambioDeModulo,
  registry: ModuleRegistry,
): PlanDeCambio {
  if (requiereOkDelDuenio(n.slug)) return { ok: false, motivo: MOTIVO_OK_DEL_DUENIO };
  if (!registry.buscar(cambio.modulo)) {
    return { ok: false, motivo: `El módulo "${cambio.modulo}" no existe en el catálogo.` };
  }
  const antes = [...n.modules];
  let plan;
  if (cambio.accion === "activar") {
    plan = planActivar(antes, cambio.modulo, registry, n.blueprintId);
  } else {
    // El candado del núcleo sólo corre en los productos con tienda (Comerciante, Contador):
    // lo que viene con su plan no se desinstala. Es el mismo criterio que la vidriera.
    const producto = derivarProducto({ blueprintId: n.blueprintId, modules: antes });
    plan = planDesactivar(antes, cambio.modulo, registry, productoUsaTienda(producto) ? producto : undefined);
  }
  if (plan.error) return { ok: false, motivo: plan.error };
  // Sólo al sumar: si un negocio viejo ya tuviera los dos, apagar uno tiene que poder hacerse.
  const choque = cambio.accion === "activar" ? choqueDeExcluyentes(plan.modules, registry) : null;
  if (choque) return { ok: false, motivo: choque };
  return {
    ok: true,
    antes,
    despues: plan.modules,
    incluidos: plan.incluidos,
    sinCambios: mismoConjunto(antes, plan.modules),
  };
}

export type VistaPreviaDeCambio =
  | { ok: false; motivo: string }
  | {
      ok: true;
      antes: string[];
      despues: string[];
      incluidos: string[];
      sinCambios: boolean;
      /** Qué cambia en sus apps con el Inicio por apps prendido: la asignación de hoy contra la nueva. */
      conInicio: DiferenciaDeApps;
      /** La asignación nueva, con el Inicio por apps, contra su menú de siempre. */
      frenteAlMenu: DiferenciaDeApps;
      /** Qué cambia apenas se confirma, con los flags reales (vacío si hoy no tiene gate). */
      alConfirmar: DiferenciaDeApps;
      producto: { antes: Producto; despues: Producto };
    };

export function vistaPreviaDeCambio(
  n: NegocioParaActivar,
  cambio: CambioDeModulo,
  flags: FlagsDeApps,
  registry: ModuleRegistry,
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): VistaPreviaDeCambio {
  const plan = validarCambio(n, cambio, registry);
  if (!plan.ok) return plan;
  const { antes, despues } = plan;
  const mirar = (modules: readonly string[], mirada: Mirada) =>
    appsDelNegocio(n, modules, contextoDe(n, modules, flags, registry, mirada), apps);
  const inicioDespues = mirar(despues, "con-inicio");
  return {
    ...plan,
    conInicio: diferencia(mirar(antes, "con-inicio"), inicioDespues),
    frenteAlMenu: diferencia(mirar(antes, "menu-de-siempre"), inicioDespues),
    alConfirmar: diferencia(mirar(antes, "real"), mirar(despues, "real")),
    producto: {
      antes: derivarProducto({ blueprintId: n.blueprintId, modules: antes }),
      despues: derivarProducto({ blueprintId: n.blueprintId, modules: despues }),
    },
  };
}

// ── Fijar la asignación actual ───────────────────────────────────────────────

export type PlanFijar =
  | { ok: false; motivo: string }
  | {
      ok: true;
      antes: string[];
      despues: string[];
      /** Módulos que se suman, dependencias incluidas, en el orden en que entran. */
      agregados: string[];
      sinCambios: boolean;
      /** Con el Inicio por apps y la asignación fijada, contra su menú de siempre. */
      frenteAlMenu: DiferenciaDeApps;
      /** Apps del menú de siempre que ningún módulo recupera, con el porqué (no debería pasar). */
      noSeRecuperan: { app: AppDescriptor; motivo: string }[];
    };

/**
 * Los módulos que FALTAN para que, con el Inicio por apps prendido, el negocio vea las
 * mismas apps que en su menú de siempre. Se mide contra el menú SIN el Inicio por apps (no
 * contra lo que ve ahora): si ya está en el piloto con una asignación incompleta, lo que
 * perdió también se recupera. Es el mínimo: sólo suma el módulo de cada app que se perdería (con
 * sus dependencias) y nunca saca uno que ya tiene: apagar es otra decisión, con su propia
 * vista previa. En un negocio sin asignación (CH) da exactamente la asignación que
 * reproduce su menú.
 */
export function planFijarAsignacion(
  n: NegocioParaActivar,
  flags: FlagsDeApps,
  registry: ModuleRegistry,
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): PlanFijar {
  if (requiereOkDelDuenio(n.slug)) return { ok: false, motivo: MOTIVO_OK_DEL_DUENIO };

  const antes = [...n.modules];
  const hoy = appsDelNegocio(n, antes, contextoDe(n, antes, flags, registry, "menu-de-siempre"), apps);
  // Se mide SIEMPRE con el gate puesto. Con la asignación vacía el Inicio por apps no filtra
  // (vacío = "todavía no se fijó"), así que mirarlo tal cual no mostraría nada que falte;
  // pero apenas se fije un módulo, el gate se enciende con lo que haya. Por eso, sin módulos,
  // se calcula como un piloto con cero módulos.
  const conInicio = (modules: readonly string[]) =>
    appsDelNegocio(
      n,
      modules,
      contextoDe(n, modules, flags, registry, "con-inicio") ?? { origen: "piloto", modulos: new Set<string>() },
      apps,
    );

  let modules = antes;
  const agregados: string[] = [];
  const noSeRecuperan = new Map<string, { app: AppDescriptor; motivo: string }>();

  // Suma de a un módulo con sus dependencias y vuelve a mirar. Cada vuelta agrega al menos
  // un módulo o termina, así que corta solo; el tope es una red por si el catálogo cambia.
  for (let vuelta = 0; vuelta <= registry.ids().length; vuelta++) {
    const vistas = new Set(conInicio(modules).map((a) => a.id));
    const perdidas = hoy.filter((a) => !vistas.has(a.id) && !noSeRecuperan.has(a.id));
    if (perdidas.length === 0) break;

    let avanzo = false;
    for (const app of perdidas) {
      const r = asegurarModulo(modules, app.modulo, registry, n.blueprintId);
      if (!r.ok) {
        noSeRecuperan.set(app.id, { app, motivo: r.motivo });
        continue;
      }
      for (const id of r.modules) {
        if (!modules.includes(id)) agregados.push(id);
      }
      if (r.modules.length !== modules.length) avanzo = true;
      modules = r.modules;
    }
    if (!avanzo) {
      // Nada nuevo que sumar y todavía se pierden apps: se explica cada una.
      const vistasFinal = new Set(conInicio(modules).map((a) => a.id));
      for (const app of hoy) {
        if (!vistasFinal.has(app.id) && !noSeRecuperan.has(app.id)) {
          noSeRecuperan.set(app.id, {
            app,
            motivo: "Tiene su módulo asignado y aun así no se ve: revisá el rubro del negocio.",
          });
        }
      }
      break;
    }
  }

  const choque = choqueDeExcluyentes(modules, registry);
  if (choque) return { ok: false, motivo: choque };

  return {
    ok: true,
    antes,
    despues: modules,
    agregados,
    sinCambios: agregados.length === 0,
    frenteAlMenu: diferencia(hoy, conInicio(modules)),
    noSeRecuperan: [...noSeRecuperan.values()],
  };
}

/**
 * Deja al módulo EFECTIVO: asignado y con sus dependencias, en cascada. `planActivar` no
 * alcanza solo: si el módulo ya está asignado pero le falta una dependencia, no la suma, y
 * el gate lo descarta igual (`resolverActivacion`).
 */
function asegurarModulo(
  modules: string[],
  id: string | null,
  registry: ModuleRegistry,
  blueprintId: string | null,
): { ok: true; modules: string[] } | { ok: false; motivo: string } {
  if (id === null) return { ok: false, motivo: "Es del núcleo: no depende de ningún módulo." };
  const pendientes = [id];
  const vistos = new Set<string>();
  let actual = modules;
  while (pendientes.length > 0) {
    const cur = pendientes.pop() as string;
    if (vistos.has(cur)) continue;
    vistos.add(cur);
    const plan = planActivar(actual, cur, registry, blueprintId);
    if (plan.error) return { ok: false, motivo: plan.error };
    actual = plan.modules;
    for (const dep of registry.buscar(cur)?.dependencias ?? []) pendientes.push(dep.id);
  }
  return { ok: true, modules: actual };
}

// ── Cuántas apps trae cada módulo (para la lista de la ficha) ────────────────

/**
 * Cuántas apps registradas cuelgan de cada módulo. Un módulo con 0 no abre ninguna pantalla
 * todavía (Mis locales en la ola 1): la ficha lo dice para que nadie le prometa una.
 */
export function appsPorModulo(apps: readonly AppDescriptor[] = REGISTRO_APPS): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const app of apps) {
    if (app.modulo === null || app.enLanzador === false) continue;
    cuenta.set(app.modulo, (cuenta.get(app.modulo) ?? 0) + 1);
  }
  return cuenta;
}
