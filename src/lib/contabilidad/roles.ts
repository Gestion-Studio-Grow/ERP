/**
 * Roles de cuenta (`CuentaRol`, Control de gestión T0 — GSG-CTRL-001 §2.1).
 *
 * Las reglas de contabilización (T1) hablan de ROLES («la caja», «las ventas», «el IVA débito»),
 * nunca de códigos: cada negocio decide qué cuenta suya cumple cada rol. Acá vive el catálogo
 * cerrado de roles y la cuenta del plan modelo que lo cumple por defecto en cada rubro.
 * PURO: sin base. [A VALIDAR con contador matriculado], como el plan modelo.
 */

import type { TipoCuenta } from "./asiento";
import { planModelo, type RubroContable } from "./plan-modelo";

interface DefinicionRol {
  /** Para la pantalla del contador (C7 «Cuentas que usa el sistema»). */
  descripcion: string;
  /** Tipo que tiene que tener la cuenta asignada. */
  tipo: TipoCuenta;
  /** Código del plan modelo que lo cumple: uno para todos los rubros o por rubro. */
  codigo: string | Partial<Record<RubroContable, string>>;
}

export const ROLES_CUENTA = {
  CAJA: { descripcion: "Caja (efectivo)", tipo: "ACTIVO", codigo: "1.1.1.01" },
  BANCO: { descripcion: "Banco", tipo: "ACTIVO", codigo: "1.1.1.02" },
  BILLETERA_MP: { descripcion: "Mercado Pago y billeteras", tipo: "ACTIVO", codigo: "1.1.1.03" },
  DEUDORES_POR_VENTAS: { descripcion: "Clientes que deben", tipo: "ACTIVO", codigo: "1.1.2.01" },
  TARJETAS_A_COBRAR: { descripcion: "Tarjetas a cobrar", tipo: "ACTIVO", codigo: "1.1.2.02" },
  MP_A_LIQUIDAR: { descripcion: "Mercado Pago a liquidar", tipo: "ACTIVO", codigo: "1.1.2.04" },
  IVA_CREDITO_FISCAL: { descripcion: "IVA crédito fiscal", tipo: "ACTIVO", codigo: "1.1.3.01" },
  PERCEPCIONES_IIBB: { descripcion: "Percepciones de IIBB sufridas", tipo: "ACTIVO", codigo: "1.1.3.02" },
  RETENCIONES_IIBB: { descripcion: "Retenciones de IIBB sufridas", tipo: "ACTIVO", codigo: "1.1.3.03" },
  RETENCIONES_IVA: { descripcion: "Percepciones y retenciones de IVA sufridas", tipo: "ACTIVO", codigo: "1.1.3.04" },
  RETENCIONES_GANANCIAS: { descripcion: "Retenciones de Ganancias sufridas", tipo: "ACTIVO", codigo: "1.1.3.05" },
  IDC_A_CUENTA: { descripcion: "Impuesto al cheque computable", tipo: "ACTIVO", codigo: "1.1.3.06" },
  MERCADERIAS: { descripcion: "Mercaderías e insumos en stock", tipo: "ACTIVO", codigo: { comercio: "1.1.4.01", club: "1.1.4.01", servicios: "1.1.4.02" } },
  FONDOS_A_RENDIR: { descripcion: "Anticipos y fondos a rendir", tipo: "ACTIVO", codigo: "1.1.5.02" },
  CUENTA_PARTICULAR: { descripcion: "Cuenta particular del dueño", tipo: "ACTIVO", codigo: "1.1.5.03" },
  AMORTIZACIONES_ACUMULADAS: { descripcion: "Amortizaciones acumuladas", tipo: "ACTIVO", codigo: "1.2.1.03" },
  PROVEEDORES: { descripcion: "Proveedores", tipo: "PASIVO", codigo: "2.1.1.01" },
  IVA_DEBITO_FISCAL: { descripcion: "IVA débito fiscal", tipo: "PASIVO", codigo: "2.1.2.01" },
  IVA_A_PAGAR: { descripcion: "IVA a pagar", tipo: "PASIVO", codigo: "2.1.2.02" },
  IIBB_A_PAGAR: { descripcion: "IIBB a pagar", tipo: "PASIVO", codigo: "2.1.2.03" },
  SUELDOS_A_PAGAR: { descripcion: "Sueldos a pagar", tipo: "PASIVO", codigo: "2.1.3.01" },
  CARGAS_SOCIALES_A_PAGAR: { descripcion: "Cargas sociales a pagar", tipo: "PASIVO", codigo: "2.1.3.02" },
  PROVISION_SAC: { descripcion: "Provisión de aguinaldo", tipo: "PASIVO", codigo: "2.1.3.03" },
  PROVISION_VACACIONES: { descripcion: "Provisión de vacaciones", tipo: "PASIVO", codigo: "2.1.3.04" },
  COMISIONES_A_PAGAR: { descripcion: "Comisiones a pagar al personal", tipo: "PASIVO", codigo: "2.1.3.05" },
  ANTICIPOS_DE_CLIENTES: { descripcion: "Señas y anticipos de clientes", tipo: "PASIVO", codigo: "2.1.4.01" },
  VOUCHERS_A_CANJEAR: { descripcion: "Vouchers y gift cards vendidos sin usar", tipo: "PASIVO", codigo: "2.1.4.02" },
  FONDOS_PAUTA_CLIENTES: { descripcion: "Plata de clientes para pauta", tipo: "PASIVO", codigo: { agencia: "2.1.6.02" } },
  CAPITAL: { descripcion: "Capital", tipo: "PATRIMONIO_NETO", codigo: "3.1.01" },
  AJUSTE_DE_CAPITAL: { descripcion: "Ajuste de capital (inflación)", tipo: "PATRIMONIO_NETO", codigo: "3.1.02" },
  RESULTADOS_NO_ASIGNADOS: { descripcion: "Resultados no asignados", tipo: "PATRIMONIO_NETO", codigo: "3.2.01" },
  RESULTADO_DEL_EJERCICIO: { descripcion: "Resultado del ejercicio", tipo: "PATRIMONIO_NETO", codigo: "3.2.02" },
  AJUSTES_EJERCICIOS_ANTERIORES: { descripcion: "Ajustes de ejercicios anteriores (AREA)", tipo: "PATRIMONIO_NETO", codigo: "3.2.03" },
  VENTAS: { descripcion: "Ventas", tipo: "RESULTADO_POSITIVO", codigo: "4.1.01" },
  FEES_GESTION_PAUTA: { descripcion: "Comisión por gestión de pauta", tipo: "RESULTADO_POSITIVO", codigo: { agencia: "4.1.02" } },
  INTERESES_GANADOS: { descripcion: "Intereses ganados", tipo: "RESULTADO_POSITIVO", codigo: "4.2.01" },
  OTROS_INGRESOS: { descripcion: "Otros ingresos", tipo: "RESULTADO_POSITIVO", codigo: "4.2.02" },
  VOUCHERS_VENCIDOS: { descripcion: "Vouchers vencidos sin canjear", tipo: "RESULTADO_POSITIVO", codigo: "4.2.03" },
  COSTO_DE_VENTAS: { descripcion: "Costo de lo vendido (CMV o costo del servicio)", tipo: "RESULTADO_NEGATIVO", codigo: "5.1.01" },
  COMISIONES_PERSONAL: {
    descripcion: "Comisiones del personal",
    tipo: "RESULTADO_NEGATIVO",
    codigo: { servicios: "5.1.02", proyectos: "5.1.02", comercio: "5.4.03", club: "5.4.03", agencia: "5.4.03" },
  },
  INSUMOS: { descripcion: "Insumos consumidos", tipo: "RESULTADO_NEGATIVO", codigo: { servicios: "5.1.03", proyectos: "5.1.03" } },
  SUELDOS: { descripcion: "Sueldos y cargas sociales", tipo: "RESULTADO_NEGATIVO", codigo: "5.2.01" },
  SAC_Y_VACACIONES: { descripcion: "Aguinaldo y vacaciones devengados", tipo: "RESULTADO_NEGATIVO", codigo: "5.2.07" },
  AMORTIZACIONES: { descripcion: "Amortizaciones del mes", tipo: "RESULTADO_NEGATIVO", codigo: "5.2.08" },
  MONOTRIBUTO: { descripcion: "Monotributo (componente impositivo)", tipo: "RESULTADO_NEGATIVO", codigo: "5.2.10" },
  GASTOS_SIN_CATEGORIA: { descripcion: "Gastos sin categoría (bandeja del dueño)", tipo: "RESULTADO_NEGATIVO", codigo: "5.2.06" },
  GASTOS_BANCARIOS: { descripcion: "Gastos bancarios", tipo: "RESULTADO_NEGATIVO", codigo: "5.3.01" },
  IIBB: { descripcion: "Ingresos brutos devengados", tipo: "RESULTADO_NEGATIVO", codigo: "5.3.02" },
  IDC: { descripcion: "Impuesto al cheque no computable", tipo: "RESULTADO_NEGATIVO", codigo: "5.3.03" },
  COMISIONES_DE_COBRO: { descripcion: "Comisiones de Mercado Pago y tarjetas", tipo: "RESULTADO_NEGATIVO", codigo: "5.3.05" },
  RECPAM: { descripcion: "Resultado por exposición a la inflación", tipo: "RESULTADO_NEGATIVO", codigo: "5.3.06" },
  DEUDORES_INCOBRABLES: { descripcion: "Deudores incobrables", tipo: "RESULTADO_NEGATIVO", codigo: "5.4.02" },

  // ── Roles nuevos de FC-01 (CATALOGO-FINANZAS-CONTROL §1.3). Provisionales a confirmar con el estudio.
  //    Los de cuentas comunes valen para todos los rubros; el resto, por ahora sólo en «servicios por
  //    proyecto». IIBB abierto por jurisdicción queda para FC-09 (hoy los roles de IIBB son únicos).
  SALDO_TECNICO_IVA: { descripcion: "Saldo técnico de IVA a favor", tipo: "ACTIVO", codigo: "1.1.3.07" },
  ANTICIPOS_GANANCIAS: { descripcion: "Anticipos de Ganancias pagados", tipo: "ACTIVO", codigo: "1.1.3.08" },
  GANANCIAS_A_PAGAR: { descripcion: "Ganancias a pagar", tipo: "PASIVO", codigo: "2.1.2.04" },
  BANCO_USD: { descripcion: "Banco en dólares", tipo: "ACTIVO", codigo: { proyectos: "1.1.1.04" } },
  VALORES_A_DEPOSITAR: { descripcion: "Cheques y Echeq recibidos a depositar", tipo: "ACTIVO", codigo: { proyectos: "1.1.1.05" } },
  PERCEPCIONES_IVA: { descripcion: "Percepciones de IVA sufridas", tipo: "ACTIVO", codigo: { proyectos: "1.1.3.09" } },
  SALDO_LIBRE_DISPONIBILIDAD_IVA: { descripcion: "Saldo de libre disponibilidad de IVA", tipo: "ACTIVO", codigo: { proyectos: "1.1.3.10" } },
  RECAUDACION_BANCARIA_IIBB: { descripcion: "Recaudación bancaria de IIBB", tipo: "ACTIVO", codigo: { proyectos: "1.1.3.11" } },
  CHEQUES_DIFERIDOS_A_PAGAR: { descripcion: "Cheques diferidos y Echeq emitidos a pagar", tipo: "PASIVO", codigo: { proyectos: "2.1.1.03" } },
  RETENCIONES_IVA_A_DEPOSITAR: { descripcion: "Retenciones de IVA practicadas a depositar", tipo: "PASIVO", codigo: { proyectos: "2.1.2.06" } },
  RETENCIONES_GANANCIAS_A_DEPOSITAR: { descripcion: "Retenciones de Ganancias practicadas a depositar", tipo: "PASIVO", codigo: { proyectos: "2.1.2.07" } },
  RETENCIONES_IIBB_A_DEPOSITAR: { descripcion: "Retenciones de IIBB practicadas a depositar", tipo: "PASIVO", codigo: { proyectos: "2.1.2.08" } },
  DIFERENCIA_DE_CAMBIO: { descripcion: "Diferencia de cambio", tipo: "RESULTADO_NEGATIVO", codigo: { proyectos: "5.3.08" } },
} as const satisfies Record<string, DefinicionRol>;

