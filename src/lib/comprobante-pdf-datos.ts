// ============================================================================
// LECTOR ÚNICO DEL COMPROBANTE IMPRESO (R3-F1) — de la base a `DatosComprobanteImpreso`.
// ============================================================================
//
// Lo usan la vista imprimible y la descarga del PDF; no tiene guardia propia: quien lo llama
// ya pidió la app y el permiso (`requireApp("facturacion")` + `requireCapability("billing:manage")`).
//
// Sólo el negocio dueño: doble candado. La consulta corre con el cliente de la app (`prisma`),
// que bajo RLS pone el negocio en la transacción (política `tenant_isolation`), y además filtra
// por `tenantId`. Un id de otro negocio devuelve `null`, igual que un id que no existe: desde
// afuera no se puede saber si existe (comprobante-pdf-postgres.test.ts).
//
// Qué se congela y qué no: el comprobante (tipo, número, fecha, importes, documento del
// receptor, CAE) es el que autorizó ARCA. El nombre, la condición y el domicilio del cliente
// salen de su ficha de hoy, porque Invoice no guarda una copia (pendiente en el traspaso); por
// eso el impreso no sale si la condición de hoy no cuadra con la letra (`faltantesDelComprobante`).
// Invoice tampoco guarda en qué ambiente de ARCA se autorizó: se deduce del de hoy y del último
// cambio del negocio entre prueba y real (`ambienteDelComprobante`).
import { ENTIDAD_RECEPTOR_DEL_COMPROBANTE } from "@/lib/comprobante-receptor-marca";
import { prisma } from "@/lib/prisma";
import { redondearAlCentavo, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { modoDesdeEnv } from "@/plugins/arca/afip/factory";
import {
  ambienteDelComprobante,
  type AlicuotaImpresa,
  type DatosComprobanteImpreso,
  type EstadoComprobante,
  type RenglonImpreso,
} from "@/lib/comprobante-pdf";
import type { OrigenDelComprobante } from "@/lib/facturacion/detalle-core";

type Importe = { toNumber(): number } | number | string | null | undefined;

function aNumero(v: Importe): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return v.toNumber();
}

function desglose(json: unknown): AlicuotaImpresa[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((a: unknown) => {
    if (typeof a !== "object" || a === null) return [];
    const { alicuotaId, base, importe } = a as Record<string, unknown>;
    const fila = { alicuotaId: Number(alicuotaId), base: Number(base), importe: Number(importe) };
    return Object.values(fila).every(Number.isFinite) ? [fila] : [];
  });
}

const CONCEPTO: Readonly<Record<number, string>> = { 1: "Productos", 2: "Servicios", 3: "Productos y servicios" };

const CLIENTE = { select: { name: true, razonSocial: true, condicionIva: true, domicilio: true } } as const;

/**
 * Quién fue el comprador de un comprobante SIN venta, turno ni movimiento del banco (Facturita, la
 * emisión manual): Invoice no tiene columnas para el nombre, la condición ni el domicilio del
 * receptor, así que quien emite deja una fila en AuditLog con esta acción, en la MISMA transacción
 * que la factura (`entity: ENTIDAD_RECEPTOR_DEL_COMPROBANTE`, `entityId`, `changes: { nombre, condicionIva, domicilio }`).
 * Es una copia congelada al emitir. Pendiente: columnas en Invoice (con migración).
 */
export const ACCION_RECEPTOR_DEL_COMPROBANTE = "comprobante.receptor";
export { ENTIDAD_RECEPTOR_DEL_COMPROBANTE };

function textoONulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Lo impreso más lo que el detalle muestra de un comprobante que no se imprime: el motivo del
 * rechazo de ARCA y de dónde salió (para volver a facturarlo).
 */
export type ComprobanteLeido = DatosComprobanteImpreso & { rechazoMotivo: string | null; origen: OrigenDelComprobante };

