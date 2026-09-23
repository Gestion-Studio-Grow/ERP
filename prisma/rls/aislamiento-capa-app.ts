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
// MIS LOCALES, ESCRITURA (tercera parte, ola 3): el traslado entre dos negocios en UNA
// transacción con dos fases de GUC (`trasladoTransaction`), su idempotencia con un doble clic
// real (dos transacciones a la vez con la misma clave), el rechazo de una escritura en la fase
// equivocada (WITH CHECK, sólo con `app_rls`), el "otro CUIT es una venta", la exclusión de la
// merma y el empuje del catálogo de la casa a un local. Siembra productos "qa …" en los negocios
// `qa-ml-*` y los deja en un estado conocido en cada corrida.
//
// MIS LOCALES (segunda parte): los ataques a la red de locales, que es el ÚNICO camino por el
// que un negocio lee datos de otro. Corren con el código real (multilocal-core.ts: el vínculo
// de la consola, la lectura de la red y la pasada por local) y valen con los dos roles; los que
// dependen de la base (RLS) sólo se afirman con un rol NO exento:
//   DATABASE_URL=postgresql://app_rls@... RLS_ENFORCEMENT=on npx tsx prisma/rls/aislamiento-capa-app.ts
// Con `app_rls` la primera parte no aplica (mide la app con RLS fuera de juego y sin GUC no ve
// nada) y se saltea diciéndolo. Siembra negocios de prueba con slug `qa-ml-*` (idempotente).

import { randomUUID } from "node:crypto";
import { basePrisma, RLS_ENFORCEMENT } from "../../src/lib/prisma-base";
import { prisma } from "../../src/lib/db";
import { tenantTransaction, trasladoTransaction } from "../../src/lib/rls";
import { clasificarAjuste } from "../../src/lib/stock/merma-core";
import {
  SIN_TRASLADOS,
  TRASLADO_ACTOR_PREFIX,
  TrasladoRechazado,
  claveDeProducto,
  trasladarEnFases,
  validarUbicaciones,
  type ContextoTraslado,
  type Ubicacion,
} from "../../src/lib/multilocal/traslado-core";
import { empujarEnTx, leerCatalogo, listaDeLaCasa, planDelLocal } from "../../src/lib/multilocal/catalogo-marca-core";
import { AltaEnRedRechazada, sumarAltaEnTx } from "../../src/lib/multilocal/multilocal-core";
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
  if (exento || RLS_ENFORCEMENT) await escrituraMisLocales(exento);
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

// ── Mis locales, escritura (ola 3) ───────────────────────────────────────────

const CUIT_QA = "20304050607";
const OTRO_CUIT_QA = "27111111113";
const ACTOR_TRASLADO = "qa-aislamiento";

/** Deja un producto "qa …" de un negocio con el stock y el precio pedidos (dato de prueba). */
async function productoQa(tenantId: string, name: string, datos: { stock: number; pricePerKg: number | null }) {
  return tenantTransaction(
    async (tx) => {
      const previo = await tx.product.findFirst({ where: { tenantId, name }, select: { id: true } });
      const data = { stock: datos.stock, pricePerKg: datos.pricePerKg, saleUnit: "WEIGHT" as const, unit: "kg", active: true, deletedAt: null, trackStock: true };
      if (previo) return (await tx.product.update({ where: { id: previo.id }, data, select: { id: true } })).id;
      return (await tx.product.create({ data: { tenantId, name, ...data }, select: { id: true } })).id;
    },
    { tenantId },
  );
}

const stockQa = (tenantId: string, id: string) =>
  tenantTransaction(async (tx) => (await tx.product.findFirst({ where: { tenantId, id }, select: { stock: true } }))?.stock ?? null, { tenantId });

