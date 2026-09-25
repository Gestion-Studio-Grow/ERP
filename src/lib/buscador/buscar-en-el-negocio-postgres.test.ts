// El buscador de Ctrl/⌘K (buscarEnElNegocio) CONTRA POSTGRES, con el rol de la app (app_rls, sin
// BYPASSRLS), RLS encendido y la Server Action REAL con la sesión de un usuario real:
//   · el negocio A no encuentra ni infiere clientes, productos ni pedidos del B (lo que sólo
//     existe en B da la misma respuesta que una palabra que no existe en ningún lado);
//   · cada grupo sale con la guardia de su listado: la recepción no ve productos (el catálogo es
//     del dueño) y un profesional, sin Clientes ni Pedidos, no recibe nada;
//   · sin sesión, o con la cookie de A en el host de B, al login sin leer nada.
// Base: una efímera propia (src/test/base-efimera.ts); lo que agrega (productos, un pedido y una
// clienta sólo de B, un profesional de A) lo escribe como dueño de la base, no la app.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres (app_rls + RLS): el buscador sólo encuentra lo del negocio y lo que la persona puede abrir", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();

  const { a, b } = base;
  const profesionalA = { id: `usr_prof_${a.id.slice(-8)}` };
  const owner = new pg.Client({ connectionString: base.urlDuenio });
  await owner.connect();
  try {
    // Los dos, carnicerías: el catálogo de productos es el del mostrador.
    await owner.query(`UPDATE "Tenant" SET "blueprintId" = 'carniceria' WHERE id = ANY($1)`, [[a.id, b.id]]);
    const producto = (id: string, tenantId: string, nombre: string) =>
      owner.query(`INSERT INTO "Product" (id, "tenantId", name, price, "updatedAt") VALUES ($1, $2, $3, 1000, now())`, [id, tenantId, nombre]);
    await producto("prd_a_vacio", a.id, "Vacío de A");
    await producto("prd_a_matambre", a.id, "Matambre");
    await producto("prd_b_vacio", b.id, "Vacío de B");
    await producto("prd_b_entrana", b.id, "Entraña secreta");
    await owner.query(`INSERT INTO "Client" (id, "tenantId", name, phone, "updatedAt") VALUES ('cli_b_zulema', $1, 'Zulema Secreta', '11 9999-8888', now())`, [b.id]);
    await owner.query(
      `INSERT INTO "Order" (id, "tenantId", code, "customerName", "customerPhone", "updatedAt") VALUES ('ped_b_777', $1, 777, 'Secreto B', '', now())`,
      [b.id],
    );
    await owner.query(
      `INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt")
       SELECT $1, "tenantId", 'Profesional A', 'profesional@negocio-a.erp.test', "passwordHash", 'PROFESSIONAL'::"UserRole", now()
       FROM "User" WHERE id = $2`,
      [profesionalA.id, a.duenia.id],
    );
  } finally {
    await owner.end();
  }

  const { buscarEnElNegocio } = await import("./buscar-en-el-negocio");
  type R = Awaited<ReturnType<typeof buscarEnElNegocio>>;
  const buscar = async (negocio: { host: string }, usuario: { id: string } | null, q: unknown): Promise<R> => {
    const s = await ejecutarAccion({ negocio, usuario }, () => buscarEnElNegocio(q));
    assert.equal(s.tipo, "respuesta", `«${String(q)}» tenía que responder: ${JSON.stringify(s)}`);
    return (s as { valor: R }).valor;
  };
  const idsDe = (r: R, grupo: string) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.ok ? (r.grupos.find((g) => g.grupo === grupo)?.items.map((i) => i.id) ?? []).sort() : [];
  };
  const grupos = (r: R) => (r.ok ? r.grupos.map((g) => g.grupo) : null);

  // ── Aislamiento: A sólo encuentra lo de A ──
  const clientesA = await buscar(a, a.duenia, "Cliente");
  assert.deepEqual(idsDe(clientesA, "clientes"), a.clientes.map((id) => `cliente-${id}`).sort());

  assert.deepEqual(idsDe(await buscar(a, a.duenia, "vac"), "productos"), ["producto-prd_a_vacio"]);
  assert.deepEqual(idsDe(await buscar(b, b.duenia, "vac"), "productos"), ["producto-prd_b_vacio"]);

  const pedidosA = idsDe(await buscar(a, a.duenia, "#1"), "pedidos");
  assert.ok(pedidosA.length > 0, "el pedido #1 de A se encuentra");
  assert.ok(
    pedidosA.every((id) => a.pedidos.map((p) => `pedido-${p}`).includes(id)),
    `sólo pedidos de A: ${pedidosA.join(", ")}`,
  );

  // No infiere: lo que sólo existe en B responde igual que algo que no existe en ningún lado.
  const nada = await buscar(a, a.duenia, "palabra-que-no-existe");
  assert.deepEqual(nada, { ok: true, grupos: [] });
  for (const q of ["Zulema", "9999-8888", "99998888", "Entraña", "secreta", "777", "#777", "Secreto B"]) {
    assert.deepEqual(await buscar(a, a.duenia, q), nada, `«${q}» es sólo de B`);
  }

  // A y B a la vez: cada uno lo suyo.
  const [va, vb] = await Promise.all([buscar(a, a.duenia, "Cliente"), buscar(b, b.recepcion, "Cliente")]);
  assert.deepEqual(idsDe(va, "clientes"), a.clientes.map((id) => `cliente-${id}`).sort());
  assert.deepEqual(idsDe(vb, "clientes"), b.clientes.map((id) => `cliente-${id}`).sort());

  // ── Permisos: la guardia de cada listado ──
  // La recepción abre Clientes y Pedidos, no el Catálogo (catalog:read es del dueño).
  assert.deepEqual(idsDe(await buscar(a, a.recepcion, "Cliente"), "clientes"), a.clientes.map((id) => `cliente-${id}`).sort());
  assert.deepEqual(grupos(await buscar(a, a.recepcion, "vac")), []);
  assert.ok(idsDe(await buscar(a, a.recepcion, "#1"), "pedidos").length > 0);
  // La recepción no ve plata: ni precios ni totales en la segunda línea.
  const rec = await buscar(a, a.recepcion, "#1");
  assert.ok(rec.ok && rec.grupos.every((g) => g.items.every((i) => !/\$/.test(i.segunda ?? ""))));

  // Un profesional no tiene Clientes, Catálogo ni Pedidos: no recibe nada.
  for (const q of ["Cliente", "vac", "#1", "Mostrador"]) {
    assert.deepEqual(await buscar(a, profesionalA, q), nada, `profesional, «${q}»`);
  }

  // ── Sesión ──
  const sinSesion = await ejecutarAccion({ negocio: a }, () => buscarEnElNegocio("Cliente"));
  assert.equal(sinSesion.tipo, "redireccion");
  assert.equal(sinSesion.tipo === "redireccion" && sinSesion.destino, "/admin/login");
  const cruzada = await ejecutarAccion({ negocio: b, usuario: a.duenia }, () => buscarEnElNegocio("Cliente"));
  assert.equal(cruzada.tipo, "redireccion", "la cookie de A no abre B");

  // ── Entrada: se valida antes de leer, con un mensaje sin nada de adentro ──
  const corta = await buscar(a, a.duenia, "a");
  assert.equal(corta.ok, false);
  assert.match(!corta.ok ? corta.mensaje : "", /al menos 2/);
  assert.equal((await buscar(a, a.duenia, { $ne: "" })).ok, false);
  assert.equal((await buscar(a, a.duenia, "x".repeat(61))).ok, false);
  // Un comodín de LIKE se busca como letra, no como comodín: «%» no trae todo.
  assert.deepEqual(await buscar(a, a.duenia, "%%"), nada);
});
