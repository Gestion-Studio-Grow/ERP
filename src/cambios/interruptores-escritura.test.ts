// ============================================================================
// INTERRUPTORES — quién escribe la entidad (trinquete) y la escritura REAL contra Postgres.
// ============================================================================
//
// 1. TRINQUETE. Una fila de entity "Interruptor" prende algo en un negocio. Sólo la escribe la
//    consola: src/lib/operador/interruptores-escritura.server.ts (que importa únicamente la action
//    interruptores-actions.ts, detrás de requireOperator) y, cuando exista el alta integrada,
//    scripts/provision-tenant.ts. Se recorren los archivos REALES de src/ y scripts/; el detector
//    se prueba además contra código de ejemplo, para que no sea un test que nunca puede fallar.
//
// 2. CONTRA LA BASE. Con el Postgres local (erp_qa_apps en /tmp/pgrun): la app como `app_rls` con
//    RLS forzado y la consola con el rol dueño, igual que producción. Corre la escritura real de la
//    consola, la lectura real del panel (interruptores.server.ts, piloto.ts, contexto.server.ts),
//    `audit()` real con una fila forjada, y el aislamiento entre negocios. Crea sus negocios de
//    prueba (slug qa-2b-…) y los borra al terminar. Sin la base, se SALTEA diciéndolo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ── 1. Trinquete ─────────────────────────────────────────────────────────────

const RAIZ = process.cwd();

/** Los únicos archivos que pueden escribir la entidad, con el porqué. */
const ESCRITORES_PERMITIDOS: Record<string, string> = {
  "src/lib/operador/interruptores-escritura.server.ts": "la escritura condicional de la consola",
  "scripts/provision-tenant.ts": "el alta integrada (todavía no la escribe)",
};

/** Quién puede importar la escritura real. */
const IMPORTADORES_PERMITIDOS = new Set(["src/lib/operador/interruptores-actions.ts"]);

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "generated" ? [] : archivos(p);
    return /\.(ts|tsx|mts|mjs|js)$/.test(e.name) && !/\.test\.(ts|tsx|mts)$/.test(e.name) ? [p] : [];
  });
}

