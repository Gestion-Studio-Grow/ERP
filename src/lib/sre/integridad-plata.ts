// ============================================================================
// CONTROL DIARIO DE INTEGRIDAD DE PLATA — cobros contra caja, por negocio. SOLO LECTURA.
// ============================================================================
//
// Qué mira (docs/runbooks/SLO-Y-CONFIABILIDAD.md §5):
//   1. cobro-sin-asiento       un cobro (`Collection`) que entró plata y no tiene su VENTA en el
//                              libro de caja (`CashMovement`). Es «cobré y la caja no se enteró».
//   2. asiento-monto-distinto  la VENTA del libro no vale lo mismo que el cobro que la originó.
//   3. asiento-duplicado       dos VENTA para el mismo cobro / pedido / pago (plata de más). Los
//                              `@@unique` lo impiden, pero en Neon puede faltar alguna migración.
//   4. asiento-de-otro-negocio un movimiento de caja que apunta a un cobro, pedido, pago o turno
//                              de caja de OTRO negocio.
//   5. monto-invalido          un movimiento con monto <= 0 o que no es un número (el monto
//                              SIEMPRE es positivo; el signo lo pone el tipo).
//
// Cómo: SÓLO `SELECT`. No importa Prisma ni la app: recibe una función `consulta(sql, params)`,
// así corre igual con `pg` (scripts/sre/control-integridad-plata.mts) y con PGlite (el test).
// Quien llama abre la transacción en SOLO LECTURA; acá no hay una sola escritura.
//
// Antes de consultar pregunta qué columnas existen: la base de producción puede ir una migración
// atrás del código (schema-ahead). Un control que no se puede evaluar se INFORMA como tal — nunca
// se da por bueno en silencio.
//
// La salida no trae nombres ni datos de personas: id de negocio, cantidades, montos e ids de fila.
// ============================================================================

export type Consulta = (sql: string, params?: readonly unknown[]) => Promise<Record<string, unknown>[]>;

export type Control =
  | "cobro-sin-asiento"
  | "asiento-monto-distinto"
  | "asiento-duplicado"
  | "asiento-de-otro-negocio"
  | "monto-invalido";

export const CONTROLES: readonly Control[] = [
  "cobro-sin-asiento",
  "asiento-monto-distinto",
  "asiento-duplicado",
  "asiento-de-otro-negocio",
  "monto-invalido",
];

export interface Hallazgo {
  control: Control;
  negocio: string;
  filas: number;
  /** Plata comprometida, como texto decimal («1500.00»). `null` si el control no suma plata. */
  monto: string | null;
  /** Hasta 5 ids de fila para ir a mirar. */
  muestras: string[];
}

export interface ResumenNegocio {
  negocio: string;
  cobros: number;
  cobrado: string;
  sinAsiento: number;
  montoSinAsiento: string;
}

export interface InformeIntegridad {
  desde: string;
  hasta: string;
  negocios: ResumenNegocio[];
  hallazgos: Hallazgo[];
  noEvaluados: { control: Control; motivo: string }[];
  /** `true` sólo si no hay hallazgos Y se pudieron evaluar todos los controles. */
  ok: boolean;
}

export interface OpcionesIntegridad {
  /** Fin de la ventana. Por defecto: ahora. */
  hasta?: Date;
  /** Cuántos días para atrás se mira. Por defecto 2 (el día de ayer entero, con margen). */
  dias?: number;
  /** Diferencia de monto que se tolera entre cobro y asiento (redondeo). Por defecto 0,01. */
  tolerancia?: number;
}

/** Las columnas que usa cada tabla. Las comprueba el test contra prisma/schema.prisma. */
export const COLUMNAS_USADAS: Readonly<Record<string, readonly string[]>> = {
  Collection: ["id", "tenantId", "originType", "orderId", "appointmentId", "amount", "method", "createdAt"],
  CashMovement: ["id", "tenantId", "sessionId", "type", "amount", "orderId", "paymentId", "collectionId", "createdAt"],
  Payment: ["id", "tenantId", "appointmentId"],
  CashSession: ["id", "tenantId"],
  Order: ["id", "tenantId"],
};

