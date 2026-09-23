// Prueba de la SEGUNDA muralla: el candado de tenant en la capa de aplicación
// (src/lib/tenant-scope.ts), medido con RLS DELIBERADAMENTE FUERA DE JUEGO.
//
// Corre con el rol dueño de las tablas (exento de RLS), así que si algo bloquea el
// acceso cross-tenant acá, lo bloqueó la app y no la base. Es la contracara de
// aislamiento-ataque-db.mjs, que mide la muralla de abajo.
//
// Uso:
//   DATABASE_URL=... FORCE_TENANT_SLUG=beauty-spa npx tsx prisma/rls/aislamiento-capa-app.ts
//   (y lo mismo con RLS_ENFORCEMENT=on, para verificar que el candado sobrevive a
//    la extensión de RLS: la de RLS re-despacha sobre el cliente base, así que si
//    el candado quedara por dentro se saltearía sin hacer ruido.)
//
// MIS LOCALES (segunda parte): los ataques a la red de locales, que es el ÚNICO camino por el
// que un negocio lee datos de otro. Corren con el código real (multilocal-core.ts: el vínculo
// de la consola, la lectura de la red y la pasada por local) y valen con los dos roles; los que
// dependen de la base (RLS) sólo se afirman con un rol NO exento:
//   DATABASE_URL=postgresql://app_rls@... RLS_ENFORCEMENT=on npx tsx prisma/rls/aislamiento-capa-app.ts
// Con `app_rls` la primera parte no aplica (mide la app con RLS fuera de juego y sin GUC no ve
// nada) y se saltea diciéndolo. Siembra negocios de prueba con slug `qa-ml-*` (idempotente).

import { basePrisma, RLS_ENFORCEMENT } from "../../src/lib/prisma-base";
import { prisma } from "../../src/lib/db";
import { tenantTransaction } from "../../src/lib/rls";
import {
  consultaFilasDeLaRed,
  darDeBajaEnTx,
  decidirAcceso,
  elegirLocal,
  filaDeLaBase,
  localesDeLaRed,
  localesDeOtrasRedes,
  recolectarLocal,
  vincularEnTx,
  type ContextoPasada,
  type MetaLocal,
  type PuertosRed,
} from "../../src/lib/multilocal/multilocal-core";
import { lastClosedDayTx } from "../../src/lib/caja/frontera-cierre";
import { todayInBusinessTz } from "../../src/lib/datetime";

const A_SLUG = process.env.FORCE_TENANT_SLUG ?? "beauty-spa";
const B_SLUG = "tenant-b";

let fallas = 0;
function chequear(nombre: string, ok: boolean, detalle: string) {
  console.log(`${ok ? "OK  " : "FALLA"}  ${nombre} — ${detalle}`);
  if (!ok) fallas++;
}

/** ¿El rol de la conexión está exento de RLS (dueño de las tablas o BYPASSRLS)? */
async function rolExento(): Promise<{ rol: string; exento: boolean }> {
  const [r] = await basePrisma.$queryRaw<{ rol: string; exento: boolean }[]>`
    SELECT current_user AS rol, (rolsuper OR rolbypassrls) AS exento FROM pg_roles WHERE rolname = current_user`;
  return r;
}

async function main() {
  const { rol, exento } = await rolExento();
  if (exento) {
    await capaDeApp();
  } else {
    console.log(
      `\nPrimera parte SALTEADA: mide la capa de app con RLS fuera de juego y el rol ${rol} no está exento ` +
        "(sin GUC no ve nada). Correla aparte con el rol dueño.\n",
    );
  }
  await ataquesMisLocales(exento);
  await basePrisma.$disconnect();
  console.log(fallas === 0 ? "\nTodo bloqueado.\n" : `\n${fallas} FALLA(S)\n`);
  process.exit(fallas === 0 ? 0 : 1);
}

