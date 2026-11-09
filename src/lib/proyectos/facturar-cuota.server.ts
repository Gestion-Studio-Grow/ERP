// ============================================================================
// PROYECTOS · Etapa 2 · T2 — facturar una cuota de cobro con ARCA (escritura). Núcleo puro:
// facturar-cuota-core.ts.
// ============================================================================
// Detrás de DOS llaves que cierran: el interruptor `facturacion-proyectos` (módulo
// `proyectos-facturacion`, etapa2-core.ts) y el módulo `arca` explícito en el negocio, más el flag
// maestro `isInvoicingEnabled()` y la columna `Invoice.proyectoCuotaId` (migración
// 20261110120000_invoice_proyecto_cuota, Gate 2). Sin cualquiera de las cuatro, no se escribe nada.
//
// Concurrencia (lo que se certifica):
//  · La cuota se toma FOR UPDATE dentro de `tenantTransaction` y se re-verifica (monto, moneda,
//    anulada, texto `factura`): dos «Facturar» a la vez se ordenan en esa fila; el segundo ve la
//    factura del primero (Read Committed: cada sentencia mira lo confirmado) y la devuelve.
//  · La factura sale por `createInvoiceInTx` con origen PROYECTO_CUOTA: idempotente, con el índice
//    único (tenantId, proyectoCuotaId) como guarda de la base (P2002 → se devuelve la ganadora) y
//    la reapertura de una RECHAZADA en la misma fila (ENG-021).
//  · Regenerar, quitar y escribir el texto `factura` toman la MISMA fila FOR UPDATE y miran la
//    factura viva (`conCuotaSinFacturaViva`): una cuota facturada queda congelada.
//  · El pedido del CAE: `procesarEnviosDelNegocio`, best-effort (timeout → `autorizarSinDuplicar`
//    del plugin consulta antes de pedir otro número).

import { Prisma } from "@/generated/prisma/client";
import { basePrisma } from "@/lib/prisma-base";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { runInTenantContext } from "@/lib/tenant-context";
import { centavosDe } from "@/lib/dinero/redondeo";
import { createInvoiceInTx, type InvoiceTx } from "@/lib/invoice-core";
import { getFiscalProfile, isInvoicingEnabled, PerfilFiscalIncompletoError } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { logger } from "@/lib/logger";
import { etapa2Activa, MENSAJE_APAGADO } from "./etapa2-core";
import {
  armarFacturaDeCuota,
  motivoParaNoFacturar,
  FACTURACION_APAGADA,
  SIN_ARCA,
  SIN_COLUMNA_CUOTA,
  type CuotaAFacturar,
} from "./facturar-cuota-core";

// ── ¿Existe la columna? (catálogo, SIN transacción; se recuerda sólo el sí) ───────────────────
// Mismo patrón que must-change-password.ts: una consulta a una columna que falta ABORTA la
// transacción en la que corre; por eso se pregunta al catálogo antes de entrar. El «no» no se
// recuerda: apenas se aplica la migración, la próxima pregunta ya lo ve.
let _columnaPresente = false;

/** ¿La base tiene `Invoice.proyectoCuotaId`? Falla cerrado: sin poder preguntar, `false`. */
export async function hayColumnaCuotaEnInvoice(): Promise<boolean> {
  if (_columnaPresente) return true;
  const filas = await basePrisma
    .$queryRaw<unknown[]>`SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'proyectoCuotaId'
      LIMIT 1`
    .catch(() => null);
  if (filas === null) return false;
  _columnaPresente = Array.isArray(filas) && filas.length > 0;
  return _columnaPresente;
}

/** Sólo para tests: olvida el «sí» recordado (el test que borra la columna en su base efímera). */
export function olvidarColumnaCuotaParaTests(): void {
  _columnaPresente = false;
}

/** Lo que la ficha muestra de la factura de cada cuota. */
export interface FacturaDeCuotaVista {
  id: string;
  status: string;
  tipoComprobante: number | null;
  puntoVenta: number;
  numero: number | null;
  rechazoMotivo: string | null;
}

/**
 * La factura de cada cuota (por id de cuota), del negocio. Sin la columna: vacío (nada facturado
 * por acá). Parada en el negocio (RLS) y con el predicado explícito.
 */
export async function facturasDeCuotas(
  tenantId: string,
  cuotaIds: readonly string[],
  db: InvoiceTx | null = null,
): Promise<Map<string, FacturaDeCuotaVista>> {
  const salida = new Map<string, FacturaDeCuotaVista>();
  if (cuotaIds.length === 0 || !(await hayColumnaCuotaEnInvoice())) return salida;
  const leer = (tx: InvoiceTx) =>
    tx.invoice.findMany({
      where: { tenantId, proyectoCuotaId: { in: [...cuotaIds] } },
      select: { id: true, proyectoCuotaId: true, status: true, tipoComprobante: true, puntoVenta: true, numero: true, rechazoMotivo: true },
    });
  const filas = db ? await leer(db) : await tenantTransaction(leer, { tenantId });
  for (const f of filas) {
    if (f.proyectoCuotaId) salida.set(f.proyectoCuotaId, { id: f.id, status: f.status, tipoComprobante: f.tipoComprobante, puntoVenta: f.puntoVenta, numero: f.numero, rechazoMotivo: f.rechazoMotivo });
  }
  return salida;
}

