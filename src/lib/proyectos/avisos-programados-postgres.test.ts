// LOS AVISOS DIARIOS DE UNA PRODUCTORA Y LA TABLA DEL SEGUNDO PASO, contra una base migrada de verdad.
//
// Se ejecuta la ruta REAL del cron. Sólo la productora recibe avisos, una cuota prevista no avisa y una segunda corrida no repite.
// Corre también con PGlite (`node scripts/qa/p1-pglite.mjs <este archivo>`): ahí toda conexión es superusuario, por eso el
// aislamiento se comprueba con `SET LOCAL ROLE`, que sí pasa por las políticas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, ROL_APP, type NegocioDePrueba } from "@/test/base-efimera";

const DIA_MS = 86_400_000;

test("cron diario sólo a la productora, sin previstas ni repetidos; segundo paso aislado por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = env.CRON_SECRET;
  env.CRON_SECRET = "secreto-del-cron-qa";
  t.after(() => {
    if (antes === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = antes;
  });

  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  await duenio.tenant.update({ where: { id: a.id }, data: { blueprintId: "productora" } });

  const armar = async (n: NegocioDePrueba) => {
    const p = await duenio.proyecto.create({ data: { tenantId: n.id, numero: 1, clientId: n.clientes[0], nombre: `Stand de ${n.slug}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaEvento: new Date(Date.now() + 30 * DIA_MS) } });
    const venceEl = new Date(Date.now() + DIA_MS);
    const cuota = { tenantId: n.id, proyectoId: p.id, monto: 100, venceEl };
    await duenio.proyectoCuota.createMany({
      data: [
        { ...cuota, tipo: "COBRO", concepto: "Anticipo" },
        { ...cuota, tipo: "COBRO", concepto: "Sin confirmar", prevista: true },
        { ...cuota, tipo: "PAGO", concepto: "Ya pagada", pagadoEl: new Date() },
        { ...cuota, tipo: "PAGO", concepto: "Muy lejos", venceEl: new Date(Date.now() + 20 * DIA_MS) },
      ],
    });
  };
  await armar(a);
  await armar(b);

  const { GET } = await import("@/app/api/cron/reminders/route");
  const { NextRequest } = await import("next/server");
  const correr = async () => {
    const res = await GET(new NextRequest("http://erp.test/api/cron/reminders", { headers: { authorization: "Bearer secreto-del-cron-qa" } }));
    assert.equal(res.status, 200);
    return (await res.json()) as { avisosProyectos: { negocios: number; fallas: number } };
  };

  assert.deepEqual((await correr()).avisosProyectos, { negocios: 1, fallas: 0 });
  const avisos = await duenio.proyectoAviso.findMany({ where: { tipo: "vencimiento" } });
  assert.equal(avisos.length, 1, "sólo la cuota real y por vencer, y sólo al dueño de la productora");
  assert.equal(avisos[0].tenantId, a.id);
  assert.equal(avisos[0].destinatario, a.duenia.id);
  assert.match(avisos[0].texto, /cobro «Anticipo» vence el/);

  await correr();
  assert.equal(await duenio.proyectoAviso.count({ where: { tipo: "vencimiento" } }), 1, "la segunda corrida no repite");

  // La tabla del segundo paso, mirada con el rol de la app.
  await duenio.proyectoSegundoFactor.create({ data: { tenantId: a.id, userId: a.duenia.id, secreto: "cifrado" } });

  // Por la conexión de la app: en un Postgres real el dueño no es miembro de `app_rls` y no puede
  // `SET ROLE`; como `app_rls`, pasarse a sí mismo vale siempre (y en PGlite, superusuario, también).
  const pg = (await import("pg")).default;
  const verComo = async (tenantId: string) => {
    const c = new pg.Client({ connectionString: base.urlApp });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${ROL_APP}`);
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const filas = await c.query<{ n: string }>('SELECT count(*) AS n FROM "ProyectoSegundoFactor"');
      await c.query("ROLLBACK");
      return Number(filas.rows[0].n);
    } finally {
      await c.end();
    }
  };
  assert.equal(await verComo(a.id), 1);
  assert.equal(await verComo(b.id), 0);

  // Y ninguna tabla del módulo quedó sin política.
  const sueltas = await duenio.$queryRaw<{ t: string }[]>`
    SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'Proyecto%' AND NOT c.relrowsecurity`;
  assert.deepEqual(sueltas, []);
});
