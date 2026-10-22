"use server";

// Server Actions de los ABONOS, el LOTE DEL MES y las NOTAS DE CRÉDITO del panel del contador.
//
// Cada una pasa PRIMERO por `exigirEstudio()` (capability `cartera:manage` + módulo `cartera`,
// el estudio sale de la sesión) y, si nombra un cliente, por `exigirClienteDeCartera` contra la
// cartera de ESE estudio. Recién ahí llama al motor, con la `tenantTransaction` de ese cliente.
// Ningún parámetro de afuera elige un negocio sin esa verificación.

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit-core";
import { exigirClienteDeCartera } from "@/lib/cartera-core";
import { buscarFilaCartera, exigirEstudio } from "@/lib/cartera-gate";
import { esMesKey, fechaFiscalDelDia, mesDelNegocio, mesVecino } from "@/lib/libros/fecha-fiscal";
import { leerImporte } from "@/lib/dinero/leer";
import { validarReglaAbono } from "@/app/contador/abonos/abonos-core";
import { avisoDeAutorizar } from "@/lib/facturacion/autorizar-en-tandas";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { crearNotaDeCredito } from "@/lib/invoice-core";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { logger } from "@/lib/logger";
import {
  MigracionPendienteError,
  OPCIONES_DE_UNA_PERSONA,
  esMigracionPendiente,
  darDeBajaReglaDelEstudio,
  emitirLoteDelEstudio,
  guardarReglaDelEstudio,
  mandarPendientesDelCliente,
  type ResultadoLote,
} from "@/lib/cartera-abonos";

export type ResultadoRegla = { ok: true; mensaje: string } | { ok: false; error: string; campo?: string };

const YA_NO_EXISTE = "Esa regla ya no existe. Volvé a cargar la página.";

/** La migración pendiente (Gate 2) se devuelve como mensaje; el resto sigue su camino. */
function siFaltaMigracion(e: unknown): { ok: false; error: string } {
  if (e instanceof MigracionPendienteError) return { ok: false, error: e.message };
  throw e;
}

/** Alta o cambio de una regla de abono (un formulario). */
export async function guardarReglaAction(_prev: ResultadoRegla | null, fd: FormData): Promise<ResultadoRegla> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const v = validarReglaAbono(Object.fromEntries(fd.entries()));
  if (!v.ok) return v;
  // Se le puede preparar el abono a un cliente en pausa (se emite cuando se reactive).
  const pertenencia = await exigirClienteDeCartera(buscarFilaCartera, gate.estudioTenantId, v.regla.clienteTenantId, {
    permitirPausada: true,
  });
  if (!pertenencia.ok) return { ok: false, error: pertenencia.error, campo: "clienteTenantId" };

  // Un id que llega del formulario sólo cambia una regla activa de ESTE estudio (predicado + RLS).
  const idRaw = String(fd.get("reglaId") ?? "").trim();
  try {
    const id = await guardarReglaDelEstudio(gate.estudioTenantId, v.regla, idRaw || null);
    if (!id) return { ok: false, error: YA_NO_EXISTE };
    await auditAdmin({ action: "cartera.abono.guardado", entity: "ReglaFacturacion", entityId: id, changes: { ...v.regla } });
  } catch (e) {
    return siFaltaMigracion(e);
  }
  revalidatePath("/contador/abonos");
  revalidatePath("/contador/lote");
  return { ok: true, mensaje: idRaw ? "Listo, la regla quedó cambiada." : `Listo, ${pertenencia.fila.alias} ya tiene su abono.` };
}

export type ResultadoSimple = { ok: true } | { ok: false; error: string };

/** Baja de una regla: desde ahora no se factura más (lo emitido no se toca). */
export async function bajaReglaAction(reglaId: string): Promise<ResultadoSimple> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const id = typeof reglaId === "string" ? reglaId.trim() : "";
  if (!id) return { ok: false, error: YA_NO_EXISTE };
  try {
    if (!(await darDeBajaReglaDelEstudio(gate.estudioTenantId, id))) return { ok: false, error: YA_NO_EXISTE };
  } catch (e) {
    return siFaltaMigracion(e);
  }
  await auditAdmin({ action: "cartera.abono.baja", entity: "ReglaFacturacion", entityId: id });
  revalidatePath("/contador/abonos");
  revalidatePath("/contador/lote");
  return { ok: true };
}

export type ResultadoEmitirLote = { ok: true; resultado: ResultadoLote } | { ok: false; error: string };

/** Emite el lote del mes (el anterior o el actual, hora argentina) y lo manda a ARCA. */
export async function emitirLoteAction(mes: string): Promise<ResultadoEmitirLote> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const actual = mesDelNegocio();
  if (!esMesKey(mes) || (mes !== actual && mes !== mesVecino(actual, -1))) {
    return { ok: false, error: "El lote se prepara para este mes o el anterior." };
  }
  let resultado: ResultadoLote;
  try {
    resultado = await emitirLoteDelEstudio(gate.estudioTenantId, mes);
  } catch (e) {
    return siFaltaMigracion(e);
  }
  await auditAdmin({
    action: "cartera.lote_emitido",
    entity: "LoteAbonos",
    entityId: mes,
    changes: { estudioTenantId: gate.estudioTenantId, mes, emitidas: resultado.emitidas, porLimite: resultado.porLimite, errores: resultado.errores.length },
  });
  revalidatePath("/contador/lote");
  revalidatePath("/contador");
  return { ok: true, resultado };
}

