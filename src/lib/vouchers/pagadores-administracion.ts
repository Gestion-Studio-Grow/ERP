// ============================================================================
// VOUCHERS · QUIÉN ES LA ADMINISTRACIÓN: SUS PAGADORES (10/11/2026).
// ============================================================================
//
// `BusinessSettings.voucherPagadores` (migración 20261110120000_voucher_pagadores, Gate 2): los CUIT/CUIL/
// CBU/CVU desde los que paga la administración. La regla (pura) vive en acreditacion-core.ts
// (`pagadorDeLaAdministracion`); acá, la lectura tolerante y la puerta de quién la edita.
//
// La columna puede no estar en la base todavía: la lectura NUNCA falla por eso. Adentro de la transacción
// del claim una sentencia que falla aborta la transacción entera, así que se lee la fila como JSON
// (`to_jsonb`): si la columna no existe, la clave no está y la lista queda vacía (monto y fecha).

import { permisoEfectivo, type UsuarioConPermisos } from "@/lib/capabilities";
import { pagadoresDeLaFila } from "./acreditacion-core";

export const SOLO_DUENIA_PAGADORES = "Quién es la administración lo carga sólo la dueña.";
export const PAGADORES_SIN_MIGRAR =
  "Guardar el CUIT de la administración necesita un paso de base de datos que todavía no se aplicó (lo aplica el dueño). Mientras tanto, se frena por monto y fecha.";

/** ¿Puede cargar los pagadores? Sólo OWNER (`vouchers:conciliar`: no se prende por usuario). */
export function motivoParaNoEditarPagadores(user: UsuarioConPermisos): string | null {
  return permisoEfectivo(user, "vouchers:conciliar") ? null : SOLO_DUENIA_PAGADORES;
}

type ConSqlCrudo = { $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T> };

/**
 * Los pagadores de la administración del negocio, dentro de la transacción del llamador (con el tenant ya
 * puesto por `tenantTransaction`). Nunca falla por la columna ausente: devuelve `[]`.
 */
export async function leerPagadoresInTx(tx: ConSqlCrudo, tenantId: string): Promise<string[]> {
  const filas = await tx.$queryRaw<{ pagadores: unknown }[]>`
    SELECT to_jsonb(b) -> 'voucherPagadores' AS pagadores FROM "BusinessSettings" b WHERE b."tenantId" = ${tenantId} LIMIT 1`;
  return pagadoresDeLaFila(filas[0]?.pagadores);
}
