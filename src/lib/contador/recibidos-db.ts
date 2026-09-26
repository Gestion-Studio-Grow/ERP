// ============================================================================
// COMPROBANTES RECIBIDOS — acceso del estudio, guardado y lectura (SERVIDOR).
// ============================================================================
//
// La contadora carga las compras de un cliente de SU cartera. Es escritura CRUZADA entre
// negocios, con las mismas tres llaves que el paquete del mes (cierre-mes/paquete-cartera.ts):
//   1. la persona tiene `cartera:manage` y su negocio tiene el módulo `cartera` asignado;
//   2. el cliente es de la cartera de SU estudio (CarteraCliente leída con el GUC del estudio);
//      inexistente, de baja o de otro estudio: el mismo «no está en tu cartera»;
//   3. recién ahí se escribe, y sólo con `tenantTransaction({ tenantId: cliente })` (RLS).
//
// Dónde queda: cada comprobante es una `StockPurchase` (kind COMPRA) SIN renglones, con los
// datos de la factura del proveedor (factura*, lanzamiento E2 B7). Sin renglones no hay
// movimiento de stock ni cuenta a pagar. El índice único StockPurchase_factura_proveedor_key
// (negocio, CUIT, tipo, punto de venta, número) hace imposible el crédito fiscal doble.
// Sin columnas nuevas (ventana M1): moneda, cotización y la marca «a revisar» van en `notes`
// con los rótulos de abajo, y `totalCost` lleva el total en pesos con signo (la nota de
// crédito resta en los listados de compras que ya suman `totalCost`).
//
// Sin "use server": no es un endpoint. Lo llaman recibidos-actions.ts, la página y la ruta CSV.

import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { MODULO_CARTERA, exigirClienteDeCartera, type EstadoCartera, type FilaCarteraDb } from "@/lib/cartera-core";
import { esMesKey, type MesKey } from "@/lib/libros/fecha-fiscal";
import { sumarAlCentavo, textoAlCentavo } from "@/lib/dinero/redondeo";
import {
  claveRecibido,
  esNotaDeCreditoRecibida,
  type ComprobanteRecibido,
  type LineaIvaRecibida,
  type RechazoRecibido,
  rotuloRecibido,
} from "./recibidos-formato";

type Tx = Prisma.TransactionClient;

/** Encabezado de `notes` de un comprobante importado del archivo de ARCA. */
export const NOTA_IMPORTADO = "Importado de Mis Comprobantes Recibidos (ARCA)";
/** Rótulo de la marca «a revisar» dentro de `notes` (sin columna propia hasta M1). */
export const NOTA_A_REVISAR = "A revisar:";
export const ACCION_IMPORTACION = "compras.recibidos-importados";

// ---------------------------------------------------------------------------
// Acceso: el estudio de la sesión y un cliente de su cartera.
// ---------------------------------------------------------------------------

export type AccesoRecibidos =
  | {
      ok: true;
      estudioTenantId: string;
      estudioNombre: string;
      usuario: { id: string; name: string };
      cliente: { id: string; nombre: string; alias: string; cuit: string | null };
    }
  | { ok: false; error: string };

const NO_ESTA = "Ese cliente no está en tu cartera.";

async function filaDeCartera(estudioTenantId: string, clienteTenantId: string): Promise<FilaCarteraDb | null> {
  const fila = await tenantTransaction(
    (tx) =>
      tx.carteraCliente.findUnique({
        where: { tenantId_clienteTenantId: { tenantId: estudioTenantId, clienteTenantId } },
        select: { id: true, clienteTenantId: true, alias: true, estado: true },
      }),
    { tenantId: estudioTenantId },
  );
  return fila ? { ...fila, estado: fila.estado as EstadoCartera } : null;
}

/**
 * ¿Puede la persona de la sesión trabajar las compras de este cliente? `paraEscribir` exige la
 * fila ACTIVA (un cliente pausado se consulta, no se le carga nada).
 */
export async function accesoAClienteDeCartera(clienteRaw: unknown, paraEscribir: boolean): Promise<AccesoRecibidos> {
  const user = await requireCapability("cartera:manage");
  const estudioTenantId = await getCurrentTenantId();
  const estudio = await basePrisma.tenant.findUnique({
    where: { id: estudioTenantId },
    select: { name: true, modules: true },
  });
  if (!estudio?.modules?.includes(MODULO_CARTERA)) {
    return { ok: false, error: "Tu negocio no tiene la cartera del estudio contable." };
  }
  const clienteTenantId = typeof clienteRaw === "string" ? clienteRaw.trim() : "";
  if (!clienteTenantId || clienteTenantId === estudioTenantId) return { ok: false, error: NO_ESTA };
  const pertenencia = await exigirClienteDeCartera(filaDeCartera, estudioTenantId, clienteTenantId, {
    permitirPausada: !paraEscribir,
  });
  if (!pertenencia.ok) return { ok: false, error: pertenencia.error };
  // Tenant está fuera de RLS por diseño; el id ya salió de la cartera verificada.
  const cliente = await basePrisma.tenant.findUnique({
    where: { id: clienteTenantId },
    select: { name: true, arcaCuit: true },
  });
  if (!cliente) return { ok: false, error: NO_ESTA };
  return {
    ok: true,
    estudioTenantId,
    estudioNombre: estudio.name,
    usuario: { id: user.id, name: user.name },
    cliente: { id: clienteTenantId, nombre: cliente.name, alias: pertenencia.fila.alias, cuit: cliente.arcaCuit ?? null },
  };
}

