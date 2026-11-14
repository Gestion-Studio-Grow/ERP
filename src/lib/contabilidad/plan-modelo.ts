/**
 * Planes de cuentas modelo por rubro (Contabilidad, ola 1 — docs/producto/contabilidad/PLAN.md §5;
 * ampliado en la ola 2 / T0 de Control de gestión, GSG-CTRL-001).
 *
 * [A VALIDAR con contador matriculado] Estructura y nombres son un punto de partida razonable para
 * una pyme argentina (RT 54 FACPCE, modelo CENCyA 27, en lo grueso), NO un plan aprobado. Hasta que
 * un contador matriculado lo revise, todo lo que se siembre con esto se muestra como «provisional».
 *
 * Códigos jerárquicos: 1 Activo · 2 Pasivo · 3 Patrimonio neto · 4 Ingresos · 5 Egresos.
 * Los nodos con hijos AGRUPAN (no imputables); las hojas son imputables. PURO: sin base.
 *
 * ESTABILIDAD DE CÓDIGOS: `sembrarPlanModelo` no toca una cuenta que ya existe por código, así que
 * un código publicado NUNCA cambia de significado. Lo que se mueve deja un hueco (5.2.05
 * «Publicidad» pasó a 5.4.01 cuando 5.2 se separó en administración y comercialización).
 *
 * Atributos de gestión por cuenta (todos opcionales en la base):
 *   · `rubro`  — rubro del estado contable RT 54 (ESP y ER), NO el rubro del negocio.
 *   · `plazo`  — CORRIENTE / NO_CORRIENTE, sólo patrimoniales de activo y pasivo.
 *   · `funcion` — función por defecto en el ER (costo, comercialización, administración,
 *     financiación); la línea de asiento la podrá sobrescribir (T2).
 *   · `monetaria` — si la partida es monetaria para el ajuste por inflación: las NO monetarias
 *     guardan `fechaOrigen` en la línea desde T0 para reexpresar en T8.
 *   · `ritmo` — FIJO_MENSUAL / VARIABLE, sólo resultados (el plan compara a la fecha, T4).
 *   · `nombreDueno` — cómo la ve el dueño en el tablero (sin debe/haber ni jerga).
 */

import { naturalezaPorTipo, type Naturaleza, type TipoCuenta } from "./asiento";

/** [A VALIDAR con contador matriculado] */
export const PLAN_MODELO_PROVISIONAL = true;

/** Rubro del NEGOCIO (qué plan modelo se siembra). */
export type RubroContable = "comercio" | "servicios" | "club" | "agencia";
export const RUBROS_CONTABLES: readonly RubroContable[] = ["comercio", "servicios", "club", "agencia"];

/** Rubro del ESTADO contable (RT 54): dónde cae la cuenta en el ESP o en el ER. */
export const RUBROS_ESTADO = [
  // Activo
  "CAJA_Y_BANCOS",
  "CREDITOS_POR_VENTAS",
  "OTROS_CREDITOS",
  "BIENES_DE_CAMBIO",
  "BIENES_DE_USO",
  // Pasivo
  "DEUDAS_COMERCIALES",
  "PRESTAMOS",
  "REMUNERACIONES_Y_CARGAS_SOCIALES",
  "CARGAS_FISCALES",
  "ANTICIPOS_DE_CLIENTES",
  "OTRAS_DEUDAS",
  // Patrimonio neto
  "CAPITAL",
  "AJUSTE_DE_CAPITAL",
  "RESERVAS",
  "RESULTADOS_NO_ASIGNADOS",
  // Estado de resultados
  "INGRESOS_POR_VENTAS",
  "COSTO_DE_VENTAS",
  "GASTOS_DE_COMERCIALIZACION",
  "GASTOS_DE_ADMINISTRACION",
  "OTROS_INGRESOS_Y_EGRESOS",
  "RESULTADOS_FINANCIEROS_Y_POR_TENENCIA",
  "IMPUESTO_A_LAS_GANANCIAS",
] as const;
export type RubroEstado = (typeof RUBROS_ESTADO)[number];

export const PLAZOS = ["CORRIENTE", "NO_CORRIENTE"] as const;
export type Plazo = (typeof PLAZOS)[number];

