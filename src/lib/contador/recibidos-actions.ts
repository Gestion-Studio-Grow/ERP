"use server";

// ============================================================================
// Importar «Mis Comprobantes Recibidos» de un cliente de la cartera (endpoint).
// ============================================================================
//
// Un solo export público. Del formulario llegan SÓLO el cliente elegido y el archivo: el
// estudio, la persona y el permiso salen de la sesión (recibidos-db.ts, accesoAClienteDeCartera),
// y el cliente se verifica contra la cartera del estudio antes de tocar nada. Ningún tenantId
// de la sesión se recibe por parámetro.

import { FALTA_EL_ARCHIVO } from "./recibidos-aviso";
import { parsearCsv } from "@/plugins/bancos/parser/csv";
import { esXlsx, parsearXlsx } from "@/plugins/bancos/parser/xlsx";
import { tenantTransaction } from "@/lib/rls";
import { fmtCuit } from "@/components/ui/format";
import { accesoAClienteDeCartera, guardarRecibidos } from "./recibidos-db";
import {
  leerRecibidos,
  resumirRecibidos,
  rotuloRecibido,
  type CeldaRecibida,
  type RechazoRecibido,
  type ResumenRecibidos,
} from "./recibidos-formato";

/** Un mes de ARCA de un cliente grande pesa bastante menos. */
const TOPE_DE_ARCHIVO = 8 * 1024 * 1024;
/** Cuántos rechazados y «a revisar» vuelven a la pantalla (el resto se cuenta). */
const TOPE_DE_DETALLE = 300;

export type ResultadoImportacion =
  | { ok: false; error: string }
  | {
      ok: true;
      resumen: ResumenRecibidos;
      rechazados: RechazoRecibido[];
      rechazadosTotal: number;
      /** De los que no se cargaron: los que ya estaban (no se duplican) y los que tienen errores. */
      yaCargadosTotal: number;
      conErroresTotal: number;
      aRevisar: { fila: number; comprobante: string; motivo: string }[];
    };

function abrirArchivo(bytes: Uint8Array): CeldaRecibida[][] | null {
  try {
    return esXlsx(bytes) ? parsearXlsx(bytes) : parsearCsv(bytes);
  } catch {
    return null;
  }
}

export async function importarRecibidosAction(formData: FormData): Promise<ResultadoImportacion> {
  const acceso = await accesoAClienteDeCartera(formData.get("cliente"), true);
  if (!acceso.ok) return { ok: false, error: acceso.error };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: FALTA_EL_ARCHIVO };
  }
  if (archivo.size > TOPE_DE_ARCHIVO) {
    return { ok: false, error: "El archivo es muy grande. Bajalo de ARCA por mes y subilo de a uno." };
  }
  const matriz = abrirArchivo(new Uint8Array(await archivo.arrayBuffer()));
  if (!matriz) return { ok: false, error: "No pudimos abrir el archivo. Bajalo de nuevo desde ARCA, sin editarlo." };

  const lectura = leerRecibidos(matriz);
  if (!lectura.ok) return { ok: false, error: lectura.error };

  // El archivo trae el CUIT del que lo bajó: si no es el del cliente, no se carga nada.
  const cuitCliente = acceso.cliente.cuit?.replace(/\D/g, "") || null;
  if (lectura.cuitDelArchivo && cuitCliente && lectura.cuitDelArchivo !== cuitCliente) {
    return {
      ok: false,
      error:
        `Este archivo es del CUIT ${fmtCuit(lectura.cuitDelArchivo)} y ${acceso.cliente.alias} tiene el CUIT ` +
        `${fmtCuit(cuitCliente)}. No se cargó nada: revisá que sea el archivo de este cliente.`,
    };
  }

  const guardado = await tenantTransaction(
    (tx) =>
      guardarRecibidos(tx, acceso.cliente.id, lectura.comprobantes, {
        actor: `estudio:${acceso.estudioTenantId}`,
        por: `${acceso.usuario.name} (${acceso.estudioNombre})`,
        archivo: archivo.name.slice(0, 200),
      }),
    { tenantId: acceso.cliente.id },
  );

  const rechazados = [...lectura.rechazos, ...guardado.yaCargados].sort((a, b) => a.fila - b.fila);
  return {
    ok: true,
    resumen: resumirRecibidos(guardado.cargados),
    rechazados: rechazados.slice(0, TOPE_DE_DETALLE),
    rechazadosTotal: rechazados.length,
    yaCargadosTotal: guardado.yaCargados.length,
    conErroresTotal: lectura.rechazos.length,
    aRevisar: guardado.cargados
      .filter((c) => c.aRevisar)
      .slice(0, TOPE_DE_DETALLE)
      .map((c) => ({ fila: c.fila, comprobante: `${rotuloRecibido(c)} · ${c.emisor}`, motivo: c.aRevisar! })),
  };
}
