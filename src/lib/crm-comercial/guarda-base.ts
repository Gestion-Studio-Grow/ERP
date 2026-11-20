// CRM COMERCIAL — guarda de base de la carga y la limpieza de la prueba (GSG-CRM-011). Pura: no importa la base
// ni conecta a nada; la usan carga-prueba.ts, operar.ts y los scripts de scripts/crm-comercial/.

export type Guarda = { ok: true } | { ok: false; motivo: string };

/** Permiso explícito para la base publicada: `--produccion` y `CRM_PRUEBA_CONFIRMO_NEGOCIO` igual al `--negocio`. */
export interface PermisoProduccion {
  produccion?: boolean;
  /** El slug del `--negocio` de la corrida. */
  negocio?: string;
  /** El valor de `CRM_PRUEBA_CONFIRMO_NEGOCIO`. */
  confirmo?: string;
}

/**
 * Por defecto la prueba nunca corre contra Neon desde un script. La única excepción (GSG-CRM-011, dejar la prueba
 * lista en producción) pide las DOS llaves a la vez: la bandera `--produccion` y la variable
 * `CRM_PRUEBA_CONFIRMO_NEGOCIO=<slug>` igual, letra por letra, al negocio de la corrida. Así un comando copiado de
 * otro negocio, o una variable que quedó de antes, no alcanza. Es pura: no conecta a nada.
 */
export function guardaDeBase(url: string | undefined, permiso: PermisoProduccion = {}): Guarda {
  if (!url?.trim()) return { ok: false, motivo: "DATABASE_URL está vacía: no se sabe a qué base ir." };
  if (!/neon\.tech/i.test(url)) return { ok: true };
  if (!permiso.produccion) {
    return { ok: false, motivo: "DATABASE_URL apunta a Neon: la carga y la limpieza de la prueba no corren contra Neon desde un script (salvo con --produccion y CRM_PRUEBA_CONFIRMO_NEGOCIO, ver docs/crm-comercial/PRUEBA.md)." };
  }
  const negocio = permiso.negocio?.trim() ?? "";
  const confirmo = permiso.confirmo?.trim() ?? "";
  if (!negocio) return { ok: false, motivo: "Con --produccion hace falta --negocio <slug>: contra la base publicada no se adivina el negocio." };
  if (!confirmo) return { ok: false, motivo: `Con --produccion hace falta la variable CRM_PRUEBA_CONFIRMO_NEGOCIO=${negocio}: es la segunda llave.` };
  if (confirmo !== negocio) return { ok: false, motivo: `CRM_PRUEBA_CONFIRMO_NEGOCIO dice «${confirmo}» y --negocio dice «${negocio}»: tienen que ser el mismo negocio.` };
  return { ok: true };
}