export const FUNCIONES = ["COSTO", "COMERCIALIZACION", "ADMINISTRACION", "FINANCIACION"] as const;
export type Funcion = (typeof FUNCIONES)[number];

export const RITMOS = ["FIJO_MENSUAL", "VARIABLE"] as const;
export type Ritmo = (typeof RITMOS)[number];

export interface CuentaModelo {
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  /** `null` en las cinco raíces. */
  padreCodigo: string | null;
  imputable: boolean;
  naturaleza: Naturaleza;
  /** Rubro RT 54. `null` en raíces y agrupadores de primer nivel. */
  rubro: RubroEstado | null;
  plazo: Plazo | null;
  funcion: Funcion | null;
  /** `null` en los agrupadores (no reciben líneas). */
  monetaria: boolean | null;
  ritmo: Ritmo | null;
  nombreDueno: string | null;
}

interface OpcionesHoja {
  /** Naturaleza opuesta a la de su tipo (amortizaciones acumuladas, previsiones). */
  regularizadora?: true;
  rubro?: RubroEstado;
  funcion?: Funcion | null;
  monetaria?: boolean;
  ritmo?: Ritmo;
  nombreDueno?: string;
}
type Hoja = readonly [codigo: string, nombre: string, opciones?: OpcionesHoja];

interface Agrupador {
  codigo: string;
  nombre: string;
  padre: string;
  /** Lo heredan las hojas salvo que la hoja lo pise. */
  rubro?: RubroEstado;
  funcion?: Funcion;
}

const AGRUPADORES: readonly Agrupador[] = [
  { codigo: "1.1", nombre: "Activo corriente", padre: "1" },
  { codigo: "1.1.1", nombre: "Caja y bancos", padre: "1.1", rubro: "CAJA_Y_BANCOS" },
  { codigo: "1.1.2", nombre: "Créditos por ventas", padre: "1.1", rubro: "CREDITOS_POR_VENTAS" },
  { codigo: "1.1.3", nombre: "Créditos fiscales", padre: "1.1", rubro: "OTROS_CREDITOS" },
  { codigo: "1.1.4", nombre: "Bienes de cambio", padre: "1.1", rubro: "BIENES_DE_CAMBIO" },
  { codigo: "1.1.5", nombre: "Otros créditos", padre: "1.1", rubro: "OTROS_CREDITOS" },
  { codigo: "1.2", nombre: "Activo no corriente", padre: "1" },
  { codigo: "1.2.1", nombre: "Bienes de uso", padre: "1.2", rubro: "BIENES_DE_USO" },
  { codigo: "2.1", nombre: "Pasivo corriente", padre: "2" },
  { codigo: "2.1.1", nombre: "Deudas comerciales", padre: "2.1", rubro: "DEUDAS_COMERCIALES" },
  { codigo: "2.1.2", nombre: "Deudas fiscales", padre: "2.1", rubro: "CARGAS_FISCALES" },
  { codigo: "2.1.3", nombre: "Deudas sociales", padre: "2.1", rubro: "REMUNERACIONES_Y_CARGAS_SOCIALES" },
  { codigo: "2.1.4", nombre: "Anticipos de clientes", padre: "2.1", rubro: "ANTICIPOS_DE_CLIENTES" },
  { codigo: "2.1.5", nombre: "Préstamos", padre: "2.1", rubro: "PRESTAMOS" },
  { codigo: "2.1.6", nombre: "Otras deudas", padre: "2.1", rubro: "OTRAS_DEUDAS" },
  { codigo: "2.2", nombre: "Pasivo no corriente", padre: "2" },
  { codigo: "2.2.1", nombre: "Préstamos a largo plazo", padre: "2.2", rubro: "PRESTAMOS" },
  { codigo: "3.1", nombre: "Capital", padre: "3", rubro: "CAPITAL" },
  { codigo: "3.2", nombre: "Resultados acumulados", padre: "3", rubro: "RESULTADOS_NO_ASIGNADOS" },
  { codigo: "3.3", nombre: "Reservas", padre: "3", rubro: "RESERVAS" },
  { codigo: "4.1", nombre: "Ingresos operativos", padre: "4", rubro: "INGRESOS_POR_VENTAS" },
  { codigo: "4.2", nombre: "Otros ingresos", padre: "4", rubro: "OTROS_INGRESOS_Y_EGRESOS" },
  { codigo: "5.1", nombre: "Costos", padre: "5", rubro: "COSTO_DE_VENTAS", funcion: "COSTO" },
  { codigo: "5.2", nombre: "Gastos de administración", padre: "5", rubro: "GASTOS_DE_ADMINISTRACION", funcion: "ADMINISTRACION" },
  { codigo: "5.3", nombre: "Gastos financieros e impuestos", padre: "5", rubro: "RESULTADOS_FINANCIEROS_Y_POR_TENENCIA", funcion: "FINANCIACION" },
  { codigo: "5.4", nombre: "Gastos de comercialización", padre: "5", rubro: "GASTOS_DE_COMERCIALIZACION", funcion: "COMERCIALIZACION" },
];