export type ResultadoMandar = { ok: true; tono: "ok" | "atencion"; texto: string } | { ok: false; error: string };

const ARCA_APAGADO =
  "La facturación con ARCA está apagada en esta plataforma: los comprobantes siguen pendientes hasta que Soporte GSG la encienda.";

/** «Mandar los pendientes a ARCA» de un cliente de la cartera (el reintento). */
export async function mandarPendientesAction(clienteTenantId: string): Promise<ResultadoMandar> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const pertenencia = await exigirClienteDeCartera(buscarFilaCartera, gate.estudioTenantId, String(clienteTenantId ?? ""));
  if (!pertenencia.ok) return pertenencia;
  // Mismo criterio que la emisión automática (bancos-glue `emitirPropuestas`): sin la facturación
  // encendida en la plataforma, nada sale hacia ARCA desde el panel del estudio.
  if (!isInvoicingEnabled()) return { ok: false, error: ARCA_APAGADO };
  const r = await mandarPendientesDelCliente(pertenencia.fila.clienteTenantId, OPCIONES_DE_UNA_PERSONA);
  await auditAdmin({
    action: "cartera.mandar_pendientes",
    entity: "CarteraCliente",
    entityId: pertenencia.fila.clienteTenantId,
    changes: { estudioTenantId: gate.estudioTenantId, autorizados: r.autorizados, rechazados: r.rechazados, quedan: r.quedan },
  });
  revalidatePath(`/contador/cliente/${pertenencia.fila.clienteTenantId}/comprobantes`);
  return { ok: true, ...avisoDeAutorizar(r) };
}

export type ResultadoAnular = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * Anula total o parcialmente una factura AUTORIZADA de un cliente de la cartera con una nota de
 * crédito asociada (`crearNotaDeCredito` del motor, en la transacción DEL CLIENTE: toma la factura
 * con bloqueo y nunca anula más de lo facturado). Importe vacío = todo lo que queda por anular.
 * Con la facturación encendida, la nota se manda a ARCA enseguida.
 */
export async function anularFacturaAction(_prev: ResultadoAnular | null, fd: FormData): Promise<ResultadoAnular> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const pertenencia = await exigirClienteDeCartera(buscarFilaCartera, gate.estudioTenantId, String(fd.get("clienteTenantId") ?? "").trim());
  if (!pertenencia.ok) return pertenencia;
  const tenantId = pertenencia.fila.clienteTenantId;
  const facturaId = String(fd.get("facturaId") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(facturaId)) return { ok: false, error: "No encontramos esa factura." };
  const motivo = String(fd.get("motivo") ?? "").trim().slice(0, 200);
  const importeRaw = leerImporte(String(fd.get("importe") ?? ""));
  if (importeRaw.estado === "invalida" || (importeRaw.estado === "ok" && importeRaw.valor <= 0)) {
    return { ok: false, error: "El importe a anular va en pesos (por ejemplo 15000 o 15.000,50). Dejalo vacío para anular todo." };
  }
  let r: Awaited<ReturnType<typeof crearNotaDeCredito>>;
  try {
    r = await crearNotaDeCredito({
      tenantId,
      facturaId,
      motivo,
      fecha: fechaFiscalDelDia(),
      ...(importeRaw.estado === "ok" ? { importe: importeRaw.valor } : {}),
    });
  } catch (e) {
    // La nota guarda su descripción (columna de la migración del motor, Gate 2).
    if (esMigracionPendiente(e)) return { ok: false, error: "La nota de crédito necesita un último paso de base de datos que todavía no se aplicó (lo hace el dueño)." };
    throw e;
  }
  if (!r.ok) return r;
  await auditAdmin({
    action: "cartera.nota_de_credito",
    entity: "Invoice",
    entityId: r.invoiceId,
    changes: { estudioTenantId: gate.estudioTenantId, clienteTenantId: tenantId, facturaId, motivo, importe: importeRaw.estado === "ok" ? importeRaw.valor : "todo" },
  });
  let mensaje = "Listo: la nota de crédito quedó cargada y espera que ARCA la autorice.";
  if (isInvoicingEnabled()) {
    try {
      const d = await procesarEnviosDelNegocio(tenantId, 5, undefined, { ignorarEspera: true });
      if (d.autorizados > 0) mensaje = "Listo: ARCA autorizó la nota de crédito.";
      else if (d.rechazados > 0) mensaje = "ARCA rechazó la nota de crédito: el motivo está en la lista.";
    } catch (e) {
      logger.error("contador", "no se pudo mandar la nota de crédito a ARCA", e, { clienteTenantId: tenantId });
    }
  }
  revalidatePath(`/contador/cliente/${tenantId}/comprobantes`);
  return { ok: true, mensaje };
}
