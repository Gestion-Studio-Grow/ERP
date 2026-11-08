/**
 * FACTURITA · Planes y precios — la ÚNICA fuente de los números que muestra la vidriera de
 * Facturita (landing, /facturita/planes, Mi cuenta). Ninguna pantalla escribe un precio a mano:
 * lo lee de acá, así cuando el dueño confirme o revise la lista se cambia en un solo lugar.
 *
 * Origen: ADR-078 (lista 2026-07-11, revisión trimestral — la próxima tocaba octubre 2026) y
 * docs/producto/blueprint-facturacion-planes.md §5. TODOS los precios están marcados como
 * PROVISIONALES A CONFIRMAR POR EL DUEÑO: la pantalla lo dice, no se esconde.
 *
 * PURO: sin DB, sin red, sin React. Se testea solo (facturita-planes.test.ts).
 */

import { LIMITE_FACTURAS_FACTURITA, type CupoDelPlan } from "@/lib/facturita-core";

/** Leyenda que acompaña SIEMPRE a cualquier precio en pantalla. */
export const ESTADO_PRECIOS = "Precios provisionales, a confirmar por el dueño";

/** De dónde sale la lista (para el pie de la tabla y para quien audite). */
export const ORIGEN_LISTA = "Lista del 11/07/2026 (ADR-078), en revisión trimestral";

/** Los precios se muestran con IVA incluido (blueprint §5: "precio final"). */
export const ACLARACION_IVA = "Precios finales por mes, en pesos, IVA incluido";

export type IdPlan = "facturita" | "factoque-plus" | "factoque-pro" | "solo" | "comercio" | "pyme" | "cm";

export interface Plan {
  id: IdPlan;
  /** Producto de la suite al que pertenece (ADR-076). */
  producto: "facturita" | "comerciante";
  nombre: string;
  /** ARS por mes. 0 = gratis. */
  precioMensual: number;
  /** Para quién es, en una línea. */
  para: string;
  /** Tope de facturas por mes del plan. */
  facturasPorMes: number;
  incluye: readonly string[];
  /** Lo que NO trae (sólo se usa en Facturita: la frontera dura de ADR-076 §3). */
  noIncluye?: readonly string[];
  /** Nota corta debajo del precio (prueba gratis, setup…). */
  nota?: string;
}

/** C · Factoque Gratis: con frontera dura (ADR-076 §3 / ADR-078). Es el plan de `Tenant.plan` nulo. */
export const PLAN_FACTURITA: Plan = {
  id: "facturita",
  producto: "facturita",
  nombre: "Factoque Gratis",
  precioMensual: 0,
  para: "Monotributistas y comercios chicos que hacen pocas facturas por mes.",
  facturasPorMes: LIMITE_FACTURAS_FACTURITA,
  incluye: [
    `${LIMITE_FACTURAS_FACTURITA} facturas por mes, autorizadas por ARCA`,
    "Factura C (monotributo y exentos) o B (inscriptos a consumidor final o exento)",
    "A consumidor final, o con CUIT, CUIL o DNI",
    "Se instala en el celu como una app",
  ],
  noIncluye: [
    "Subir el extracto del banco ni conciliar",
    "Cobrar con Mercado Pago",
    "Soporte por persona (tenés la ayuda paso a paso)",
  ],
  nota: "Sin tarjeta.",
};

/**
 * Planes pagos de Factoque (PLAN-SALIDA-2026-11 §2): la MISMA app y la misma pantalla; lo único que
 * cambia es el tope. Escalera por cantidad de facturas, nunca por usuario (ADR-078 principio 2).
 * Precios provisionales a confirmar (`ESTADO_PRECIOS`). Las notas de crédito siguen la regla del
 * cupo del motor (`filtrosFacturacionMes().cupo`), igual en todos los planes.
 */
export const PLAN_FACTOQUE_PLUS: Plan = {
  id: "factoque-plus",
  producto: "facturita",
  nombre: "Factoque Plus",
  precioMensual: 5_900,
  para: "Monotributistas con clientela fija.",
  facturasPorMes: 40,
  incluye: ["Todo lo de Factoque Gratis", "40 facturas por mes, autorizadas por ARCA", "La misma app: no se migra nada"],
  nota: "Se paga por mes. Sin prueba extra: el plan Gratis ya es la prueba.",
};

