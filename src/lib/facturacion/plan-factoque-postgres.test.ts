// ============================================================================
// T2 · PLANES DE FACTOQUE EN EL MOTOR — el tope sale de `Tenant.plan` y de la vigencia que deja el
// «Cambiar plan» del operador (fila `factoque.plan`), contra una base efímera con RLS y ARCA stub.
//
//  · Plus: tope 40; emisiones simultáneas con claves distintas en el último lugar no lo pasan.
//  · Downgrade con más de 5 emitidas: no borra nada, frena la siguiente. Vencido: tope de 5 aunque
//    la columna diga Plus. Renovado: sigue emitiendo.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const CUIT_EMISOR = "20111111112";

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = { arca: env.ARCA_INVOICING_ENABLED, modo: env.ARCA_MODO, auth: env.AUTH_SECRET };
  Object.assign(env, { ARCA_INVOICING_ENABLED: "true", AUTH_SECRET: "secreto-de-auth-qa" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  t.after(() => {
    for (const [k, v] of [["ARCA_INVOICING_ENABLED", antes.arca], ["ARCA_MODO", antes.modo], ["AUTH_SECRET", antes.auth]] as const) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { emitirComprobanteManual } = await import("@/lib/facturacion/emision-manual.server");
  return { base, duenio, emitirComprobanteManual };
}

type Prep = NonNullable<Awaited<ReturnType<typeof preparar>>>;
type Respuesta = { ok: boolean; error?: string; limite?: { limite: number; plan: string } | null };

/** Lo que deja el «Cambiar plan» del operador: la columna y la fila con la vigencia. */
async function venderPlan(p: Prep, negocio: NegocioDePrueba, plan: string | null, vigenciaHasta: string | null) {
  await p.duenio.tenant.update({ where: { id: negocio.id }, data: { plan } });
  await p.duenio.auditLog.create({
    data: {
      tenantId: negocio.id,
      actor: "operator:qa",
      action: "factoque.plan",
      entity: "Tenant",
      entityId: negocio.id,
      changes: { antes: {}, despues: { plan, vigenciaHasta } },
    },
  });
}

async function comoFactoque(p: Prep, negocio: NegocioDePrueba) {
  await p.duenio.tenant.update({
    where: { id: negocio.id },
    data: { blueprintId: "facturita", arcaCuit: CUIT_EMISOR, arcaPuntoVenta: 5, arcaHomologacion: true, arcaCondicionIva: "MONOTRIBUTO" },
  });
  const emitir = async (i: number): Promise<Respuesta> => {
    const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () =>
      p.emitirComprobanteManual(
        { tenantId: negocio.id, actor: "user:qa", revalidar: [] },
        { descripcion: `Venta ${i}`, total: 1000, claveEmision: `clave-de-plan-${negocio.id.slice(-6)}-${String(i).padStart(4, "0")}` },
      ),
    );
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Respuesta }).valor;
  };
  const facturas = () =>
    p.duenio.invoice.findMany({ where: { tenantId: negocio.id }, select: { id: true, status: true, cae: true }, orderBy: { id: "asc" } });
  return { emitir, facturas };
}

test("plan Plus: tope 40; emisiones simultáneas en el último lugar no lo pasan", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const negocio = p.base.a;
  const { emitir, facturas } = await comoFactoque(p, negocio);
  await venderPlan(p, negocio, "factoque-plus", "2099-12-31");
  for (let i = 0; i < 39; i++) {
    const r = await emitir(i);
    assert.ok(r.ok, JSON.stringify(r));
    if (i === 38) assert.match(String((r as { limite?: { limite: number } }).limite?.limite), /^40$/);
  }
  const rs = await Promise.all([39, 40, 41, 42].map(emitir));
  assert.equal(rs.filter((r) => r.ok).length, 1, JSON.stringify(rs));
  assert.ok(rs.filter((r) => !r.ok).every((r) => /tope de 40 facturas de tu plan Factoque Plus/.test(r.error ?? "")), JSON.stringify(rs));
  assert.equal((await facturas()).length, 40);
});

test("downgrade con más de 5 emitidas no borra nada y frena la siguiente; vencido = tope 5; renovado sigue", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const negocio = p.base.b;
  const { emitir, facturas } = await comoFactoque(p, negocio);
  await venderPlan(p, negocio, "factoque-pro", null);
  for (let i = 0; i < 7; i++) assert.ok((await emitir(i)).ok);
  const siete = await facturas();
  assert.equal(siete.length, 7);

  // Downgrade a Gratis a mitad de mes.
  await venderPlan(p, negocio, null, null);
  const octava = await emitir(7);
  assert.ok(!octava.ok && /tope de 5 facturas gratis/.test(octava.error ?? ""), JSON.stringify(octava));
  assert.deepEqual(await facturas(), siete, "las 7 quedan como estaban");

  // Se vende Plus con la vigencia ya vencida: rige Gratis, aunque la columna diga Plus.
  await venderPlan(p, negocio, "factoque-plus", "2020-01-31");
  const vencido = await emitir(8);
  assert.ok(!vencido.ok && /tope de 5 facturas gratis/.test(vencido.error ?? ""), JSON.stringify(vencido));
  assert.deepEqual(await facturas(), siete);

  // Renovado por el operador: sale la octava con el tope de Plus.
  await venderPlan(p, negocio, "factoque-plus", "2099-12-31");
  const renovado = await emitir(9);
  assert.ok(renovado.ok, JSON.stringify(renovado));
  assert.equal(renovado.limite?.limite, 40);
  assert.equal((await facturas()).length, 8);
});

test("la vigencia de la fila sólo vale para el plan que tiene la columna", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { vigenciaDeLaFila } = await import("@/lib/facturacion/plan-factoque.server");
  const fila = { antes: {}, despues: { plan: "factoque-plus", vigenciaHasta: "2020-01-31" } };
  assert.equal(vigenciaDeLaFila(fila, "factoque-plus"), "2020-01-31");
  assert.equal(vigenciaDeLaFila(fila, "factoque-pro"), null, "la columna se escribió por otra puerta: sin vencimiento");
  assert.equal(vigenciaDeLaFila(null, "factoque-plus"), null);
});