async function escrituraMisLocales(exento: boolean) {
  console.log(`\nMIS LOCALES, ESCRITURA — rol ${exento ? "exento de RLS" : "NO exento (RLS en juego)"} · RLS_ENFORCEMENT=${RLS_ENFORCEMENT ? "on" : "off"}\n`);
  const ids = Object.fromEntries(
    await Promise.all(
      (["casa", "local1", "local2"] as const).map(async (k) => [k, (await basePrisma.tenant.findUniqueOrThrow({ where: { slug: QA[k].slug }, select: { id: true } })).id]),
    ),
  ) as Record<"casa" | "local1" | "local2", string>;
  // CUIT de prueba: la casa y el local 1 comparten; el local 2 es de otro CUIT (una franquicia).
  await basePrisma.tenant.update({ where: { id: ids.casa }, data: { arcaCuit: CUIT_QA } });
  await basePrisma.tenant.update({ where: { id: ids.local1 }, data: { arcaCuit: CUIT_QA } });
  await basePrisma.tenant.update({ where: { id: ids.local2 }, data: { arcaCuit: OTRO_CUIT_QA } });
  await basePrisma.$transaction((tx) => vincularEnTx(tx, { casaId: ids.casa, localId: ids.local1, alias: "qa Local 1", actor: ACTOR }, () => false));
  await basePrisma.$transaction((tx) => vincularEnTx(tx, { casaId: ids.casa, localId: ids.local2, alias: "qa Local 2", actor: ACTOR }, () => false));
  // Estado conocido: se borra lo que dejaron las corridas anteriores en estos negocios de prueba.
  for (const id of Object.values(ids)) {
    await tenantTransaction(
      async (tx) => {
        await tx.stockMovement.deleteMany({ where: { tenantId: id, createdBy: { startsWith: "traslado:user:qa" } } });
        await tx.stockMovement.deleteMany({ where: { tenantId: id, createdBy: "user:qa-merma" } });
        await tx.auditLog.deleteMany({ where: { tenantId: id, actor: { startsWith: "traslado:user:qa" } } });
        await tx.auditLog.deleteMany({ where: { tenantId: id, actor: "casa:qa" } });
      },
      { tenantId: id },
    );
  }
  const vacioCasa = await productoQa(ids.casa, "qa Vacío", { stock: 25, pricePerKg: 12000 });
  const vacioLocal = await productoQa(ids.local1, "qa vacio", { stock: 0, pricePerKg: 11000 });
  await productoQa(ids.casa, "qa Asado", { stock: 5, pricePerKg: 9000 });

  const red = await localesDeLaRed(puertos, ids.casa);
  const ubicaciones: Ubicacion[] = [
    { id: ids.casa, nombre: "qa casa", esCasa: true, cuit: CUIT_QA },
    ...red.map((l) => ({ id: l.localTenantId, nombre: l.alias, esCasa: false, cuit: l.arcaCuit })),
  ];
  const ctx = (clave: string, destino: string, kg: number): ContextoTraslado => {
    const v = validarUbicaciones(ubicaciones, ids.casa, destino);
    if (!v.ok) throw new Error(v.error);
    return {
      pedido: { clave, origen: ids.casa, destino, lineas: [{ producto: claveDeProducto("qa Vacío", "WEIGHT"), saleUnit: "WEIGHT", cantidad: kg }], nota: null },
      origen: v.origen,
      destino: v.destino,
      casa: "qa casa",
      usuarioId: ACTOR_TRASLADO,
      por: "qa",
      ahora: new Date(),
    };
  };
  const trasladar = (c: ContextoTraslado) => trasladoTransaction({ origen: c.origen.id, destino: c.destino.id }, (f) => trasladarEnFases(f, c));

  // 1) 10 kg del obrador al local 1: uno baja 10 y el otro sube 10, en una sola transacción.
  const clave = randomUUID();
  const t0 = Date.now();
  const r1 = await trasladar(ctx(clave, ids.local1, 10));
  const [casaDespues, localDespues] = [await stockQa(ids.casa, vacioCasa), await stockQa(ids.local1, vacioLocal)];
  chequear("traslado de 10 kg: el obrador baja 10 y el local sube 10", !r1.yaEstaba && casaDespues === 15 && localDespues === 10, `casa ${casaDespues} · local ${localDespues} (${Date.now() - t0} ms)`);

  // 2) La misma clave otra vez (un reintento): "ya estaba", nada se mueve de nuevo.
  const r2 = await trasladar(ctx(clave, ids.local1, 10));
  const [casa2, local2] = [await stockQa(ids.casa, vacioCasa), await stockQa(ids.local1, vacioLocal)];
  chequear("la misma clave otra vez → ya estaba, sin moverse", r2.yaEstaba && casa2 === 15 && local2 === 10, `casa ${casa2} · local ${local2}`);

  // 3) Doble clic real: dos transacciones A LA VEZ con la misma clave → un solo traslado.
  const doble = randomUUID();
  const t1 = Date.now();
  const ambos = await Promise.allSettled([trasladar(ctx(doble, ids.local1, 5)), trasladar(ctx(doble, ids.local1, 5))]);
  const [casa3, local3] = [await stockQa(ids.casa, vacioCasa), await stockQa(ids.local1, vacioLocal)];
  const salidas = await tenantTransaction(
    (tx) => tx.stockMovement.count({ where: { tenantId: ids.casa, createdBy: { startsWith: "traslado:user:qa" }, reason: { contains: doble.replace(/-/g, "").slice(0, 8).toUpperCase() } } }),
    { tenantId: ids.casa },
  );
  chequear(
    "doble clic (dos a la vez, misma clave) → un solo traslado",
    ambos.every((x) => x.status === "fulfilled") && salidas === 1 && casa3 === 10 && local3 === 15,
    `${ambos.map((x) => (x.status === "fulfilled" ? (x.value.yaEstaba ? "ya estaba" : "trasladó") : `falló: ${String((x as PromiseRejectedResult).reason).slice(0, 60)}`)).join(" / ")} · salidas ${salidas} · casa ${casa3} · local ${local3} (${Date.now() - t1} ms)`,
  );

  // 4) Otro CUIT: es una venta, no un traslado.
  const venta = validarUbicaciones(ubicaciones, ids.casa, ids.local2);
  chequear("al local con otro CUIT → rechazo 'es una venta'", !venta.ok && /es una venta/.test(venta.error), venta.ok ? "LO DEJÓ" : venta.error);

  // 5) El destino no tiene el producto → no se mueve NADA (la salida del origen se deshace).
  const sinProducto = { ...ctx(randomUUID(), ids.local1, 3), destino: { id: ids.local2, nombre: "qa Local 2", esCasa: false, cuit: CUIT_QA } };
  let rechazo = "";
  try {
    await trasladoTransaction({ origen: ids.casa, destino: ids.local2 }, (f) => trasladarEnFases(f, { ...sinProducto, pedido: { ...sinProducto.pedido, destino: ids.local2 } }));
  } catch (e) {
    rechazo = e instanceof TrasladoRechazado ? e.message : `otro error: ${(e as Error).message}`;
  }
  const casa5 = await stockQa(ids.casa, vacioCasa);
  chequear("si el destino no tiene el producto, lo que salió del origen vuelve", /no tiene/.test(rechazo) && casa5 === 10, `${rechazo.slice(0, 70)} · casa ${casa5}`);

  // 6) El traslado no es merma: la salida del obrador queda excluida del tablero.
  const ajuste = await tenantTransaction(
    (tx) => tx.stockMovement.findFirst({ where: { tenantId: ids.casa, type: "AJUSTE", createdBy: { startsWith: "traslado:user:qa" } }, select: { productId: true, qty: true, reason: true, createdBy: true, unitCost: true } }),
    { tenantId: ids.casa },
  );
  const clase = ajuste ? clasificarAjuste(ajuste) : null;
  chequear("la salida del traslado no aparece como merma", clase?.clase === "EXCLUIDO" && "porQue" in clase && clase.porQue === "traslado", JSON.stringify(clase));
  // La lista "Ajustes recientes" de Mermas (ajustes-loader.ts) lee los AJUSTE del negocio. Con el
  // pedazo de where `SIN_TRASLADOS` (el cambio pedido para ese archivo) sale TODO menos los traslados:
  // una merma de verdad (dato de prueba, sin tocar el stock) tiene que seguir apareciendo.
  await tenantTransaction(
    (tx) =>
      tx.stockMovement.create({
        data: { tenantId: ids.casa, productId: vacioCasa, type: "AJUSTE", qty: -0.5, balanceAfter: 0, reason: "qa merma", createdBy: "user:qa-merma" },
      }),
    { tenantId: ids.casa },
  );
  const ajustes = (sinTraslados: boolean) =>
    tenantTransaction(
      (tx) =>
        tx.stockMovement.findMany({
          where: { tenantId: ids.casa, type: "AJUSTE", ...(sinTraslados ? SIN_TRASLADOS : {}) },
          select: { createdBy: true },
        }),
      { tenantId: ids.casa },
    );
  const [todos, sinTraslados] = await Promise.all([ajustes(false), ajustes(true)]);
  const esTraslado = (m: { createdBy: string }) => m.createdBy.startsWith(TRASLADO_ACTOR_PREFIX);
  chequear(
    "la lista de ajustes con SIN_TRASLADOS deja afuera los traslados y nada más",
    todos.some(esTraslado) &&
      !sinTraslados.some(esTraslado) &&
      sinTraslados.some((m) => m.createdBy === "user:qa-merma") &&
      sinTraslados.length === todos.filter((m) => !esTraslado(m)).length,
    `${todos.length} ajustes (${todos.filter(esTraslado).length} de traslados) → ${sinTraslados.length} sin traslados`,
  );

  // 7) Una escritura en la fase equivocada revienta el WITH CHECK y no deja nada.
  await (exento
    ? Promise.resolve(console.log("—     escritura en la fase equivocada → WITH CHECK — SALTEADO: el rol está exento de RLS"))
    : (async () => {
        const marca = `qa.fase-equivocada.${randomUUID()}`;
        let error = "";
        try {
          await trasladoTransaction({ origen: ids.casa, destino: ids.local1 }, async (f) => {
            await f.enOrigen((tx) => tx.auditLog.create({ data: { tenantId: ids.casa, actor: "qa", action: marca, entity: "Traslado" } }));
            await f.enOrigen((tx) => tx.auditLog.create({ data: { tenantId: ids.local1, actor: "qa", action: marca, entity: "Traslado" } }));
          });
        } catch (e) {
          error = (e as Error).message;
        }
        const quedaron = await tenantTransaction((tx) => tx.auditLog.count({ where: { tenantId: ids.casa, action: marca } }), { tenantId: ids.casa });
        chequear(
          "escribir la fila del destino en la fase del origen → la base la rechaza y no queda nada",
          /row-level security|violates|42501/i.test(error) && quedaron === 0,
          `${error.split("\n").find((l) => /row-level|violates/i.test(l))?.trim().slice(0, 90) ?? error.slice(0, 90)} · filas que quedaron: ${quedaron}`,
        );
      })());

  // 8) El catálogo de la casa, empujado al local 1: cambia el precio, crea lo que falta, y la
  //    segunda vez no escribe nada. Cada escritura con el GUC del local. Sin vista previa (huella
  //    null, lo que usa el alta) no se le pisa nada a un local que ya tiene su catálogo; con la
  //    huella de la vista previa (lo que manda la pantalla de la casa), sí.
  const lista = listaDeLaCasa(await tenantTransaction((tx) => leerCatalogo(tx, ids.casa), { tenantId: ids.casa }));
  // (El "qa vacio" del local arranca cada corrida en 11000, sembrado arriba: la casa lo tiene a 12000.)
  const empujar = (huella: string | null) =>
    tenantTransaction(
      (tx) => empujarEnTx(tx, { tenantId: ids.local1, lista, huella, actor: "casa:qa", casa: { id: ids.casa, nombre: "qa casa" }, por: "qa", lote: randomUUID() }),
      { tenantId: ids.local1 },
    );
  const sinVista = await empujar(null);
  const precioSinVista = (await tenantTransaction((tx) => leerCatalogo(tx, ids.local1), { tenantId: ids.local1 })).find((p) => p.id === vacioLocal)?.pricePerKg;
  chequear(
    "sin vista previa no se le pisa el precio a un local con catálogo propio",
    sinVista.estado === "no-aplicable" && precioSinVista === 11000,
    `${sinVista.estado} · vacío sigue en ${precioSinVista}`,
  );
  const vistaPrevia = await tenantTransaction((tx) => planDelLocal(tx, ids.local1, lista), { tenantId: ids.local1 });
  const e1 = await empujar(vistaPrevia.huella);
  const catalogoLocal = await tenantTransaction((tx) => leerCatalogo(tx, ids.local1), { tenantId: ids.local1 });
  const vacio = catalogoLocal.find((p) => p.id === vacioLocal);
  const asado = catalogoLocal.find((p) => p.name === "qa Asado");
  chequear(
    "la lista de la casa en el local: el precio cambia y lo que faltaba se crea (sin stock)",
    (e1.estado === "aplicado" || e1.estado === "al-dia") && vacio?.pricePerKg === 12000 && asado?.pricePerKg === 9000 && asado?.stock === 0,
    `${e1.estado} · vacío ${vacio?.pricePerKg} · asado ${asado?.pricePerKg} (stock ${asado?.stock})`,
  );
  const e2 = await empujar(vistaPrevia.huella);
  chequear("la misma lista otra vez no escribe nada", e2.estado === "al-dia", e2.estado);

  // 9) El alta de un local que nace dentro de la red, por el camino de la consola: vínculo, CUIT
  //    y punto de venta, y la lista de la casa, en UNA transacción; con un punto de venta que ya
  //    usa otro negocio del mismo CUIT, no queda nada escrito.
  const nuevo = await basePrisma.tenant.upsert({
    where: { slug: "qa-ml-local-nuevo" },
    create: { slug: "qa-ml-local-nuevo", name: "qa local nuevo", modules: [], blueprintId: "generico" },
    update: { arcaCuit: null, arcaPuntoVenta: null },
    select: { id: true },
  });
  await basePrisma.tenant.update({ where: { id: ids.local1 }, data: { arcaPuntoVenta: 98 } });
  const fila = await tenantTransaction((tx) => tx.carteraCliente.findFirst({ where: { tenantId: ids.casa, clienteTenantId: nuevo.id, estado: "activa" } }), { tenantId: ids.casa });
  if (fila) await basePrisma.$transaction((tx) => darDeBajaEnTx(tx, { casaId: ids.casa, localId: nuevo.id, actor: ACTOR }));
  await tenantTransaction((tx) => tx.product.deleteMany({ where: { tenantId: nuevo.id, name: { startsWith: "qa " } } }), { tenantId: nuevo.id });
  const alta = (puntoVenta: string) =>
    basePrisma.$transaction(
      (tx) => sumarAltaEnTx(tx, { casaId: ids.casa, localId: nuevo.id, alias: "qa Nuevo", puntoVenta, actor: ACTOR, lote: randomUUID() }, () => false),
      { timeout: 20_000 },
    );
  let choque = "";
  try {
    await alta("98");
  } catch (e) {
    choque = e instanceof AltaEnRedRechazada ? e.message : `otro error: ${(e as Error).message}`;
  }
  const trasChoque = await basePrisma.tenant.findUniqueOrThrow({ where: { id: nuevo.id }, select: { arcaPuntoVenta: true } });
  const vinculoTrasChoque = await tenantTransaction(
    (tx) => tx.carteraCliente.count({ where: { tenantId: ids.casa, clienteTenantId: nuevo.id, estado: "activa" } }),
    { tenantId: ids.casa },
  );
  chequear(
    "alta en la red con un CUIT + punto de venta ya usado → rechazo y nada escrito",
    /ya lo usa «qa local 1»/.test(choque) && trasChoque.arcaPuntoVenta === null && vinculoTrasChoque === 0,
    `${choque.slice(0, 80)} · pv ${trasChoque.arcaPuntoVenta} · vínculos ${vinculoTrasChoque}`,
  );
  const t2 = Date.now();
  const ok = await alta("97");
  const productosNuevo = await tenantTransaction((tx) => leerCatalogo(tx, nuevo.id), { tenantId: nuevo.id });
  chequear(
    "alta en la red: vinculado, con CUIT y punto de venta, y con la lista de la casa",
    ok.puntoVenta === 97 && ok.cuit === CUIT_QA && ok.catalogo.estado === "aplicado" && productosNuevo.some((p) => p.name === "qa Vacío" && p.pricePerKg === 12000 && p.stock === 0),
    `pv ${ok.puntoVenta} · cuit ${ok.cuit} · lista ${ok.catalogo.estado} · ${productosNuevo.length} productos (${Date.now() - t2} ms)`,
  );
  const otraVez = await alta("97");
  chequear("reintentar el alta en la red no escribe nada nuevo", otraVez.catalogo.estado === "al-dia", otraVez.catalogo.estado);
  // Se deja la red como la espera la segunda parte en la próxima corrida (dos locales): el local
  // nuevo sale de la red por el camino de la consola (queda en baja, con su historia).
  await basePrisma.$transaction((tx) => darDeBajaEnTx(tx, { casaId: ids.casa, localId: nuevo.id, actor: ACTOR }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