export type RolCuenta = keyof typeof ROLES_CUENTA;
export const ROLES: readonly RolCuenta[] = Object.keys(ROLES_CUENTA) as RolCuenta[];

export function esRolCuenta(x: unknown): x is RolCuenta {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(ROLES_CUENTA, x);
}

/** Código del plan modelo que cumple el rol en ese rubro; `null` si el rol no aplica al rubro. */
export function codigoDelRol(rol: RolCuenta, rubro: RubroContable): string | null {
  const c: DefinicionRol["codigo"] = ROLES_CUENTA[rol].codigo;
  return typeof c === "string" ? c : (c[rubro] ?? null);
}

/** Los roles que el plan modelo del rubro deja asignados al sembrar: rol → código. */
export function rolesModelo(rubro: RubroContable): Map<RolCuenta, string> {
  const m = new Map<RolCuenta, string>();
  for (const rol of ROLES) {
    const codigo = codigoDelRol(rol, rubro);
    if (codigo) m.set(rol, codigo);
  }
  return m;
}

export type ProblemaRol = "ROL_INEXISTENTE" | "CUENTA_NO_IMPUTABLE" | "CUENTA_INACTIVA" | "TIPO_INCOMPATIBLE";

/**
 * ¿Puede esta cuenta cumplir el rol? Imputable, activa y del tipo del rol. Lo usa
 * `asignarRolCuenta` antes de guardar; el negocio de la cuenta lo garantiza la FK compuesta.
 */