/** Todo lo que el comprobante impreso necesita, o `null` si el id no es de este negocio. */
export async function leerComprobanteImpreso(invoiceId: string, tenantId: string): Promise<ComprobanteLeido | null> {
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      status: true, tipoComprobante: true, puntoVenta: true, numero: true, fecha: true, concepto: true,
      cae: true, caeVencimiento: true, neto: true, iva: true, total: true, ivaDesglose: true,
      docTipo: true, docNro: true, authorizedAt: true, createdAt: true, rechazoMotivo: true, orderId: true, appointmentId: true,
      comprobanteAsociado: { select: { tipoComprobante: true, puntoVenta: true, numero: true } },
      order: {
        select: {
          customerName: true,
          client: CLIENTE,
          items: { select: { name: true, quantity: true, unitPrice: true }, orderBy: { id: "asc" } },
        },
      },
      appointment: { select: { priceAtBooking: true, service: { select: { name: true } }, client: CLIENTE } },
    },
  });
  if (!inv) return null;

  const negocio = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      arcaCuit: true, arcaRazonSocial: true, arcaCondicionIva: true, arcaDomicilioFiscal: true,
      bancosDomicilioEmisor: true, arcaInicioActividades: true, arcaIibb: true, arcaHomologacion: true,
    },
  });
  // Último cambio del negocio entre el ARCA de prueba y el real: el pase a real y la vuelta a
  // pruebas dejan en AuditLog `changes.arcaHomologacion.despues` (`cambiosParaAuditoria`,
  // src/lib/operador/pase-a-real.ts). Es el único camino que cambia `arcaHomologacion` de un
  // negocio ya dado de alta. Lo autorizado antes de ese cambio no se sabe en qué ambiente fue.
  const cambioDeAmbiente = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      entity: "Tenant",
      entityId: tenantId,
      OR: [
        { changes: { path: ["arcaHomologacion", "despues"], equals: true } },
        { changes: { path: ["arcaHomologacion", "despues"], equals: false } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  // Sin origen (venta ni turno): la factura pudo salir de un movimiento del banco, que guarda
  // a quién y qué se facturó.
  const movimiento =
    !inv.order && !inv.appointment
      ? await prisma.movimientoImportado.findFirst({
          where: { invoiceId, tenantId },
          select: { nombreReceptor: true, descripcionServicio: true, receptorCondicionIva: true },
        })
      : null;
  // `Invoice.descripcion` nace con 20261022140000 (Gate 2): se lee aparte para que, en una base sin
  // esa migración (P2022, columna inexistente), el PDF siga saliendo con el concepto como antes.
  const descripcionGuardada = await prisma.invoice
    .findFirst({ where: { id: invoiceId, tenantId }, select: { descripcion: true } })
    .then((x) => x?.descripcion ?? null)
    .catch((e: unknown) => {
      const code = (e as { code?: string } | null)?.code;
      if (code === "P2021" || code === "P2022") return null;
      throw e;
    });
  // Sin venta, turno ni movimiento: la copia del comprador que dejó la emisión manual (Facturita).
  const copiaReceptor =
    !inv.order && !inv.appointment && !movimiento
      ? await prisma.auditLog.findFirst({
          where: { tenantId, entity: ENTIDAD_RECEPTOR_DEL_COMPROBANTE, entityId: invoiceId, action: ACCION_RECEPTOR_DEL_COMPROBANTE },
          orderBy: { createdAt: "desc" },
          select: { changes: true },
        })
      : null;
  const copia = (copiaReceptor?.changes ?? null) as Record<string, unknown> | null;

  const total = aNumero(inv.total);
  let renglones: RenglonImpreso[];
  if (inv.order && inv.order.items.length > 0) {
    renglones = inv.order.items.map((i) => ({
      descripcion: i.name,
      cantidad: i.quantity,
      precioUnitario: i.unitPrice,
      importe: redondearAlCentavo(i.quantity * i.unitPrice),
    }));
  } else if (inv.appointment) {
    const precio = inv.appointment.priceAtBooking ?? total;
    renglones = [{ descripcion: inv.appointment.service.name, cantidad: 1, precioUnitario: precio, importe: redondearAlCentavo(precio) }];
  } else {
    // Lo que se facturó, si quien emitió lo escribió (`Invoice.descripcion`); si no, el concepto.
    const descripcion = descripcionGuardada?.trim() || movimiento?.descripcionServicio?.trim() || CONCEPTO[inv.concepto] || "Venta";
    renglones = [{ descripcion, cantidad: 1, precioUnitario: total, importe: total }];
  }
  // El detalle tiene que sumar el total autorizado: si la venta tuvo descuento o recargo, va
  // como un renglón más en vez de dejar un detalle que no cierra.
  const diferencia = redondearAlCentavo(total - sumarAlCentavo(renglones.map((r) => r.importe)));
  if (diferencia !== 0) {
    renglones.push({
      descripcion: diferencia < 0 ? "Descuentos de la venta" : "Otros cargos de la venta",
      cantidad: 1,
      precioUnitario: diferencia,
      importe: diferencia,
    });
  }

  const cliente = inv.order?.client ?? inv.appointment?.client ?? null;
  const origen: OrigenDelComprobante = inv.orderId
    ? { tipo: "venta", orderId: inv.orderId }
    : inv.appointmentId
      ? { tipo: "turno" }
      : movimiento
        ? { tipo: "banco" }
        : { tipo: "otro" };
  return {
    rechazoMotivo: inv.rechazoMotivo,
    origen,
    estado: inv.status as EstadoComprobante,
    tipoComprobante: inv.tipoComprobante,
    puntoVenta: inv.puntoVenta,
    numero: inv.numero,
    fecha: inv.fecha,
    concepto: inv.concepto,
    cae: inv.cae,
    caeVencimiento: inv.caeVencimiento,
    neto: aNumero(inv.neto),
    iva: aNumero(inv.iva),
    total,
    ivaDesglose: desglose(inv.ivaDesglose),
    otrosImpuestosNacionales: 0,
    renglones,
    emisor: {
      razonSocial: negocio?.arcaRazonSocial ?? null,
      cuit: negocio?.arcaCuit ?? null,
      condicionIva: negocio?.arcaCondicionIva ?? null,
      domicilio: negocio?.arcaDomicilioFiscal ?? negocio?.bancosDomicilioEmisor ?? null,
      inicioActividades: negocio?.arcaInicioActividades ?? null,
      iibb: negocio?.arcaIibb ?? null,
    },
    receptor: {
      docTipo: inv.docTipo,
      docNro: inv.docNro,
      nombre: cliente?.razonSocial ?? cliente?.name ?? inv.order?.customerName ?? movimiento?.nombreReceptor ?? textoONulo(copia?.nombre),
      condicionIva: cliente?.condicionIva ?? movimiento?.receptorCondicionIva ?? textoONulo(copia?.condicionIva),
      domicilio: cliente?.domicilio ?? textoONulo(copia?.domicilio),
    },
    comprobanteAsociado: inv.comprobanteAsociado,
    // Sin la hora del CAE (comprobantes viejos) vale la de creación: el CAE llegó después, así
    // que si se creó después del cambio también se autorizó después.
    ambiente: ambienteDelComprobante({
      arcaHomologacion: negocio?.arcaHomologacion ?? true,
      modoArca: modoDesdeEnv(),
      autorizadoEn: inv.authorizedAt ?? inv.createdAt,
      ultimoCambioDeAmbiente: cambioDeAmbiente?.createdAt ?? null,
    }),
  };
}
