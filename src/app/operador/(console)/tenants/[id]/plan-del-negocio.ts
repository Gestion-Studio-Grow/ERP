// ============================================================================
// PLAN DEL NEGOCIO — la vista previa y la decisión de un cambio de plan (consola). Puro.
// ============================================================================
//
// Cambiar el plan escribe tres columnas de la fila del negocio (`plan`, `modules`, `profile`) y
// nada más: prende o apaga pantallas, no toca un dato (la valla vive en src/modules/perfil-datos.ts).
// Lo decide `vistaPreviaDePlan`, que usan la tarjeta para mostrar y la action para volver a
// decidir con la base fresca (el botón habilitado no prueba nada):
//   · candado de CH: un negocio de REQUIEREN_OK_DEL_DUENIO no cambia de plan (apps-del-negocio.ts:87);
//   · los módulos salen del catálogo de planes (`modulosDelPlan`, src/planes/catalogo.ts) para el
//     rubro del negocio, conservando los agregados que el plan nuevo acepta;
//   · no se apaga «Mis locales» ni el panel del contador con vínculos activos (los locales o los
//     clientes de la cartera quedarían colgando), igual que en el cambio de a un módulo;
//   · las apps que gana y pierde se miden con `appsVisibles`, la misma regla del Inicio, sobre la
//     asignación nueva y los interruptores REALES (`alAplicar`): es lo que el Inicio muestra apenas
//     se aplica. `conInicio` es lo que vería trabajando por apps (hoy o cuando se lo prendan).
//   · las excepciones de límites vigentes (de cualquier plan) se cierran: el negocio arranca con
//     los topes del plan nuevo y una excepción vieja nunca regala nada en silencio (limites.ts:16-20).
//
// Client-safe: sin Prisma. El catálogo de módulos entra por parámetro.

import type { AppDescriptor } from "@/apps/contract";
import { REGISTRO_APPS } from "@/apps/registro";
import { appsVisibles, resolverContextoApps } from "@/apps/visibles";
import type { Role } from "@/lib/capabilities";
import type { ModuleRegistry } from "@/modules/registry";
import type { Perfil } from "@/modules/perfil";
import { avisosDeDatosQueQuedan, datosDelCambioDePlan, type DatosDelCambioDePlan } from "@/modules/perfil-datos";
import {
  esPlanId,
  LIMITE_IDS,
  modulosDelPlan,
  PLAN_IDS,
  planPorId,
  rubroDelNegocio,
  type LimiteId,
  type PlanId,
  type Tope,
} from "@/planes/catalogo";
import { filaDeExcepcionDeLimite, limitesDelNegocio, type FilaDeLimite, type NuevaFilaDeLimite } from "@/planes/limites";
import {
  mismoConjunto,
  requiereOkDelDuenio,
  type DiferenciaDeApps,
  type FlagsDeApps,
  type NegocioParaActivar,
} from "./apps-del-negocio";

export const MOTIVO_PLAN_OK_DEL_DUENIO =
  "Requiere OK del dueño: es el único cliente en producción y su plan no cambia sin su aprobación.";

export const MOTIVO_PLAN_INEXISTENTE = "Ese plan no existe. Recargá la ficha y elegilo de nuevo.";

/** El negocio con todo lo que decide sus apps, más lo que guarda su fila sobre el plan. */
export interface NegocioParaPlan extends NegocioParaActivar {
  /** `Tenant.plan` tal cual (puede ser nulo o un texto viejo). */
  plan: string | null;
  /** `Tenant.profile` tal cual (la columna, no el perfil activo: ese es `perfil`). */
  profile: Perfil | null;
}

/** Una excepción de límite vigente, de cualquier plan. */
export interface ExcepcionVigente {
  limite: LimiteId;
  plan: PlanId;
  valor: Tope;
  quien: string;
}

export type VistaPreviaDePlan =
  | { ok: false; motivo: string }
  | {
      ok: true;
      plan: PlanId;
      nombre: string;
      /** Ya tiene ese plan, esos módulos y ese perfil: no hay nada que escribir. */
      sinCambios: boolean;
      antes: { plan: string | null; modules: string[]; profile: Perfil | null };
      /** Lo que se escribe en la fila (sólo plan, modules y profile). */
      despues: DatosDelCambioDePlan;
      modulosQueSePrenden: string[];
      modulosQueSeApagan: string[];
      /** ¿Tiene prendido «Trabaja por apps»? Sin él, el plan no filtra su Inicio. */
      trabajaPorApps: boolean;
      /** Lo que cambia en su Inicio apenas se aplica (interruptores reales). */
      alAplicar: DiferenciaDeApps;
      /** Su Inicio después de aplicar (unión de sus roles), en el orden del Inicio. */
      appsDespues: AppDescriptor[];
      /** Lo que cambia trabajando por apps (hoy o cuando se lo prendan). */
      conInicio: DiferenciaDeApps;
      /** Una línea por módulo que se apaga: la pantalla se va, los datos quedan. */
      datosQueQuedan: string[];
      excepcionesQueSeCierran: ExcepcionVigente[];
    };