const FIJO: Pick<OpcionesHoja, "ritmo"> = { ritmo: "FIJO_MENSUAL" };

/** Hojas comunes a todos los rubros, por agrupador. */
const HOJAS_COMUNES: Readonly<Record<string, readonly Hoja[]>> = {
  "1.1.1": [
    ["1.1.1.01", "Caja"],
    ["1.1.1.02", "Banco cuenta corriente"],
    ["1.1.1.03", "Mercado Pago y billeteras"],
  ],
  "1.1.2": [
    ["1.1.2.01", "Deudores por ventas"],
    ["1.1.2.02", "Tarjetas a cobrar"],
    ["1.1.2.03", "Previsión para deudores incobrables", { regularizadora: true }],
    ["1.1.2.04", "Mercado Pago a liquidar"],
  ],
  "1.1.3": [
    ["1.1.3.01", "IVA crédito fiscal"],
    ["1.1.3.02", "Percepciones IIBB sufridas"],
    ["1.1.3.03", "Retenciones IIBB sufridas"],
    ["1.1.3.04", "Percepciones y retenciones IVA sufridas"],
    ["1.1.3.05", "Retenciones de Ganancias sufridas"],
    ["1.1.3.06", "Impuesto a los débitos y créditos a cuenta"],
    ["1.1.3.07", "IVA saldo a favor"],
    ["1.1.3.08", "Anticipos de Ganancias"],
  ],
  "1.1.5": [
    // Un anticipo que fija precio no es monetario (RT 54): se reexpresa.
    ["1.1.5.01", "Anticipos a proveedores", { monetaria: false }],
    ["1.1.5.02", "Fondos a rendir"],
    ["1.1.5.03", "Cuenta particular del dueño"],
    ["1.1.5.04", "Gastos pagados por adelantado", { monetaria: false }],
  ],
  "1.2.1": [
    ["1.2.1.01", "Muebles y útiles"],
    ["1.2.1.02", "Equipos de computación"],
    ["1.2.1.03", "Amortizaciones acumuladas de bienes de uso", { regularizadora: true }],
    ["1.2.1.04", "Instalaciones"],
    ["1.2.1.05", "Rodados"],
  ],
  "2.1.1": [
    ["2.1.1.01", "Proveedores"],
    ["2.1.1.02", "Tarjetas de crédito a pagar"],
  ],
  "2.1.2": [
    ["2.1.2.01", "IVA débito fiscal"],
    ["2.1.2.02", "IVA a pagar"],
    ["2.1.2.03", "IIBB a pagar"],
    ["2.1.2.04", "Ganancias a pagar"],
    ["2.1.2.05", "Monotributo a pagar"],
  ],
  "2.1.3": [
    ["2.1.3.01", "Sueldos a pagar"],
    ["2.1.3.02", "Cargas sociales a pagar"],
    ["2.1.3.03", "Provisión SAC y cargas sociales"],
    ["2.1.3.04", "Provisión vacaciones y cargas sociales"],
    ["2.1.3.05", "Comisiones a pagar al personal"],
  ],
  "2.1.4": [
    // Señas y vouchers fijan precio: no monetarios (se reexpresan).
    ["2.1.4.01", "Anticipos de clientes (señas)", { monetaria: false }],
    ["2.1.4.02", "Vouchers y gift cards a canjear", { monetaria: false }],
  ],
  "2.1.5": [["2.1.5.01", "Préstamos bancarios (porción corriente)"]],
  "2.1.6": [["2.1.6.01", "Acreedores varios"]],
  "2.2.1": [["2.2.1.01", "Préstamos bancarios (porción no corriente)"]],
  "3.1": [
    ["3.1.01", "Capital"],
    ["3.1.02", "Ajuste de capital", { rubro: "AJUSTE_DE_CAPITAL" }],
  ],
  "3.2": [
    ["3.2.01", "Resultados no asignados"],
    ["3.2.02", "Resultado del ejercicio"],
    ["3.2.03", "Ajustes de resultados de ejercicios anteriores"],
  ],
  "3.3": [["3.3.01", "Reserva legal"]],
  "4.2": [
    ["4.2.01", "Intereses ganados", { rubro: "RESULTADOS_FINANCIEROS_Y_POR_TENENCIA", nombreDueno: "Intereses que ganaste" }],
    ["4.2.02", "Otros ingresos", { nombreDueno: "Otros ingresos" }],
    ["4.2.03", "Vouchers vencidos no canjeados", { nombreDueno: "Vouchers que vencieron sin usar" }],
  ],
  "5.2": [
    ["5.2.01", "Sueldos y cargas sociales", { ...FIJO, nombreDueno: "Sueldos" }],
    ["5.2.02", "Alquileres", { ...FIJO, nombreDueno: "Alquiler" }],
    ["5.2.03", "Servicios (luz, gas, internet)", { ...FIJO, nombreDueno: "Luz, gas e internet" }],
    ["5.2.04", "Honorarios profesionales", { ...FIJO, nombreDueno: "Contador y profesionales" }],
    // 5.2.05 «Publicidad» se movió a 5.4.01 (hueco a propósito: ver «Estabilidad de códigos»).
    ["5.2.06", "Gastos varios", { nombreDueno: "Otros gastos" }],
    ["5.2.07", "SAC y vacaciones", { ...FIJO, nombreDueno: "Aguinaldo y vacaciones" }],
    ["5.2.08", "Amortizaciones de bienes de uso", { ...FIJO, nombreDueno: "Desgaste de equipos" }],
    ["5.2.09", "Seguros", { ...FIJO, nombreDueno: "Seguros" }],
    ["5.2.10", "Impuestos, tasas y monotributo", { ...FIJO, nombreDueno: "Monotributo, tasas e impuestos" }],
    ["5.2.11", "Sistemas y software", { ...FIJO, nombreDueno: "Sistemas y suscripciones" }],
  ],
  "5.3": [
    ["5.3.01", "Gastos bancarios y comisiones", { nombreDueno: "Gastos del banco" }],
    // IIBB grava la venta: va a comercialización en el ER por función.
    ["5.3.02", "Impuesto sobre los ingresos brutos", { rubro: "GASTOS_DE_COMERCIALIZACION", funcion: "COMERCIALIZACION", nombreDueno: "Ingresos brutos" }],
    ["5.3.03", "Impuesto a los débitos y créditos bancarios", { nombreDueno: "Impuesto al cheque" }],
    ["5.3.04", "Intereses perdidos", { nombreDueno: "Intereses que pagaste" }],
    ["5.3.05", "Comisiones de Mercado Pago y tarjetas", { nombreDueno: "Comisiones de cobro (MP y tarjetas)" }],
    // RECPAM: lo calcula el ajuste por inflación (T8) en moneda de cierre; no se reexpresa.
    ["5.3.06", "Resultado por exposición a la inflación (RECPAM)", { monetaria: true, nombreDueno: "Efecto de la inflación" }],
    ["5.3.07", "Impuesto a las ganancias", { rubro: "IMPUESTO_A_LAS_GANANCIAS", funcion: null, nombreDueno: "Impuesto a las ganancias" }],
  ],
  "5.4": [
    ["5.4.01", "Publicidad y promoción", { nombreDueno: "Publicidad" }],
    ["5.4.02", "Deudores incobrables", { nombreDueno: "Clientes que no pagaron" }],
    ["5.4.03", "Comisiones por ventas", { nombreDueno: "Comisiones de venta" }],
  ],
};

