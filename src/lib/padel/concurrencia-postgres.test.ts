// ============================================================================
// F-1 (CERT Matías T2+T3) con las ACCIONES REALES de pádel: 24 movidas simultáneas, 0 errores crudos.
// ============================================================================
//
// 12 pares de `moverHorario` al mismo hueco, en `Promise.all`, contra una base efímera con RLS y el
// adaptador pg. Antes del arreglo de `conflicto-de-escritura.ts`, ~1 de cada 24 subía como
// `DriverAdapterError: TransactionWriteConflict` (500) en vez de «Se ocupó recién». La versión de
// plataforma (sin pádel) es `src/lib/conflicto-de-escritura-postgres.test.ts`.
//
//   node --import tsx --test src/lib/padel/concurrencia-postgres.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { OMITIR_COLUMNAS_T4 } from "@/lib/padel/modelo";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const H = 3_600_000;
const DIA = 86_400_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * H + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);

test("F-1 — 12 pares de movidas al mismo hueco a la vez: 0 errores crudos, una entra y la otra «Se ocupó recién»", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env, { DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  // T4: sin pedir las columnas nuevas por defecto, así la suite corre igual con y sin la migración
  // 20261023120000 (ERP_TEST_SIN_MIGRACIONES=20261023120000_padel_reingenieria).
  const db = await prismaComoDuenio(base, { omit: OMITIR_COLUMNAS_T4 });
  const tenantId = base.a.id;
  await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 120, diasAdelante: 14, maxPendientesPorTel: 2 } });
  await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "06:00", hasta: "23:00", tipo: "DA" })) });
  const cl = await db.client.create({ data: { tenantId, name: "Juan Pérez", phone: "1151111111" } });
  const al = await db.padelAlumno.create({ data: { tenantId, clientId: cl.id, token: "TokenDeJuanReconocidoAAA1" } });
  const profe = await import("@/lib/padel/acciones");
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  let crudos = 0;
  let ok = 0;
  let negocio = 0;
  const detalles: string[] = [];
  for (let i = 0; i < 12; i++) {
    const dia = fechaEn(5 + i);
    const mk = (h: string) => db.padelClase.create({ data: { tenantId, alumnoId: al.id, clientId: cl.id, empiezaEn: aLas(dia, h), terminaEn: new Date(aLas(dia, h).getTime() + H), estado: "CONFIRMADA", origen: "PROFE", precio: 25_000, confirmadaEl: new Date() }, select: { id: true } });
    const [a, b] = await Promise.all([mk("08:00"), mk("10:00")]);
    const destino = aLas(dia, "15:00").toISOString();
    const rs = await Promise.allSettled([
      ejecutarAccion(duenia, () => profe.moverHorario(a.id, destino)),
      ejecutarAccion(duenia, () => profe.moverHorario(b.id, destino)),
    ]);
    for (const r of rs) {
      if (r.status === "rejected") {
        crudos++;
        const e = r.reason as { name?: string; message?: string; code?: string; cause?: { kind?: string }; meta?: unknown };
        detalles.push(`${e.name}:${e.code ?? ""}:${e.cause?.kind ?? ""}:${JSON.stringify(e.meta ?? null)}:${String(e.message ?? "").split("\n").filter(Boolean).slice(-2).join(" / ")}`);
      } else if ((r.value as { valor?: { ok: boolean } }).valor?.ok) ok++;
      else negocio++;
    }
    const en15 = await db.padelClase.count({ where: { tenantId, empiezaEn: aLas(dia, "15:00"), estado: "CONFIRMADA" } });
    assert.ok(en15 <= 1, "los datos nunca quedan pisados");
  }
  console.log(`  ok=${ok} errorDeNegocio=${negocio} errorCrudo=${crudos}`);
  for (const d of [...new Set(detalles)]) console.log(`  crudo: ${d}`);
  assert.equal(ok, 12, "siempre una entra");
  // Lo que se CERTIFICA: ninguna de las 24 debería explotar con un error crudo; la perdedora tiene que decir «se ocupó».
  assert.equal(crudos, 0, `${crudos} movidas terminaron en un error crudo en vez de «Se ocupó recién»`);
  assert.equal(negocio, 12, "la otra de cada par contesta el error de negocio");
});
