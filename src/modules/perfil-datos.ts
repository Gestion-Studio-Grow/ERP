// ============================================================================
// PERFIL Y DATOS — la valla "sin perder un dato" de un cambio de plan. Puro.
// ============================================================================
//
// Cambiar el plan de un negocio sólo prende o apaga PANTALLAS: escribe tres columnas de su fila
// (`Tenant.plan`, `Tenant.modules`, `Tenant.profile`) y nada más. No borra, no mueve y no recalcula
// ningún dato del negocio: ventas, clientes, turnos, stock y comprobantes quedan como estaban, y lo
// que se apaga vuelve a verse tal cual si el negocio vuelve a un plan que lo traiga.
//
// Esta valla lo hace verificable en dos lugares:
//   · la escritura del cambio de plan (src/lib/operador/plan-escritura.server.ts) pasa por
//     `datosDelCambioDePlan`, que rechaza cualquier campo que no sea de esos tres;
//   · `diferenciasDeConteo` compara los conteos por tabla de antes y después (el recorrido del
//     laboratorio: Micro → PyME → Micro tiene que dar cero diferencias).
//
// Client-safe: sin Prisma ni nada de servidor.

import type { Perfil } from "./perfil";

/** Lo ÚNICO que escribe un cambio de plan en la fila del negocio. */
export const CAMPOS_DEL_CAMBIO_DE_PLAN = ["plan", "modules", "profile"] as const;
export type CampoDelCambioDePlan = (typeof CAMPOS_DEL_CAMBIO_DE_PLAN)[number];

export const PROMESA_SIN_PERDER_DATOS =
  "Cambiar de plan sólo prende o apaga pantallas: no se borra ni se mueve ningún dato del negocio.";

export interface DatosDelCambioDePlan {
  plan: string;
  modules: string[];
  profile: Perfil;
}

/** Los campos de `data` que un cambio de plan NO puede escribir, ordenados. */
export function camposAjenosAlPlan(data: object): string[] {
  const permitidos: readonly string[] = CAMPOS_DEL_CAMBIO_DE_PLAN;
  return Object.keys(data)
    .filter((k) => !permitidos.includes(k))
    .sort();
}

/**
 * Los datos que se escriben en `Tenant` al cambiar de plan, validados. Tira si hay un campo de más o
 * un valor imposible: es un error de programación, y es mejor no escribir nada que tocar un dato.
 */
export function datosDelCambioDePlan(d: DatosDelCambioDePlan): DatosDelCambioDePlan {
  const ajenos = camposAjenosAlPlan(d);
  if (ajenos.length > 0) {
    throw new Error(`Un cambio de plan sólo prende o apaga pantallas: no puede escribir ${ajenos.join(", ")}.`);
  }
  if (typeof d.plan !== "string" || d.plan.trim() === "") {
    throw new Error("Un cambio de plan necesita el plan nuevo.");
  }
  if (!Array.isArray(d.modules) || !d.modules.every((m) => typeof m === "string" && m.trim() !== "")) {
    throw new Error("Un cambio de plan necesita la lista de módulos nueva, sin vacíos.");
  }
  if (d.profile !== "lite" && d.profile !== "enterprise") {
    throw new Error(`Perfil desconocido: ${String(d.profile)}.`);
  }
  return { plan: d.plan.trim(), modules: [...new Set(d.modules)], profile: d.profile };
}

/** Un módulo que se apaga con el cambio, con el nombre que ve el operador. */
export interface ModuloQueSeApaga {
  id: string;
  nombre: string;
}

/** Lo que se le dice al operador por cada módulo que se apaga: la pantalla se va, los datos no. */
export function avisosDeDatosQueQuedan(apagados: readonly ModuloQueSeApaga[]): string[] {
  return apagados.map(
    (m) => `«${m.nombre}» se apaga: lo cargado queda guardado y vuelve a verse si el negocio vuelve a un plan que lo traiga.`,
  );
}

// ── Conteos por tabla (la prueba del laboratorio) ──────────────────────────────

export type ConteosPorTabla = Readonly<Record<string, number>>;

export interface DiferenciaDeConteo {
  tabla: string;
  /** `null` = la tabla no estaba en esa foto. */
  antes: number | null;
  despues: number | null;
}

/** Las tablas cuyo conteo cambió entre dos fotos, ordenadas por nombre. Vacío = no se perdió ni se sumó nada. */
export function diferenciasDeConteo(antes: ConteosPorTabla, despues: ConteosPorTabla): DiferenciaDeConteo[] {
  const tablas = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].sort();
  return tablas.flatMap((tabla) => {
    const a = Object.hasOwn(antes, tabla) ? antes[tabla] : null;
    const d = Object.hasOwn(despues, tabla) ? despues[tabla] : null;
    return a === d ? [] : [{ tabla, antes: a, despues: d }];
  });
}
