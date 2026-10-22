"use server";

// Server Actions de los ABONOS y el LOTE DEL MES del panel del contador.
//
// Cada una pasa PRIMERO por `exigirEstudio()` (capability `cartera:manage` + módulo `cartera`,
// el estudio sale de la sesión) y, si nombra un cliente, por `exigirClienteDeCartera` contra la
// cartera de ESE estudio. Recién ahí llama a `cartera-abonos.ts`, que lee y escribe cada cliente
// con su `tenantTransaction`. Ningún parámetro de afuera elige un negocio sin esa verificación.

import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentUser } from "@/lib/session";
import { exigirClienteDeCartera } from "@/lib/cartera-core";
import { buscarFilaCartera, exigirEstudio } from "@/lib/cartera-gate";
import { esMesKey, mesDelNegocio, mesVecino } from "@/lib/libros/fecha-fiscal";
import { validarReglaAbono } from "@/app/contador/abonos/abonos-core";
import { avisoDeAutorizar } from "@/lib/facturacion/autorizar-en-tandas";
import { isInvoicingEnabled } from "@/lib/fiscal";
import {
  darDeBajaReglaDelEstudio,
  emitirLoteDelEstudio,
  guardarReglaDelEstudio,
  leerReglasDelEstudio,
  mandarPendientesDelCliente,
  type ResultadoLote,
} from "@/lib/cartera-abonos";

export type ResultadoRegla = { ok: true; mensaje: string } | { ok: false; error: string; campo?: string };

async function actor(): Promise<string> {
  const u = await getCurrentUser();
  return u ? `user:${u.id}` : "admin";
}

/** Alta o cambio de una regla de abono (un formulario). Un cambio es una versión nueva. */
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

  // Un id que llega del formulario sólo vale si es de una regla de ESTE estudio.
  const idRaw = String(fd.get("reglaId") ?? "").trim();
  let reglaId: string | null = null;
  if (idRaw) {
    const existentes = await leerReglasDelEstudio(gate.estudioTenantId);
    if (!existentes.some((r) => r.id === idRaw)) return { ok: false, error: "Esa regla ya no existe. Volvé a cargar la página." };
    reglaId = idRaw;
  }
  await guardarReglaDelEstudio(gate.estudioTenantId, await actor(), v.regla, reglaId);
  revalidatePath("/contador/abonos");
  revalidatePath("/contador/lote");
  return { ok: true, mensaje: reglaId ? "Listo, la regla quedó cambiada." : `Listo, ${pertenencia.fila.alias} ya tiene su abono.` };
}

export type ResultadoSimple = { ok: true } | { ok: false; error: string };

/** Baja de una regla: desde ahora no se factura más (lo emitido no se toca). */
export async function bajaReglaAction(reglaId: string): Promise<ResultadoSimple> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const id = typeof reglaId === "string" ? reglaId.trim() : "";
  const reglas = await leerReglasDelEstudio(gate.estudioTenantId);
  if (!reglas.some((r) => r.id === id)) return { ok: false, error: "Esa regla ya no existe. Volvé a cargar la página." };
  await darDeBajaReglaDelEstudio(gate.estudioTenantId, await actor(), id);
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
  const resultado = await emitirLoteDelEstudio(gate.estudioTenantId, mes, await actor());
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

/** «Mandar los pendientes a ARCA» de un cliente de la cartera (el reintento). */
export async function mandarPendientesAction(clienteTenantId: string): Promise<ResultadoMandar> {
  const gate = await exigirEstudio();
  if (!gate.ok) return gate;
  const pertenencia = await exigirClienteDeCartera(buscarFilaCartera, gate.estudioTenantId, String(clienteTenantId ?? ""));
  if (!pertenencia.ok) return pertenencia;
  // Mismo criterio que la emisión automática (bancos-glue `emitirPropuestas`): sin la facturación
  // encendida en la plataforma, nada sale hacia ARCA desde el panel del estudio.
  if (!isInvoicingEnabled()) {
    return { ok: false, error: "La facturación con ARCA está apagada en esta plataforma: los comprobantes siguen pendientes hasta que Soporte GSG la encienda." };
  }
  const r = await mandarPendientesDelCliente(pertenencia.fila.clienteTenantId);
  await auditAdmin({
    action: "cartera.mandar_pendientes",
    entity: "CarteraCliente",
    entityId: pertenencia.fila.clienteTenantId,
    changes: { estudioTenantId: gate.estudioTenantId, autorizados: r.autorizados, rechazados: r.rechazados, quedan: r.quedan },
  });
  revalidatePath(`/contador/cliente/${pertenencia.fila.clienteTenantId}/comprobantes`);
  return { ok: true, ...avisoDeAutorizar(r) };
}
