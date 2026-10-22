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

import { LIMITE_FACTURAS_FACTURITA } from "@/lib/facturita-core";

/** Leyenda que acompaña SIEMPRE a cualquier precio en pantalla. */
export const ESTADO_PRECIOS = "Precios provisionales, a confirmar por el dueño";

/** De dónde sale la lista (para el pie de la tabla y para quien audite). */
export const ORIGEN_LISTA = "Lista del 11/07/2026 (ADR-078), en revisión trimestral";

/** Los precios se muestran con IVA incluido (blueprint §5: "precio final"). */
export const ACLARACION_IVA = "Precios finales por mes, en pesos, IVA incluido";

export type IdPlan = "facturita" | "solo" | "comercio" | "pyme" | "cm";

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

/** C · Facturita: gratis, con frontera dura (ADR-076 §3 / ADR-078). */
export const PLAN_FACTURITA: Plan = {
  id: "facturita",
  producto: "facturita",
  nombre: "Facturita",
  precioMensual: 0,
  para: "Monotributistas y comercios chicos que hacen pocas facturas por mes.",
  facturasPorMes: LIMITE_FACTURAS_FACTURITA,
  incluye: [
    `${LIMITE_FACTURAS_FACTURITA} facturas por mes con validez de ARCA`,
    "La letra (A, B o C) la elige el sistema",
    "A consumidor final, o con CUIT, CUIL o DNI",
    "Se instala en el celu como una app",
  ],
  noIncluye: [
    "Subir el extracto del banco ni conciliar",
    "Cobrar con Mercado Pago",
    "Soporte por persona (tenés la ayuda paso a paso)",
  ],
  nota: "Para siempre, sin tarjeta.",
};

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
      "Todo lo de Facturita, sin el tope de 5",
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
    incluye: ["Todo lo de Comercio", "Varios locales con su conciliación", "Usuarios sin límite", "Soporte prioritario"],
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

/** El primer escalón pago: el salto natural desde Facturita (trigger de la factura n.º 6). */
export const PLAN_SALTO: Plan = PLANES_COMERCIANTE[0];

/** "Gratis" o "$14.900" — sin decimales, separador de miles argentino. */
export function precioTexto(precioMensual: number): string {
  if (precioMensual <= 0) return "Gratis";
  return `$${precioMensual.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/** "$14.900 por mes" / "Gratis". */
export function precioConPeriodo(precioMensual: number): string {
  return precioMensual <= 0 ? "Gratis" : `${precioTexto(precioMensual)} por mes`;
}
