// ============================================================================
// Lectura del Libro IVA de UN MES (ADR-060 D7) — arma las filas desde lo que YA existe.
// ============================================================================
//
// Mes CALENDARIO en hora argentina (`bordesDelMes`), no una ventana de N días hacia atrás:
// el IVA se liquida por mes, y con "últimos 30 días" el libro de septiembre mezclaba agosto.
//
//   - COMPROBANTES: `Invoice` AUTORIZADO con `fecha` (AAAAMMDD) del mes, con su desglose de
//     IVA y el estado de la venta de origen (para marcar las anuladas sin nota de crédito).
//   - VENTAS SIN COMPROBANTE (control): pedidos cobrados y turnos cobrados del mes que NO
//     tienen un comprobante con CAE, de ningún mes. Se decide con la relación
//     (`invoices: none AUTHORIZED`), no con los comprobantes de ESTE mes: una venta del 31 a
//     las 23 facturada el 1 no puede aparecer como "sin comprobante".
//   - COMPRAS (control): `StockPurchase` COMPRA. Las que NO tienen la factura del proveedor, por
//     el día de carga (`createdAt`) y sin crédito. Las que SÍ la tienen (hoy, las importadas de
//     «Mis Comprobantes Recibidos»), por la FECHA DEL COMPROBANTE (`facturaFecha`, AAAAMMDD), con
//     sus importes y su IVA como crédito (contador/recibidos-libro.ts). Antes entraban todas por
//     el día de carga con `totalCost`: los recibidos de julio subidos el 3/9 caían en septiembre.
//   - CONDICIÓN: de los tipos que el negocio emitió alguna vez (A/B = inscripto, sólo C =
//     monotributo). Se mira todo el historial y no sólo el mes: un inscripto que este mes no
//     facturó sigue siendo inscripto.
//
// `leerLibroIva` recibe la base con la que leer: la del request (la pantalla, envuelta en la
// transacción del negocio) o la de OTRO negocio dentro de su `tenantTransaction` (el paquete
// del contador). Nunca decide el negocio: se lo pasan. Por eso este archivo NO lleva
// "use server" — publicaría un endpoint que lee el libro de cualquier tenantId.

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { compraDelLibroDesdeFactura } from "@/lib/contador/recibidos-libro";
import { leerRegimenFacturaAEnTx } from "@/lib/fiscal/regimen-factura-a.server";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { bordesDelMes, type MesKey } from "./fecha-fiscal";
import {
  armarLibroIva,
  comprobanteDesdeInvoice,
  condicionDelNegocio,
  dateToIso,
  type CompraRow,
  type FilasDelLibro,
  type LibroIva,
  type VentaSinComprobanteRow,
  whereComprobantesDePruebaDelMes,
  whereAutorizadosDespues,
  whereAutorizadosHasta,
  whereComprobantesDelMes,
  whereComprobantesEmitidos,
} from "./libro-iva";

/** La base con la que se lee: una transacción del negocio (o el cliente del request). */
export type DbLibro = Prisma.TransactionClient;

/** Recupera CUIT / N° de orden que la compra formal compuso en `notes`. */
function parseFormalNotes(notes: string | null): { cuit: string | null; oc: string | null } {
  const cuit = notes ? /CUIT\s+([\d-]+)/i.exec(notes)?.[1] ?? null : null;
  const oc = notes ? /OC\s*#(\S+)/i.exec(notes)?.[1] ?? null : null;
  return { cuit, oc };
}

