// Matriz de permisos contra Postgres de verdad (arnés `base-efimera`, RLS aplicado, dos negocios).
// PLAN permisos §11, riesgos 5 (aislamiento por tenant) y 6 (el resolvedor lee lo grabado).
//   node --import tsx --test src/lib/permisos/grabar-permiso-postgres.test.ts
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const SIN_RLS = process.env.ERP_TEST_MOTOR === "pglite";

test("UserPermissionOverride: graba, vuelve al rol, y un negocio no ve ni toca las casillas del otro", { timeout: 300_000 }, async (t: TestContext) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  env.FORCE_TENANT_SLUG = base.a.slug;

  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { grabarCambioDePermisoEnTx } = await import("@/lib/permisos/grabar-permiso");
  const { decidirCambioDePermiso } = await import("@/lib/permisos/cambio-de-permiso");
  const { permisoEfectivo } = await import("@/lib/capabilities");
  const { leerOverridesTolerante } = await import("@/lib/permisos-overrides");

  const A = base.a.id;
  const B = base.b.id;
  const recA = base.a.recepcion.id;
  const recB = base.b.recepcion.id;

  const overridesDe = (tenantId: string, userId: string) =>
    tenantTransaction(
      (tx) => leerOverridesTolerante(() => tx.userPermissionOverride.findMany({ where: { userId }, select: { capability: true, allowed: true } })),
      { tenantId },
    );
  const cambiar = async (tenantId: string, userId: string, capability: string, allowed: boolean) => {
    const objetivo = { id: userId, role: "RECEPTION" as const, professionalId: null, overrides: await overridesDe(tenantId, userId) };
    const d = decidirCambioDePermiso({ actorId: "otro", objetivo, capability, allowed });
    assert.ok(d.ok);
    await tenantTransaction((tx) => grabarCambioDePermisoEnTx(tx, { tenantId, userId, plan: d.plan }), { tenantId });
  };

  // Apagarle la caja a la recepcionista de A: una fila, con el negocio de A.
  await cambiar(A, recA, "cash:manage", false);
  const filasA = await duenio.userPermissionOverride.findMany({ where: { userId: recA } });
  assert.deepEqual(filasA.map((f) => [f.tenantId, f.capability, f.allowed]), [[A, "cash:manage", false]]);
  const vistas = await overridesDe(A, recA);
  assert.equal(permisoEfectivo({ role: "RECEPTION", overrides: vistas }, "cash:manage"), false);
  assert.equal(permisoEfectivo({ role: "RECEPTION", overrides: vistas }, "orders:manage"), true, "vender no depende de la caja");

  // Stock: una casilla, tres filas.
  await cambiar(A, recA, "stock:adjust", false);
  assert.equal(await duenio.userPermissionOverride.count({ where: { userId: recA, capability: { startsWith: "stock:" } } }), 3);

  // B tiene lo suyo; cada negocio ve sólo sus filas.
  await cambiar(B, recB, "clients:contact", false);
  if (!SIN_RLS) {
    const desdeA = await tenantTransaction((tx) => tx.userPermissionOverride.findMany({ select: { tenantId: true } }), { tenantId: A });
    assert.ok(desdeA.length > 0 && desdeA.every((f) => f.tenantId === A), "A ve sólo filas de A");
    const deBDesdeA = await overridesDe(A, recB);
    assert.deepEqual(deBDesdeA, [], "A no lee las casillas de la recepcionista de B");
    // Borrar desde A con el usuario de B no toca nada de B.
    await tenantTransaction(
      (tx) => grabarCambioDePermisoEnTx(tx, { tenantId: A, userId: recB, plan: { allowed: true, borrar: ["clients:contact"], grabar: [] } }),
      { tenantId: A },
    );
    assert.equal(await duenio.userPermissionOverride.count({ where: { userId: recB } }), 1, "la fila de B sigue");
    // Insertar una fila con el negocio de B desde la sesión de A: RLS (WITH CHECK) la rechaza.
    await assert.rejects(
      tenantTransaction(
        (tx) => tx.userPermissionOverride.create({ data: { tenantId: B, userId: recB, capability: "cash:manage", allowed: false } }),
        { tenantId: A },
      ),
    );
  }

  // Volver al rol borra la fila (no guarda «true» de más).
  await cambiar(A, recA, "cash:manage", true);
  assert.equal(await duenio.userPermissionOverride.count({ where: { userId: recA, capability: "cash:manage" } }), 0);
  await duenio.$disconnect();
});
