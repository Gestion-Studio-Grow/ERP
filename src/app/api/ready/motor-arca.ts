// ============================================================================
// ESTADO DEL MOTOR ARCA para /api/ready (y su parte sin base para /api/health) — núcleo PURO.
// ============================================================================
//
// Contesta, SIN NOMBRAR NEGOCIOS, la pregunta del que está de guardia: «¿la facturación está
// saliendo?». Recibe los HECHOS ya medidos por negocio (motor-arca.server.ts) y devuelve un
// resumen agregado con un semáforo y códigos de alerta estables, que son los que mapean a los
// runbooks de docs/runbooks/facturacion/incidentes.md.
//
// Qué NUNCA sale de acá: ids ni slugs de negocios, CUIT, montos, números de comprobante, textos de
// error de ARCA (pueden traer datos del receptor). Sólo conteos y dos marcas de tiempo.
//
// PURA: el "ahora" y el entorno entran por parámetro. Se testea sin DB ni reloj.

/** Lo que se mide de UN negocio (todo agregado, sin filas). */
export interface HechosNegocio {
  /** Envíos a ARCA abiertos (sin cerrar y sin rendirse). */
  pendientes: number;
  /** Envíos con un número ya anotado para ARCA, sin despacho vivo y sin cerrar: el CAE pudo haber
   *  salido o no. Es el caso ENG-020: el próximo despacho consulta antes de pedir otro. */
  enDuda: number;
  /** Envíos abiertos con UMBRAL_TRABADO intentos fallidos o más. */
  trabados: number;
  /** Envíos que se rindieron (`muertoEn`) sin cerrar. */
  muertos: number;
  /** Alta del envío abierto más viejo, o null si no hay. */
  pendienteMasViejo: Date | null;
  /** Última factura autorizada por ARCA (CAE), o null si nunca. */
  ultimoExito: Date | null;
  /** Facturas rechazadas por ARCA en las últimas 24 h. */
  rechazos24h: number;
}

export type ModoArca = "stub" | "homologacion" | "real";

export type Semaforo = "apagado" | "ok" | "atencion" | "critico" | "sin-medicion";

/** Códigos estables: cada uno tiene su sección en docs/runbooks/facturacion/incidentes.md. */
export type CodigoAlerta =
  | "cae-en-duda"
  | "cron-sin-correr"
  | "envios-trabados"
  | "envios-muertos"
  | "rechazos-masivos"
  | "rechazos"
  | "sin-exito-reciente"
  | "medicion-incompleta";

export interface EstadoMotorArca {
  estado: Semaforo;
  facturacion: boolean;
  modo: ModoArca;
  alertas: CodigoAlerta[];
  pendientes: number;
  enDuda: number;
  trabados: number;
  muertos: number;
  rechazos24h: number;
  /** Minutos de antigüedad del envío abierto más viejo (null si no hay). */
  pendienteMasViejoMin: number | null;
  ultimoExito: string | null;
  /** Cuántos negocios tienen alguna alerta (sin decir cuáles). */
  negociosConAlerta: number;
  /** Cuántos negocios no se pudieron medir. */
  negociosSinMedir: number;
  medidoEn: string;
}

// ── Umbrales (exportados: son política, no magia) ──────────────────────────────────────────

/** Intentos fallidos desde los que un envío se considera trabado (espeja UMBRAL_OUTBOX_TRABADO). */
export const UMBRAL_TRABADO = 3;
/** El cron de ARCA corre una vez por día (vercel.json, plan Hobby): 26 h = se salteó una corrida. */
export const HORAS_CRON_SIN_CORRER = 26;
/** Rechazos en 24 h que ya son «masivos» (algo del lado nuestro: certificado, CUIT, punto de venta). */
export const RECHAZOS_MASIVOS_24H = 10;
/** Rechazos en 24 h que merecen una mirada. */
export const RECHAZOS_ATENCION_24H = 3;

const MS_MIN = 60_000;
const MS_HORA = 60 * MS_MIN;

const CRITICAS: ReadonlySet<CodigoAlerta> = new Set([
  "cae-en-duda",
  "cron-sin-correr",
  "envios-muertos",
  "rechazos-masivos",
]);

/** Modo de ARCA desde el entorno: mismo criterio que `modoDesdeEnv` del plugin. PURA. */
export function modoArcaDesdeEnv(env: Record<string, string | undefined>): ModoArca {
  if (env.ARCA_MODO === "real") return "real";
  if (env.ARCA_MODO === "homologacion") return "homologacion";
  return "stub";
}

