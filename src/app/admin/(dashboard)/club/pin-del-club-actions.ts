"use server";

// ============================================================================
// «CAMBIAR MI PIN» DEL CLUB EN EL SERVIDOR (GSG-SEG-019) — envoltorio fino de `cambiarPinEnLaFoto`.
// ============================================================================
//
// Desde SEG-019 el guardado de la foto sin un OWNER del ERP no cambia ningún PIN (src/lib/club/delicado.ts). Para
// cambiar el propio, el puesto de recepción llama acá con quién es, su PIN actual y el nuevo. La regla vive en
// src/lib/club/cambiar-pin.ts (pura, con tests); acá sólo: guardia (`requireAppAccion("club")`), negocio de la
// sesión (nunca del navegador), foto VIGENTE de la base, guardado con la versión optimista del repositorio y
// auditoría del intento (quién del ERP, qué usuario del club, resultado). Nunca se registra ni se devuelve un PIN.
//
// Versión: se lee la vigente y se guarda contra ESA versión (si otra terminal guardó en el medio, se reintenta una
// vez sobre la nueva). No se usa la versión del puesto: la comprobación es contra lo que hay en la base, y el puesto
// suele tener la suya atrasada por lo que todavía tiene subiendo.
//
// SEG-020: el PIN actual de un dueño del club cuenta en el tope de intentos del negocio (tope-pin-servidor.ts), el
// mismo de `firmarComoDuenio`: durante la espera no se comprueba.
//
// — Elaborado por GSG

import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { audit } from "@/lib/audit-core";
import { guardar, leerVigente } from "@/lib/club/estado-repo";
import { cambiarPinEnLaFoto, type CodigoDeRechazo } from "@/lib/club/cambiar-pin";
import { conTopeDePin } from "@/lib/club/tope-pin-servidor";
import type { Ahora } from "@/lib/club/motor.mjs";
import type { RespuestaCambiarMiPin } from "./puerta-del-pin";

const ERROR_DE_BASE = "No se pudo guardar el PIN nuevo: probá de nuevo en un rato. Tu PIN sigue siendo el de antes.";

/** La hora del club para la línea del registro (el servidor corre en UTC; el club, en Argentina). */
function ahoraDelClub(cuando: Date): Ahora {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(cuando)
      .map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, min: Number(partes.hour) * 60 + Number(partes.minute) };
}

const texto = (x: unknown, tope: number) => (typeof x === "string" && x.length <= tope ? x : null);

/** ¿El usuario del club es dueño en la foto vigente? */
function esDuenioEnLaFoto(textoVigente: string, usuarioId: string): boolean {
  try {
    const us = (JSON.parse(textoVigente) as { estado?: { usuarios?: { id?: unknown; rol?: unknown }[] } }).estado?.usuarios;
    return Array.isArray(us) && us.some((u) => u?.id === usuarioId && u.rol === "duenio");
  } catch {
    return false;
  }
}

export async function cambiarMiPinDelClub(pedido: { usuarioId: unknown; pinActual: unknown; pinNuevo: unknown }): Promise<RespuestaCambiarMiPin> {
  let user;
  try {
    user = await requireAppAccion("club");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
  const tenantId = await getCurrentTenantId();
  const usuarioId = texto(pedido?.usuarioId, 60);
  const pinActual = texto(pedido?.pinActual, 16);
  const pinNuevo = texto(pedido?.pinNuevo, 16);
  const auditar = (resultado: "ok" | "rechazo", codigo?: CodigoDeRechazo | "datos" | "base" | "espera") =>
    audit({
      actor: `user:${user.id}`,
      action: `club_cambiar_pin:${resultado}`,
      entity: "ClubUsuario",
      entityId: usuarioId,
      changes: { resultado, ...(codigo ? { codigo } : {}), rolErp: user.role },
      channel: "admin",
    });
  if (!usuarioId || pinActual === null || pinNuevo === null) {
    await auditar("rechazo", "datos");
    return { ok: false, error: "Faltan datos para cambiar el PIN." };
  }
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const vigente = await leerVigente(tenantId);
    if (!vigente) {
      await auditar("rechazo", "ilegible");
      return { ok: false, error: "Todavía no hay nada guardado del club en la base." };
    }
    const pedidoDeCambio = { usuarioId, pinActual, pinNuevo, esDuenioDelErp: user.role === "OWNER", ahora: ahoraDelClub(new Date()) };
    let r: ReturnType<typeof cambiarPinEnLaFoto>;
    if (pedidoDeCambio.esDuenioDelErp && esDuenioEnLaFoto(vigente.texto, usuarioId)) {
      const t = await conTopeDePin(tenantId, "pin", () => {
        const x = cambiarPinEnLaFoto(vigente.texto, pedidoDeCambio);
        const acerto = x.ok || x.codigo === "pin-nuevo"; // «pin-nuevo» sólo sale con el actual ya comprobado
        return { ok: acerto, duenio: acerto, x };
      });
      if (t.espera) {
        await auditar("rechazo", "espera");
        return { ok: false, error: `Demasiados intentos: esperá ${t.esperaS >= 90 ? `${Math.ceil(t.esperaS / 60)} minutos` : `${t.esperaS} segundos`} y probá de nuevo.` };
      }
      r = t.resultado.x;
    } else {
      r = cambiarPinEnLaFoto(vigente.texto, pedidoDeCambio);
    }
    if (!r.ok) {
      // Evento de seguridad (un PIN actual mal puede ser alguien probando): queda en la auditoría y en los logs.
      console.warn("[club] SEG-019: cambio de PIN rechazado", { tenantId, userId: user.id, usuarioClub: usuarioId, codigo: r.codigo });
      await auditar("rechazo", r.codigo);
      return { ok: false, error: r.motivo };
    }
    const g = await guardar(tenantId, r.texto, vigente.version, `user:${user.id}`);
    if (g.ok) {
      await auditar("ok");
      return { ok: true, version: g.version };
    }
    if (g.motivo !== "CAMBIO_MIENTRAS_MIRABAS") break;
  }
  await auditar("rechazo", "base");
  return { ok: false, error: ERROR_DE_BASE };
}