async function capaDeApp() {
  const a = await basePrisma.tenant.findUnique({ where: { slug: A_SLUG } });
  const b = await basePrisma.tenant.findUnique({ where: { slug: B_SLUG } });
  if (!a || !b) throw new Error(`faltan tenants: ${A_SLUG}=${!!a} ${B_SLUG}=${!!b}`);

  const clienteB = await basePrisma.client.findFirst({ where: { tenantId: b.id } });
  const turnoB = await basePrisma.appointment.findFirst({ where: { tenantId: b.id } });
  const totalClientes = await basePrisma.client.count();
  const clientesA = await basePrisma.client.count({ where: { tenantId: a.id } });

  console.log(
    `\nEscenario: ${totalClientes} clientes en la base, ${clientesA} del tenant A.` +
      `\nRLS_ENFORCEMENT=${RLS_ENFORCEMENT ? "on" : "off"} · rol: dueño de las tablas (RLS exento)\n`,
  );

  // 1) Listado sin where: el caso de getClients(), que hoy no filtra nada.
  const listado = await prisma.client.findMany({ orderBy: { name: "asc" } });
  chequear(
    "findMany sin where sólo trae el tenant propio",
    listado.length === clientesA && listado.every((c) => c.tenantId === a.id),
    `trajo ${listado.length} de ${totalClientes}`,
  );

  // 2) IDOR de lectura: id ajeno en la URL.
  const leido = await prisma.client.findUnique({ where: { id: clienteB!.id } });
  chequear(
    "findUnique con el id de un cliente ajeno devuelve null",
    leido === null,
    leido === null ? "null" : `devolvió ${leido.name}`,
  );

  // 3) IDOR de escritura: id ajeno en un campo del formulario.
  let bloqueado = false;
  let codigo = "";
  try {
    if (turnoB) {
      await prisma.appointment.update({
        where: { id: turnoB.id },
        data: { status: "CANCELLED" },
      });
    }
  } catch (e) {
    bloqueado = true;
    codigo = (e as { code?: string }).code ?? (e as Error).message.slice(0, 60);
  }
  chequear(
    "update sobre un turno ajeno no lo toca",
    bloqueado,
    bloqueado ? `rechazado (${codigo})` : "PASÓ: el turno ajeno se modificó",
  );
  if (turnoB) {
    const despues = await basePrisma.appointment.findUnique({ where: { id: turnoB.id } });
    chequear(
      "el turno ajeno quedó como estaba",
      despues?.status === turnoB.status,
      `${turnoB.status} → ${despues?.status}`,
    );
  }

  // 4) Borrado masivo sin where.
  const borrables = await prisma.cashMovement.count();
  const totalMovimientos = await basePrisma.cashMovement.count();
  chequear(
    "count sin where no cuenta los movimientos ajenos",
    borrables <= totalMovimientos && borrables === (await basePrisma.cashMovement.count({ where: { tenantId: a.id } })),
    `${borrables} de ${totalMovimientos}`,
  );

  // 5) Dentro de tenantTransaction el callback recibe un `tx` crudo, sin extensiones:
  //    es por donde escriben 87 operaciones del repo. Tiene que estar igual de atado.
  const dentroDeTx = await tenantTransaction(async (tx) => {
    const leido = await tx.client.findUnique({ where: { id: clienteB!.id } });
    const listado = await tx.client.findMany({});
    return { leido, listado: listado.length };
  });
  chequear(
    "dentro de tenantTransaction el id ajeno tampoco se lee",
    dentroDeTx.leido === null,
    dentroDeTx.leido === null ? "null" : `devolvió ${dentroDeTx.leido.name}`,
  );
  chequear(
    "dentro de tenantTransaction el listado sólo trae el tenant propio",
    dentroDeTx.listado === clientesA,
    `${dentroDeTx.listado} de ${totalClientes}`,
  );

  // 6) El candado no debe pisar un tenant puesto a propósito (workers por tenant).
  const explicito = await prisma.client.findMany({ where: { tenantId: b.id } });
  chequear(
    "un tenantId explícito del código se respeta",
    explicito.length > 0 && explicito.every((c) => c.tenantId === b.id),
    `${explicito.length} clientes de B leídos a propósito`,
  );
}

// ── Mis locales ──────────────────────────────────────────────────────────────

const QA = {
  casa: { slug: "qa-ml-casa", name: "qa casa de la red", modules: ["multilocal"] },
  local1: { slug: "qa-ml-local-1", name: "qa local 1", modules: [] as string[] },
  local2: { slug: "qa-ml-local-2", name: "qa local 2", modules: [] as string[] },
  ajeno: { slug: "qa-ml-ajeno", name: "qa negocio ajeno", modules: [] as string[] },
  otraCasa: { slug: "qa-ml-otra-casa", name: "qa otra casa", modules: ["multilocal"] },
  estudio: { slug: "qa-ml-estudio", name: "qa estudio contable", modules: ["cartera"] },
};
const MARCA_QA = "qa:multilocal";
const ACTOR = "operator:qa-aislamiento";