/** La llave global: mismo criterio que `isInvoicingEnabled()` (sólo "true"). PURA. */
export function facturacionEncendida(env: Record<string, string | undefined>): boolean {
  return env.ARCA_INVOICING_ENABLED === "true";
}

/** Las alertas de UN negocio. PURA. */
export function alertasDeNegocio(h: HechosNegocio, ahora: Date): CodigoAlerta[] {
  const a: CodigoAlerta[] = [];
  if (h.enDuda > 0) a.push("cae-en-duda");
  if (h.pendienteMasViejo && ahora.getTime() - h.pendienteMasViejo.getTime() > HORAS_CRON_SIN_CORRER * MS_HORA) {
    a.push("cron-sin-correr");
  }
  if (h.trabados > 0) a.push("envios-trabados");
  if (h.muertos > 0) a.push("envios-muertos");
  if (h.rechazos24h >= RECHAZOS_MASIVOS_24H) a.push("rechazos-masivos");
  else if (h.rechazos24h >= RECHAZOS_ATENCION_24H) a.push("rechazos");
  if (
    h.pendientes > 0 &&
    (h.ultimoExito === null || ahora.getTime() - h.ultimoExito.getTime() > HORAS_CRON_SIN_CORRER * MS_HORA)
  ) {
    a.push("sin-exito-reciente");
  }
  return a;
}

/**
 * Junta los hechos de todos los negocios en un resumen sin nombres. `sinMedir` = negocios cuya
 * medición falló. Con la facturación apagada no hace falta medir: estado "apagado". PURA.
 */
export function resumirMotorArca(
  hechos: readonly HechosNegocio[],
  ctx: { ahora: Date; env: Record<string, string | undefined>; sinMedir?: number },
): EstadoMotorArca {
  const facturacion = facturacionEncendida(ctx.env);
  const modo = modoArcaDesdeEnv(ctx.env);
  const sinMedir = ctx.sinMedir ?? 0;
  const base: EstadoMotorArca = {
    estado: "apagado",
    facturacion,
    modo,
    alertas: [],
    pendientes: 0,
    enDuda: 0,
    trabados: 0,
    muertos: 0,
    rechazos24h: 0,
    pendienteMasViejoMin: null,
    ultimoExito: null,
    negociosConAlerta: 0,
    negociosSinMedir: sinMedir,
    medidoEn: ctx.ahora.toISOString(),
  };
  if (!facturacion) return base;

  const alertas = new Set<CodigoAlerta>();
  let masViejo: number | null = null;
  let ultimo: number | null = null;
  for (const h of hechos) {
    base.pendientes += h.pendientes;
    base.enDuda += h.enDuda;
    base.trabados += h.trabados;
    base.muertos += h.muertos;
    base.rechazos24h += h.rechazos24h;
    if (h.pendienteMasViejo) masViejo = Math.min(masViejo ?? Infinity, h.pendienteMasViejo.getTime());
    if (h.ultimoExito) ultimo = Math.max(ultimo ?? -Infinity, h.ultimoExito.getTime());
    const propias = alertasDeNegocio(h, ctx.ahora);
    if (propias.length > 0) base.negociosConAlerta += 1;
    for (const a of propias) alertas.add(a);
  }
  if (sinMedir > 0) alertas.add("medicion-incompleta");
  base.pendienteMasViejoMin = masViejo === null ? null : Math.max(0, Math.round((ctx.ahora.getTime() - masViejo) / MS_MIN));
  base.ultimoExito = ultimo === null ? null : new Date(ultimo).toISOString();
  base.alertas = [...alertas].sort();

  if (hechos.length === 0 && sinMedir > 0) base.estado = "sin-medicion";
  else if (base.alertas.some((a) => CRITICAS.has(a))) base.estado = "critico";
  else if (base.alertas.length > 0) base.estado = "atencion";
  else base.estado = "ok";
  return base;
}

/** Lo que /api/health puede decir del motor SIN tocar la base. PURA. */
export function configMotorArca(env: Record<string, string | undefined>): {
  facturacion: boolean;
  modo: ModoArca;
  cronProtegido: boolean;
} {
  return {
    facturacion: facturacionEncendida(env),
    modo: modoArcaDesdeEnv(env),
    // Sólo SI existe el secreto del cron, nunca su valor ni su largo. Sin él, el cron responde 503
    // (fail-closed, src/lib/cron-auth.ts) y la facturación automática no sale.
    cronProtegido: (env.CRON_SECRET ?? "").trim() !== "",
  };
}