/** Lo propio de cada rubro: ingresos operativos, costos, bienes de cambio y algún activo o deuda. */
const HOJAS_POR_RUBRO: Readonly<Record<RubroContable, Readonly<Record<string, readonly Hoja[]>>>> = {
  comercio: {
    "1.1.4": [["1.1.4.01", "Mercaderías"]],
    "4.1": [["4.1.01", "Ventas", { nombreDueno: "Ventas" }]],
    "5.1": [
      ["5.1.01", "Costo de mercaderías vendidas (CMV)", { nombreDueno: "Mercadería vendida" }],
      ["5.1.02", "Fletes y acarreos", { nombreDueno: "Fletes" }],
    ],
  },
  servicios: {
    // Estética: la aparatología es el activo más grande (FINAL §1, bienes de uso en T6).
    "1.1.4": [["1.1.4.02", "Insumos"]],
    "1.2.1": [["1.2.1.06", "Aparatología y equipamiento profesional"]],
    "4.1": [["4.1.01", "Ventas de servicios", { nombreDueno: "Servicios" }]],
    "5.1": [
      ["5.1.01", "Costo de los servicios prestados", { nombreDueno: "Costo de los servicios" }],
      ["5.1.02", "Comisiones del personal de atención", { nombreDueno: "Comisiones del equipo" }],
      ["5.1.03", "Insumos consumidos", { nombreDueno: "Insumos" }],
    ],
  },
  club: {
    "1.1.4": [["1.1.4.01", "Mercaderías (buffet y tienda)"]],
    "4.1": [
      ["4.1.01", "Cuotas sociales", { nombreDueno: "Cuotas" }],
      ["4.1.02", "Alquiler de instalaciones", { nombreDueno: "Alquiler de canchas y espacios" }],
      ["4.1.03", "Ventas de buffet y tienda", { nombreDueno: "Buffet y tienda" }],
    ],
    "5.1": [
      ["5.1.01", "Costo de mercaderías vendidas (CMV)", { nombreDueno: "Mercadería vendida" }],
      ["5.1.02", "Mantenimiento de instalaciones", { ...FIJO, nombreDueno: "Mantenimiento" }],
    ],
  },
  agencia: {
    // Pauta como agente (defecto): la plata del cliente para pauta es deuda, no ingreso.
    "2.1.6": [["2.1.6.02", "Fondos de clientes para pauta"]],
    "4.1": [
      ["4.1.01", "Ventas de servicios", { nombreDueno: "Servicios" }],
      ["4.1.02", "Fees de gestión de pauta", { nombreDueno: "Comisión por gestionar pauta" }],
    ],
    "5.1": [
      ["5.1.01", "Costo de pauta de terceros", { nombreDueno: "Pauta pagada" }],
      ["5.1.02", "Costo de producción y freelancers", { nombreDueno: "Freelancers y producción" }],
    ],
  },
};