const ROLES: readonly Role[] = ["OWNER", "RECEPTION", "PROFESSIONAL"];

/** Las apps que ve al menos uno de sus roles con esta asignación, en el orden del Inicio. */
function appsCon(
  n: NegocioParaActivar,
  modules: readonly string[],
  perfil: Perfil | null,
  flags: FlagsDeApps,
  enInicioPorApps: boolean,
  registry: ModuleRegistry,
  apps: readonly AppDescriptor[],
): AppDescriptor[] {
  const contexto = resolverContextoApps(
    { id: n.id, slug: n.slug, blueprintId: n.blueprintId, modules },
    { registroGlobal: flags.registroGlobal, enInicioPorApps },
    registry,
  );
  const vistas = new Map<string, AppDescriptor>();
  for (const role of ROLES) {
    const negocio = {
      role,
      contexto,
      modulosAsignados: [...modules],
      perfil,
      esMostrador: n.esMostrador,
      carniceriaLista: n.carniceriaLista,
    };
    for (const a of appsVisibles(negocio, apps)) if (!vistas.has(a.id)) vistas.set(a.id, a);
  }
  return [...vistas.values()];
}

function diferencia(antes: readonly AppDescriptor[], despues: readonly AppDescriptor[]): DiferenciaDeApps {
  const idsAntes = new Set(antes.map((a) => a.id));
  const idsDespues = new Set(despues.map((a) => a.id));
  return {
    gana: despues.filter((a) => !idsAntes.has(a.id)),
    pierde: antes.filter((a) => !idsDespues.has(a.id)),
  };
}

/** Las excepciones de límites vigentes del negocio, de TODOS los planes (una por límite y plan). */
export function excepcionesVigentes(slug: string | null, filas: readonly FilaDeLimite[]): ExcepcionVigente[] {
  return PLAN_IDS.flatMap((plan) => {
    const l = limitesDelNegocio({ slug, plan }, filas);
    return LIMITE_IDS.flatMap((limite) => {
      const t = l.topes[limite];
      return t.origen === "excepcion" ? [{ limite, plan, valor: t.valor, quien: t.quien ?? "" }] : [];
    });
  });
}

/** Las filas de AuditLog que cierran esas excepciones ("limite.quitar-ajuste" de su plan). */
export function filasQueCierranExcepciones(
  tenantId: string,
  operador: string,
  vigentes: readonly ExcepcionVigente[],
): NuevaFilaDeLimite[] {
  return vigentes.map((e) => filaDeExcepcionDeLimite({ tenantId, operador, plan: e.plan, limite: e.limite }));
}

/** Módulos que guardan vínculos con otros negocios: no se apagan con vínculos activos. */
const CON_VINCULOS: readonly { modulo: string; que: (n: number) => string; donde: string }[] = [
  {
    modulo: "multilocal",
    que: (n) => `${n} ${n === 1 ? "local vinculado" : "locales vinculados"} a su red`,
    donde: "Primero dalos de baja en «Red de locales» (en esta ficha) y después cambiá el plan.",
  },
  {
    modulo: "cartera",
    que: (n) => `${n} ${n === 1 ? "cliente" : "clientes"} en su cartera de estudio contable`,
    donde: "Primero dalos de baja de la cartera y después cambiá el plan.",
  },
];

function choqueConVinculos(n: NegocioParaActivar, despues: readonly string[], nombrePlan: string): string | null {
  for (const c of CON_VINCULOS) {
    if (!n.modules.includes(c.modulo) || despues.includes(c.modulo)) continue;
    const v = n.vinculosActivos;
    if (v === null || v === undefined) {
      return "No pudimos leer su red de locales ni su cartera, y el plan nuevo las apaga. Recargá la ficha y probá de nuevo.";
    }
    if (v > 0) return `Tiene ${c.que(v)} y el plan ${nombrePlan} no lo trae. ${c.donde}`;
  }
  if (despues.includes("multilocal") && despues.includes("cartera")) {
    return "El plan dejaría juntos «Mis locales» y el panel del contador, que no pueden convivir. Avisá a producto.";
  }
  return null;
}

