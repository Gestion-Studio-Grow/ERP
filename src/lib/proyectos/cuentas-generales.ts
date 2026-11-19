// MIA-50 · T08 · Adenda 1 § B (CG1-CG8): las cuentas generales del negocio (/admin/cuentas-a-cobrar, /admin/cuentas-a-pagar
// y /admin/flujo) suman lo de Proyectos. Decisión del dueño (18/11): «es vital que la gestión de proyectos funcione».
//
// SIN reimplementar nada: la parte de proyectos sale de `recuadrosDeCuotas` (la misma función que Administración de
// Proyectos), con sus reglas ya resueltas: cobros sueltos descontados, pagos parciales, previstas, perdidos, «sin
// calendario» y gastos sin pagar. Acá sólo se pasan sus renglones a pesos de hoy y se suman. Sólo lectura: los renglones
// llevan a Administración de Proyectos, no se cobran desde la pantalla general (CG7). 0 filas a AccountReceivable/Payable.
//
// Un negocio sin la app de Proyectos (CH) no lee nada de proyectos (CG6), y quien no tiene «Empresa · ver» no ve
// renglones de proyectos (CG5): las dos preguntas se hacen ANTES de leer una cuota.

import { aPesos, codigoProyecto } from "./gestion-core";
import { esPrevista } from "./cobranza-core";
import type { recuadrosDeCuotas } from "./empresa.server";
import { redondear } from "./core";

type Recuadros = Awaited<ReturnType<typeof recuadrosDeCuotas>>;

export const ENLACE_PROYECTOS = "/admin/proyectos/administracion";

export interface RenglonDeProyecto {
  /** `cuota-<id>`, `sincal-<proyectoId>` o `gasto-<id>`: nunca el id de una cuenta corriente. */
  clave: string;
  quien: string;
  concepto: string;
  /** Lo que falta, en pesos de hoy. */
  pesos: number;
  /** Lo que falta en su moneda (para mostrar «US$ 1.000»). */
  monto: number;
  moneda: string;
  /** null = sin calendario: no entra a la proyección del flujo (CG8). */
  vence: Date | null;
  enlace: string;
}

export interface ProyectosEnCuentas {
  aCobrar: { renglones: RenglonDeProyecto[]; total: number };
  aPagar: { renglones: RenglonDeProyecto[]; total: number };
  /** Hay una cuota en otra moneda sin cambio cargado: se avisa como en Administración, no se muestra un 0 callado. */
  sinCambio: boolean;
  /** C-CF5: quien mira tiene `costoTotal` oculto; lo de proyectos a pagar no viene. */
  aPagarOculto?: boolean;
}

const codigo = (p: { numero: number; createdAt: Date }) => codigoProyecto(p.numero, p.createdAt);

/**
 * Los renglones y los totales de proyectos para las cuentas generales, desde lo que ya calculó `recuadrosDeCuotas`.
 * Los totales son los de su `resumen` (el mismo número que Administración); la lista suma lo mismo. PURA.
 */