/** Decimal de Prisma → number, en el borde (ADR-057). */
function num(v: unknown): number {
  if (v != null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const SELECT_COMPROBANTE = {
  id: true,
  fecha: true, tipoComprobante: true, puntoVenta: true, numero: true,
  docTipo: true, docNro: true, neto: true, iva: true, total: true, ivaDesglose: true,
  order: { select: { status: true } },
  appointment: { select: { status: true } },
} as const;

/** El Libro IVA del mes `mes` del negocio `tenantId` (sólo ese negocio), leído con `db`. */
export async function leerLibroIva(db: DbLibro, tenantId: string, mes: MesKey): Promise<LibroIva> {
  const f = await leerFilasLibroIva(db, tenantId, mes);
  return armarLibroIva({ ...f, condicion: condicionDelNegocio(f.condicionCargada, f.tiposEmitidos) });
}

/** Las filas del libro de UN negocio, sin armar: el libro de un CUIT con locales las junta (libro-iva-red.ts). */
export async function leerFilasLibroIva(
  db: DbLibro,
  tenantId: string,
  mes: MesKey,
  /** El instante del congelado: sólo lo autorizado hasta ahí suma (el paquete FINAL). */
  corte: Date | null = null,
): Promise<FilasDelLibro> {
  const b = bordesDelMes(mes);
  const delMes = whereComprobantesDelMes(tenantId, mes);
  const enElMes = { gte: b.instantes.gte, lt: b.instantes.lt };
  const sinComprobanteConCae = { none: { status: "AUTHORIZED" as const } };

  const [invoices, despues, dePrueba, tiposEmitidos, orders, payments, purchases, conFactura, negocio] = await Promise.all([
    // El mismo `where` que el número del botón (finanzas.server.ts): sin los del modo prueba.
    db.invoice.findMany({
      where: corte ? { ...delMes, AND: [...delMes.AND, whereAutorizadosHasta(corte)] } : delMes,
      select: SELECT_COMPROBANTE,
    }),
    // Mes congelado: lo que ARCA autorizó después, aparte y sin sumar (refutador, vuelta 4).
    corte
      ? db.invoice.findMany({ where: { ...delMes, AND: [...delMes.AND, whereAutorizadosDespues(corte)] }, select: SELECT_COMPROBANTE })
      : Promise.resolve([]),
    // Los del modo prueba (CAE simulado), aparte: se ven como «de prueba» y no suman (QA vuelta 6).
    db.invoice.findMany({ where: whereComprobantesDePruebaDelMes(tenantId, mes), select: SELECT_COMPROBANTE }),
    db.invoice.groupBy({
      by: ["tipoComprobante"],
      where: whereComprobantesEmitidos(tenantId),
      _count: { _all: true },
    }),
    db.order.findMany({
      where: {
        tenantId,
        paid: true,
        status: { not: "CANCELLED" },
        createdAt: enElMes,
        invoices: sinComprobanteConCae,
      },
      select: { id: true, code: true, total: true, createdAt: true, customerName: true },
    }),
    db.payment.findMany({
      where: {
        tenantId,
        status: "APPROVED",
        createdAt: enElMes,
        appointment: { invoices: sinComprobanteConCae },
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        appointment: { select: { client: { select: { name: true } }, service: { select: { name: true } } } },
      },
    }),
    db.stockPurchase.findMany({
      where: { tenantId, kind: "COMPRA", facturaTipo: null, createdAt: enElMes },
      select: {
        id: true, code: true, supplier: true, totalCost: true, createdAt: true, notes: true,
        supplierRef: { select: { name: true, taxId: true } },
      },
    }),
    db.stockPurchase.findMany({
      where: { tenantId, kind: "COMPRA", facturaTipo: { not: null }, facturaFecha: { startsWith: mes.replace("-", "") } },
      orderBy: [{ facturaFecha: "asc" }, { code: "asc" }],
      select: {
        id: true, supplier: true,
        facturaTipo: true, facturaPuntoVenta: true, facturaNumero: true, facturaFecha: true, facturaCuit: true,
        facturaNeto: true, facturaIva: true, facturaTotal: true, notes: true,
        facturaOtrosTributos: true, facturaPercepcionIva: true, facturaPercepcionIibb: true,
        supplierRef: { select: { name: true } },
      },
    }),
    // La condición CARGADA del negocio (Tenant está fuera de RLS por diseño; se lee con su id).
    db.tenant.findUnique({ where: { id: tenantId }, select: { arcaCondicionIva: true } }),
  ]);

  const comoFila = (i: (typeof invoices)[number]) =>
    comprobanteDesdeInvoice({
      id: i.id,
      fecha: i.fecha,
      tipoComprobante: i.tipoComprobante,
      puntoVenta: i.puntoVenta,
      numero: i.numero,
      docTipo: i.docTipo,
      docNro: i.docNro,
      neto: num(i.neto),
      iva: num(i.iva),
      total: num(i.total),
      ivaDesglose: i.ivaDesglose,
      origenAnulado: i.order?.status === "CANCELLED" || i.appointment?.status === "CANCELLED",
    });
  const comprobantes = invoices.map(comoFila);

  const ventasSinComprobante: VentaSinComprobanteRow[] = [
    ...orders.map((o) => ({
      clave: `pedido:${o.id}`,
      fecha: dateToIso(o.createdAt),
      tipo: "Venta del mostrador",
      numero: `Pedido ${o.code}`,
      cliente: o.customerName?.trim() || "Consumidor final",
      total: o.total,
    })),
    ...payments.map((p) => ({
      clave: `cobro:${p.id}`,
      fecha: dateToIso(p.createdAt),
      tipo: "Turno cobrado",
      numero: p.appointment?.service?.name ?? "—",
      cliente: p.appointment?.client?.name ?? "Consumidor final",
      total: p.amount,
    })),
  ];

  const compras: CompraRow[] = purchases.map((c) => {
    const { cuit, oc } = parseFormalNotes(c.notes);
    const cuitFinal = c.supplierRef?.taxId?.trim() || cuit;
    return {
      clave: `compra:${c.id}`,
      fecha: dateToIso(c.createdAt),
      proveedor: c.supplierRef?.name?.trim() || c.supplier?.trim() || "Proveedor sin identificar",
      doc: cuitFinal ? `CUIT ${cuitFinal}` : "—",
      numero: oc ?? `Compra ${c.code}`,
      total: c.totalCost,
    };
  });
  for (const c of conFactura) {
    compras.push(
      compraDelLibroDesdeFactura({
        id: c.id,
        proveedor: c.supplierRef?.name?.trim() || c.supplier?.trim() || "Proveedor sin identificar",
        facturaTipo: c.facturaTipo ?? 0,
        facturaPuntoVenta: c.facturaPuntoVenta ?? 0,
        facturaNumero: c.facturaNumero ?? 0,
        facturaFecha: c.facturaFecha ?? "",
        facturaCuit: c.facturaCuit ?? "",
        facturaIva: num(c.facturaIva),
        facturaTotal: num(c.facturaTotal),
        facturaNeto: num(c.facturaNeto),
        // Percepciones de IVA e IIBB y otros tributos, juntos: la misma suma que la pantalla (recibidos-db.ts).
        facturaOtrosTributos: sumarAlCentavo([num(c.facturaOtrosTributos), num(c.facturaPercepcionIva), num(c.facturaPercepcionIibb)]),
        notas: c.notes,
      }),
    );
  }

  return {
    comprobantes,
    ...(corte ? { comprobantesDespuesDelCongelado: despues.map(comoFila) } : {}),
    comprobantesDePrueba: dePrueba.map(comoFila),
    ventasSinComprobante,
    compras,
    tiposEmitidos: tiposEmitidos.map((g) => g.tipoComprobante),
    condicionCargada: negocio?.arcaCondicionIva ?? null,
    // Con la transacción del negocio (su RLS): la clase que cargó Soporte, para el aviso del libro.
    regimenFacturaA: await leerRegimenFacturaAEnTx(db, tenantId),
  };
}

/**
 * El Libro IVA del negocio del request. Exige `reports:read` (la página además pasa por
 * `requireApp("libro-iva")`); lee en la transacción del negocio, con su RLS.
 */
export async function getLibroIva(mes: MesKey): Promise<LibroIva> {
  await requireCapability("reports:read");
  const tenantId = await getCurrentTenantId();
  // El libro del CUIT: la casa de una red suma sus locales del mismo CUIT (QA vuelta 6, bloqueante 2).
  const { leerLibroIvaDelCuit } = await import("./libro-iva-red");
  return leerLibroIvaDelCuit(tenantId, mes);
}