/**
 * ¿Se puede pasar este negocio a este plan, y qué le cambia? `filas` son las filas de AuditLog de
 * sus excepciones (idealmente filtradas con `filtroDeExcepcionesValidas`); se revalidan acá.
 */
export function vistaPreviaDePlan(
  n: NegocioParaPlan,
  planPedido: string,
  flags: FlagsDeApps,
  registry: ModuleRegistry,
  filas: readonly FilaDeLimite[] = [],
  apps: readonly AppDescriptor[] = REGISTRO_APPS,
): VistaPreviaDePlan {
  if (requiereOkDelDuenio(n.slug)) return { ok: false, motivo: MOTIVO_PLAN_OK_DEL_DUENIO };
  if (!esPlanId(planPedido)) return { ok: false, motivo: MOTIVO_PLAN_INEXISTENTE };
  const p = planPorId(planPedido);
  const rubro = rubroDelNegocio(n);
  // Agregados que se conservan: los que el negocio sumó POR FUERA de su plan de hoy (lo que trae la
  // base de su plan no es un agregado: si no, PyME → Micro se quedaría con los módulos de PyME que
  // Micro acepta sueltos y la vuelta no daría las mismas pantallas). Sin plan del catálogo, todo lo
  // que tiene cuenta como sumado.
  const baseDeHoy = esPlanId(n.plan) ? modulosDelPlan(n.plan, rubro).modulos : [];
  const sumados = n.modules.filter((m) => !baseDeHoy.includes(m) && p.agregables.includes(m));
  const { modulos } = modulosDelPlan(p, rubro, sumados);
  const choque = choqueConVinculos(n, modulos, p.nombre);
  if (choque) return { ok: false, motivo: choque };

  const despues = datosDelCambioDePlan({ plan: p.id, modules: modulos, profile: p.perfil });
  // El perfil ACTIVO sigue al motor de perfiles: apagado (hoy) no cuenta, prendido es la columna.
  const perfilDespues = n.perfil === null ? null : despues.profile;
  const hoy = appsCon(n, n.modules, n.perfil, flags, flags.enInicioPorApps, registry, apps);
  const appsDespues = appsCon(n, despues.modules, perfilDespues, flags, flags.enInicioPorApps, registry, apps);
  const hoyConInicio = appsCon(n, n.modules, n.perfil, flags, true, registry, apps);
  const despuesConInicio = appsCon(n, despues.modules, perfilDespues, flags, true, registry, apps);
  const apagados = n.modules.filter((m) => !despues.modules.includes(m));
  const sinCambios = n.plan === p.id && mismoConjunto(n.modules, despues.modules) && n.profile === despues.profile;

  return {
    ok: true,
    plan: p.id,
    nombre: p.nombre,
    sinCambios,
    antes: { plan: n.plan, modules: [...n.modules], profile: n.profile },
    despues,
    modulosQueSePrenden: despues.modules.filter((m) => !n.modules.includes(m)),
    modulosQueSeApagan: apagados,
    trabajaPorApps: flags.enInicioPorApps,
    alAplicar: diferencia(hoy, appsDespues),
    appsDespues,
    conInicio: diferencia(hoyConInicio, despuesConInicio),
    datosQueQuedan: avisosDeDatosQueQuedan(apagados.map((id) => ({ id, nombre: registry.buscar(id)?.nombre ?? id }))),
    excepcionesQueSeCierran: sinCambios ? [] : excepcionesVigentes(n.slug, filas),
  };
}

/**
 * Si el cambio le saca apps de su Inicio apenas se aplica, el operador tiene que marcar que lo
 * entiende. `null` = se puede aplicar.
 */
export function motivoSiFaltaConfirmar(previa: VistaPreviaDePlan, confirmado: boolean): string | null {
  if (!previa.ok || previa.sinCambios || confirmado) return null;
  const k = previa.alAplicar.pierde.length;
  if (k === 0) return null;
  return (
    `Con el plan ${previa.nombre} deja de ver ${k} ${k === 1 ? "app" : "apps"} ` +
    `(${previa.alAplicar.pierde.map((a) => a.nombre).join(", ")}). ` +
    "Marcá «Entiendo» para confirmar: sus datos quedan guardados."
  );
}
