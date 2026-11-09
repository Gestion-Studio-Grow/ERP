// ============================================================================
// PROYECTOS · Etapa 2 · T2 — facturar una cuota de cobro con ARCA. Núcleo PURO (sin base).
// ============================================================================
// Arma la factura de UNA cuota de cobro de un proyecto (`ProyectoCuota`, tipo COBRO): qué se
// puede facturar, con qué montos y a quién. La escritura (lock de la cuota, idempotencia,
// outbox) vive en facturar-cuota.server.ts; acá no hay Prisma.
//
// Reglas (diseño T2, aprobado):
//  · Sólo COBRO de un proyecto, ni anulada ni prevista, con el texto libre `factura` vacío (si
//    tiene texto, ya se facturó fuera del sistema: no se emite otra).
//  · Sólo pesos: una cuota en dólares se rechaza hasta que el dueño decida cómo (WSFEv1 viaja en
//    PES, soap.ts).
//  · `monto` YA incluye el IVA (planDeCuotas, gestion-core.ts): es el total del comprobante.
//    Inscripto: neto e IVA con la alícuota del presupuesto vivo (21 → 5, 10,5 → 4, 27 → 6; otra,
//    no se emite) y `ivaPorProducto` (ADR-006, ENG-024). Monotributo o exento: Factura C sin IVA
//    discriminado, la alícuota del presupuesto no se usa.
//  · La letra la decide el plugin; el Core la promete con la MISMA decisión que hace el despacho
//    (`decidirDelEvento`: servicios, período exigido, umbral del motor sin medio de pago).

import type { CondicionIva } from "@/lib/fiscal";
import type { CreateInvoiceInput } from "@/lib/invoice-core";
import { centavosDe } from "@/lib/dinero/redondeo";
import { montosFacturita } from "@/lib/facturita-montos";
import { decidirComprobante } from "@/lib/fiscal/decidir-comprobante";
import {
  motivoDeLaDecision,
  queImpideEntregarLaFactura,
  receptorDeFicha,
  receptorParaComprobante,
  type FichaFiscal,
} from "@/lib/fiscal/ficha-fiscal";
import { umbralDelMotor } from "@/lib/fiscal/parametros-del-motor";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

/** Concepto de WSFEv1: 2 = Servicios (un proyecto es un servicio con período). */
export const CONCEPTO_SERVICIOS = 2;

/** Alícuota de IVA de ARCA (catálogo de WSFEv1) para el `ivaPct` del presupuesto; `null` si no hay. */
export function alicuotaDeIvaPct(ivaPct: number | null | undefined): number | null {
  if (typeof ivaPct !== "number" || !Number.isFinite(ivaPct)) return null;
  const centesimos = Math.round(ivaPct * 100);
  if (centesimos === 2100) return 5;
  if (centesimos === 1050) return 4;
  if (centesimos === 2700) return 6;
  return null;
}

/** La cuota, tal como está en la base. */
export interface CuotaAFacturar {
  id: string;
  proyectoId: string | null;
  tipo: string;
  concepto: string;
  monto: number;
  moneda: string;
  venceEl: Date;
  prevista: boolean;
  anuladoEl: Date | null;
  factura: string | null;
}

export interface ProyectoAFacturar {
  numero: number;
  fechaArmado: Date | null;
  fechaEvento: Date | null;
  fechaDesarme: Date | null;
}

/** El negocio que factura (perfil fiscal del Core). */
export interface EmisorAFacturar {
  cuit: number;
  condicionIva: CondicionIva;
  puntoVenta: number;
  regimenFacturaA?: string | null;
}

export interface DatosParaFacturarCuota {
  tenantId: string;
  cuota: CuotaAFacturar;
  proyecto: ProyectoAFacturar;
  /** Ficha fiscal del cliente del proyecto (`Client`). */
  cliente: FichaFiscal | null;
  emisor: EmisorAFacturar;
  /** `ivaPct` del presupuesto vivo (la última versión, de donde salen las cuotas); `null` sin presupuesto. */
  ivaPct: number | null;
  /** Ahora (el día fiscal del negocio sale de acá). */
  ahora: Date;
}