/** Toma la cuota FOR UPDATE (SQL crudo: Prisma no lo expresa; el negocio va explícito además de RLS). */
async function tomarCuota(tx: InvoiceTx, tenantId: string, cuotaId: string): Promise<CuotaAFacturar | null> {
  const filas = await tx.$queryRaw<CuotaAFacturar[]>`
    SELECT id, "proyectoId", tipo, concepto, monto, moneda, "venceEl", prevista, "anuladoEl", factura
    FROM "ProyectoCuota"
    WHERE id = ${cuotaId} AND "tenantId" = ${tenantId}
    FOR UPDATE`;
  return filas[0] ?? null;
}

/**
 * Corre `fn` con la cuota tomada FOR UPDATE si NO tiene una factura viva (PENDING o AUTORIZADA);
 * si la tiene, devuelve `"facturada"` sin correr nada. Lo usan regenerar, quitar y el texto
 * `factura`: el mismo candado que toma la facturación, así nunca terminan las dos juntas. Sin la
 * columna corre `fn` directo (no hay facturas de cuotas que cuidar).
 */
export async function conCuotaSinFacturaViva<T>(
  tenantId: string,
  cuotaId: string,
  fn: (tx: InvoiceTx) => Promise<T>,
): Promise<T | "facturada"> {
  if (!(await hayColumnaCuotaEnInvoice())) return tenantTransaction(fn, { tenantId });
  return tenantTransaction(
    async (tx) => {
      await tomarCuota(tx, tenantId, cuotaId);
      const viva = await tx.invoice.findFirst({ where: { tenantId, proyectoCuotaId: cuotaId, status: { in: ["PENDING", "AUTHORIZED"] } }, select: { id: true } });
      if (viva) return "facturada" as const;
      return fn(tx);
    },
    { tenantId },
  );
}

/** La cuota cambió entre que se armó la factura y que se tomó su fila: no se factura con lo viejo. */
export class CuotaCambioError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "CuotaCambioError";
  }
}

export type ResultadoFacturarCuota =
  | { ok: true; invoiceId: string; yaEstaba: boolean }
  | { ok: false; error: string };

export interface DepsFacturarCuota {
  getFiscalProfile: typeof getFiscalProfile;
  procesarEnviosDelNegocio: (tenantId: string) => Promise<unknown>;
  isInvoicingEnabled: () => boolean;
  ahora: () => Date;
}

const DEPS: DepsFacturarCuota = {
  getFiscalProfile,
  procesarEnviosDelNegocio: (tenantId) => procesarEnviosDelNegocio(tenantId),
  isInvoicingEnabled,
  ahora: () => new Date(),
};

/** ¿Este negocio puede facturar cuotas? `null` si sí; el motivo si no. Las cuatro llaves cierran. */
export async function motivoParaNoFacturarCuotas(tenantId: string, deps: Pick<DepsFacturarCuota, "isInvoicingEnabled"> = DEPS): Promise<string | null> {
  let modulos: string[] = [];
  try {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } });
    modulos = t?.modules ?? [];
  } catch {
    modulos = [];
  }
  if (!etapa2Activa(modulos, "facturacion-proyectos")) return MENSAJE_APAGADO["facturacion-proyectos"];
  if (!modulos.includes("arca")) return SIN_ARCA;
  if (!deps.isInvoicingEnabled()) return FACTURACION_APAGADA;
  if (!(await hayColumnaCuotaEnInvoice())) return SIN_COLUMNA_CUOTA;
  return null;
}

/**
 * Factura UNA cuota de cobro de un proyecto. El permiso (`pagos`) y la visibilidad del proyecto
 * los controla la acción; acá, las llaves del negocio, la cuota y la escritura. Idempotente: dos
 * pedidos (doble clic, dos pestañas) dan UNA factura y UN envío; una rechazada se reabre.
 */
