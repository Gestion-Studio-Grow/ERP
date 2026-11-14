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
// SEG-024: el PIN actual de quien NO es dueño cuenta en su propio tope, por persona (ámbito «equipo»: 5 fallos y la
// escalera 30 s, 2 min, 10 min), aparte del de los dueños: los fallos de uno no traban al otro. El de un dueño, desde
// una sesión OWNER, va al carril «pin-owner». Todo intento que llega a evaluarse GASTA un intento del tope: un PIN
// actual mal, un PIN nuevo que ya usa otra persona y también el cambio hecho (si el cambio no gastara, probar PIN nuevos
// libres sería gratis y el «en uso» delataría los ajenos: son pocos y el de recepción es de 2 números). Nada limpia el
// tope desde acá. No gastan los rechazos que no dicen nada de otra persona (largo, fácil, igual al actual). Si el
// usuario no existe o está inactivo, la regla lo rechaza sin mirar el PIN y no se anota nada (`carrilDePin`).
//
// — Elaborado por GSG

import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { audit } from "@/lib/audit-core";
import { guardar, leerVigente } from "@/lib/club/estado-repo";
import { cambiarPinEnLaFoto, carrilDePin, type CodigoDeRechazo } from "@/lib/club/cambiar-pin";
import { ambitoDelPinDeDuenio, conTopeDePin } from "@/lib/club/tope-pin-servidor";
import { textoDeEsperaDelServidor } from "@/lib/club/espera-del-servidor";
import type { Ahora } from "@/lib/club/motor.mjs";
import type { RespuestaCambiarMiPin } from "./puerta-del-pin";

const FALTA_QUIEN = "No sabemos quién está operando: bloqueá la pantalla, entrá con tu PIN y probá de nuevo.";
const FALTA_ACTUAL = "Poné tu PIN actual (sólo números).";
const FALTA_NUEVO = "Poné el PIN nuevo (sólo números).";
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
    return { ok: false, error: !usuarioId ? FALTA_QUIEN : pinActual === null ? FALTA_ACTUAL : FALTA_NUEVO };
  }
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const vigente = await leerVigente(tenantId);
    if (!vigente) {
      await auditar("rechazo", "ilegible");
      return { ok: false, error: "Todavía no hay nada guardado del club en la base." };
    }
    const pedidoDeCambio = { usuarioId, pinActual, pinNuevo, esDuenioDelErp: user.role === "OWNER", ahora: ahoraDelClub(new Date()) };
    // El tope: el de quien no es dueño (por persona) o, para un dueño desde un OWNER del ERP, el de su carril. Un dueño
    // desde otra sesión sale rechazado sin mirar el PIN; un usuario inexistente o inactivo, también (no gasta intentos).
    const carril = carrilDePin(vigente.texto, usuarioId);
    const ambito = carril === "equipo" ? "equipo" : carril === "duenio" && pedidoDeCambio.esDuenioDelErp ? ambitoDelPinDeDuenio(user.role) : null;
    let r: ReturnType<typeof cambiarPinEnLaFoto>;
    let esperaTrasElFallo = 0;
    if (ambito) {
      const t = await conTopeDePin(
        tenantId,
        ambito,
        () => {
          const x = cambiarPinEnLaFoto(vigente.texto, pedidoDeCambio);
          const gasta = x.ok || x.codigo === "pin-actual" || x.codigo === "pin-en-uso";
          return { ok: !gasta, limpia: null, x }; // `ok` es «no gasta» para el tope; el desenlace es `x`
        },
        { usuarioId },
      );
      if (t.espera) {
        await auditar("rechazo", "espera");
        return { ok: false, error: textoDeEsperaDelServidor(t.esperaS) };
      }
      r = t.resultado.x;
      esperaTrasElFallo = t.esperaS;
    } else {
      r = cambiarPinEnLaFoto(vigente.texto, pedidoDeCambio);
    }
    if (!r.ok) {
      // Evento de seguridad (un PIN actual mal puede ser alguien probando): queda en la auditoría y en los logs.
      console.warn("[club] SEG-019: cambio de PIN rechazado", { tenantId, userId: user.id, usuarioClub: usuarioId, codigo: r.codigo });
      await auditar("rechazo", r.codigo);
      // Si este fallo abrió la espera, se avisa ya (el mismo texto que la firma del dueño).
      const abrioLaEspera = (r.codigo === "pin-actual" || r.codigo === "pin-en-uso") && esperaTrasElFallo > 0;
      return { ok: false, error: abrioLaEspera ? textoDeEsperaDelServidor(esperaTrasElFallo) : r.motivo };
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
