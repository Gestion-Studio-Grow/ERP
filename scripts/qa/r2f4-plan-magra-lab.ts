// ============================================================================
// R2-F4 en el LABORATORIO (erp_lab, Postgres local): magra Micro → PyME → Micro con la escritura
// real de la consola, y al final se deja magra como estaba. Nunca contra Neon.
//   node --import tsx scripts/qa/r2f4-plan-magra-lab.ts [negocio=magra] [plan de base=micro] [plan alto=pyme]
// Criterio: mismos conteos por tabla, mismas pantallas al volver, la vista previa es lo que queda.
// ============================================================================

import pg from "pg";
import { ROL_APP, urlDelServidor, urlDeRol } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const BASE = "erp_lab";
const [SLUG = "magra", PLAN_BASE = "micro", PLAN_ALTO = "pyme"] = process.argv.slice(2);
// En erp_lab las tablas son de `postgres` (lo que en Neon es neondb_owner): la consola escribe con ese rol.
const ROL_OPERADOR_LAB = "postgres";
const servidor = urlDelServidor();
if (!/localhost|\/tmp\/pgrun|127\.0\.0\.1/.test(servidor)) throw new Error(`Sólo contra el Postgres local (llegó ${servidor}).`);
Object.assign(process.env, {
  DATABASE_URL: urlDeRol(servidor, ROL_APP, BASE),
  OPERATOR_DATABASE_URL: urlDeRol(servidor, ROL_OPERADOR_LAB, BASE),
  MIGRATE_DATABASE_URL: urlDeRol(servidor, ROL_OPERADOR_LAB, BASE),
  RLS_ENFORCEMENT: "on",
});
for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED"]) delete process.env[v];

const dueno = new pg.Client({ connectionString: urlDeRol(servidor, ROL_OPERADOR_LAB, BASE) });

async function conteos(tenantId: string): Promise<Record<string, number>> {
  const { rows } = await dueno.query<{ t: string }>(
    `SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId' ORDER BY 1`,
  );
  const out: Record<string, number> = {};
  for (const { t } of rows) {
    if (t === "AuditLog") continue;
    out[t] = Number((await dueno.query(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, [tenantId])).rows[0].n);
  }
  return out;
}