export function proyectosDesdeRecuadros(r: Pick<Recuadros, "cuotas" | "sinCalendario" | "gastosSinPagar" | "resumen" | "tc">): ProyectosEnCuentas {
  const aCobrar: RenglonDeProyecto[] = [];
  const aPagar: RenglonDeProyecto[] = [];
  for (const c of r.cuotas) {
    if (c.pagadoEl || esPrevista(c) || c.noSeCobra) continue; // las anuladas ya no vienen (`cuotasDelNegocio`)
    const falta = c.pendiente ?? c.monto;
    if (!(falta > 0.005)) continue;
    const quien = c.tipo === "COBRO" ? (c.proyecto?.client?.name ?? "Empresa") : (c.supplier?.name ?? (c.proyecto ? "Proveedor" : "Empresa"));
    const renglon: RenglonDeProyecto = {
      clave: `cuota-${c.id}`,
      quien,
      concepto: [c.proyecto ? `Proyecto ${codigo(c.proyecto)} ${c.proyecto.nombre}` : "Empresa", c.concepto].join(" · "),
      pesos: redondear(aPesos(falta, c.moneda, r.tc)),
      monto: redondear(falta),
      moneda: c.moneda,
      vence: c.venceEl,
      enlace: `${ENLACE_PROYECTOS}?tab=${c.tipo === "COBRO" ? "cobrar" : "pagar"}`,
    };
    (c.tipo === "COBRO" ? aCobrar : aPagar).push(renglon);
  }
  for (const f of r.sinCalendario) {
    aCobrar.push({ clave: `sincal-${f.proyectoId}`, quien: f.proyecto.client?.name ?? "Cliente", concepto: `Proyecto ${codigo(f.proyecto)} ${f.proyecto.nombre} · sin calendario`, pesos: f.pesos, monto: f.monto, moneda: f.moneda, vence: null, enlace: `${ENLACE_PROYECTOS}?tab=cobrar` });
  }
  for (const g of r.gastosSinPagar) {
    aPagar.push({ clave: `gasto-${g.id}`, quien: g.supplier?.name ?? "Proveedor", concepto: `Proyecto ${codigo(g.proyecto)} ${g.proyecto.nombre} · ${g.descripcion}`, pesos: g.total, monto: g.total, moneda: "ARS", vence: null, enlace: `${ENLACE_PROYECTOS}?tab=pagar` });
  }
  return {
    aCobrar: { renglones: aCobrar, total: r.resumen.aCobrar },
    aPagar: { renglones: aPagar, total: r.resumen.aPagar },
    // La misma regla que `faltaCambio` (empresa.server.ts, que es server-only): sin cambio, los dólares valdrían 0.
    sinCambio: r.cuotas.some((c) => !c.pagadoEl && c.moneda !== "ARS" && !(r.tc[c.moneda] > 0)),
  };
}

export interface DependenciasCuentas {
  /** ¿El negocio tiene la app de Proyectos? (lee el negocio, no una cuota). */
  tieneProyectos: (tenantId: string) => Promise<boolean>;
  /** ¿Quien mira tiene «Empresa · ver» (el mismo permiso que Administración de Proyectos)? */
  veEmpresa: () => Promise<boolean>;
  /**
   * MIA-50 T11 (C-CF5): ¿quien mira tiene `costoTotal` oculto? Administración de Proyectos no le muestra «A pagar»
   * (`A/administracion/page.tsx`, O46); acá tampoco: ni renglones ni total de proyectos a pagar, en la cuenta ni en el flujo.
   */
  ocultaCosto: () => Promise<boolean>;
  recuadros: (tenantId: string) => Promise<Recuadros>;
}

/** CG5/CG6: null sin la app o sin el permiso, sin leer ninguna cuota. */
export async function proyectosEnCuentasGenerales(tenantId: string, d: DependenciasCuentas): Promise<ProyectosEnCuentas | null> {
  if (!(await d.tieneProyectos(tenantId))) return null;
  if (!(await d.veEmpresa())) return null;
  const p = proyectosDesdeRecuadros(await d.recuadros(tenantId));
  return (await d.ocultaCosto()) ? sinAPagar(p) : p;
}

/** C-CF5: lo de proyectos a pagar no sale del servidor (ni renglones ni total). PURA. */
export function sinAPagar(p: ProyectosEnCuentas): ProyectosEnCuentas {
  return { ...p, aPagar: { renglones: [], total: 0 }, aPagarOculto: true };
}

/** CG8: los renglones con fecha, en la forma que espera el flujo de fondos. Sin calendario no entra. PURA. */
export function paraElFlujo(p: ProyectosEnCuentas | null) {
  if (!p) return { aCobrar: [], aPagar: [] };
  const fila = (r: RenglonDeProyecto) => ({ id: r.clave, amount: r.pesos, issueDate: r.vence!, dueDate: r.vence, saldado: 0, saldo: r.pesos, quien: r.quien });
  return {
    aCobrar: p.aCobrar.renglones.filter((r) => r.vence).map(fila),
    aPagar: p.aPagar.renglones.filter((r) => r.vence).map((r) => ({ ...fila(r), cheques: [] as const })),
  };
}
