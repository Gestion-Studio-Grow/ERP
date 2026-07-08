// Catálogo de SKUs — Plantillería AR
// Fuente única de verdad para la landing, páginas de producto, carrito y entrega.
// Precios en USD con equivalente ARS de referencia (informativo, el argentino piensa en pesos).
//
// DEMO: el checkout es Mercado Pago en MODO DEMO (no cobra plata real, no persiste datos).
// No hay URLs de pasarela real ni secretos embebidos (ADR-030/031).

export type Formato = "Google Sheets" | "Excel" | "Notion" | "Google Docs";

export interface Plantilla {
  slug: string;
  nombre: string;
  gancho: string; // one-liner de venta
  formato: Formato[];
  precioUSD: number;
  precioARSref: number; // referencia informativa, no es el cobro
  publico: string; // a quién le sirve
  dolor: string; // el problema que resuelve
  incluye: string[]; // bullets concretos de contenido
  normativa: string[]; // qué reglas AR están embebidas
  destacada: boolean;
  emoji: string; // ícono liviano para la ficha (sin assets externos, costo-cero)
}

export const PLANTILLAS: Plantilla[] = [
  {
    slug: "control-monotributo",
    nombre: "Control de Monotributo AR",
    gancho:
      "No te pases de categoría sin darte cuenta. Alertas de recategorización antes de que ARCA te reclame.",
    formato: ["Google Sheets", "Excel"],
    precioUSD: 29,
    precioARSref: 32000,
    publico:
      "Monotributistas, freelancers, prestadores de servicios y oficios que facturan por su cuenta.",
    dolor:
      "El monotributista no sabe en tiempo real cuánto lleva facturado ni cuándo se está por pasar de categoría. Se entera tarde, cuando ARCA lo recategoriza de oficio o le cae una multa.",
    incluye: [
      "Registro de facturación mensual con acumulado móvil de 12 meses (el que mira ARCA).",
      "Tabla de categorías A–K actualizada con topes de ingresos vigentes.",
      "Semáforo automático: verde / amarillo / rojo según cercanía al tope de tu categoría.",
      "Cálculo del componente impositivo + aportes por categoría y total mensual a pagar.",
      "Recordatorio de fechas de pago y de las dos recategorizaciones anuales (enero / julio).",
      "Hoja de facturas emitidas para conciliar con el portal de ARCA.",
    ],
    normativa: [
      "Escalas y topes de categorías de Monotributo (Régimen Simplificado).",
      "Recategorización semestral obligatoria (enero y julio).",
      "Componente impositivo + aportes SIPA + obra social.",
    ],
    destacada: true,
    emoji: "📊",
  },
  {
    slug: "presupuestador-oficios",
    nombre: "Presupuestador para Oficios",
    gancho:
      "Cotizá trabajos en 5 minutos con precio de materiales + mano de obra y margen que no te comas la inflación.",
    formato: ["Google Sheets", "Excel"],
    precioUSD: 39,
    precioARSref: 43000,
    publico: "Plomeros, electricistas, gasistas, pintores, albañiles, herreros, carpinteros.",
    dolor:
      "El oficio cotiza de memoria o en un papel, se olvida de cargar materiales, no aplica margen ni ajuste por inflación, y termina trabajando gratis. Encima el presupuesto se ve improvisado.",
    incluye: [
      "Planilla de cotización con ítems de materiales + mano de obra por hora/jornal.",
      "Lista de materiales editable con precio unitario y cantidad; recalcula el total solo.",
      "Margen de ganancia configurable + colchón por inflación / validez del presupuesto (7-15 días).",
      "Cálculo de mano de obra por hora o por m² según el rubro.",
      "Presupuesto listo para imprimir/PDF con tus datos, logo y numeración.",
      "Historial de trabajos cotizados y ganados para ver tu rentabilidad real.",
    ],
    normativa: [
      "Formato de presupuesto usual AR (validez, seña, saldo contra entrega).",
      "Discriminación de mano de obra vs. materiales (base para facturar como monotributista).",
    ],
    destacada: true,
    emoji: "🔧",
  },
  {
    slug: "caja-stock-kiosco",
    nombre: "Caja y Stock para Kiosco / Comercio",
    gancho: "Sabé cuánto ganás de verdad cada día y qué reponer, sin sistema caro ni contador.",
    formato: ["Google Sheets", "Excel"],
    precioUSD: 35,
    precioARSref: 39000,
    publico: "Kioscos, almacenes, dietéticas, ferreterías chicas, comercios de barrio.",
    dolor:
      "El comerciante mete la mano en la caja y no sabe si ganó o perdió en el día. No tiene control de stock, se queda sin lo que más vende y se llena de lo que no rota.",
    incluye: [
      "Cierre de caja diario: ventas efectivo / débito / QR / crédito, gastos y arqueo.",
      "Control de stock con stock mínimo y alerta de reposición automática.",
      "Margen por producto y detección de los que más y menos rinden.",
      "Resumen mensual de ventas, costos y ganancia neta con gráfico.",
      "Carga rápida de compras a proveedores para actualizar costos con la inflación.",
    ],
    normativa: [
      "Separación de medios de cobro (efectivo, débito, QR interoperable, crédito).",
      "Base ordenada para la DDJJ de monotributo o el contador.",
    ],
    destacada: true,
    emoji: "🏪",
  },
  {
    slug: "sueldos-simple",
    nombre: "Liquidación de Sueldos Simple AR",
    gancho:
      "Recibo, aguinaldo y vacaciones bien calculados para tu empleado, sin planilla de otro país.",
    formato: ["Google Sheets", "Excel"],
    precioUSD: 45,
    precioARSref: 50000,
    publico: "Pymes y comercios con 1 a 5 empleados en relación de dependencia.",
    dolor:
      "El dueño de un comercio chico paga sueldos a ojo, no sabe calcular el aguinaldo ni los descuentos de ley, y las planillas que baja de internet están hechas para México o España.",
    incluye: [
      "Recibo de sueldo con sueldo básico, presentismo, antigüedad y adicionales.",
      "Descuentos de ley: jubilación (11%), obra social (3%), sindical (según convenio).",
      "Cálculo de SAC (aguinaldo): la mejor remuneración del semestre / 2.",
      "Cálculo de vacaciones según antigüedad (14/21/28/35 días).",
      "Provisiones mensuales de aguinaldo y vacaciones para no descapitalizarte.",
      "Planilla anual por empleado con acumulados.",
    ],
    normativa: [
      "Descuentos SIPA / obra social / cuota sindical sobre el bruto.",
      "SAC (Ley 27.073): 50% de la mejor remuneración mensual del semestre.",
      "Días de vacaciones por antigüedad (LCT art. 150).",
    ],
    destacada: false,
    emoji: "🧾",
  },
  {
    slug: "finanzas-personales-ar",
    nombre: "Finanzas Personales AR (anti-inflación)",
    gancho:
      "Presupuesto que sobrevive a la inflación: pensado en pesos, dólares y plazo fijo, no en dólares estables.",
    formato: ["Google Sheets", "Notion"],
    precioUSD: 25,
    precioARSref: 28000,
    publico: "Personas y familias que quieren ordenar sus gastos en un contexto de inflación.",
    dolor:
      "Las plantillas de finanzas personales asumen precios estables y ahorro en una sola moneda. En Argentina no sirven: hay que pensar en pesos que se devalúan, dólares, plazo fijo y compras adelantadas.",
    incluye: [
      "Presupuesto mensual por categorías con % sobre ingreso (regla 50/30/20 adaptada AR).",
      "Seguimiento de ahorro en pesos, dólares (MEP/blue) y plazo fijo con tasa.",
      "Panel de patrimonio en dólares para ver tu poder de compra real mes a mes.",
      "Registro de deudas y cuotas (tarjeta, préstamos) con costo financiero.",
      "Metas de ahorro con proyección ajustada por inflación esperada.",
    ],
    normativa: [
      "Distinción de cotizaciones de dólar habituales (oficial, MEP, blue).",
      "Lógica de ahorro real (poder de compra) propia del contexto AR.",
    ],
    destacada: false,
    emoji: "💸",
  },
];

