// ============================================================================
// VOUCHERS · EL VALOR DEL VOUCHER DEL NEGOCIO (orden del dueño, 09/11/2026).
// ============================================================================
//
// `BusinessSettings.voucherValor` (migración 20261109200000_voucher_valor, Gate 2): con valor, un voucher
// cubre min(valor, saldo del turno) y un monto escrito a mano no puede pasarlo (`validarAplicacion`,
// voucher-core.ts). Null = sin tope (cubre el saldo, como hasta ahora). Lo edita sólo la dueña.
//
// La columna puede no estar en la base todavía: la lectura NUNCA falla por eso. Adentro de la transacción
// del cobro una sentencia que falla aborta la transacción entera (no se puede «probar y tolerar»), así
// que se lee la fila como JSON (`to_jsonb`): si la columna no existe, la clave no está y vale null.

import { leerImporte } from "@/lib/dinero/leer";
import { permisoEfectivo, type UsuarioConPermisos } from "@/lib/capabilities";

/** Tope de la columna DECIMAL(14,2). */
export const VALOR_MAXIMO = 999_999_999_999.99;

export const SOLO_DUENIA_VALOR = "El valor del voucher lo cambia sólo la dueña.";
export const VALOR_SIN_MIGRAR =
  "Guardar el valor del voucher necesita un paso de base de datos que todavía no se aplicó (lo aplica el dueño). Mientras tanto, el voucher cubre lo que falta cobrar del turno.";

/** ¿Puede cambiar el valor? Sólo OWNER (misma capacidad fina que conciliar: no se prende por usuario). */
export function motivoParaNoEditarValor(user: UsuarioConPermisos): string | null {
  return permisoEfectivo(user, "vouchers:conciliar") ? null : SOLO_DUENIA_VALOR;
}

/** Lo escrito en el formulario: vacío = sin valor (cubre el saldo). Regla de importes de la casa. PURA. */
export function leerValorDelFormulario(raw: string | null | undefined): { ok: true; valor: number | null } | { ok: false; error: string } {
  const l = leerImporte(raw);
  if (l.estado === "vacio") return { ok: true, valor: null };
  if (l.estado !== "ok") return { ok: false, error: "Escribí el valor en pesos (por ejemplo, 14.000), o dejalo vacío para que cubra lo que falta cobrar." };
  if (!(l.valor > 0)) return { ok: false, error: "El valor del voucher tiene que ser mayor a cero (o vacío)." };
  if (l.valor > VALOR_MAXIMO) return { ok: false, error: "Ese valor es demasiado grande." };
  return { ok: true, valor: l.valor };
}

/** El valor guardado, leído del JSON de la fila: ausente, null, no numérico o ≤ 0 = sin valor. PURA. */
export function valorDeLaFila(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type ConSqlCrudo = { $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T> };

/**
 * El valor del voucher del negocio, dentro de la transacción del llamador (con el tenant ya puesto por
 * `tenantTransaction`). Nunca falla por la columna ausente: devuelve null.
 */
export async function leerValorVoucherInTx(tx: ConSqlCrudo, tenantId: string): Promise<number | null> {
  const filas = await tx.$queryRaw<{ valor: string | null }[]>`
    SELECT to_jsonb(b) ->> 'voucherValor' AS valor FROM "BusinessSettings" b WHERE b."tenantId" = ${tenantId} LIMIT 1`;
  return valorDeLaFila(filas[0]?.valor);
}
