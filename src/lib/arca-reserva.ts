/**
 * ENG-019 · Quién toma cada envío a ARCA.
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
 * CADA TOMA, PARADA EN SU NEGOCIO. Toda toma y toda escritura corren en la transacción del
 * negocio del envío (el GUC de RLS puesto), también las del cron que recorre a todos
 * (`tomarDeLosNegocios`). Antes el cron leía los pendientes de todos de una vez con la conexión
 * del operador y exigía que esa conexión salteara RLS (ENG-027: si no, error de configuración);
 * en producción la consola está sujeta a RLS (26/09/2026) y el cron no despachaba nada.
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

/** Corre `fn` en UNA transacción del negocio, con su contexto de RLS. */
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

  /**
   * @param saltear envíos que esta corrida no toma aunque sigan pendientes: los que ya fallaron
   *   por un error nuestro en el mismo toque de «Autorizar los pendientes» (arca-dispatch.ts).
   */
  private readonly saltear: readonly string[];
  constructor(saltear: readonly string[] = []) {
    this.saltear = saltear;
  }

  /** Lo que la corrida no toma: lo que ya tomó y lo que le pidieron saltear. */
  get excluidos(): string[] {
    return this.saltear.length === 0 ? this.vistos : [...this.vistos, ...this.saltear];
  }

  anotar(envio: EnvioTomado): void {
    this.vistos.push(envio.id);
    this.porNegocio.set(envio.tenantId, (this.porNegocio.get(envio.tenantId) ?? 0) + 1);
  }

  tomadosDe(tenantId: string): number {
    return this.porNegocio.get(tenantId) ?? 0;
  }
}

/**
 * Toma el próximo envío pendiente de ESTE negocio con reserva libre, o `null` si no hay ninguno que
 * se pueda tomar ahora (no hay, otro despacho está tomando uno de este negocio, o uno tiene la
 * reserva vigente). Corre en la transacción del negocio (`enTransaccion`, con su GUC) y además
 * filtra por negocio en cada sentencia.
 */
export async function tomarSiguienteEnvio(
  enTransaccion: EnTransaccion,
  corrida: CorridaDeEnvios,
  tenantId: string,
): Promise<EnvioTomado | null> {
  return enTransaccion(async (tx) => {
    // Sin candado primero: si el negocio no tiene nada que tomar, no se toma el candado.
    const [pendiente] = await tx.$queryRaw<{ hay: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "OutboxEvent"
        WHERE "tenantId" = ${tenantId}::text
          AND "type" = ${OUTBOX_INVOICE_CREATED}
          AND "processedAt" IS NULL
          AND NOT ("id" = ANY(${corrida.excluidos}::text[]))
          AND (("payload"->'reserva') IS NULL OR ("payload"->'reserva'->>'hasta')::timestamptz <= now())
      ) AS hay`;
    if (!pendiente?.hay) return null;

    const [candado] = await tx.$queryRaw<{ tomado: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${CANDADO_ENVIOS_ARCA}::int, hashtext(${tenantId}::text)) AS tomado`;
    if (!candado?.tomado) return null; // otro despacho está tomando un envío de este negocio

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
            AND NOT (o."id" = ANY(${corrida.excluidos}::text[]))
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
    if (!envio) return null;
    corrida.anotar(envio);
    return envio;
  });
}

/**
 * El cron recorre TODOS los negocios: esto le da el próximo envío de cualquiera de `negocios`,
 * tomado parado en el suyo (`enTransaccionDe`). Turno entre negocios (ENG-019): primero el negocio
 * al que esta corrida le tomó menos envíos; a igual cantidad, el orden de `negocios`. Un negocio sin
 * nada que se pueda tomar ahora sale de la corrida: no se lo vuelve a consultar en cada toma.
 */
export function tomarDeLosNegocios(
  negocios: readonly string[],
  enTransaccionDe: (tenantId: string) => EnTransaccion,
): (corrida: CorridaDeEnvios) => Promise<EnvioTomado | null> {
  const orden = new Map(negocios.map((id, i) => [id, i]));
  const activos = new Set(negocios);
  return async (corrida) => {
    const turno = [...activos].sort(
      (x, y) => corrida.tomadosDe(x) - corrida.tomadosDe(y) || (orden.get(x) ?? 0) - (orden.get(y) ?? 0),
    );
    for (const tenantId of turno) {
      const envio = await tomarSiguienteEnvio(enTransaccionDe(tenantId), corrida, tenantId);
      if (envio) return envio;
      activos.delete(tenantId);
    }
    return null;
  };
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
