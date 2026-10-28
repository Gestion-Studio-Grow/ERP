// ============================================================================
// Probe de schema — ¿está aplicada tal tabla / columna / valor de enum? (Gate 2 nivel 2, S2)
// ============================================================================
//
// El paquete de migraciones del nivel 2 (prisma/pending-gate2/N2_*.sql) se escribe ANTES de
// aplicarse, y `main` auto-deploya: el código de las tandas (M1, M3a, M6, P2, P4, P5, P6, B1)
// corre con la base vieja hasta el día D. Cada una pregunta acá antes de usar lo nuevo:
//   hayTabla("ApiKey") · hayColumna("OutboxEvent", "clave") · hayValorEnum("PaymentMethod", "TARJETA")
// y si contesta false muestra «En preparación» / cae al camino de hoy. Generaliza el patrón de
// src/lib/carniceria/schema-probe.ts (que queda como está).
//
// Este archivo es PURO (sin Prisma): recibe la función que consulta, así se testea con una
// consulta falsa y contra el Postgres local. La instancia del proceso está en ./index.ts.
//
// CACHÉ POR PROCESO (no por request):
//   · `true` se guarda para siempre: el paquete es aditivo, lo que aparece no desaparece
//     (si el dueño corre una reversa, el runbook pide redeploy → procesos nuevos).
//   · `false` se guarda `ttlNegativoMs` (60 s por omisión): aplicada la migración, los procesos
//     vivos se enteran solos en un minuto, sin redeploy, y mientras tanto no se consulta en
//     cada request.
//   · Error de consulta → false y NO se guarda (fail-safe: ocultar; se reintenta la próxima).
//   · Dos llamadas simultáneas a lo mismo comparten una sola consulta.
//
// Consulta pg_catalog (no information_schema): information_schema filtra por privilegios del
// rol, y con la app como `app_rls` podría esconder una tabla que sí existe. No son tablas de
// negocio → la RLS no las toca. Esquema = current_schema() (public en Neon).
// ============================================================================

/** Ejecuta SQL parametrizado ($1, $2…) y devuelve las filas. */
export type ConsultaSql = (sql: string, params: readonly string[]) => Promise<ReadonlyArray<Record<string, unknown>>>;

export interface OpcionesProbe {
  /** Cuánto se recuerda un "no está" antes de volver a preguntar. Default 60 000 ms. */
  ttlNegativoMs?: number;
  /** Reloj inyectable (tests). */
  ahora?: () => number;
}

export interface SchemaProbe {
  hayTabla(tabla: string): Promise<boolean>;
  hayColumna(tabla: string, columna: string): Promise<boolean>;
  hayValorEnum(tipo: string, valor: string): Promise<boolean>;
  /** Vacía la caché (tests y, si hiciera falta, un endpoint de operador). */
  olvidar(): void;
}

export const TTL_NEGATIVO_MS = 60_000;

export const SQL_TABLA = `SELECT 1 AS ok
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema() AND c.relname = $1 AND c.relkind IN ('r', 'p')
  LIMIT 1`;

export const SQL_COLUMNA = `SELECT 1 AS ok
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema() AND c.relname = $1 AND a.attname = $2
    AND a.attnum > 0 AND NOT a.attisdropped
  LIMIT 1`;

export const SQL_VALOR_ENUM = `SELECT 1 AS ok
  FROM pg_catalog.pg_enum e
  JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = current_schema() AND t.typname = $1 AND e.enumlabel = $2
  LIMIT 1`;

interface Entrada {
  valor: boolean;
  /** Hasta cuándo vale; Infinity para `true`. */
  vence: number;
}

export function crearSchemaProbe(consultar: ConsultaSql, opciones: OpcionesProbe = {}): SchemaProbe {
  const ttl = opciones.ttlNegativoMs ?? TTL_NEGATIVO_MS;
  const ahora = opciones.ahora ?? Date.now;
  const cache = new Map<string, Entrada>();
  const enVuelo = new Map<string, Promise<boolean>>();

  function preguntar(clave: string, sql: string, params: readonly string[]): Promise<boolean> {
    const guardada = cache.get(clave);
    if (guardada && guardada.vence > ahora()) return Promise.resolve(guardada.valor);

    const pendiente = enVuelo.get(clave);
    if (pendiente) return pendiente;

    const promesa = (async () => {
      try {
        const filas = await consultar(sql, params);
        const valor = Array.isArray(filas) && filas.length > 0;
        cache.set(clave, { valor, vence: valor ? Number.POSITIVE_INFINITY : ahora() + ttl });
        return valor;
      } catch {
        return false; // fail-safe: ocultar lo nuevo; no se cachea → se reintenta
      } finally {
        enVuelo.delete(clave);
      }
    })();
    enVuelo.set(clave, promesa);
    return promesa;
  }

  return {
    hayTabla: (tabla) => preguntar(`t:${tabla}`, SQL_TABLA, [tabla]),
    hayColumna: (tabla, columna) => preguntar(`c:${tabla}.${columna}`, SQL_COLUMNA, [tabla, columna]),
    hayValorEnum: (tipo, valor) => preguntar(`e:${tipo}.${valor}`, SQL_VALOR_ENUM, [tipo, valor]),
    olvidar: () => {
      cache.clear();
      enVuelo.clear();
    },
  };
}