const RAICES: ReadonlyArray<{ codigo: string; nombre: string; tipo: TipoCuenta }> = [
  { codigo: "1", nombre: "Activo", tipo: "ACTIVO" },
  { codigo: "2", nombre: "Pasivo", tipo: "PASIVO" },
  { codigo: "3", nombre: "Patrimonio neto", tipo: "PATRIMONIO_NETO" },
  { codigo: "4", nombre: "Ingresos", tipo: "RESULTADO_POSITIVO" },
  { codigo: "5", nombre: "Egresos", tipo: "RESULTADO_NEGATIVO" },
];

const TIPO_POR_RAIZ = new Map(RAICES.map((r) => [r.codigo, r.tipo]));
const tipoDe = (codigo: string): TipoCuenta => TIPO_POR_RAIZ.get(codigo.split(".")[0])!;
const esResultado = (tipo: TipoCuenta) => tipo === "RESULTADO_POSITIVO" || tipo === "RESULTADO_NEGATIVO";

/** Plazo por la rama: 1.1/2.1 corriente, 1.2/2.2 no corriente; PN y resultados no tienen. */
function plazoDe(codigo: string): Plazo | null {
  const [raiz, rama] = codigo.split(".");
  if (raiz !== "1" && raiz !== "2") return null;
  if (rama === "1") return "CORRIENTE";
  if (rama === "2") return "NO_CORRIENTE";
  return null;
}