const VENTANA = `>= ($1::timestamptz AT TIME ZONE 'UTC')`;
const HASTA = `< ($2::timestamptz AT TIME ZONE 'UTC')`;

function texto(v: unknown): string {
  return v === null || v === undefined ? "0" : String(v);
}

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => x !== null).map(String) : [];
}

async function columnasPresentes(consulta: Consulta): Promise<Set<string>> {
  const tablas = Object.keys(COLUMNAS_USADAS);
  const filas = await consulta(
    `SELECT table_name AS tabla, column_name AS columna
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [tablas],
  );
  return new Set(filas.map((f) => `${String(f.tabla)}.${String(f.columna)}`));
}

/**
 * Corre los cinco controles y devuelve el informe. NO escribe nada.
 * Quien llama decide qué hacer con `ok === false` (el script sale con código 1 y avisa).
 */
export async function controlarIntegridadPlata(
  consulta: Consulta,
  opciones: OpcionesIntegridad = {},
): Promise<InformeIntegridad> {
  const hasta = opciones.hasta ?? new Date();
  const dias = opciones.dias && opciones.dias > 0 ? opciones.dias : 2;
  const tolerancia = opciones.tolerancia ?? 0.01;
  const desde = new Date(hasta.getTime() - dias * 24 * 60 * 60 * 1000);
  const rango = [desde.toISOString(), hasta.toISOString()] as const;

  const hay = await columnasPresentes(consulta);
  const tiene = (tabla: string, ...cols: string[]) => cols.every((c) => hay.has(`${tabla}.${c}`));
  const noEvaluados: InformeIntegridad["noEvaluados"] = [];
  const hallazgos: Hallazgo[] = [];
  let negocios: ResumenNegocio[] = [];

  const hayCobros = tiene("Collection", ...COLUMNAS_USADAS.Collection);
  const hayLibro = tiene("CashMovement", "id", "tenantId", "type", "amount", "createdAt");
  const conCobro = tiene("CashMovement", "collectionId");
  const conPedido = tiene("CashMovement", "orderId");
  const conPago = tiene("CashMovement", "paymentId") && tiene("Payment", "id", "appointmentId");

  if (!hayLibro) {
    for (const control of CONTROLES) noEvaluados.push({ control, motivo: "falta la tabla CashMovement o alguna de sus columnas base" });
    return { desde: rango[0], hasta: rango[1], negocios, hallazgos, noEvaluados, ok: false };
  }

  // ── 1. cobro-sin-asiento (y el resumen por negocio) ──────────────────────────────────────────
  // Un cobro está asentado si hay una VENTA del MISMO negocio enganchada a él por cualquiera de los
  // tres puentes: el cobro (collectionId, vigente), el pedido (orderId, mostrador) o el pago del
  // turno (paymentId, el puente anterior). VOUCHER no va al libro (lo liquida un tercero);
  // RECEIVABLE/PAYABLE son cuentas corrientes, otro circuito.
  if (!hayCobros) {
    noEvaluados.push({ control: "cobro-sin-asiento", motivo: "falta la tabla Collection o alguna de sus columnas" });
  } else {
    const puentes = [
      conCobro ? `m."collectionId" = c.id` : null,
      conPedido ? `(c."orderId" IS NOT NULL AND m."orderId" = c."orderId")` : null,
      conPago
        ? `(c."appointmentId" IS NOT NULL AND m."paymentId" IN (SELECT p.id FROM "Payment" p WHERE p."appointmentId" = c."appointmentId"))`
        : null,
    ].filter(Boolean);
    if (puentes.length === 0) {
      noEvaluados.push({ control: "cobro-sin-asiento", motivo: "CashMovement no tiene ninguna columna de puente (collectionId / orderId / paymentId)" });
    } else {
      const filas = await consulta(
        `WITH cobros AS (
           SELECT c.id, c."tenantId" AS negocio, c.amount::numeric AS monto,
                  EXISTS (SELECT 1 FROM "CashMovement" m
                           WHERE m."tenantId" = c."tenantId" AND m.type::text = 'VENTA'
                             AND (${puentes.join(" OR ")})) AS asentado
             FROM "Collection" c
            WHERE c."createdAt" ${VENTANA} AND c."createdAt" ${HASTA}
              AND c."originType"::text IN ('ORDER', 'APPOINTMENT')
              AND c.method::text <> 'VOUCHER'
              AND c.amount > 0
         )
         SELECT negocio,
                count(*)::int AS cobros,
                coalesce(sum(monto), 0)::text AS cobrado,
                (count(*) FILTER (WHERE NOT asentado))::int AS sin_asiento,
                coalesce(sum(monto) FILTER (WHERE NOT asentado), 0)::text AS monto_sin_asiento,
                (array_agg(id ORDER BY id) FILTER (WHERE NOT asentado))[1:5] AS muestras
           FROM cobros GROUP BY negocio ORDER BY negocio`,
        rango,
      );
      negocios = filas.map((f) => ({
        negocio: String(f.negocio),
        cobros: Number(f.cobros),
        cobrado: texto(f.cobrado),
        sinAsiento: Number(f.sin_asiento),
        montoSinAsiento: texto(f.monto_sin_asiento),
      }));
      for (const f of filas) {
        if (Number(f.sin_asiento) > 0) {
          hallazgos.push({
            control: "cobro-sin-asiento",
            negocio: String(f.negocio),
            filas: Number(f.sin_asiento),
            monto: texto(f.monto_sin_asiento),
            muestras: lista(f.muestras),
          });
        }
      }
    }
  }

  // ── 2. asiento-monto-distinto ────────────────────────────────────────────────────────────────
  if (!hayCobros || !conCobro) {
    noEvaluados.push({ control: "asiento-monto-distinto", motivo: "falta Collection o CashMovement.collectionId" });
  } else {
    const filas = await consulta(
      `SELECT m."tenantId" AS negocio, count(*)::int AS filas,
              sum(abs(m.amount::numeric - c.amount::numeric))::text AS monto,
              (array_agg(m.id ORDER BY m.id))[1:5] AS muestras
         FROM "CashMovement" m JOIN "Collection" c ON c.id = m."collectionId"
        WHERE m.type::text = 'VENTA'
          AND m."createdAt" ${VENTANA} AND m."createdAt" ${HASTA}
          AND abs(m.amount::numeric - c.amount::numeric) > $3::numeric
        GROUP BY 1 ORDER BY 1`,
      [...rango, tolerancia],
    );
    for (const f of filas) {
      hallazgos.push({ control: "asiento-monto-distinto", negocio: String(f.negocio), filas: Number(f.filas), monto: texto(f.monto), muestras: lista(f.muestras) });
    }
  }

  // ── 3. asiento-duplicado ─────────────────────────────────────────────────────────────────────
  {
    const claves = [conCobro ? "collectionId" : null, conPedido ? "orderId" : null, tiene("CashMovement", "paymentId") ? "paymentId" : null].filter(
      (c): c is string => c !== null,
    );
    if (claves.length === 0) {
      noEvaluados.push({ control: "asiento-duplicado", motivo: "CashMovement no tiene columnas de puente" });
    } else {
      const partes = claves.map(
        (col) =>
          `SELECT m."tenantId" AS negocio, '${col}:' || m."${col}" AS clave, (count(*) - 1) AS sobran,
                  sum(m.amount::numeric) - max(m.amount::numeric) AS monto
             FROM "CashMovement" m
            WHERE m.type::text = 'VENTA' AND m."${col}" IS NOT NULL
            GROUP BY m."tenantId", m."${col}"
           HAVING count(*) > 1 AND max(m."createdAt") ${VENTANA} AND min(m."createdAt") ${HASTA}`,
      );
      const filas = await consulta(
        `SELECT negocio, sum(sobran)::int AS filas, sum(monto)::text AS monto, (array_agg(clave ORDER BY clave))[1:5] AS muestras
           FROM (${partes.join(" UNION ALL ")}) d GROUP BY negocio ORDER BY negocio`,
        rango,
      );
      for (const f of filas) {
        hallazgos.push({ control: "asiento-duplicado", negocio: String(f.negocio), filas: Number(f.filas), monto: texto(f.monto), muestras: lista(f.muestras) });
      }
    }
  }

  // ── 4. asiento-de-otro-negocio ───────────────────────────────────────────────────────────────
  {
    const cruces = [
      hayCobros && conCobro ? { join: `LEFT JOIN "Collection" c ON c.id = m."collectionId"`, cond: `c."tenantId" <> m."tenantId"` } : null,
      conPedido && tiene("Order", "id", "tenantId") ? { join: `LEFT JOIN "Order" o ON o.id = m."orderId"`, cond: `o."tenantId" <> m."tenantId"` } : null,
      conPago && tiene("Payment", "tenantId") ? { join: `LEFT JOIN "Payment" p ON p.id = m."paymentId"`, cond: `p."tenantId" <> m."tenantId"` } : null,
      tiene("CashMovement", "sessionId") && tiene("CashSession", "id", "tenantId")
        ? { join: `LEFT JOIN "CashSession" s ON s.id = m."sessionId"`, cond: `s."tenantId" <> m."tenantId"` }
        : null,
    ].filter((x): x is { join: string; cond: string } => x !== null);
    if (cruces.length === 0) {
      noEvaluados.push({ control: "asiento-de-otro-negocio", motivo: "no hay ninguna relación contra la que cruzar" });
    } else {
      const filas = await consulta(
        `SELECT m."tenantId" AS negocio, count(*)::int AS filas, (array_agg(m.id ORDER BY m.id))[1:5] AS muestras
           FROM "CashMovement" m ${cruces.map((c) => c.join).join(" ")}
          WHERE m."createdAt" ${VENTANA} AND m."createdAt" ${HASTA}
            AND (${cruces.map((c) => c.cond).join(" OR ")})
          GROUP BY 1 ORDER BY 1`,
        rango,
      );
      for (const f of filas) {
        hallazgos.push({ control: "asiento-de-otro-negocio", negocio: String(f.negocio), filas: Number(f.filas), monto: null, muestras: lista(f.muestras) });
      }
    }
  }

  // ── 5. monto-invalido ────────────────────────────────────────────────────────────────────────
  {
    const filas = await consulta(
      `SELECT m."tenantId" AS negocio, count(*)::int AS filas, (array_agg(m.id ORDER BY m.id))[1:5] AS muestras
         FROM "CashMovement" m
        WHERE m."createdAt" ${VENTANA} AND m."createdAt" ${HASTA}
          AND NOT (m.amount > 0 AND m.amount < 1e15)
        GROUP BY 1 ORDER BY 1`,
      rango,
    );
    for (const f of filas) {
      hallazgos.push({ control: "monto-invalido", negocio: String(f.negocio), filas: Number(f.filas), monto: null, muestras: lista(f.muestras) });
    }
  }

  return { desde: rango[0], hasta: rango[1], negocios, hallazgos, noEvaluados, ok: hallazgos.length === 0 && noEvaluados.length === 0 };
}

/** El informe en pocas líneas, para el log y para el aviso. Sin datos de personas. PURA. */
export function resumenParaAviso(informe: InformeIntegridad): string {
  const lineas: string[] = [];
  lineas.push(`Ventana: ${informe.desde} → ${informe.hasta}`);
  lineas.push(`Negocios con cobros: ${informe.negocios.length}`);
  if (informe.ok) {
    lineas.push("Resultado: OK — cobros y caja coinciden.");
    return lineas.join("\n");
  }
  lineas.push("Resultado: HAY DIFERENCIAS");
  for (const h of informe.hallazgos) {
    const plata = h.monto === null ? "" : ` · $ ${h.monto}`;
    lineas.push(`- ${h.control} · negocio ${h.negocio} · ${h.filas} fila(s)${plata} · muestras: ${h.muestras.join(", ") || "—"}`);
  }
  for (const n of informe.noEvaluados) lineas.push(`- NO EVALUADO ${n.control}: ${n.motivo}`);
  return lineas.join("\n");
}