/** Los mismos puertos que multilocal-actions.ts: la red con el GUC de la casa, cada local con el suyo. */
const puertos: PuertosRed = {
  filasDeLaRed: async (casaId) =>
    (await tenantTransaction((tx) => tx.carteraCliente.findMany(consultaFilasDeLaRed(casaId)), { tenantId: casaId })).map(
      filaDeLaBase,
    ),
  metaDeLocales: async (ids) => {
    const ts = await basePrisma.tenant.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, slug: true, subdomain: true, arcaCuit: true, arcaPuntoVenta: true },
    });
    return new Map<string, MetaLocal>(
      ts.map((t) => [t.id, { nombre: t.name, slug: t.slug, subdomain: t.subdomain, arcaCuit: t.arcaCuit, arcaPuntoVenta: t.arcaPuntoVenta }]),
    );
  },
  enLocal: (id, fn) => tenantTransaction(fn, { tenantId: id }),
};

async function sembrar(): Promise<Record<keyof typeof QA, string>> {
  const ids = {} as Record<keyof typeof QA, string>;
  for (const [clave, t] of Object.entries(QA) as [keyof typeof QA, (typeof QA)[keyof typeof QA]][]) {
    const fila = await basePrisma.tenant.upsert({
      where: { slug: t.slug },
      create: { slug: t.slug, name: t.name, modules: t.modules, blueprintId: "generico" },
      update: { modules: t.modules },
      select: { id: true },
    });
    ids[clave] = fila.id;
  }
  // Una venta de hoy en el local 1 y otra, enorme, en el negocio ajeno: si la pasada del local
  // leyera de más, la cifra lo delata.
  for (const [id, monto] of [[ids.local1, 1234], [ids.ajeno, 99999]] as const) {
    await tenantTransaction(
      async (tx) => {
        await tx.cashMovement.deleteMany({ where: { tenantId: id, createdBy: MARCA_QA } });
        await tx.cashMovement.create({
          data: { tenantId: id, type: "VENTA", method: "EFECTIVO", amount: monto, reason: "qa multilocal", createdBy: MARCA_QA },
        });
      },
      { tenantId: id },
    );
  }
  return ids;
}