export const PLANTILLAS_DESTACADAS = PLANTILLAS.filter((p) => p.destacada);

export function getPlantilla(slug: string): Plantilla | undefined {
  return PLANTILLAS.find((p) => p.slug === slug);
}

// Bundle: todo el catálogo con descuento (ancla de precio + ticket alto).
export interface Bundle {
  slug: string;
  nombre: string;
  gancho: string;
  precioUSD: number;
  precioARSref: number;
  ahorroUSD: number;
  emoji: string;
}

export const BUNDLE: Bundle = {
  slug: "pack-completo",
  nombre: "Pack Completo (las 5 plantillas)",
  gancho: "Todo el kit para ordenar tu negocio y tu plata. Comprás las 5 por menos que 3 sueltas.",
  precioUSD: 89,
  precioARSref: 99000,
  ahorroUSD: 84, // suma suelta 173 vs 89
  emoji: "📦",
};

// Un ítem comprable = una plantilla o el bundle. Base del carrito y el checkout demo.
export interface ItemComprable {
  slug: string;
  nombre: string;
  precioUSD: number;
  precioARSref: number;
  emoji: string;
}

export function itemDesdeSlug(slug: string): ItemComprable | undefined {
  if (slug === BUNDLE.slug) {
    return {
      slug: BUNDLE.slug,
      nombre: BUNDLE.nombre,
      precioUSD: BUNDLE.precioUSD,
      precioARSref: BUNDLE.precioARSref,
      emoji: BUNDLE.emoji,
    };
  }
  const p = getPlantilla(slug);
  if (!p) return undefined;
  return {
    slug: p.slug,
    nombre: p.nombre,
    precioUSD: p.precioUSD,
    precioARSref: p.precioARSref,
    emoji: p.emoji,
  };
}

// Catálogo comprable completo (plantillas + bundle), consumido por el carrito del cliente.
export const COMPRABLES: ItemComprable[] = COMPRABLES_desde();

function COMPRABLES_desde(): ItemComprable[] {
  const items: ItemComprable[] = PLANTILLAS.map((p) => ({
    slug: p.slug,
    nombre: p.nombre,
    precioUSD: p.precioUSD,
    precioARSref: p.precioARSref,
    emoji: p.emoji,
  }));
  items.push({
    slug: BUNDLE.slug,
    nombre: BUNDLE.nombre,
    precioUSD: BUNDLE.precioUSD,
    precioARSref: BUNDLE.precioARSref,
    emoji: BUNDLE.emoji,
  });
  return items;
}