/** Monetaria por rubro (RT 54 / RT 6): caja, créditos y deudas en pesos sí; el resto no. */
const RUBROS_MONETARIOS: ReadonlySet<RubroEstado> = new Set<RubroEstado>([
  "CAJA_Y_BANCOS",
  "CREDITOS_POR_VENTAS",
  "OTROS_CREDITOS",
  "DEUDAS_COMERCIALES",
  "PRESTAMOS",
  "REMUNERACIONES_Y_CARGAS_SOCIALES",
  "CARGAS_FISCALES",
  "OTRAS_DEUDAS",
]);

/** Une las hojas comunes con las del rubro (concatenando por agrupador, nunca pisando). */
function hojasDe(rubro: RubroContable): Record<string, readonly Hoja[]> {
  const hojas: Record<string, readonly Hoja[]> = { ...HOJAS_COMUNES };
  for (const [agrupador, propias] of Object.entries(HOJAS_POR_RUBRO[rubro])) {
    hojas[agrupador] = [...(hojas[agrupador] ?? []), ...propias];
  }
  return hojas;
}

/**
 * Plan modelo del rubro, plano y ORDENADO (cada padre antes que sus hijos): se puede sembrar en
 * ese orden resolviendo `padreCodigo`. Los agrupadores que en el rubro no tienen hojas
 * (p. ej. «Bienes de cambio» en agencia) no se incluyen.
 */
export function planModelo(rubro: RubroContable): CuentaModelo[] {
  const hojas = hojasDe(rubro);
  const vacio = { rubro: null, plazo: null, funcion: null, monetaria: null, ritmo: null, nombreDueno: null } as const;
  const plan: CuentaModelo[] = RAICES.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    tipo: r.tipo,
    padreCodigo: null,
    imputable: false,
    naturaleza: naturalezaPorTipo(r.tipo),
    ...vacio,
  }));

  // Un agrupador entra si él o algún descendiente tiene hojas.
  const tieneHojas = (codigo: string): boolean =>
    (hojas[codigo]?.length ?? 0) > 0 || AGRUPADORES.some((a) => a.padre === codigo && tieneHojas(a.codigo));

  for (const a of AGRUPADORES) {
    if (!tieneHojas(a.codigo)) continue;
    const tipo = tipoDe(a.codigo);
    plan.push({
      codigo: a.codigo,
      nombre: a.nombre,
      tipo,
      padreCodigo: a.padre,
      imputable: false,
      naturaleza: naturalezaPorTipo(tipo),
      ...vacio,
      rubro: a.rubro ?? null,
      plazo: plazoDe(a.codigo),
      funcion: a.funcion ?? null,
    });
  }
  for (const a of AGRUPADORES) {
    for (const [codigo, nombre, op = {}] of hojas[a.codigo] ?? []) {
      const tipo = tipoDe(codigo);
      const habitual = naturalezaPorTipo(tipo);
      const naturaleza: Naturaleza = op.regularizadora ? (habitual === "DEUDORA" ? "ACREEDORA" : "DEUDORA") : habitual;
      const rubroEstado = op.rubro ?? a.rubro ?? null;
      const resultado = esResultado(tipo);
      plan.push({
        codigo,
        nombre,
        tipo,
        padreCodigo: a.codigo,
        imputable: true,
        naturaleza,
        rubro: rubroEstado,
        plazo: plazoDe(codigo),
        funcion: tipo === "RESULTADO_NEGATIVO" ? (op.funcion === undefined ? (a.funcion ?? null) : op.funcion) : null,
        monetaria: op.monetaria ?? (rubroEstado !== null && RUBROS_MONETARIOS.has(rubroEstado)),
        ritmo: resultado ? (op.ritmo ?? "VARIABLE") : null,
        nombreDueno: resultado ? (op.nombreDueno ?? nombre) : null,
      });
    }
  }
  // Orden jerárquico por código (segmentos numéricos): padres antes que hijos.
  return plan.sort((x, y) => compararCodigos(x.codigo, y.codigo));
}

export function compararCodigos(a: string, b: string): number {
  const sa = a.split(".").map(Number);
  const sb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (sa[i] === undefined) return -1;
    if (sb[i] === undefined) return 1;
    if (sa[i] !== sb[i]) return sa[i] - sb[i];
  }
  return 0;
}
