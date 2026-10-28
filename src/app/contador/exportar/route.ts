/**
 * El mes de TODA la cartera en un CSV — `GET /contador/exportar?mes=2026-10`.
 *
 * Llave: `exigirEstudio()` (sesión con `cartera:manage` + módulo `cartera`). Los clientes salen
 * de la cartera de ESE estudio (`filasDeCarteraDb`) y cada uno se lee con SU transacción
 * (`leerParaExportar` abre `tenantTransaction({ tenantId: cliente })`). Jamás operatorPrisma.
 * Secuencial a propósito (pooler de Neon). El formato lo arma `exportar-core.ts`.
 */

import { unstable_rethrow } from "next/navigation";
import { logger } from "@/lib/logger";
import { BOM, cabecerasCsv } from "@/lib/libros/csv-ar";
import { bordesDelMes, esMesKey, mesDelNegocio } from "@/lib/libros/fecha-fiscal";
import { TOPE_CSV, type FiltrosComprobantes } from "@/lib/facturacion/lista-core";
import { leerParaExportar } from "@/lib/facturacion/lista.server";
import { exigirEstudio, filasDeCarteraDb, metadataClientesDb } from "@/lib/cartera-gate";
import { esMigracionPendiente } from "@/lib/cartera-abonos";
import { tenantTransaction } from "@/lib/rls";
import { lineasCsvCartera, nombreArchivoCartera, type BloqueDeCliente } from "../exportar-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Qué se facturó» de los comprobantes del mes de UN cliente (`Invoice.descripcion`), con SU
 * transacción. Antes de la migración del motor (Gate 2) la columna no existe: el CSV sale igual,
 * con esa columna vacía.
 */
async function descripcionesDelMes(clienteTenantId: string, fiscal: { gte: string; lt: string }): Promise<Map<string, string>> {
  try {
    const filas = await tenantTransaction(
      (tx) =>
        tx.invoice.findMany({
          where: { tenantId: clienteTenantId, fecha: fiscal, descripcion: { not: null } },
          select: { id: true, descripcion: true },
        }),
      { tenantId: clienteTenantId },
    );
    return new Map(filas.map((f) => [f.id, f.descripcion ?? ""]));
  } catch (e) {
    if (esMigracionPendiente(e)) return new Map();
    throw e;
  }
}

const TEXTO = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const gate = await exigirEstudio();
    if (!gate.ok) return new Response(gate.error, { status: 403, headers: TEXTO });
    const raw = new URL(request.url).searchParams.get("mes");
    const mes = esMesKey(raw) ? raw : mesDelNegocio();
    const b = bordesDelMes(mes);
    const filtros: FiltrosComprobantes = { estado: "todos", tipo: "todos", puntoVenta: null, desde: b.primerDia, hasta: b.ultimoDia, q: "", pagina: 1 };

    const filas = await filasDeCarteraDb(gate.estudioTenantId);
    const metas = filas.length ? await metadataClientesDb(filas.map((f) => f.clienteTenantId)) : new Map();
    const bloques: BloqueDeCliente[] = [];
    for (const f of filas) {
      const meta = metas.get(f.clienteTenantId);
      if (!meta) continue;
      try {
        const { renglones, recortado } = await leerParaExportar(f.clienteTenantId, filtros);
        const descripciones = await descripcionesDelMes(f.clienteTenantId, b.fiscal);
        bloques.push({ alias: f.alias, cuit: meta.arcaCuit, renglones, recortado, descripciones });
      } catch (e) {
        logger.error("contador/exportar", "no se pudieron leer los comprobantes de un cliente", e, { clienteTenantId: f.clienteTenantId });
        bloques.push({ alias: f.alias, cuit: meta.arcaCuit, renglones: null, recortado: false });
      }
    }
    const cuerpo = BOM + lineasCsvCartera(bloques, TOPE_CSV).join("\r\n") + "\r\n";
    return new Response(cuerpo, { headers: cabecerasCsv(nombreArchivoCartera(mes)) });
  } catch (err) {
    // `requireCapability` redirige (sin sesión o sin permiso) con una excepción de Next: no se traga.
    unstable_rethrow(err);
    logger.error("contador/exportar", "no se pudo armar el CSV de la cartera", err);
    return new Response("No se pudo armar el archivo. Probá de nuevo en un rato; si sigue, avisanos.", { status: 500, headers: TEXTO });
  }
}
