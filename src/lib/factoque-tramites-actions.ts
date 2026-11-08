"use server";
// FACTOQUE · Server actions del Botón de arrepentimiento y del Botón de baja (ver
// src/lib/factoque-tramites.ts). Dos puertas:
//  · `tramitePublicoAction`: la de la portada, SIN registrarse (Res. SCI 424/2020): sólo registra.
//  · `tramiteDeMiCuentaAction`: la de Mi cuenta, con la sesión del negocio: procesa en el acto
//    (el plan pago vuelve a Gratis) sin pedir más pasos (Res. 316/2018).

import { revalidatePath } from "next/cache";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import { registrarTramite } from "@/lib/factoque-tramites.server";
import { avisoParaGsg, esTipoTramite, leerFormularioTramite, mensajeDelTramite, NOMBRE_TRAMITE } from "@/lib/factoque-tramites";
import { fechaFiscalDelDia } from "@/lib/bancos-glue";
import { logger } from "@/lib/logger";
import { canalGsg, linkCanal } from "@/app/facturita/contacto";

export type ResultadoTramite =
  | { ok: true; numero: string; mensaje: string; avisoHref: string; canal: "whatsapp" | "mail" }
  | { ok: false; error: string; campo?: "email" | "cuit" | "motivo" };

async function tramitar(formData: FormData, conSesion: boolean): Promise<ResultadoTramite> {
  const tipo = formData.get("tipo");
  if (!esTipoTramite(tipo)) return { ok: false, error: "No entendimos qué trámite querés hacer." };
  const lectura = leerFormularioTramite(formData.get("email"), formData.get("cuit"), formData.get("motivo"));
  if (!lectura.ok) return { ok: false, error: lectura.error, campo: lectura.campo };
  let sesion: { tenantId: string; userId: string } | null = null;
  if (conSesion) {
    try {
      sesion = await sesionFacturita();
    } catch {
      return { ok: false, error: "Tu sesión venció. Entrá de nuevo a Factoque, o usá el botón de la portada, que no pide cuenta." };
    }
  }
  try {
    const r = await registrarTramite(tipo, lectura.datos, sesion, fechaFiscalDelDia(new Date()));
    const canal = canalGsg();
    if (sesion) revalidatePath("/facturita/app", "layout");
    return {
      ok: true,
      numero: r.numero,
      mensaje: mensajeDelTramite(tipo, r.efecto),
      avisoHref: linkCanal(canal, `Factoque · ${NOMBRE_TRAMITE[tipo]} ${r.numero}`, avisoParaGsg(tipo, r.numero, lectura.datos, r.efecto)),
      canal: canal.tipo,
    };
  } catch (e) {
    logger.error("factoque", "no se pudo registrar el trámite", e, { tipo });
    return { ok: false, error: "No pudimos registrar el trámite. Probá de nuevo en unos minutos o escribinos." };
  }
}

export async function tramitePublicoAction(_: ResultadoTramite | null, formData: FormData): Promise<ResultadoTramite> {
  return tramitar(formData, false);
}

export async function tramiteDeMiCuentaAction(_: ResultadoTramite | null, formData: FormData): Promise<ResultadoTramite> {
  return tramitar(formData, true);
}