export function problemaDeAsignacion(
  rol: string,
  cuenta: { tipo: string; imputable: boolean; activa: boolean },
): { codigo: ProblemaRol; mensaje: string } | null {
  if (!esRolCuenta(rol)) return { codigo: "ROL_INEXISTENTE", mensaje: "Ese rol no existe en el sistema." };
  const def = ROLES_CUENTA[rol];
  if (!cuenta.imputable) return { codigo: "CUENTA_NO_IMPUTABLE", mensaje: "Esa cuenta agrupa otras: elegí una cuenta de detalle." };
  if (!cuenta.activa) return { codigo: "CUENTA_INACTIVA", mensaje: "Esa cuenta está dada de baja: reactivala o elegí otra." };
  if (cuenta.tipo !== def.tipo) {
    return { codigo: "TIPO_INCOMPATIBLE", mensaje: `«${def.descripcion}» necesita una cuenta de tipo ${def.tipo}.` };
  }
  return null;
}

/** Comprobación del catálogo contra el plan modelo (la usa el test; barata, sin base). */
export function rolesSinCuentaEnElPlan(rubro: RubroContable): RolCuenta[] {
  const plan = new Map(planModelo(rubro).map((c) => [c.codigo, c]));
  return [...rolesModelo(rubro)].filter(([rol, codigo]) => {
    const c = plan.get(codigo);
    return !c || problemaDeAsignacion(rol, { tipo: c.tipo, imputable: c.imputable, activa: true }) !== null;
  }).map(([rol]) => rol);
}
