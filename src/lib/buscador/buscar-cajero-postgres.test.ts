// El buscador de Ctrl/⌘K para quien COBRA (R-2509), contra Postgres con app_rls y RLS encendido.
// Archivo propio: cada archivo de test tiene su base efímera (el cliente de Prisma es uno por proceso).

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

// El cajero (R-2509): quien tiene Vender y no el Catálogo encuentra lo que puede cobrar, con el
// nombre y el precio de venta, y el enlace lo lleva a Vender. Vender exige el módulo `pos` siempre
// (`moduloDuro`): A lo tiene asignado, B no (como CH hoy), y B sigue sin ver productos.
test("contra Postgres (app_rls + RLS): el cajero con Vender encuentra productos con su precio de venta, sin costo y sólo de su negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();

  const { a, b } = base;
  const profesionalA = { id: `usr_prof_${a.id.slice(-8)}` };
  const owner = new pg.Client({ connectionString: base.urlDuenio });
  await owner.connect();
  try {
    await owner.query(`UPDATE "Tenant" SET "blueprintId" = 'carniceria' WHERE id = ANY($1)`, [[a.id, b.id]]);
    await owner.query(`UPDATE "Tenant" SET modules = ARRAY['pos'] WHERE id = $1`, [a.id]);
    const producto = (id: string, tenantId: string, nombre: string, extra = "price, active", valores = "1000, true") =>
      owner.query(`INSERT INTO "Product" (id, "tenantId", name, ${extra}, "updatedAt") VALUES ($1, $2, $3, ${valores}, now())`, [id, tenantId, nombre]);
    await producto("prd_a_vacio", a.id, "Vacío de A");
    await producto("prd_a_kilo", a.id, "Vacío por kilo", `"saleUnit", "pricePerKg", active`, `'WEIGHT', 12500.5, true`);
    await producto("prd_a_pausado", a.id, "Vacío pausado", "price, active", "900, false");
    await producto("prd_a_sinprecio", a.id, "Vacío sin precio", "active", "true");
    await producto("prd_b_vacio", b.id, "Vacío de B");
    await producto("prd_b_entrana", b.id, "Entraña secreta");
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
  const productosDe = (r: R) => {
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.ok ? (r.grupos.find((g) => g.grupo === "productos")?.items ?? []) : [];
  };

  // La recepción de A (orders:manage, sin catalog:read) cobra con Vender: ve nombre y precio.
  const cajero = productosDe(await buscar(a, a.recepcion, "vac"));
  assert.deepEqual(
    cajero.map((p) => [p.id, p.nombre, p.href]),
    [
      ["producto-prd_a_vacio", "Vacío de A", "/admin/vender"],
      ["producto-prd_a_kilo", "Vacío por kilo", "/admin/vender"],
    ],
    "sólo lo que se puede cobrar: sin pausados, sin lo que no tiene precio y nada de B",
  );
  // La segunda línea es la unidad y el precio de venta, y nada más (el costo ni se lee).
  assert.match(cajero[0].segunda ?? "", /^Por unidad · \$\s?1\.000,00$/);
  assert.match(cajero[1].segunda ?? "", /^Por kilo · \$\s?12\.500,50 el kilo$/);

  // Aislamiento: lo que sólo existe en B no aparece ni se infiere.
  assert.deepEqual(await buscar(a, a.recepcion, "Entraña"), { ok: true, grupos: [] });

  // La dueña de A tiene el Catálogo: la ficha, con pausados y sin precio.
  const duenia = productosDe(await buscar(a, a.duenia, "vac"));
  assert.equal(duenia.length, 4);
  assert.ok(duenia.every((p) => p.href.startsWith("/admin/catalogo?editar=")));

  // Sin Vender ni Catálogo, nada de productos: el profesional de A y la recepción de B (B no
  // tiene el módulo de mostrador asignado, como CH).
  assert.deepEqual(await buscar(a, profesionalA, "vac"), { ok: true, grupos: [] });
  assert.deepEqual(productosDe(await buscar(b, b.recepcion, "vac")), []);
});
