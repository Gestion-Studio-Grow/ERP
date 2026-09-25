/**
 * ENG-019 · ENG-027 · Quién toma cada envío a ARCA, y si el procesador ve lo que tiene que ver.
 *
 * RESERVA (ENG-019). Antes, el despacho leía los pendientes sin reservarlos: dos despachos a la
 * vez tomaban el mismo envío y pedían dos CAE, y dos ventas del mismo negocio a la vez pedían el
 * mismo número. Ahora cada envío se TOMA con una sola sentencia condicional:
 *
 *   · `FOR UPDATE SKIP LOCKED` elige la fila sin esperar a otro despacho que la esté tomando, y el
 *     `UPDATE … WHERE <reserva libre>` es la garantía: si otro la reservó y confirmó primero,
 *     Postgres vuelve a evaluar la condición sobre la fila nueva y este despacho no la toma.
 *   · UN envío en vuelo por negocio: ARCA numera "último autorizado + 1" por punto de venta y
 *     tipo; si dos envíos del mismo negocio van a la vez, piden el mismo número. La toma pasa por
 *     un candado de Postgres por negocio (`pg_try_advisory_xact_lock`, se suelta al confirmar) y
 *     en una sentencia POSTERIOR del mismo bloque verifica que ningún otro envío del negocio tenga
 *     la reserva vigente. Como la reserva se confirma antes de soltar el candado, el siguiente que
 *     obtiene el candado ya la ve.
 *   · La reserva vive en el `payload` (`reserva: { token, hasta }`), sin migración. Vence sola a
 *     los `RESERVA_DEL_ENVIO_SEGUNDOS`: si el proceso muere, el envío vuelve a estar disponible y el
 *     que lo retome consulta el número anotado antes de pedir otro (ENG-020). Anotar el número
 *     renueva la reserva y sólo se hace si la reserva sigue siendo de este despacho: un despacho
 *     que la perdió no le pide nada a ARCA.
 *   · Turno entre negocios: en cada toma se prueba primero el negocio al que este despacho le
 *     tomó menos envíos en la corrida; 20 envíos trabados de un negocio no frenan al otro.
 *
 * ACCESO DEL OPERADOR (ENG-027). El barrido de todos los negocios usa la conexión del operador
 * (`operator-db.ts`). Si `OPERATOR_DATABASE_URL` falta, esa conexión cae a `DATABASE_URL`
 * (`app_rls`) y RLS le esconde todos los envíos: el procesador devolvía "0 procesados" y ninguna
 * factura se autorizaba. `verificarAccesoDelOperador` lo detecta ANTES de leer y lanza
 * `ProcesadorArcaSinAccesoError`; el cron y `/api/ready` lo informan.
 */

import { randomUUID } from "node:crypto";
import { OUTBOX_INVOICE_CREATED } from "@/lib/invoice-core";

/**
 * Cuánto dura la reserva de un envío. Un llamado a ARCA se corta a los 15 s (`TIMEOUT_ARCA_MS`);
 * un envío hace a lo sumo cuatro (login, último autorizado, consulta, pedido del CAE): 60 s. La
 * reserva se renueva al anotar el número, justo antes de pedir el CAE, así que después de anotar
 * quedan 300 s para un llamado de 15 s. Un proceso que muere traba a su negocio a lo sumo 5
 * minutos, menos que los 15 de reintento (DECISIONS.md P5).
 */
export const RESERVA_DEL_ENVIO_SEGUNDOS = 300;

/** Primera mitad de la clave del candado por negocio ("ARCA" en ASCII); la otra es el negocio. */
const CANDADO_ENVIOS_ARCA = 0x41524341;

/** Lo mínimo que se necesita de un cliente de Prisma (transacción o cliente) para hablar SQL. */
export interface ConSql {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

/** Corre `fn` en UNA transacción (la del operador, o la del negocio con su contexto de RLS). */
export type EnTransaccion = <T>(fn: (tx: ConSql) => Promise<T>) => Promise<T>;

/** Un envío tomado: la fila del outbox con la reserva de este despacho. */
export interface EnvioTomado {
  id: string;
  tenantId: string;
  payload: unknown;
  attempts: number;
}

/** El estado de una corrida: su token y lo que ya tomó (para no tomar dos veces lo mismo). */
export class CorridaDeEnvios {
  readonly token = randomUUID();
  readonly vistos: string[] = [];
  private readonly porNegocio = new Map<string, number>();

