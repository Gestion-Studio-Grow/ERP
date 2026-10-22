// ============================================================================
// ¿QUÉ MEDIOS DE PAGO TIENE ESTA BASE? — lee el enum `PaymentMethod` del catálogo de Postgres.
// ============================================================================
//
// Reingeniería CH, Tanda 3 (CH-031/CH-032). El código conoce DEBITO y CREDITO; la base sólo los
// tiene con la migración M1 (20261024120000_ch_medios_tarjeta) aplicada, y producción hoy NO la
// tiene (Gate 2). Esta función devuelve los valores del enum que la base TIENE, para pasárselos
// a `metodosDePago` (qué teclas se dibujan) y a `medioHabilitado` (la guarda antes de escribir),
// ambas en src/lib/turnos/cobros.ts.
//
// Lee `pg_enum` (catálogo del sistema, legible por cualquier rol, sin datos de ningún negocio):
// por eso usa el cliente base y no pasa por el contexto de negocio de RLS.
//
// FALLA CERRADO: si no puede leer, contesta los tres de siempre — nunca ofrece un medio que quizá
// la base no tiene. Ese resultado NO se guarda (el próximo pedido vuelve a mirar).
//
// Guarda el resultado bueno 60 s en el proceso: el enum sólo cambia con una migración, que en
// producción corre en el build (instancias nuevas). Un minuto es el peor caso en un servidor que
// sigue vivo mientras alguien migra a mano.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { METODOS_DE_PAGO } from "@/lib/turnos/cobros";

const VIGENCIA_MS = 60_000;
let guardado: { valores: readonly string[]; hasta: number } | null = null;

type ConsultaCruda = { $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };

/** Los valores del enum `PaymentMethod` que tiene la base, en el orden del catálogo. */
export async function mediosDePagoHabilitados(
  db: ConsultaCruda = basePrisma,
  ahora: number = Date.now(),
): Promise<readonly string[]> {
  if (guardado && guardado.hasta > ahora) return guardado.valores;
  try {
    const filas = await db.$queryRaw<{ valor: string }[]>`
      SELECT e.enumlabel::text AS valor
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typname = 'PaymentMethod' AND n.nspname = current_schema()
       ORDER BY e.enumsortorder`;
    const valores = filas.map((f) => f.valor);
    // Un enum vacío o sin los de siempre no es una base de esta app: falla cerrado.
    if (!METODOS_DE_PAGO.every((m) => valores.includes(m))) return METODOS_DE_PAGO;
    guardado = { valores, hasta: ahora + VIGENCIA_MS };
    return valores;
  } catch {
    return METODOS_DE_PAGO;
  }
}

/** Sólo para tests: olvida lo guardado. */
export function olvidarMediosDePago(): void {
  guardado = null;
}
