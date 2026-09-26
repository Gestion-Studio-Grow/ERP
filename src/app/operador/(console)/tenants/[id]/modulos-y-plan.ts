// ============================================================================
// Los interruptores de módulos respetan el plan del negocio (GSG-19). PURO.
// ============================================================================
//
// Antes, a un negocio Micro se le prendía «Cuentas a pagar» desde la ficha sin aviso: la vista
// previa sólo hablaba de apps, y se regalaba una función de un plan más caro mientras «Tu plan»
// seguía diciendo Micro. La regla de qué entra en cada plan es UNA y vive en el catálogo
// (`modulosDelPlan`, src/planes/catalogo.ts:283-304): acá sólo se la aplica a lo que un cambio SUMA
// (el módulo pedido y las dependencias que arrastra). Lo que el negocio ya tiene no se juzga:
// apagar nunca se frena por el plan.
//
// Un negocio sin plan del catálogo (vacío o un plan comercial viejo) no tiene tope: no se frena.

import { esPlanId, modulosDelPlan, planPorId, rubroDelNegocio } from "@/planes/catalogo";

export interface NegocioConPlan {
  /** `Tenant.plan` tal cual está en la base. */
  plan: string | null | undefined;
  esMostrador: boolean;
  carniceriaLista: boolean;
}

/**
 * `null` si todo lo que el cambio suma entra en el plan del negocio; si no, el motivo para el
 * operador, con el nombre de cada módulo que no entra (`nombreDe`) y cómo destrabarlo.
 */
export function motivoFueraDelPlan(
  negocio: NegocioConPlan,
  antes: readonly string[],
  despues: readonly string[],
  nombreDe: (id: string) => string,
): string | null {
  if (!esPlanId(negocio.plan)) return null;
  const tenia = new Set(antes);
  const suma = despues.filter((id) => !tenia.has(id));
  if (suma.length === 0) return null;
  const { rechazados } = modulosDelPlan(negocio.plan, rubroDelNegocio(negocio), suma);
  if (rechazados.length === 0) return null;
  const plan = planPorId(negocio.plan).nombre;
  const nombres = rechazados.map((r) => `«${nombreDe(r.id)}»`).join(", ");
  const verbo = rechazados.length === 1 ? "no entra" : "no entran";
  return (
    `${nombres} ${verbo} en ${plan}. Para sumarlo, primero pasá el negocio a un plan que lo traiga ` +
    "(«Plan del negocio», en esta misma pestaña). No se cambió nada."
  );
}