// ---------------------------------------------------------------------------
// Guardado.
// ---------------------------------------------------------------------------

export function notasDelRecibido(c: ComprobanteRecibido, por: string): string {
  const partes = [`${NOTA_IMPORTADO}, por ${por}.`];
  if (c.moneda !== "PES") {
    partes.push(`Moneda ${c.moneda}, tipo de cambio ${String(c.cotizacion).replace(".", ",")}.`);
  }
  if (c.codAutorizacion) partes.push(`CAE ${c.codAutorizacion}.`);
  if (c.aRevisar) partes.push(`${NOTA_A_REVISAR} ${c.aRevisar}`);
  return partes.join(" ");
}

/** La marca «a revisar» de una compra, leída de sus notas; null si no tiene. */
export function aRevisarDeNotas(notes: string | null): string | null {
  if (!notes) return null;
  const i = notes.indexOf(NOTA_A_REVISAR);
  return i === -1 ? null : notes.slice(i + NOTA_A_REVISAR.length).trim();
}

export interface ResultadoGuardado {
  cargados: ComprobanteRecibido[];
  /** Los que ya estaban en el negocio (misma clave): no se cargan de nuevo. */
  yaCargados: RechazoRecibido[];
}

/**
 * Guarda los comprobantes en el negocio `tenantId` (la transacción DEBE ser la de ese negocio).
 * Todo o nada: si una fila falla, no queda ninguna. Mismo candado que el alta de compras
 * (purchase-core.ts), así el correlativo y la verificación de repetidos no compiten.
 */
export async function guardarRecibidos(
  tx: Tx,
  tenantId: string,
  comprobantes: readonly ComprobanteRecibido[],
  quien: { actor: string; por: string; archivo: string },
): Promise<ResultadoGuardado> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`compra:${tenantId}`}))`;

  const cuits = [...new Set(comprobantes.map((c) => c.cuitEmisor))];
  const existentes = cuits.length
    ? await tx.stockPurchase.findMany({
        where: { tenantId, facturaCuit: { in: cuits } },
        select: { facturaCuit: true, facturaTipo: true, facturaPuntoVenta: true, facturaNumero: true, code: true },
      })
    : [];
  const yaEsta = new Map(
    existentes.map((e) => [
      claveRecibido({ cuitEmisor: e.facturaCuit!, tipo: e.facturaTipo ?? 0, puntoVenta: e.facturaPuntoVenta ?? 0, numero: e.facturaNumero ?? 0 }),
      e.code,
    ]),
  );
  const yaCargados: RechazoRecibido[] = [];
  const nuevos: ComprobanteRecibido[] = [];
  for (const c of comprobantes) {
    const code = yaEsta.get(claveRecibido(c));
    if (code != null) {
      yaCargados.push({ fila: c.fila, comprobante: rotuloRecibido(c), motivo: `Ya estaba cargado (compra #${code}): no se duplica.` });
    } else nuevos.push(c);
  }

  if (nuevos.length) {
    const proveedores = await tx.supplier.findMany({
      where: { tenantId, taxId: { in: [...new Set(nuevos.map((c) => c.cuitEmisor))] } },
      select: { id: true, taxId: true },
    });
    const proveedorPorCuit = new Map(proveedores.map((p) => [p.taxId!, p.id]));
    const last = await tx.stockPurchase.findFirst({ where: { tenantId }, orderBy: { code: "desc" }, select: { code: true } });
    let code = last?.code ?? 0;
    const dec = (n: number) => new Prisma.Decimal(textoAlCentavo(n));
    await tx.stockPurchase.createMany({
      data: nuevos.map((c) => ({
        tenantId,
        code: ++code,
        kind: "COMPRA" as const,
        supplier: c.emisor,
        supplierId: proveedorPorCuit.get(c.cuitEmisor) ?? null,
        notes: notasDelRecibido(c, quien.por),
        totalCost: esNotaDeCreditoRecibida(c.tipo) ? -c.total : c.total,
        createdBy: quien.actor,
        facturaTipo: c.tipo,
        facturaPuntoVenta: c.puntoVenta,
        facturaNumero: c.numero,
        facturaFecha: c.fecha,
        facturaCuit: c.cuitEmisor,
        facturaNeto: dec(c.neto),
        facturaIva: dec(c.iva),
        facturaIvaDesglose: c.desglose == null ? Prisma.JsonNull : (c.desglose as LineaIvaRecibida[] as unknown as Prisma.InputJsonValue),
        facturaNoGravado: dec(c.noGravado),
        facturaExento: dec(c.exento),
        facturaOtrosTributos: dec(c.otrosTributos),
        facturaTotal: dec(c.total),
      })),
    });
  }

  await tx.auditLog.create({
    data: {
      tenantId,
      actor: quien.actor,
      action: ACCION_IMPORTACION,
      entity: "StockPurchase",
      entityId: null,
      changes: {
        por: quien.por,
        archivo: quien.archivo,
        cargados: nuevos.length,
        yaCargados: yaCargados.length,
        aRevisar: nuevos.filter((c) => c.aRevisar).length,
      },
      channel: "admin",
    },
  });
  return { cargados: nuevos, yaCargados };
}

