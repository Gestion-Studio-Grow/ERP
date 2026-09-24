// ============================================================================
// ¿ESTE OPERADOR PUEDE TOCAR ESTE NEGOCIO? — la decisión, pura.
// ============================================================================
//
// La regla "a CH sólo la toca el dueño" vivía sólo en el interruptor. Los operadores con nombre
// (OPERADORES) pasaban por todas las otras acciones sobre CH: contraseña de la dueña, subdominio,
// estado, CUIT, certificado, red de locales. Ahora es UNA regla para todas las actions del operador
// que reciben o afectan un negocio: si alguno está en REQUIEREN_OK_DEL_DUENIO, hace falta la sesión
// del dueño (rol "d" firmado en el token, src/lib/operator-auth.ts). La aplica
// `requireOperadorParaNegocio` (guardia-negocio.ts) y el trinquete de guardia-negocio.test.ts exige
// que toda action la use.

import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";

/** Un negocio por su id (lo que manda la ficha) o por su slug (el alta). */
export type RefNegocio = { id: string } | { slug: string };

export type DecisionOperadorNegocio = { ok: true } | { ok: false; motivo: string };

export function decidirOperadorParaNegocios(
  sesion: { nombre: string; esDuenio: boolean },
  slugs: readonly (string | null | undefined)[],
): DecisionOperadorNegocio {
  if (sesion.esDuenio) return { ok: true };
  const protegido = slugs.find((s) => requiereOkDelDuenio(s ?? null));
  if (!protegido) return { ok: true };
  return {
    ok: false,
    motivo:
      `«${protegido.trim().toLowerCase()}» es un cliente vivo en producción: sólo el dueño de GSG puede cambiar algo ahí. ` +
      `Entraste como «${sesion.nombre}». No se hizo nada.`,
  };
}