async function main() {
  await dueno.connect();
  prepararAccionesDeServidor();
  const escritura = await import("@/lib/operador/plan-escritura.server");
  const plan = await import("@/app/operador/(console)/tenants/[id]/plan-del-negocio");
  const { catalogo } = await import("@/modules/catalog");
  const { diferenciasDeConteo } = await import("@/modules/perfil-datos");
  const flags = { registroGlobal: true, enInicioPorApps: true };
  const fallas: string[] = [];
  const check = (ok: boolean, que: string) => {
    console.log(`${ok ? "OK   " : "FALLA"} ${que}`);
    if (!ok) fallas.push(que);
  };

  const fila = (await dueno.query(`SELECT id, plan, modules, profile FROM "Tenant" WHERE slug = $1`, [SLUG])).rows[0];
  if (!fila) throw new Error(`No está ${SLUG} en ${BASE}.`);
  const id: string = fila.id;
  const original = { plan: fila.plan as string | null, modules: fila.modules as string[], profile: fila.profile as string | null };
  console.log(`${BASE} / ${SLUG} (${id}) al empezar: plan=${original.plan ?? "sin plan"} · ${original.modules.length} módulos · perfil ${original.profile}`);
  const conteosAlEmpezar = await conteos(id);
  console.log(`tablas con tenantId: ${Object.keys(conteosAlEmpezar).length} · filas del negocio: ${Object.values(conteosAlEmpezar).reduce((a, b) => a + b, 0)}`);

  async function vista(p: string) {
    const n = await escritura.leerNegocioParaPlan(id);
    if (!n) throw new Error("el negocio no se pudo leer");
    const filas = await escritura.leerFilasDeLimites(id);
    return { n, previa: plan.vistaPreviaDePlan(n, p, flags, catalogo(), filas) };
  }
  async function aplicar(p: string) {
    const { n, previa } = await vista(p);
    if (!previa.ok) return { previa, r: { tipo: "sin-vista-previa", motivo: previa.motivo } as const };
    const r = await escritura.escribirPlanConCandado({ tenantId: id, leido: { plan: n.plan, modules: n.modules, profile: n.profile }, previa, operador: "qa-r2f4-lab" });
    return { previa, r };
  }
  const apps = (p: { ok: boolean } & Record<string, unknown>) =>
    p.ok ? (p as unknown as { appsDespues: { id: string }[] }).appsDespues.map((a) => a.id).sort() : [];

  try {
    const micro = await aplicar(PLAN_BASE);
    check(micro.r.tipo === "ok", `${original.plan ?? "sin plan"} → ${PLAN_BASE}: ${JSON.stringify(micro.r)}`);
    if (micro.r.tipo !== "ok" || !micro.previa.ok) return fallas;
    const conteosMicro = await conteos(id);
    check(diferenciasDeConteo(conteosAlEmpezar, conteosMicro).length === 0, `pasar a ${PLAN_BASE} no cambió ninguna fila de datos`);
    const modulosMicro = [...micro.previa.despues.modules].sort();
    const appsMicro = apps(micro.previa);
    const releidaMicro = await vista(PLAN_BASE);
    check(releidaMicro.previa.ok && releidaMicro.previa.sinCambios, `la vista previa de ${PLAN_BASE} es lo que quedó en la base`);

    const pyme = await aplicar(PLAN_ALTO);
    check(pyme.r.tipo === "ok", `${PLAN_BASE} → ${PLAN_ALTO}: ${JSON.stringify(pyme.r)}`);
    if (pyme.previa.ok) console.log(`  ${PLAN_ALTO} gana ${pyme.previa.alAplicar.gana.length} apps y pierde ${pyme.previa.alAplicar.pierde.length}: gana [${pyme.previa.alAplicar.gana.map((a) => a.id).join(", ")}]`);
    const releidaPyme = await vista(PLAN_ALTO);
    check(releidaPyme.previa.ok && releidaPyme.previa.sinCambios, `la vista previa de ${PLAN_ALTO} es lo que quedó en la base`);
    check(diferenciasDeConteo(conteosMicro, await conteos(id)).length === 0, `pasar a ${PLAN_ALTO} no cambió ninguna fila de datos`);

    const vuelta = await aplicar(PLAN_BASE);
    check(vuelta.r.tipo === "ok", `${PLAN_ALTO} → ${PLAN_BASE}: ${JSON.stringify(vuelta.r)}`);
    if (vuelta.previa.ok) {
      check(JSON.stringify([...vuelta.previa.despues.modules].sort()) === JSON.stringify(modulosMicro), `vuelve con los mismos módulos (${modulosMicro.length})`);
      check(JSON.stringify(apps(vuelta.previa)) === JSON.stringify(appsMicro), `vuelve con las mismas pantallas (${appsMicro.length} apps)`);
    }
    const dif = diferenciasDeConteo(conteosMicro, await conteos(id));
    check(dif.length === 0, `mismos conteos por tabla al volver (${Object.keys(conteosMicro).length} tablas)${dif.length ? " " + JSON.stringify(dif) : ""}`);
  } finally {
    // Se deja magra como estaba (sólo si nadie más la tocó en el medio).
    await dueno.query(`UPDATE "Tenant" SET plan = $2, modules = $3, profile = $4 WHERE id = $1 AND plan = $5`, [id, original.plan, original.modules, original.profile, PLAN_BASE]);
    const fin = (await dueno.query(`SELECT plan, modules, profile FROM "Tenant" WHERE id = $1`, [id])).rows[0];
    check(fin.plan === original.plan && JSON.stringify(fin.modules) === JSON.stringify(original.modules) && fin.profile === original.profile, `${SLUG} quedó como estaba al empezar`);
    check(diferenciasDeConteo(conteosAlEmpezar, await conteos(id)).length === 0, `ninguna tabla de ${SLUG} ganó ni perdió filas en todo el recorrido`);
    const aud = await dueno.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND actor = 'operator:qa-r2f4-lab' AND action = 'tenant.plan.aplicar'`, [id]);
    console.log(`auditoría: ${aud.rows[0].n} cambios de plan registrados con el actor operator:qa-r2f4-lab (acumulado de corridas)`);
  }
  return fallas;
}

main()
  .then(async (fallas) => {
    const [{ basePrisma }, { operatorPrisma }] = await Promise.all([import("@/lib/prisma-base"), import("@/lib/operator-db")]);
    await Promise.all([basePrisma.$disconnect(), operatorPrisma.$disconnect(), dueno.end()]);
    console.log(fallas.length === 0 ? "RESULTADO: todo OK" : `RESULTADO: ${fallas.length} falla(s)`);
    process.exit(fallas.length === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