  anotar(envio: EnvioTomado): void {
    this.vistos.push(envio.id);
    this.porNegocio.set(envio.tenantId, (this.porNegocio.get(envio.tenantId) ?? 0) + 1);
  }

  tomadosDe(tenantId: string): number {
    return this.porNegocio.get(tenantId) ?? 0;
  }
}

/**
 * Toma el próximo envío pendiente con reserva libre, o `null` si no hay ninguno que se pueda tomar
 * ahora. Con `soloDelNegocio`, sólo de ese negocio (además del filtro de RLS de la transacción).
 */
export async function tomarSiguienteEnvio(
  enTransaccion: EnTransaccion,
  corrida: CorridaDeEnvios,
  soloDelNegocio: string | null,
): Promise<EnvioTomado | null> {
  return enTransaccion(async (tx) => {
    const candidatos = await tx.$queryRaw<{ tenantId: string; createdAt: Date }[]>`
      SELECT DISTINCT ON ("tenantId") "tenantId", "createdAt"
      FROM "OutboxEvent"
      WHERE "type" = ${OUTBOX_INVOICE_CREATED}
        AND "processedAt" IS NULL
        AND NOT ("id" = ANY(${corrida.vistos}::text[]))
        AND (${soloDelNegocio}::text IS NULL OR "tenantId" = ${soloDelNegocio}::text)
        AND (("payload"->'reserva') IS NULL OR ("payload"->'reserva'->>'hasta')::timestamptz <= now())
      ORDER BY "tenantId", "createdAt", "id"`;

    const turno = [...candidatos].sort(
      (x, y) =>
        corrida.tomadosDe(x.tenantId) - corrida.tomadosDe(y.tenantId) ||
        x.createdAt.getTime() - y.createdAt.getTime(),
    );

    for (const { tenantId } of turno) {
      const [candado] = await tx.$queryRaw<{ tomado: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${CANDADO_ENVIOS_ARCA}::int, hashtext(${tenantId}::text)) AS tomado`;
      if (!candado?.tomado) continue; // otro despacho está tomando un envío de este negocio

      // Sentencia NUEVA después del candado: ve las reservas que otros confirmaron antes.
      const tomados = await tx.$queryRaw<EnvioTomado[]>`
        UPDATE "OutboxEvent" AS e
        SET "payload" = jsonb_set(
          e."payload",
          '{reserva}',
          jsonb_build_object(
            'token', ${corrida.token}::text,
            'hasta', now() + ${RESERVA_DEL_ENVIO_SEGUNDOS}::int * interval '1 second'
          )
        )
        WHERE e."id" = (
            SELECT o."id" FROM "OutboxEvent" AS o
            WHERE o."tenantId" = ${tenantId}::text
              AND o."type" = ${OUTBOX_INVOICE_CREATED}
              AND o."processedAt" IS NULL
              AND NOT (o."id" = ANY(${corrida.vistos}::text[]))
              AND ((o."payload"->'reserva') IS NULL OR (o."payload"->'reserva'->>'hasta')::timestamptz <= now())
            ORDER BY o."createdAt", o."id"
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          AND e."processedAt" IS NULL
          AND ((e."payload"->'reserva') IS NULL OR (e."payload"->'reserva'->>'hasta')::timestamptz <= now())
          AND NOT EXISTS (
            SELECT 1 FROM "OutboxEvent" AS x
            WHERE x."tenantId" = e."tenantId"
              AND x."type" = ${OUTBOX_INVOICE_CREATED}
              AND x."processedAt" IS NULL
              AND x."id" <> e."id"
              AND (x."payload"->'reserva') IS NOT NULL
              AND (x."payload"->'reserva'->>'hasta')::timestamptz > now()
          )
        RETURNING e."id", e."tenantId", e."payload", e."attempts"`;
      const envio = tomados[0];
      if (envio) {
        corrida.anotar(envio);
        return envio;
      }
    }
    return null;
  });
}

/**
 * ENG-020 + ENG-019 · Anota el número que se le va a pedir a ARCA y renueva la reserva, sólo si
 * el envío sigue abierto y la reserva sigue siendo de esta corrida. Devuelve si anotó.
 */
export async function anotarIntentoConReserva(
  enTransaccion: EnTransaccion,
  envio: { id: string; tenantId: string },
  token: string,
  intento: unknown,
): Promise<boolean> {
  const n = await enTransaccion((tx) => tx.$executeRaw`
    UPDATE "OutboxEvent"
    SET "payload" = jsonb_set(
      jsonb_set("payload", '{intentoArca}', ${JSON.stringify(intento)}::jsonb),
      '{reserva,hasta}',
      to_jsonb(now() + ${RESERVA_DEL_ENVIO_SEGUNDOS}::int * interval '1 second')
    )
    WHERE "id" = ${envio.id}::text
      AND "tenantId" = ${envio.tenantId}::text
      AND "processedAt" IS NULL
      AND "payload"->'reserva'->>'token' = ${token}::text`);
  return n > 0;
}

/**
 * Suma un intento fallido, guarda el motivo y suelta la reserva, sólo si el envío sigue abierto y
 * la reserva es de esta corrida (el motivo de un envío que otro ya tomó o cerró no se pisa).
 */
export async function anotarFallaYSoltar(
  enTransaccion: EnTransaccion,
  envio: { id: string; tenantId: string },
  token: string,
  motivo: string,
): Promise<void> {
  await enTransaccion((tx) => tx.$executeRaw`
    UPDATE "OutboxEvent"
    SET "attempts" = "attempts" + 1, "lastError" = ${motivo}::text, "payload" = "payload" - 'reserva'
    WHERE "id" = ${envio.id}::text
      AND "tenantId" = ${envio.tenantId}::text
      AND "processedAt" IS NULL
      AND "payload"->'reserva'->>'token' = ${token}::text`);
}

/** Suelta la reserva sin anotar nada (un error inesperado a mitad del envío). */
export async function soltarReserva(
  enTransaccion: EnTransaccion,
  envio: { id: string; tenantId: string },
  token: string,
): Promise<void> {
  await enTransaccion((tx) => tx.$executeRaw`
    UPDATE "OutboxEvent" SET "payload" = "payload" - 'reserva'
    WHERE "id" = ${envio.id}::text
      AND "tenantId" = ${envio.tenantId}::text
      AND "processedAt" IS NULL
      AND "payload"->'reserva'->>'token' = ${token}::text`);
}

// ── ENG-027 · el procesador de todos los negocios tiene que poder verlos ─────────────────────

/** Lo que `/api/ready` y el cron muestran. Sin nombres de roles ni de tablas (estándar §4). */
export const MOTIVO_PROCESADOR_SIN_ACCESO = "procesador de ARCA sin acceso";

/** La conexión del operador no ve los envíos de todos los negocios: error de configuración. */
export class ProcesadorArcaSinAccesoError extends Error {
  readonly motivo = MOTIVO_PROCESADOR_SIN_ACCESO;
  constructor(detalle: string) {
    super(`${MOTIVO_PROCESADOR_SIN_ACCESO}: ${detalle}`);
    this.name = "ProcesadorArcaSinAccesoError";
  }
}

/**
 * Verifica, antes de leer, que la conexión del operador ve las filas de `OutboxEvent` de todos los
 * negocios: superusuario, `BYPASSRLS`, dueño de la tabla sin `FORCE ROW LEVEL SECURITY`, o la
 * tabla sin RLS. Si no, lanza `ProcesadorArcaSinAccesoError` (el detalle sí nombra el rol: va al
 * log del servidor, no a la respuesta).
 */
export async function verificarAccesoDelOperador(
  db: Pick<ConSql, "$queryRaw">,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const [fila] = await db.$queryRaw<{ rol: string; veTodo: boolean }[]>`
    SELECT current_user::text AS rol,
      (r.rolsuper OR r.rolbypassrls OR NOT c.relrowsecurity
        OR (pg_has_role(current_user, c.relowner, 'USAGE') AND NOT c.relforcerowsecurity)) AS "veTodo"
    FROM pg_roles AS r, pg_class AS c
    WHERE r.rolname = current_user AND c.oid = '"OutboxEvent"'::regclass`;
  if (fila?.veTodo) return;
  const falta = !env.OPERATOR_DATABASE_URL;
  throw new ProcesadorArcaSinAccesoError(
    falta
      ? `falta OPERATOR_DATABASE_URL y la conexión de la app (rol ${fila?.rol ?? "desconocido"}) no ve los envíos de ` +
          "todos los negocios; ninguna factura se autorizaría. Configurar OPERATOR_DATABASE_URL con el rol dueño."
      : `OPERATOR_DATABASE_URL usa el rol ${fila?.rol ?? "desconocido"}, que no ve los envíos de todos los negocios ` +
          "(no es dueño de la tabla ni tiene BYPASSRLS); ninguna factura se autorizaría.",
  );
}
