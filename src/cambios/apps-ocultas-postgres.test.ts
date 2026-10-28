// ============================================================================
// APPS OCULTAS y PÉRDIDAS ACEPTADAS — contra Postgres (app_rls + RLS forzado), base efímera.
// ============================================================================
//
// Lo mismo que interruptores-core.test.ts, pero con la escritura REAL de la consola
// (interruptores-escritura.server.ts, candado `bloquearAppsDelNegocio`), la lectura REAL del panel
// (interruptores.server.ts + contexto.server.ts) y `audit()` real:
//   · dos negocios de QA: ocultar en uno no toca al otro (RLS + filtro por tenant);
//   · filas forjadas por `audit()` y por el cliente de la app no ocultan nada;
//   · CH (beauty-spa): ni el dueño oculta ni acepta pérdidas, y una fila válida no le cambia el menú;
//   · DOBLE ENVÍO: dos pedidos iguales a la vez (la misma app, o prender aceptando pérdidas) →
//     una fila y un CAMBIO_MIENTRAS_MIRABAS.
// Crea sus negocios (slug qa-oc-…) y la base se borra al terminar. Sin Postgres local se SALTEA
// diciéndolo; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: ocultar por negocio, forjadas, CH y doble envío bajo el candado", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const e = process.env as Record<string, string | undefined>;
  Object.assign(e, { NODE_ENV: "development", MODULE_REGISTRY_ENABLED: "", DB_CONNECTION_LIMIT: "3", DB_CONNECT_TIMEOUT_MS: "3000" });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const duenio = await prismaComoDuenio(base);
  const { depsDeAppOcultaReales, depsDeCambioReales } = await import("@/lib/operador/interruptores-escritura.server");
  const { leerAppsOcultasDe } = await import("@/lib/operador/apps-ocultas.server");
  const { cambiarAppOcultaCon, cambiarInterruptorCon, CAMBIO_MIENTRAS_MIRABAS, MOTIVO_PERDIDAS_EN_CLIENTE_VIVO } = await import(
    "./interruptores-core"
  );
  const { appsOcultasDelNegocio } = await import("./interruptores.server");
  const { getNegocioApps } = await import("@/apps/contexto.server");
  const { appsVisibles, motivoNoDisponible } = await import("@/apps/visibles");
  const { appPorId } = await import("@/apps/registro");
  const { audit } = await import("@/lib/audit-core");
  const { prisma } = await import("@/lib/prisma");
  const { describirAccion } = await import("@/app/admin/(dashboard)/auditoria/frase");
  const { estadoDeApps } = await import("@/app/operador/(console)/tenants/[id]/apps-del-negocio");
  const { bloquearAppsDelNegocio, leerNegocioParaActivar } = await import("@/app/operador/(console)/tenants/[id]/negocio.server");
  const { catalogo } = await import("@/modules/catalog");
  const { INICIO_POR_APPS } = await import("./interruptores");

  const FACU = { nombre: "facu", esDuenio: false };
  const DUENIO = { nombre: "tomas", esDuenio: true };
  const sufijo = Date.now().toString(36);
  const BASE_CARNICERIA = ["pos", "catalog", "clients", "reports", "arca"];
  const crear = (slug: string) => duenio.tenant.create({ data: { name: slug, slug, blueprintId: "carniceria", modules: BASE_CARNICERIA } });
  const filasDe = (tenantId: string, entity: string) =>
    duenio.auditLog.findMany({ where: { tenantId, entity }, orderBy: { createdAt: "asc" } });
  const panel = async (slug: string) => {
    e.FORCE_TENANT_SLUG = slug;
    const n = await getNegocioApps("OWNER");
    return { ocultas: [...(await appsOcultasDelNegocio())].sort(), n };
  };
  const pedidoOculta = (tenantId: string, app: string) => ({ tenantId, app, accion: "ocultar", visto: "visible" });
  /** Retiene el candado de las apps del negocio hasta `soltar()`, para alinear dos pedidos. */
  const retenerCandado = async (tenantId: string) => {
    let tomado!: () => void;
    let soltar!: () => void;
    const tomadoP = new Promise<void>((ok) => (tomado = ok));
    const soltarP = new Promise<void>((ok) => (soltar = ok));
    const tx = operatorPrisma.$transaction(
      async (tx) => {
        await bloquearAppsDelNegocio(tx, tenantId);
        tomado();
        await soltarP;
      },
      { timeout: 20_000 },
    );
    await tomadoP;
    return { soltar: async () => (soltar(), await tx) };
  };

  try {
    const a = await crear(`qa-oc-a-${sufijo}`);
    const b = await crear(`qa-oc-b-${sufijo}`);
    const ch =
      (await duenio.tenant.findUnique({ where: { slug: "beauty-spa" } })) ??
      (await duenio.tenant.create({ data: { name: "CH", slug: "beauty-spa", modules: [] } }));

    // ── A5: forjadas desde la app del negocio ──
    e.FORCE_TENANT_SLUG = a.slug;
    await audit({ actor: "user:recepcion", action: "app.ocultar", entity: "AppOculta", entityId: "apariencia", channel: "admin" });
    assert.equal((await filasDe(a.id, "AppOculta")).length, 0, "audit() no puede escribir una app oculta");
    await prisma.auditLog.create({
      data: { tenantId: a.id, actor: "user:recepcion", action: "app.ocultar", entity: "AppOculta", entityId: "apariencia", channel: "admin" },
    });
    await prisma.auditLog.create({
      data: { tenantId: a.id, actor: "operator:facu", action: "app.ocultar", entity: "AppOculta", entityId: "inventario", channel: "operador" },
    });
    assert.equal((await filasDe(a.id, "AppOculta")).length, 2);
    const forjado = await panel(a.slug);
    assert.deepEqual(forjado.ocultas, [], "una fila forjada o fuera de la lista no oculta nada");
    assert.equal(motivoNoDisponible(appPorId("apariencia"), forjado.n), null);
    assert.equal(motivoNoDisponible(appPorId("inventario"), forjado.n) === "oculta", false);

    // ── A4: ocultar Apariencia en A con la escritura real ──
    const r = await cambiarAppOcultaCon(depsDeAppOcultaReales(), FACU, pedidoOculta(a.id, "apariencia"));
    assert.deepEqual(r, { tipo: "hecho", app: "apariencia", accion: "ocultar" });
    const enA = await panel(a.slug);
    assert.deepEqual(enA.ocultas, ["apariencia"]);
    assert.equal(motivoNoDisponible(appPorId("apariencia"), enA.n), "oculta", "requireApp manda a /admin/no-disponible");
    assert.ok(!appsVisibles(enA.n).some((x) => x.id === "apariencia"));
    const [escrita] = (await filasDe(a.id, "AppOculta")).filter((f) => f.channel === "operador" && f.entityId === "apariencia");
    assert.equal(escrita.actor, "operator:facu");
    assert.equal(describirAccion(escrita).frase, "GSG ocultó Apariencia");
    const ficha = await leerAppsOcultasDe(a.id);
    assert.deepEqual([...(ficha?.ocultas ?? [])], ["apariencia"]);
    assert.equal(ficha?.historial.length, 1, "las forjadas no figuran en el historial");
    assert.equal(ficha?.historial[0]?.quien, "facu");

    // Aislamiento: B no se enteró, y la app de B no ve las filas de A.
    const enB = await panel(b.slug);
    assert.deepEqual(enB.ocultas, []);
    assert.ok(appsVisibles(enB.n).some((x) => x.id === "apariencia"));
    const ajenas = await prisma.auditLog.findMany({ where: { entity: "AppOculta" } });
    assert.equal(ajenas.filter((f) => f.tenantId !== b.id).length, 0, "la app de un negocio no ve apps ocultas de otro");

    // ── A7: doble envío de «ocultar Promociones» en B, alineado detrás del candado ──
    const candado = await retenerCandado(b.id);
    const dos = Promise.all([
      cambiarAppOcultaCon(depsDeAppOcultaReales(), FACU, pedidoOculta(b.id, "promociones")),
      cambiarAppOcultaCon(depsDeAppOcultaReales(), FACU, pedidoOculta(b.id, "promociones")),
    ]);
    await new Promise((ok) => setTimeout(ok, 400));
    await candado.soltar();
    const tipos = (await dos).map((x) => (x.tipo === "rechazado" ? x.motivo : x.tipo)).sort();
    assert.deepEqual(tipos, [CAMBIO_MIENTRAS_MIRABAS, "hecho"].sort());
    assert.equal((await filasDe(b.id, "AppOculta")).length, 1, "una sola fila");
    assert.deepEqual((await panel(b.slug)).ocultas, ["promociones"]);

    // ── A1/A2 contra la base: prender «Trabaja por apps» en A aceptando lo que pierde ──
    const negocioA = await leerNegocioParaActivar(a.id);
    assert.ok(negocioA);
    const pierde = estadoDeApps(negocioA, { registroGlobal: false, enInicioPorApps: false }, catalogo()).conInicioFrenteAlMenu.pierde.map(
      (x) => x.id,
    );
    assert.ok(pierde.length > 0, "la carnicería sin fijar pierde apps");
    const pedidoPrender = (perdidasAceptadas: string[] | null) => ({
      tenantId: a.id,
      interruptor: INICIO_POR_APPS,
      accion: "encender",
      visto: "apagado",
      modulosVistos: negocioA.modules,
      slugTipeado: "",
      perdidasAceptadas,
    });
    for (const lista of [null, pierde.slice(1), [...pierde, "agenda"]]) {
      assert.equal((await cambiarInterruptorCon(depsDeCambioReales(), FACU, pedidoPrender(lista))).tipo, "rechazado");
    }
    assert.equal((await filasDe(a.id, "Interruptor")).length, 0, "ningún rechazo escribe");
    // Doble envío con la lista exacta: una fila (con pierdeAceptadas) y un CAMBIO_MIENTRAS_MIRABAS.
    const candadoA = await retenerCandado(a.id);
    const dosPrender = Promise.all([
      cambiarInterruptorCon(depsDeCambioReales(), FACU, pedidoPrender([...pierde].reverse())),
      cambiarInterruptorCon(depsDeCambioReales(), FACU, pedidoPrender(pierde)),
    ]);
    await new Promise((ok) => setTimeout(ok, 400));
    await candadoA.soltar();
    const tiposPrender = (await dosPrender).map((x) => (x.tipo === "rechazado" ? x.motivo : x.tipo)).sort();
    assert.deepEqual(tiposPrender, [CAMBIO_MIENTRAS_MIRABAS, "hecho"].sort());
    const prendidas = await filasDe(a.id, "Interruptor");
    assert.equal(prendidas.length, 1);
    assert.deepEqual((prendidas[0].changes as { pierdeAceptadas?: string[] }).pierdeAceptadas, [...pierde].sort());

    // ── A3: CH, ni el dueño ──
    const filasCh = async () => (await filasDe(ch.id, "AppOculta")).length + (await filasDe(ch.id, "Interruptor")).length;
    const antesCh = await filasCh();
    const chOculta = await cambiarAppOcultaCon(depsDeAppOcultaReales(), DUENIO, pedidoOculta(ch.id, "apariencia"));
    assert.equal(chOculta.tipo, "rechazado");
    const chPrender = await cambiarInterruptorCon(depsDeCambioReales(), DUENIO, {
      tenantId: ch.id,
      interruptor: INICIO_POR_APPS,
      accion: "encender",
      visto: "apagado",
      modulosVistos: ch.modules,
      slugTipeado: "beauty-spa",
      perdidasAceptadas: ["inventario"],
    });
    assert.deepEqual(chPrender, { tipo: "rechazado", motivo: MOTIVO_PERDIDAS_EN_CLIENTE_VIVO });
    assert.equal(await filasCh(), antesCh, "0 filas en CH");
    // Y si existiera una fila VÁLIDA de la consola en CH, su panel igual no oculta nada.
    const chAntes = await panel("beauty-spa");
    await duenio.auditLog.create({
      data: { tenantId: ch.id, actor: "operator:tomas", action: "app.ocultar", entity: "AppOculta", entityId: "apariencia", channel: "operador" },
    });
    const chDespues = await panel("beauty-spa");
    assert.deepEqual(chDespues.ocultas, ["apariencia"], "la lectura la ve…");
    assert.equal(chDespues.n.ocultas?.size ?? 0, 0, "…pero el panel de CH no la aplica");
    assert.deepEqual(appsVisibles(chDespues.n), appsVisibles(chAntes.n));
  } finally {
    delete e.FORCE_TENANT_SLUG;
  }
});