async function ataquesMisLocales(exento: boolean) {
  console.log(`\nMIS LOCALES — rol ${exento ? "exento de RLS (sólo capa de app)" : "NO exento (RLS en juego)"} · RLS_ENFORCEMENT=${RLS_ENFORCEMENT ? "on" : "off"}\n`);
  if (!exento && !RLS_ENFORCEMENT) {
    chequear("configuración", false, "con un rol no exento hace falta RLS_ENFORCEMENT=on (sin GUC no se ve nada)");
    return;
  }
  const ids = await sembrar();
  const soloRls = (nombre: string, ok: () => Promise<[boolean, string]>) =>
    exento ? Promise.resolve(console.log(`—     ${nombre} — SALTEADO: el rol está exento de RLS`)) : ok().then(([b, d]) => chequear(nombre, b, d));

  // 1) El vínculo, por el camino de la consola: fila con el GUC de la casa y auditoría en los dos.
  const t0 = Date.now();
  const v1 = await basePrisma.$transaction((tx) => vincularEnTx(tx, { casaId: ids.casa, localId: ids.local1, alias: "qa Local 1", actor: ACTOR }, () => false));
  const v2 = await basePrisma.$transaction((tx) => vincularEnTx(tx, { casaId: ids.casa, localId: ids.local2, alias: "qa Local 2", actor: ACTOR }, () => false));
  chequear("el operador vincula dos locales a la casa", v1.ok && v2.ok, `${v1.ok ? "ok" : v1.motivo} / ${v2.ok ? "ok" : v2.motivo} (${Date.now() - t0} ms)`);
  const auditoria = await Promise.all(
    [ids.casa, ids.local1, ids.local2].map((id) =>
      tenantTransaction((tx) => tx.auditLog.count({ where: { tenantId: id, actor: ACTOR, action: { startsWith: "multilocal." } } }), { tenantId: id }),
    ),
  );
  chequear("el vínculo queda en la auditoría de los tres negocios", auditoria.every((n) => n > 0), `casa/local1/local2: ${auditoria.join("/")}`);

  // 2) La casa sólo ve sus locales, y pide uno ajeno con el input manipulado → error.
  const red = await localesDeLaRed(puertos, ids.casa);
  const idsRed = red.map((l) => l.localTenantId).sort();
  chequear("la red de la casa son sus dos locales, leídos de SUS filas", JSON.stringify(idsRed) === JSON.stringify([ids.local1, ids.local2].sort()), idsRed.join(", "));
  const ajeno = elegirLocal(red, ids.ajeno);
  chequear("la casa pide un local ajeno (?local=<id>) → error", !ajeno.ok, ajeno.ok ? "LO DEVOLVIÓ" : ajeno.error);

  // 3) La pasada de un local lee sólo ese local: la venta enorme del ajeno no aparece.
  const ctx: ContextoPasada = { hoy: todayInBusinessTz(), leerFronteraCaja: lastClosedDayTx, leerCierres: async () => [] };
  const local1 = red.find((l) => l.localTenantId === ids.local1)!;
  const t1 = Date.now();
  const pasada = await tenantTransaction((tx) => recolectarLocal(tx, local1, ctx), { tenantId: ids.local1 });
  chequear("la pasada del local 1 cuenta sólo su venta de hoy", pasada.hoy.neto === 1234, `cobrado hoy ${pasada.hoy.neto} (${Date.now() - t1} ms)`);
  await soloRls("adentro de la transacción del local, una consulta cruda sólo ve ese local", async () => {
    const r = await tenantTransaction(
      (tx) => tx.$queryRaw<{ tenantId: string }[]>`SELECT DISTINCT "tenantId" FROM "CashMovement"`,
      { tenantId: ids.local1 },
    );
    return [r.length > 0 && r.every((x) => x.tenantId === ids.local1), r.map((x) => x.tenantId).join(", ") || "nada"];
  });

  // 4) Nadie más ve la red: ni el local, ni otra casa, ni una conexión sin GUC.
  await soloRls("el local no ve la red de la casa (CarteraCliente con su GUC)", async () => {
    const r = await tenantTransaction((tx) => tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "CarteraCliente"`, { tenantId: ids.local1 });
    return [r[0].n === 0, `${r[0].n} filas`];
  });
  await soloRls("otra casa pide las filas de esta casa por id → 0 filas", async () => {
    const r = await tenantTransaction((tx) => tx.carteraCliente.findMany({ where: { tenantId: ids.casa } }), { tenantId: ids.otraCasa });
    return [r.length === 0, `${r.length} filas`];
  });
  await soloRls("sin GUC la tabla de la red no muestra nada", async () => {
    const n = await basePrisma.carteraCliente.count();
    return [n === 0, `${n} filas`];
  });

  // 5) Las validaciones de la consola, contra la base real.
  const otraRed = await basePrisma.$transaction((tx) => vincularEnTx(tx, { casaId: ids.otraCasa, localId: ids.local1, actor: ACTOR }, () => false));
  chequear("un local que ya está en una red no entra en otra", !otraRed.ok, otraRed.ok ? "LO VINCULÓ" : otraRed.motivo);
  // La lista del formulario de la otra casa ya lo marca, con el nombre de su casa (misma lectura
  // con el GUC de cada casa: con app_rls, sin GUC no vería nada y lo ofrecería como libre).
  const marcados = await basePrisma.$transaction((tx) => localesDeOtrasRedes(tx, [ids.local1, ids.estudio], ids.otraCasa));
  chequear(
    "la consola de otra casa marca al local como ya vinculado, con su casa",
    marcados.size === 1 && (marcados.get(ids.local1) ?? []).some((c) => c.id === ids.casa),
    [...marcados].map(([id, casas]) => `${id} → ${casas.map((c) => c.name).join(", ")}`).join("; ") || "nada",
  );
  const estudio = await basePrisma.$transaction((tx) => vincularEnTx(tx, { casaId: ids.casa, localId: ids.estudio, actor: ACTOR }, () => false));
  chequear("un estudio contable no entra a una red", !estudio.ok, estudio.ok ? "LO VINCULÓ" : estudio.motivo);
  chequear(
    "un estudio no abre Mis locales, ni una casa el panel del contador",
    !decidirAcceso(QA.estudio.modules, "casa").ok && !decidirAcceso(QA.casa.modules, "estudio").ok,
    "decidirAcceso",
  );

  // 6) Escribir en la fase equivocada revienta (WITH CHECK): la auditoría del local con el GUC de la casa.
  await soloRls("escribir la fila de un local con el GUC de la casa → rechazo de la base", async () => {
    try {
      await basePrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${ids.casa}, true)`;
        await tx.auditLog.create({ data: { tenantId: ids.local1, actor: ACTOR, action: "qa.fase-equivocada", entity: "Tenant" } });
      });
      return [false, "SE ESCRIBIÓ"];
    } catch (e) {
      return [true, `rechazado (${(e as { code?: string }).code ?? (e as Error).message.slice(0, 50)})`];
    }
  });

  // 7) Un vínculo dado de baja → el local desaparece de la red en el acto.
  const baja = await basePrisma.$transaction((tx) => darDeBajaEnTx(tx, { casaId: ids.casa, localId: ids.local2, actor: ACTOR }));
  const despues = await localesDeLaRed(puertos, ids.casa);
  chequear(
    "un vínculo dado de baja → el local desaparece",
    baja.ok && despues.every((l) => l.localTenantId !== ids.local2) && !elegirLocal(despues, ids.local2).ok,
    `${despues.length} local(es) en la red`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
