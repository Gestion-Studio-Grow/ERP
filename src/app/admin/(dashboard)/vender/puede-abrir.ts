// ¿Quien mira puede usar OTRA app en este negocio? Para ofrecer un botón que vive en una pantalla
// y es de otra app («A cuenta» es de Cuentas a cobrar; «Facturar», de Facturación), con la MISMA
// regla que su action exige (`requireAppAccion`: módulo, capability, rubro). Si la pantalla y la
// action decidieran distinto, el botón aparecería y la action lo rechazaría, o al revés.
//
// No es la guardia de ninguna página (ésa es `requireApp` con el id de su propia app): sólo
// decide qué se ofrece.

import "server-only";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import type { AppId } from "@/apps/registro";

export async function puedeAbrirApp(id: AppId): Promise<boolean> {
  try {
    await requireAppAccion(id);
    return true;
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return false;
    throw e;
  }
}