export type FacturaDeCuota = { ok: true; input: CreateInvoiceInput } | { ok: false; error: string };

/** ¿Esta cuota se puede facturar, mirando sólo la cuota? `null` si sí; el motivo, si no. PURA. */
export function motivoParaNoFacturar(c: Pick<CuotaAFacturar, "tipo" | "proyectoId" | "anuladoEl" | "prevista" | "factura" | "moneda" | "monto">): string | null {
  if (c.tipo !== "COBRO" || !c.proyectoId) return "Sólo se factura un cobro de un proyecto.";
  if (c.anuladoEl) return "Esa cuota está anulada: no se factura.";
  if (c.prevista) return "Esa cuota es una previsión: se factura cuando el evento esté confirmado y con fecha.";
  if ((c.factura ?? "").trim() !== "") return `Esa cuota ya figura facturada fuera del sistema («${(c.factura ?? "").trim()}»): no se emite otra.`;
  if (c.moneda !== "ARS") return "Por ahora sólo se facturan cuotas en pesos: la de dólares todavía no.";
  if (!(centavosDe(c.monto) > 0)) return "Esa cuota no tiene monto para facturar.";
  return null;
}

const fechaFiscal = (d: Date | null | undefined): string | null => (d ? fechaFiscalDelDia(d) : null);

/**
 * El comprobante de una cuota de cobro, listo para `createInvoiceInTx`, o el motivo (en criollo)
 * por el que no se emite. PURA: lo mismo en la pantalla, en la acción y en el test.
 */
export function armarFacturaDeCuota(d: DatosParaFacturarCuota): FacturaDeCuota {
  const { cuota, proyecto, emisor } = d;
  const motivo = motivoParaNoFacturar(cuota);
  if (motivo) return { ok: false, error: motivo };

  const total = centavosDe(cuota.monto) / 100;
  const inscripto = emisor.condicionIva === "RESPONSABLE_INSCRIPTO";
  let alicuota = 3; // 0 %: no se usa fuera del inscripto (Factura C, sin IVA discriminado)
  if (inscripto) {
    const a = alicuotaDeIvaPct(d.ivaPct);
    if (a === null) {
      return {
        ok: false,
        error:
          d.ivaPct === null
            ? "El proyecto no tiene presupuesto: no se sabe con qué IVA facturar."
            : `El presupuesto lleva IVA ${d.ivaPct} %, y la factura sólo sale con 21 %, 10,5 % o 27 %. Corregilo en el presupuesto.`,
      };
    }
    alicuota = a;
  }
  const montos = montosFacturita(emisor.condicionIva, total, alicuota);
  if (!montos.ok) return { ok: false, error: montos.error };

  // Período del servicio: del armado (o del evento) al desarme (o al evento).
  const desde = fechaFiscal(proyecto.fechaArmado ?? proyecto.fechaEvento);
  const hasta = fechaFiscal(proyecto.fechaDesarme ?? proyecto.fechaEvento ?? proyecto.fechaArmado);
  if (!desde || !hasta) return { ok: false, error: "El proyecto no tiene fechas: cargá la fecha del evento (o del armado y desarme) para facturar el período del servicio." };
  if (desde > hasta) return { ok: false, error: "El desarme del proyecto es anterior al armado: corregí las fechas para facturar." };

  const hoy = fechaFiscalDelDia(d.ahora);
  const vence = fechaFiscalDelDia(cuota.venceEl);
  const vencimientoPago = vence > hoy ? vence : hoy;

  const decision = decidirComprobante(
    { condicionIva: emisor.condicionIva, cuit: emisor.cuit, regimenFacturaA: emisor.regimenFacturaA ?? null },
    receptorDeFicha(d.cliente),
    {
      clase: "factura",
      fecha: hoy,
      fechaDeEnvio: hoy,
      importeTotal: montos.total,
      naturaleza: "servicios",
      servicio: { desde, hasta, vencimientoPago },
    },
    // Lo mismo que decide el despacho (`decidirDelEvento`): así la letra prometida es la que sale.
    { exigirPeriodoDeServicio: true, umbralIdentificacionDelNegocio: umbralDelMotor(null) },
  );
  const receptor = receptorParaComprobante(decision);
  if (!receptor) return { ok: false, error: motivoDeLaDecision(decision) };
  const impide = queImpideEntregarLaFactura(decision, d.cliente, montos.iva.length);
  if (impide) return { ok: false, error: impide };

  return {
    ok: true,
    input: {
      tenantId: d.tenantId,
      concepto: CONCEPTO_SERVICIOS,
      fecha: hoy,
      emisor: { cuit: emisor.cuit, condicionIva: emisor.condicionIva, puntoVenta: emisor.puntoVenta },
      receptor,
      neto: montos.neto,
      iva: montos.iva,
      total: montos.total,
      ...(montos.ivaPorProducto ? { ivaPorProducto: true } : {}),
      servicioDesde: desde,
      servicioHasta: hasta,
      vencimientoPago,
      descripcion: `Proyecto #${proyecto.numero} · ${cuota.concepto}`.slice(0, 200),
      origin: { type: "PROYECTO_CUOTA", id: cuota.id },
      // La pide una persona («Facturar» / «Volver a facturar»): una rechazada se reabre con los datos de ahora.
      reabrirSiRechazada: true,
    },
  };
}