// ---------------------------------------------------------------------------
// Lectura: las compras con factura del mes (fecha del comprobante), manuales o importadas.
// ---------------------------------------------------------------------------

export interface CompraConFactura {
  id: string;
  code: number;
  fecha: string;
  tipo: number;
  puntoVenta: number;
  numero: number;
  cuitEmisor: string;
  emisor: string;
  neto: number;
  noGravado: number;
  exento: number;
  iva: number;
  otrosTributos: number;
  total: number;
  desglose: LineaIvaRecibida[] | null;
  aRevisar: string | null;
  importada: boolean;
}

/**
 * Tope de seguridad de UNA lectura del mes (pantalla, resumen y archivo). No corta en silencio:
 * si un mes lo pasa, la lectura vuelve `completa: false` y la pantalla y el archivo lo dicen en
 * vez de entregar una lista recortada. Un archivo de ARCA trae hasta 20.000 (MAXIMO_DE_FILAS);
 * 50.000 en un mes de UN cliente es más que un mayorista grande.
 */
export const TOPE_DEL_MES = 50_000;

/** Lo que ven la pantalla y la bajada si el mes pasa el tope (no se entrega nada recortado). */
export const MES_DEMASIADO_GRANDE =
  "Este mes tiene más de 50.000 comprobantes cargados y no se puede mostrar ni bajar entero. " +
  "Pedile a Soporte GSG que te lo prepare: no te entregamos una lista incompleta para el libro de IVA compras.";

export interface ComprasDelMes {
  /** Por fecha del comprobante. Si `completa` es false, son las primeras `tope`. */
  compras: CompraConFactura[];
  /** false = el mes tiene más que el tope: no usar como total del mes. */
  completa: boolean;
}

function num(v: Prisma.Decimal | null): number {
  return v == null ? 0 : v.toNumber();
}

function desgloseGuardado(v: Prisma.JsonValue | null): LineaIvaRecibida[] | null {
  if (!Array.isArray(v)) return null;
  const lineas: LineaIvaRecibida[] = [];
  for (const l of v) {
    const o = l as { alicuotaId?: unknown; base?: unknown; importe?: unknown } | null;
    if (!o || typeof o.alicuotaId !== "number" || typeof o.base !== "number" || typeof o.importe !== "number") return null;
    lineas.push({ alicuotaId: o.alicuotaId, base: o.base, importe: o.importe });
  }
  return lineas;
}

export async function leerComprasConFactura(
  tx: Tx,
  tenantId: string,
  mes: MesKey,
  tope: number = TOPE_DEL_MES,
): Promise<ComprasDelMes> {
  if (!esMesKey(mes)) return { compras: [], completa: true };
  const filas = await tx.stockPurchase.findMany({
    where: { tenantId, facturaTipo: { not: null }, facturaFecha: { startsWith: mes.replace("-", "") } },
    orderBy: [{ facturaFecha: "asc" }, { code: "asc" }],
    // Uno más que el tope: así se SABE si el mes lo pasa, en vez de cortar sin avisar.
    take: tope + 1,
    select: {
      id: true, code: true, supplier: true, notes: true,
      facturaTipo: true, facturaPuntoVenta: true, facturaNumero: true, facturaFecha: true, facturaCuit: true,
      facturaNeto: true, facturaIva: true, facturaIvaDesglose: true, facturaNoGravado: true, facturaExento: true,
      facturaPercepcionIva: true, facturaPercepcionIibb: true, facturaOtrosTributos: true, facturaTotal: true,
    },
  });
  const completa = filas.length <= tope;
  const compras = filas.slice(0, tope).map((f) => ({
    id: f.id,
    code: f.code,
    fecha: f.facturaFecha ?? "",
    tipo: f.facturaTipo ?? 0,
    puntoVenta: f.facturaPuntoVenta ?? 0,
    numero: f.facturaNumero ?? 0,
    cuitEmisor: f.facturaCuit ?? "",
    emisor: f.supplier ?? "Proveedor sin identificar",
    neto: num(f.facturaNeto),
    noGravado: num(f.facturaNoGravado),
    exento: num(f.facturaExento),
    iva: num(f.facturaIva),
    // Percepciones de IVA e IIBB (carga manual) y otros tributos van juntos en «otros».
    otrosTributos: sumarAlCentavo([num(f.facturaOtrosTributos), num(f.facturaPercepcionIva), num(f.facturaPercepcionIibb)]),
    total: num(f.facturaTotal),
    desglose: desgloseGuardado(f.facturaIvaDesglose),
    aRevisar: aRevisarDeNotas(f.notes),
    importada: (f.notes ?? "").startsWith(NOTA_IMPORTADO),
  }));
  return { compras, completa };
}