export const PLAN_FACTOQUE_PRO: Plan = {
  id: "factoque-pro",
  producto: "facturita",
  nombre: "Factoque Pro",
  precioMensual: 9_900,
  para: "Comercios chicos que facturan todos los días.",
  facturasPorMes: 159,
  incluye: ["Todo lo de Factoque Plus", "159 facturas por mes, autorizadas por ARCA", "La misma app: no se migra nada"],
  nota: "Se paga por mes.",
};

/** La escalera de Factoque, de menor a mayor. */
export const PLANES_FACTOQUE: readonly Plan[] = [PLAN_FACTURITA, PLAN_FACTOQUE_PLUS, PLAN_FACTOQUE_PRO];

/** Los ids que se guardan en `Tenant.plan`. Gratis es `null` (o cualquier otro valor). */
export const IDS_PLAN_FACTOQUE_PAGO = ["factoque-plus", "factoque-pro"] as const;
export type IdPlanFactoquePago = (typeof IDS_PLAN_FACTOQUE_PAGO)[number];

export function esPlanFactoquePago(x: unknown): x is IdPlanFactoquePago {
  return typeof x === "string" && (IDS_PLAN_FACTOQUE_PAGO as readonly string[]).includes(x);
}

/** «AAAA-MM-DD» válido (fecha de calendario real), o `null`. */
export function fechaDeVigencia(x: unknown): string | null {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
  const d = new Date(`${x}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x ? x : null;
}

export interface PlanEfectivo {
  plan: Plan;
  /** El negocio tenía un plan pago con la vigencia vencida: corre Gratis (nada se borra). */
  vencido: boolean;
  /** Hasta qué día (inclusive) corre el plan pago; `null` = sin vencimiento cargado. */
  vigenciaHasta: string | null;
}

/**
 * El plan que rige HOY para un negocio Factoque. `planGuardado` es `Tenant.plan`; `vigenciaHasta`
 * («AAAA-MM-DD», inclusive) la carga el operador al cambiar el plan. `hoy` es la fecha fiscal del
 * negocio en «AAAAMMDD» (`fechaFiscalDelDia`). Un plan pago vencido vuelve a Gratis: el tope pasa a
 * 5 y lo ya emitido queda como está. Una vigencia ilegible se trata como vencida (falla cerrada:
 * corre el plan chico, nunca uno más grande que el pagado).
 */
export function planFactoqueEfectivo(
  planGuardado: string | null | undefined,
  vigenciaHasta: string | null | undefined,
  hoy: string,
): PlanEfectivo {
  if (!esPlanFactoquePago(planGuardado)) return { plan: PLAN_FACTURITA, vencido: false, vigenciaHasta: null };
  const plan = planGuardado === "factoque-pro" ? PLAN_FACTOQUE_PRO : PLAN_FACTOQUE_PLUS;
  if (vigenciaHasta == null) return { plan, vencido: false, vigenciaHasta: null };
  const hasta = fechaDeVigencia(vigenciaHasta);
  if (!hasta || hasta.replaceAll("-", "") < hoy) return { plan: PLAN_FACTURITA, vencido: true, vigenciaHasta: hasta };
  return { plan, vencido: false, vigenciaHasta: hasta };
}

/** El cupo que aplica la regla del tope (`estadoLimite`) para un plan de la escalera de Factoque. */
export function cupoDelPlan(plan: Plan): CupoDelPlan {
  const i = PLANES_FACTOQUE.findIndex((p) => p.id === plan.id);
  const siguiente = i >= 0 ? PLANES_FACTOQUE[i + 1] : undefined;
  return {
    tope: plan.facturasPorMes,
    nombre: plan.nombre,
    gratis: plan.precioMensual <= 0,
    siguiente: siguiente ? { nombre: siguiente.nombre, tope: siguiente.facturasPorMes } : null,
  };
}

export type CambioDePlanFactoque =
  | { ok: true; plan: IdPlanFactoquePago | null; vigenciaHasta: string | null }
  | { ok: false; error: string };

/**
 * Lo que manda el formulario «Cambiar plan» del operador, validado. `plan` vacío o «facturita» =
 * Gratis (`Tenant.plan` nulo); la vigencia es opcional y sólo vale para un plan pago.
 */
export function leerCambioDePlanFactoque(plan: unknown, vigencia: unknown): CambioDePlanFactoque {
  const p = typeof plan === "string" ? plan.trim() : "";
  const v = typeof vigencia === "string" ? vigencia.trim() : "";
  if (p === "" || p === "facturita") {
    return v ? { ok: false, error: "El plan Gratis no lleva vencimiento." } : { ok: true, plan: null, vigenciaHasta: null };
  }
  if (!esPlanFactoquePago(p)) return { ok: false, error: "Ese plan no existe en Factoque." };
  if (!v) return { ok: true, plan: p, vigenciaHasta: null };
  const hasta = fechaDeVigencia(v);
  return hasta ? { ok: true, plan: p, vigenciaHasta: hasta } : { ok: false, error: "La fecha de vencimiento no es válida (AAAA-MM-DD)." };
}

/**
 * Cómo se paga un plan hoy: sin cobro online todavía (PLAN-SALIDA §2), transferencia a GSG y el
 * operador lo activa desde la ficha. El alias es un placeholder hasta que el dueño lo confirme.
 */
export const ALIAS_TRANSFERENCIA_GSG = "provisional a confirmar";

/**
 * A · Comerciante: escalera por tamaño de negocio, NUNCA por usuario (ADR-078 principio 2).
 * Las descripciones son conservadoras a propósito: sólo lo que el blueprint pone como esencia.
 */
export const PLANES_COMERCIANTE: readonly Plan[] = [
  {
    id: "solo",
    producto: "comerciante",
    nombre: "Comerciante Solo",
    precioMensual: 14_900,
    para: "Monotributo o responsable inscripto chico, sin empleados.",
    facturasPorMes: 159,
    incluye: [
      "Todo lo de Factoque, con más facturas por mes",
      "Las facturas se arman solas desde el extracto del banco y Mercado Pago",
      "Notas de crédito y débito en un clic",
      "Avisos de recategorización y del tope del monotributo",
      "Tu contador puede mirar todo, sin tocar",
    ],
    nota: "30 días de prueba sin tarjeta. Alta asistida: $49.900, bonificada si pagás el año.",
  },
  {
    id: "comercio",
    producto: "comerciante",
    nombre: "Comerciante Comercio",
    precioMensual: 39_900,
    para: "Un local con hasta 5 empleados.",
    facturasPorMes: 400,
    incluye: ["Todo lo de Solo", "Hasta 3 usuarios con roles", "2 puntos de venta", "Cobranzas con Mercado Pago"],
  },
  {
    id: "pyme",
    producto: "comerciante",
    nombre: "Comerciante Pyme",
    precioMensual: 89_900,
    para: "Dos o más locales, varias cuentas de banco.",
    facturasPorMes: 1_500,
    incluye: ["Todo lo de Comercio", "Varios locales con su conciliación", "Más usuarios, con roles", "Soporte prioritario"],
  },
  {
    id: "cm",
    producto: "comerciante",
    nombre: "Comerciante Multiprovincia",
    precioMensual: 149_900,
    para: "Inscriptos en Convenio Multilateral.",
    facturasPorMes: 3_000,
    incluye: ["Todo lo de Pyme", "Convenio Multilateral completo", "Percepciones y retenciones por provincia"],
  },
];

/** El primer escalón pago: el salto natural desde Gratis (trigger de la factura n.º 6). */
export const PLAN_SALTO: Plan = PLAN_FACTOQUE_PLUS;

/**
 * Comerciante (producto A) es «lo que sigue» después de Pro: no se vende desde Factoque (sin
 * botón), la vidriera sólo lo menciona.
 */
export const LO_QUE_SIGUE: Plan = PLANES_COMERCIANTE[0];

/** "Gratis" o "$14.900" — sin decimales, separador de miles argentino. */
export function precioTexto(precioMensual: number): string {
  if (precioMensual <= 0) return "Gratis";
  return `$${precioMensual.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/** "$14.900 por mes" / "Gratis". */
export function precioConPeriodo(precioMensual: number): string {
  return precioMensual <= 0 ? "Gratis" : `${precioTexto(precioMensual)} por mes`;
}