/** Estados de la factura de una cuota que la «congelan» (no se regenera ni se anula ni se quita). */
export const FACTURA_VIVA: readonly string[] = ["PENDING", "AUTHORIZED"];

export const esFacturaViva = (status: string | null | undefined): boolean => !!status && FACTURA_VIVA.includes(status);

/** Mensajes de la acción cuando falta algo del negocio (en criollo). */
export const SIN_COLUMNA_CUOTA = "La facturación de cuotas espera su migración: avisale a soporte de Gestión Studio Grow.";
export const SIN_ARCA = "Tu negocio no tiene la facturación electrónica (ARCA) activada.";
export const FACTURACION_APAGADA = "La facturación electrónica está apagada en este entorno.";
/**
 * Certificación T2 · vuelta 1 (ALTA): el negocio también factura desde el extracto del banco (módulo
 * `bancos`, o ya tiene movimientos importados). Esas propuestas se emiten SIN origen y no saben de
 * las cuotas: el mismo cobro saldría con dos CAE. Hasta atarlas, la cuota no se factura por acá.
 */
export const CON_BANCOS =
  "Tu negocio también factura desde el extracto del banco: para no hacer dos facturas del mismo cobro, las cuotas de proyecto se facturan desde Facturación.";

/**
 * Certificación T2 · vuelta 1 (BAJA): el presupuesto suma IVA pero el negocio factura C
 * (monotributo o exento). La factura sale bien —por lo que paga el cliente, sin IVA discriminado—,
 * pero el precio lleva un IVA que el negocio no cobra. `null` si no hay nada que avisar.
 */
export function avisoIvaEnFacturaC(condicionIva: string | null | undefined, ivaPct: number | null | undefined): string | null {
  if (!condicionIva || condicionIva === "RESPONSABLE_INSCRIPTO") return null;
  if (typeof ivaPct !== "number" || !Number.isFinite(ivaPct) || ivaPct <= 0) return null;
  const quien = condicionIva === "MONOTRIBUTO" ? "es monotributista" : "es exento de IVA";
  return `El presupuesto suma IVA (${ivaPct} %), pero tu negocio ${quien} y factura C: la factura sale por el total de la cuota, sin IVA discriminado. Si ese IVA no corresponde, sacalo del presupuesto antes de facturar.`;
}