/** El código sin comentarios: nombrar la entidad en un comentario no es escribirla. */
function codigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Llamadas que escriben AuditLog: el cliente de Prisma, SQL crudo o las funciones de auditoría. */
const ESCRIBE_AUDITORIA =
  /auditLog\s*\.\s*(create|createMany|createManyAndReturn|upsert|update|updateMany)\s*\(|INSERT\s+INTO\s+"?AuditLog"?|\$executeRaw|\b(audit|auditAdmin|auditPublic)\s*\(/i;

/** Lo que identifica a la entidad o a la fila ya armada. */
const NOMBRA_INTERRUPTOR =
  /["'`]Interruptor["'`]|\bENTIDAD_INTERRUPTOR\b|\bfilaDeInterruptor\b|\bNuevaFilaDeInterruptor\b|\bDepsDeCambio\b|\bescribirSiSigueIgual\b/;

export function escribeInterruptor(src: string): boolean {
  const c = codigo(src);
  return ESCRIBE_AUDITORIA.test(c) && NOMBRA_INTERRUPTOR.test(c);
}

const TODOS = [...archivos(join(RAIZ, "src")), ...archivos(join(RAIZ, "scripts"))].map((p) => ({
  archivo: relative(RAIZ, p).split(sep).join("/"),
  src: readFileSync(p, "utf8"),
}));

test("el detector del trinquete marca las escrituras de la entidad y no las demás", () => {
  const marcados = [
    `await prisma.auditLog.create({ data: { tenantId, entity: "Interruptor", entityId: "inicio-por-apps" } });`,
    `await auditAdmin({ action: "interruptor.encender", entity: ENTIDAD_INTERRUPTOR, entityId: id });`,
    "await tx.$executeRaw`INSERT INTO \"AuditLog\" (entity) VALUES ('Interruptor')`;",
    `await tx.auditLog.create({ data: filaDeInterruptor({ tenantId, interruptor, accion, operador }) });`,
    `const d: DepsDeCambio = { escribirSiSigueIgual: (f) => tx.auditLog.create({ data: f }) };`,
  ];
  for (const s of marcados) assert.equal(escribeInterruptor(s), true, s);
  const limpios = [
    `await prisma.auditLog.create({ data: { entity: "Tenant" } });`,
    `// await prisma.auditLog.create({ data: { entity: "Interruptor" } });`,
    `const e = await prisma.auditLog.findMany({ where: { entity: ENTIDAD_INTERRUPTOR } });`,
  ];
  for (const s of limpios) assert.equal(escribeInterruptor(s), false, s);
});

test("TRINQUETE: nadie fuera de la consola escribe entity 'Interruptor'", () => {
  const escritores = TODOS.filter((f) => escribeInterruptor(f.src)).map((f) => f.archivo);
  const intrusos = escritores.filter((a) => !(a in ESCRITORES_PERMITIDOS));
  assert.deepEqual(intrusos, [], `escriben la entidad Interruptor fuera de la consola: ${intrusos.join(", ")}`);
  // Y el escritor de la consola sigue siendo detectado (si deja de serlo, el detector se rompió).
  assert.ok(escritores.includes("src/lib/operador/interruptores-escritura.server.ts"), escritores.join(", "));
});

test("TRINQUETE: la escritura real sólo la importa la action (detrás de la guardia del negocio)", () => {
  const importan = TODOS.filter((f) => /from\s+["'][^"']*interruptores-escritura\.server["']/.test(codigo(f.src))).map(
    (f) => f.archivo,
  );
  assert.deepEqual(importan.filter((a) => !IMPORTADORES_PERMITIDOS.has(a)), [], importan.join(", "));
  const action = TODOS.find((f) => f.archivo === "src/lib/operador/interruptores-actions.ts");
  assert.ok(action, "falta la action");
  assert.match(action.src, /^"use server";/);
  // Un solo endpoint, y lo primero que espera es la sesión de operador con el candado de CH
  // (el resto de las actions lo exige guardia-negocio.test.ts).
  const exportados = [...codigo(action.src).matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(exportados, ["cambiarInterruptor"]);
  const cuerpo = codigo(action.src).split("export async function cambiarInterruptor(formData: FormData) {")[1] ?? "";
  assert.ok(cuerpo.indexOf("await") >= 0, "la action no espera nada");
  assert.equal(
    cuerpo.indexOf("await requireOperadorParaNegocio({ id: tenantId })"),
    cuerpo.indexOf("await"),
    "la primera espera tiene que ser la guardia del negocio",
  );
});

// ── 2. Contra Postgres ───────────────────────────────────────────────────────

const DB = process.env.INTERRUPTORES_TEST_DB ?? "erp_qa_apps";
const OWNER_URL = `postgresql://postgres@localhost:5433/${DB}?host=/tmp/pgrun`;
const APP_URL = `postgresql://app_rls@localhost:5433/${DB}?host=/tmp/pgrun`;

test("contra Postgres (app_rls + RLS): prender, leer desde el panel, forjar, aislar y apagar", async (t) => {
  const e = process.env as Record<string, string | undefined>;
  Object.assign(e, {
    NODE_ENV: "development",
    DATABASE_URL: APP_URL,
    OPERATOR_DATABASE_URL: OWNER_URL,
    RLS_ENFORCEMENT: "on",
    MODULE_REGISTRY_ENABLED: "",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  // `server-only` lo resuelve Next (no está en node_modules); en Node se reemplaza por un módulo
  // vacío para poder importar los lectores de servidor tal cual corren en el panel.
  const Module = (await import("node:module")).default as unknown as {
    _resolveFilename: (req: string, ...rest: unknown[]) => string;
    _cache: Record<string, unknown>;
  };
  const resolverOriginal = Module._resolveFilename;
  Module._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? "\0server-only" : resolverOriginal.call(this, req, ...rest);
  };
  Module._cache["\0server-only"] = { id: "\0server-only", filename: "\0server-only", loaded: true, exports: {} };

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { basePrisma } = await import("@/lib/prisma-base");
  try {
    await operatorPrisma.$queryRaw`SELECT 1`;
    const rol = await basePrisma.$queryRaw<{ r: string; bypass: boolean }[]>`
      SELECT current_user AS r, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
    assert.equal(rol[0]?.bypass, false, "la app tiene que correr con un rol sin BYPASSRLS");
  } catch (err) {
    await operatorPrisma.$disconnect().catch(() => {});
    await basePrisma.$disconnect().catch(() => {});
    if (err instanceof assert.AssertionError) throw err;
    return t.skip(`sin Postgres local (${DB} en /tmp/pgrun): la escritura real queda SIN verificar`);
  }

  const { depsDeCambioReales } = await import("@/lib/operador/interruptores-escritura.server");
  const { cambiarInterruptorCon } = await import("./interruptores-core");
  const { interruptoresDelNegocio } = await import("./interruptores.server");
  const { enInicioPorApps } = await import("@/app/admin/(dashboard)/inicio/piloto");
  const { getContextoApps } = await import("@/apps/contexto.server");
  const { leerInterruptoresDe } = await import("@/app/operador/(console)/tenants/[id]/negocio.server");
  const { audit } = await import("@/lib/audit-core");
  const { prisma } = await import("@/lib/prisma");
  const { planFijarAsignacion, vistaPreviaDeCambio, motivoSiPierdeAppsConInicio } = await import(
    "@/app/operador/(console)/tenants/[id]/apps-del-negocio"
  );
  const { CANDADO_OCUPADO } = await import("@/lib/operador/corte-de-transaccion");
  const { bloquearAppsDelNegocio, escribirModulosConCandado, leerNegocioParaActivar } = await import(
    "@/app/operador/(console)/tenants/[id]/negocio.server"
  );
  const { trabajaPorApps, CAMBIO_MIENTRAS_MIRABAS } = await import("./interruptores-core");
  const { catalogo } = await import("@/modules/catalog");
  const { INICIO_POR_APPS } = await import("./interruptores");

  const FACU = { nombre: "facu", esDuenio: false };
  const sufijo = Date.now().toString(36);
  const slugs = { carniceria: `qa-2b-carniceria-${sufijo}`, otro: `qa-2b-otro-${sufijo}`, sinFijar: `qa-2b-sin-fijar-${sufijo}` };
  const BASE_CARNICERIA = ["pos", "catalog", "clients", "reports", "arca"];
  const fijar = planFijarAsignacion(
    { id: "x", slug: slugs.carniceria, blueprintId: "carniceria", modules: BASE_CARNICERIA, esMostrador: true, carniceriaLista: false, perfil: null },
    { registroGlobal: false, enInicioPorApps: false },
    catalogo(),
  );
  assert.ok(fijar.ok);
  const ids: string[] = [];
  const crear = async (slug: string, modules: string[]) => {
    const tn = await operatorPrisma.tenant.create({ data: { name: slug, slug, blueprintId: "carniceria", modules } });
    ids.push(tn.id);
    return tn;
  };
  const filasDe = (tenantId: string) =>
    operatorPrisma.auditLog.findMany({ where: { tenantId, entity: "Interruptor" }, orderBy: { createdAt: "asc" } });
  const comoPanel = async (slug: string) => {
    e.FORCE_TENANT_SLUG = slug;
    return {
      estado: (await interruptoresDelNegocio())[INICIO_POR_APPS].encendido,
      inicio: await enInicioPorApps(),
      gate: (await getContextoApps())?.origen ?? null,
    };
  };

  try {
    const carniceria = await crear(slugs.carniceria, fijar.despues);
    const otro = await crear(slugs.otro, fijar.despues);
    const sinFijar = await crear(slugs.sinFijar, BASE_CARNICERIA);
    const pedido = (tn: { id: string; modules: string[] }, accion: "encender" | "apagar") => ({
      tenantId: tn.id,
      interruptor: INICIO_POR_APPS,
      accion,
      visto: accion === "encender" ? "apagado" : "encendido",
      modulosVistos: tn.modules,
      slugTipeado: "",
    });

    // Recién creado: menú de siempre.
    assert.deepEqual(await comoPanel(slugs.carniceria), { estado: false, inicio: false, gate: null });

    // Fila forjada por la app del negocio. Primero por audit(): la rechaza y no escribe nada.
    e.FORCE_TENANT_SLUG = slugs.carniceria;
    await audit({ actor: "user:recepcion", action: "interruptor.encender", entity: "Interruptor", entityId: INICIO_POR_APPS, channel: "admin" });
    assert.equal((await filasDe(carniceria.id)).length, 0, "audit() no puede escribir un interruptor");
    // Después, salteando audit() con el cliente de la app (app_rls): la fila entra, pero no cuenta.
    await prisma.auditLog.create({
      data: { tenantId: carniceria.id, actor: "user:recepcion", action: "interruptor.encender", entity: "Interruptor", entityId: INICIO_POR_APPS, channel: "admin" },
    });
    assert.equal((await filasDe(carniceria.id)).length, 1);
    assert.deepEqual(await comoPanel(slugs.carniceria), { estado: false, inicio: false, gate: null });

    // Prender con la escritura REAL de la consola.
    const r = await cambiarInterruptorCon(depsDeCambioReales(), FACU, pedido(carniceria, "encender"));
    assert.deepEqual(r, { tipo: "hecho", interruptor: INICIO_POR_APPS, accion: "encender" });
    const escritas = await filasDe(carniceria.id);
    const ultima = escritas[escritas.length - 1];
    assert.equal(ultima.actor, "operator:facu");
    assert.equal(ultima.channel, "operador");
    assert.equal(ultima.action, "interruptor.encender");
    // La próxima carga del panel: Inicio por apps y gate por módulo (sin deploy).
    assert.deepEqual(await comoPanel(slugs.carniceria), { estado: true, inicio: true, gate: "piloto" });
    // El historial de la ficha: nombre y hora.
    const ficha = await leerInterruptoresDe(carniceria.id);
    assert.equal(ficha?.historial[0]?.quien, "facu");
    assert.ok(ficha?.historial[0]?.cuando instanceof Date);
    assert.equal(ficha?.historial.length, 1, "la fila forjada no figura en el historial");

    // Aislamiento: el otro negocio no se enteró (RLS + filtro por tenant).
    assert.deepEqual(await comoPanel(slugs.otro), { estado: false, inicio: false, gate: null });
    e.FORCE_TENANT_SLUG = slugs.otro;
    const ajenas = await prisma.auditLog.findMany({ where: { entity: "Interruptor" } });
    assert.equal(ajenas.filter((f) => f.tenantId !== otro.id).length, 0, "la app de un negocio no ve interruptores de otro");
    // Y la consola (rol dueño, exento de RLS) lee cada negocio por su id, no el de al lado.
    const fichaOtro = await leerInterruptoresDe(otro.id);
    assert.equal(fichaOtro?.estado[INICIO_POR_APPS].encendido, false);
    assert.deepEqual(fichaOtro?.historial, []);

    // Con apps perdidas, la escritura real no llega a escribir.
    const rechazo = await cambiarInterruptorCon(depsDeCambioReales(), FACU, pedido(sinFijar, "encender"));
    assert.equal(rechazo.tipo, "rechazado");
    assert.equal((await filasDe(sinFijar.id)).length, 0);

    // Apagar: vuelve el menú de siempre.
    const r2 = await cambiarInterruptorCon(depsDeCambioReales(), FACU, pedido(carniceria, "apagar"));
    assert.equal(r2.tipo, "hecho");
    assert.deepEqual(await comoPanel(slugs.carniceria), { estado: false, inicio: false, gate: null });

    // ── Módulos e interruptor, con el MISMO candado por negocio ──
    // (a) Vista vieja: la vista previa de "apagar Stock" se arma con el interruptor apagado; en el
    // medio otro operador lo prende. La escritura de módulos lee el interruptor bajo el candado y
    // rechaza sacarle apps que ahora ve (el mismo criterio que para prender).
    const negocioReal = await leerNegocioParaActivar(carniceria.id);
    assert.ok(negocioReal);
    const previa = vistaPreviaDeCambio(negocioReal, { accion: "desactivar", modulo: "inventario" }, { registroGlobal: false, enInicioPorApps: false }, catalogo());
    assert.ok(previa.ok && !previa.sinCambios);
    assert.equal((await cambiarInterruptorCon(depsDeCambioReales(), FACU, pedido(carniceria, "encender"))).tipo, "hecho");
    const modulos = await escribirModulosConCandado(
      carniceria.id,
      negocioReal.modules,
      previa.despues,
      { actor: "operator:facu", action: "module.deactivate", changes: { modulo: "inventario" } },
      (i) => motivoSiPierdeAppsConInicio(previa, trabajaPorApps(i)),
    );
    assert.equal(modulos.tipo, "rechazado");
    assert.match((modulos as { motivo: string }).motivo, /trabaja por apps: con este cambio dejaría de ver .*Stock/);
    const trasRechazo = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: carniceria.id }, select: { modules: true } });
    assert.deepEqual([...trasRechazo.modules].sort(), [...negocioReal.modules].sort(), "no se tocó la asignación");

    // (b) Carrera: mientras una escritura de módulos tiene el candado, "apagar" espera, y al entrar
    // ve los módulos nuevos y rechaza (sin el candado habría decidido con la foto vieja).
    let tomado!: () => void;
    let soltar!: () => void;
    const candadoTomado = new Promise<void>((ok) => (tomado = ok));
    const podesSoltar = new Promise<void>((ok) => (soltar = ok));
    const otraEscritura = operatorPrisma.$transaction(
      async (tx) => {
        await bloquearAppsDelNegocio(tx, carniceria.id);
        tomado();
        await podesSoltar;
        await tx.tenant.update({ where: { id: carniceria.id }, data: { modules: [...negocioReal.modules, "libros"] } });
      },
      { timeout: 20_000 },
    );
    await candadoTomado;
    const apagar = cambiarInterruptorCon(depsDeCambioReales(), FACU, pedido(carniceria, "apagar"));
    await new Promise((ok) => setTimeout(ok, 400));
    let apagarTermino = false;
    void apagar.then(() => (apagarTermino = true));
    await new Promise((ok) => setTimeout(ok, 50));
    assert.equal(apagarTermino, false, "apagar tiene que esperar el candado de las apps del negocio");
    soltar();
    await otraEscritura;
    assert.deepEqual(await apagar, { tipo: "rechazado", motivo: CAMBIO_MIENTRAS_MIRABAS });
    assert.deepEqual(await comoPanel(slugs.carniceria), { estado: true, inicio: true, gate: "piloto" });

    // (c) Y al revés: la escritura de módulos también espera el candado.
    let tomado2!: () => void;
    let soltar2!: () => void;
    const tomado2P = new Promise<void>((ok) => (tomado2 = ok));
    const soltar2P = new Promise<void>((ok) => (soltar2 = ok));
    const retiene = operatorPrisma.$transaction(
      async (tx) => {
        await bloquearAppsDelNegocio(tx, carniceria.id);
        tomado2();
        await soltar2P;
      },
      { timeout: 20_000 },
    );
    await tomado2P;
    let modulosTermino = false;
    const sacarLibros = escribirModulosConCandado(
      carniceria.id,
      [...negocioReal.modules, "libros"],
      negocioReal.modules,
      { actor: "operator:facu", action: "module.deactivate", changes: { modulo: "libros" } },
    ).then((x) => {
      modulosTermino = true;
      return x;
    });
    await new Promise((ok) => setTimeout(ok, 400));
    assert.equal(modulosTermino, false, "la escritura de módulos tiene que esperar el candado");
    soltar2();
    await retiene;
    assert.deepEqual(await sacarLibros, { tipo: "ok" });

    // (d) Si el candado no se libera a tiempo, las dos escrituras contestan un motivo legible (no
    // un P2028 crudo) y no escriben nada. La espera se achica a 300 ms sólo para este paso.
    e.CANDADO_APPS_ESPERA_MS = "300";
    let tomado3!: () => void;
    let soltar3!: () => void;
    const tomado3P = new Promise<void>((ok) => (tomado3 = ok));
    const soltar3P = new Promise<void>((ok) => (soltar3 = ok));
    const retieneMucho = operatorPrisma.$transaction(
      async (tx) => {
        await bloquearAppsDelNegocio(tx, carniceria.id);
        tomado3();
        await soltar3P;
      },
      { timeout: 20_000 },
    );
    try {
      await tomado3P;
      const filasAntes = (await filasDe(carniceria.id)).length;
      const m = await escribirModulosConCandado(carniceria.id, negocioReal.modules, [...negocioReal.modules, "libros"], {
        actor: "operator:facu",
        action: "module.activate",
        changes: { modulo: "libros" },
      });
      assert.deepEqual(m, { tipo: "rechazado", motivo: CANDADO_OCUPADO });
      const i = await cambiarInterruptorCon(depsDeCambioReales(), FACU, pedido(carniceria, "apagar"));
      assert.deepEqual(i, { tipo: "rechazado", motivo: CANDADO_OCUPADO });
      assert.equal((await filasDe(carniceria.id)).length, filasAntes, "no se escribió ninguna fila");
    } finally {
      soltar3();
      await retieneMucho;
      delete e.CANDADO_APPS_ESPERA_MS;
    }
  } finally {
    delete e.FORCE_TENANT_SLUG;
    if (ids.length > 0) {
      await operatorPrisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await operatorPrisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
    await operatorPrisma.$disconnect();
    await basePrisma.$disconnect();
  }
});
