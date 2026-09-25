// ============================================================================
// APPS DEL PLAN — la vitrina del plan sale de la MISMA función que el Inicio.
// ============================================================================
//
// Qué apps trae un plan no se escribe a mano: se calcula con `appsVisibles`
// (src/apps/visibles.ts:212) sobre un negocio de muestra que tiene los módulos del plan. Así la
// web, la consola y "Tu plan" nunca prometen una pantalla que la guardia de la página después
// rebota: si el registro cambia, la vitrina cambia sola.
//
// El gate del negocio de muestra sale de `resolverContextoApps` (visibles.ts:64), la misma
// función que usan el panel y la consola, con el interruptor "Trabaja por apps" prendido. No se
// arma a mano: así cada plan se mide con el menú que tendría un negocio real.
//   · La escalera (Facturación a PyME) cae en un blueprint de su rubro y da el origen "piloto": el
//     módulo decide cada app (visibles.ts:88).
//   · El Estudio trae `cartera`, así que su producto es el del contador y SIEMPRE tiene el menú de
//     su producto (origen "producto", visibles.ts:81), prendido o no el interruptor.
//
// La vitrina es lo que ese negocio ve SEGURO: lo que ve con el motor de perfiles prendido (su
// perfil es el del plan) y también apagado (perfil `null`, que es como corre hoy). Una app que
// sólo aparece con uno de los dos no se promete.
//
// Vale para un negocio que trabaja por apps. Sin ese interruptor (origen `null`) el plan no filtra
// nada y el negocio ve su menú de siempre: por eso la consola, al aplicar un plan, lo tiene que
// prender (R2-F4). Y un negocio con blueprint "generico" (el Comerciante de facturación de hoy)
// conserva el menú de su producto aunque lo tenga prendido: para él, la vista previa de un cambio
// es `vistaPreviaDeCambio` (tenants/[id]/apps-del-negocio.ts:360) sobre su fila real. Los dos
// casos los mide catalogo.test.ts.
//
// Mira a la dueña: tiene todas las capabilities (ROLE_CAPABILITIES.OWNER = ALL_CAPABILITIES,
// src/lib/capabilities.ts), así que lo que ve ella es lo que trae el plan. Lo verifica el test.
//
// Client-safe: sin Prisma ni nada de servidor. El catálogo de módulos entra por parámetro, como en
// `resolverContextoApps`, para no arrastrarlo al bundle del navegador.

import type { AppDescriptor, RubroApp } from "@/apps/contract";
import { REGISTRO_APPS } from "@/apps/registro";
import { appsVisibles, resolverContextoApps, type ContextoApps, type NegocioApps } from "@/apps/visibles";
import type { ModuleId } from "@/modules/contract";
import type { ModuleRegistry } from "@/modules/registry";
import { modulosDelPlan, modulosPosiblesDelPlan, planPorId, type PlanDescriptor, type PlanId } from "./catalogo";

/**
 * El negocio de muestra de cada rubro: un blueprint real de ese rubro y los dos datos de la barra.
 * El blueprint no cambia qué módulos entran (todos los del plan aceptan cualquier blueprint del
 * rubro, lo prueba catalogo.test.ts contra todos los registrados); "estetica" es el vertical
 * principal del rubro servicios.
 */
export const NEGOCIO_DE_MUESTRA: Readonly<
  Record<RubroApp, { blueprintId: string; esMostrador: boolean; carniceriaLista: boolean }>
> = {
  servicios: { blueprintId: "estetica", esMostrador: false, carniceriaLista: false },
  mostrador: { blueprintId: "kiosco", esMostrador: true, carniceriaLista: false },
  carniceria: { blueprintId: "carniceria", esMostrador: true, carniceriaLista: true },
};

function descriptor(plan: PlanId | PlanDescriptor): PlanDescriptor {
  return typeof plan === "string" ? planPorId(plan) : plan;
}

/**
 * El gate por módulo de un negocio de este plan que trabaja por apps: `resolverContextoApps` sobre
 * la fila de muestra, con "Trabaja por apps" prendido y sin el flag global (apagado, como hoy).
 */
export function contextoDelPlan(
  plan: PlanId | PlanDescriptor,
  rubro: RubroApp,
  catalogoModulos: ModuleRegistry,
  agregados: readonly ModuleId[] = [],
): ContextoApps {
  const p = descriptor(plan);
  const { modulos } = modulosDelPlan(p, rubro, agregados);
  const contexto = resolverContextoApps(
    { id: `plan:${p.id}`, slug: null, blueprintId: NEGOCIO_DE_MUESTRA[rubro].blueprintId, modules: modulos },
    { registroGlobal: false, enInicioPorApps: true },
    catalogoModulos,
  );
  // Con módulos y el interruptor prendido siempre hay gate; si no lo hubiera, el plan no filtraría
  // nada y la vitrina mentiría. Mejor romper acá que prometer de más.
  if (!contexto) throw new Error(`contextoDelPlan: el plan ${p.id} no filtra apps en ${rubro}.`);
  return contexto;
}

/** El negocio de muestra del plan, mirado por la dueña, con el motor de perfiles prendido. */
export function negocioDelPlan(
  plan: PlanId | PlanDescriptor,
  rubro: RubroApp,
  catalogoModulos: ModuleRegistry,
  agregados: readonly ModuleId[] = [],
): NegocioApps {
  const p = descriptor(plan);
  const muestra = NEGOCIO_DE_MUESTRA[rubro];
  return {
    role: "OWNER",
    contexto: contextoDelPlan(p, rubro, catalogoModulos, agregados),
    modulosAsignados: modulosDelPlan(p, rubro, agregados).modulos,
    perfil: p.perfil,
    esMostrador: muestra.esMostrador,
    carniceriaLista: muestra.carniceriaLista,
  };
}

/**
 * Las apps que trae el plan en ese rubro, en el orden del Inicio. Es `appsVisibles` sobre el
 * negocio de muestra: la misma regla que el Inicio, la barra y la guardia de cada página. Sólo
 * las que ve con el motor de perfiles prendido Y apagado.
 */
export function appsDelPlan(
  plan: PlanId | PlanDescriptor,
  rubro: RubroApp,
  catalogoModulos: ModuleRegistry,
  opciones: { agregados?: readonly ModuleId[]; apps?: readonly AppDescriptor[] } = {},
): AppDescriptor[] {
  const apps = opciones.apps ?? REGISTRO_APPS;
  const negocio = negocioDelPlan(plan, rubro, catalogoModulos, opciones.agregados ?? []);
  const sinMotor = new Set(appsVisibles({ ...negocio, perfil: null }, apps).map((a) => a.id));
  return appsVisibles(negocio, apps).filter((a) => sinMotor.has(a.id));
}

/**
 * Apps de los módulos que el plan vende (los suyos, los de cualquier rubro y los agregables) que
 * todavía están en preparación. Tiene que dar vacío: un plan que vende un módulo cuya app no está
 * lista promete una pantalla que no se ve. Las del núcleo (`modulo: null`) no cuentan: vienen con
 * la plataforma, no con el plan.
 */
export function appsEnPreparacionDelPlan(
  plan: PlanId | PlanDescriptor,
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): AppDescriptor[] {
  const modulos = new Set(modulosPosiblesDelPlan(descriptor(plan)));
  return apps.filter((a) => a.modulo !== null && modulos.has(a.modulo) && a.estado !== "lista");
}