export async function facturarCuotaDelProyecto(
  d: { tenantId: string; proyectoId: string; cuotaId: string; autor: string },
  deps: DepsFacturarCuota = DEPS,
): Promise<ResultadoFacturarCuota> {
  const { tenantId, proyectoId, cuotaId } = d;
  return runInTenantContext(tenantId, async () => {
    const cerrado = await motivoParaNoFacturarCuotas(tenantId, deps);
    if (cerrado) return { ok: false, error: cerrado };

    // Lectura (fuera de la transacción de escritura): la cuota, el proyecto, su cliente y el IVA del presupuesto vivo.
    const leido = await tenantTransaction(
      async (tx) => {
        const cuota = await tx.proyectoCuota.findFirst({
          where: { id: cuotaId, tenantId, proyectoId },
          select: { id: true, proyectoId: true, tipo: true, concepto: true, monto: true, moneda: true, venceEl: true, prevista: true, anuladoEl: true, factura: true },
        });
        if (!cuota) return null;
        const proyecto = await tx.proyecto.findFirst({
          where: { id: proyectoId, tenantId },
          select: { numero: true, fechaArmado: true, fechaEvento: true, fechaDesarme: true, client: { select: { docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true } } },
        });
        if (!proyecto) return null;
        const viva = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId }, orderBy: { version: "desc" }, select: { ivaPct: true } });
        return { cuota, proyecto, ivaPct: viva?.ivaPct ?? null };
      },
      { tenantId },
    );
    if (!leido) return { ok: false, error: "Esa cuota no existe." };
    const motivo = motivoParaNoFacturar(leido.cuota);
    if (motivo) return { ok: false, error: motivo };

    let perfil: Awaited<ReturnType<typeof getFiscalProfile>>;
    try {
      perfil = await deps.getFiscalProfile(tenantId);
    } catch (e) {
      if (e instanceof PerfilFiscalIncompletoError) return { ok: false, error: "Faltan los datos fiscales del negocio (CUIT, punto de venta o condición frente al IVA): cargalos en Facturación." };
      throw e;
    }
    const { client, ...proyecto } = leido.proyecto;
    const armada = armarFacturaDeCuota({
      tenantId,
      cuota: leido.cuota,
      proyecto,
      cliente: client,
      emisor: { cuit: perfil.cuit, condicionIva: perfil.condicionIva, puntoVenta: perfil.puntoVenta, regimenFacturaA: perfil.regimenFacturaA ?? null },
      ivaPct: leido.ivaPct,
      ahora: deps.ahora(),
    });
    if (!armada.ok) return { ok: false, error: armada.error };

    let resultado: { invoiceId: string; yaEstaba: boolean };
    try {
      resultado = await tenantTransaction(
        async (tx) => {
          const fila = await tomarCuota(tx, tenantId, cuotaId);
          if (!fila || fila.proyectoId !== proyectoId) throw new CuotaCambioError("Esa cuota ya no existe.");
          const ahora = motivoParaNoFacturar(fila);
          if (ahora) throw new CuotaCambioError(ahora);
          if (centavosDe(fila.monto) !== centavosDe(leido.cuota.monto) || fila.moneda !== leido.cuota.moneda) {
            throw new CuotaCambioError("La cuota cambió mientras se facturaba: volvé a intentarlo.");
          }
          const previa = await tx.invoice.findFirst({ where: { tenantId, proyectoCuotaId: cuotaId }, select: { id: true, status: true } });
          const invoiceId = await createInvoiceInTx(tx, armada.input);
          // Nueva o reabierta (estaba rechazada): queda en el historial del proyecto. La que ya iba, no.
          const yaEstaba = !!previa && previa.status !== "REJECTED";
          if (!yaEstaba) {
            await tx.proyectoCambio.create({
              data: {
                tenantId,
                proyectoId,
                entidad: "ProyectoCuota",
                entidadId: cuotaId,
                campo: previa ? `Factura reenviada · ${leido.cuota.concepto}` : `Factura pedida a ARCA · ${leido.cuota.concepto}`,
                antes: previa ? "Rechazada" : null,
                despues: `${armada.input.total} ARS · ${invoiceId}`,
                autor: d.autor,
              },
            });
          }
          return { invoiceId, yaEstaba };
        },
        { tenantId },
      );
    } catch (e) {
      if (e instanceof CuotaCambioError) return { ok: false, error: e.message };
      // Guarda de la base (índice único): otro pedido la creó primero. Se devuelve la ganadora.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const ganadora = await tenantTransaction(
          (tx) => tx.invoice.findFirst({ where: { tenantId, proyectoCuotaId: cuotaId }, select: { id: true } }),
          { tenantId },
        );
        if (ganadora) return { ok: true, invoiceId: ganadora.id, yaEstaba: true };
      }
      throw e;
    }

    // El CAE: best-effort. Si ARCA no contesta, el envío queda pendiente y lo toma el próximo despacho.
    try {
      await deps.procesarEnviosDelNegocio(tenantId);
    } catch (e) {
      logger.warn("facturacion", "cuota de proyecto: el envío a ARCA quedó pendiente", { tenantId, cuotaId, error: e instanceof Error ? e.message : String(e) });
    }
    return { ok: true, ...resultado };
  });
}
