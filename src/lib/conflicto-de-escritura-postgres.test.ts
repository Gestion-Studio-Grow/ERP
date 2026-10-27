// ============================================================================
// F-1 (CERT Matías T2+T3) — el choque Serializable REAL se reintenta, en la base, con RLS.
// ============================================================================
//
// Lo que se certifica: dos transacciones de reserva (`bookingTransaction`) que leen "libre" y
// escriben a la vez contra un Postgres de verdad, con el adaptador pg y el rol `app_rls`, NUNCA
// terminan en un error crudo. Una entra; la otra, al reintentar, ve la primera ya escrita y
// contesta su error de negocio. Antes del arreglo, cuando el abort salía del COMMIT (o del GUC)
// como `DriverAdapterError` crudo (`cause.kind: "TransactionWriteConflict"`), `rls.ts` no lo
// reconocía y subía tal cual: 1 de cada ~24 terminaba en un 500 (medido en la CERT).
//
// Es de PLATAFORMA: usa sólo `Client` y `bookingTransaction`, así que corre igual en cualquier
// rama que tenga el arnés (`src/test/base-efimera.ts`). La versión con las acciones reales de
// pádel está en `src/lib/padel/concurrencia-postgres.test.ts`.
//
//   node --import tsx --test src/lib/conflicto-de-escritura-postgres.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

/** Lo que se ve de un error crudo, para que el informe diga qué forma escapó. */
function describir(e: unknown): string {
  const x = e as { name?: string; code?: string; message?: string; cause?: { kind?: string }; meta?: unknown };
  return `${x?.name}:${x?.code ?? ""}:${x?.cause?.kind ?? ""}:${String(x?.message ?? "").split("\n").filter(Boolean).slice(-1)[0] ?? ""}`;
}

test("24 reservas simultáneas (12 pares al mismo hueco) en Serializable: 0 errores crudos, una entra por par", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env, { DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  const { bookingTransaction } = await import("@/lib/rls");
  const db = await prismaComoDuenio(base);
  const tenantId = base.a.id;

  /** "Reservar el hueco": si nadie lo tiene, lo toma; si ya está, error de negocio. */
  const reservar = (hueco: string, quien: string) =>
    bookingTransaction(
      async (tx) => {
        const ocupado = await tx.client.count({ where: { tenantId, phone: hueco } });
        // Un respiro entre leer y escribir: deja que la otra lea "libre" también (la carrera real).
        await new Promise((r) => setTimeout(r, 5));
        if (ocupado > 0) return { ok: false as const, error: "Se ocupó recién" };
        await tx.client.create({ data: { tenantId, name: quien, phone: hueco } });
        return { ok: true as const };
      },
      { tenantId },
    );

  let ok = 0;
  let negocio = 0;
  const crudos: string[] = [];
  for (let i = 0; i < 12; i++) {
    const hueco = `hueco-f1-${i}`;
    const rs = await Promise.allSettled([reservar(hueco, `A${i}`), reservar(hueco, `B${i}`)]);
    for (const r of rs) {
      if (r.status === "rejected") crudos.push(describir(r.reason));
      else if (r.value.ok) ok++;
      else negocio++;
    }
    const tomados = await db.client.count({ where: { tenantId, phone: hueco } });
    assert.equal(tomados, 1, `el hueco ${i} quedó tomado una sola vez`);
  }
  for (const c of new Set(crudos)) console.log(`  crudo: ${c}`);
  assert.deepEqual(crudos, [], `${crudos.length} reservas terminaron en un error crudo en vez del error de negocio`);
  assert.equal(ok, 12, "una por par entra");
  assert.equal(negocio, 12, "la otra contesta «Se ocupó recién»");
});
