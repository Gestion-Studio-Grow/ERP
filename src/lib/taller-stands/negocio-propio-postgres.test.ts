// ============================================================================
// MIA TALLER COMO NEGOCIO PROPIO (V9 · GSG-MIA-045): tres negocios en la misma base — MIA Producciones,
// MIA Taller y un tercero — y ninguno ve los proyectos, los usuarios ni la administración (gastos, cobros,
// piezas con costo interno) de los otros. Cada uno entra por su propio link (subdominio). Corre como el
// rol de la app (`app_rls`, sin BYPASSRLS) contra una base efímera local; sin Postgres se saltea (en CI falla).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, DOMINIO_DE_PRUEBA, prismaComoDuenio } from "@/test/base-efimera";
import { defaultModulesForBlueprint } from "@/blueprints/presets-meta";
import { altaMiaTaller, SLUG_TALLER } from "../../../scripts/taller-stands/alta-mia-taller";

test("V9: MIA Producciones, MIA Taller y un tercero no ven proyectos, usuarios ni administración del otro", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const db = await prismaComoDuenio(base);

  // Los tres negocios. MIA Taller sale del alta real (slug y link `mia-taller`); Producciones, como la siembra.
  const taller = await altaMiaTaller(db);
  assert.equal(taller.creado, true);
  const produ = await db.tenant.create({
    data: {
      name: "MIA Producciones (prueba)",
      slug: "mia-producciones",
      subdomain: "mia-producciones",
      blueprintId: "productora",
      modules: defaultModulesForBlueprint("productora"),
    },
    select: { id: true },
  });
  const negocios = [
    { nombre: "mia-producciones", id: produ.id, sub: "mia-producciones" },
    { nombre: "mia-taller", id: taller.tenantId, sub: SLUG_TALLER },
    { nombre: "tercero", id: base.a.id, sub: base.a.subdominio },
  ];

  // FORCE RLS en las tablas de proyectos y del taller: hasta el dueño escribe parado en el negocio.
  const enNegocio = <T>(cliente: typeof db, tenantId: string, fn: (tx: typeof db) => Promise<T>) =>
    cliente.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as typeof db);
    });

  // Siembra: en cada negocio, una dueña, un cliente, un proyecto con un gasto y un cobro, y una pieza del taller.
  const sembrado = new Map<string, { usuario: string; email: string; proyecto: string; gasto: string; pago: string; pieza: string }>();
  for (const n of negocios) {
    const email = `direccion@${n.sub}.${DOMINIO_DE_PRUEBA}`;
    const ids = await enNegocio(db, n.id, async (tx) => {
      const usuario = await tx.user.create({
        data: { tenantId: n.id, name: `Dueña ${n.nombre}`, email, passwordHash: "x", role: "OWNER" },
        select: { id: true },
      });
      const cliente = await tx.client.create({ data: { tenantId: n.id, name: `Cliente de ${n.nombre}`, phone: "1100000000" }, select: { id: true } });
      const proyecto = await tx.proyecto.create({
        data: { tenantId: n.id, clientId: cliente.id, numero: 1, nombre: `Stand de ${n.nombre}`, servicio: "EVENTOS" },
        select: { id: true },
      });
      const gasto = await tx.proyectoGasto.create({ data: { tenantId: n.id, proyectoId: proyecto.id, descripcion: "Materiales", neto: 1000 }, select: { id: true } });
      const pago = await tx.proyectoPago.create({ data: { tenantId: n.id, proyectoId: proyecto.id, medio: "TRANSFERENCIA", monto: 500 }, select: { id: true } });
      const pieza = await tx.tallerPieza.create({ data: { tenantId: n.id, nombre: "Panel", costoUnit: 100 }, select: { id: true } });
      return { usuario: usuario.id, email, proyecto: proyecto.id, gasto: gasto.id, pago: pago.id, pieza: pieza.id };
    });
    sembrado.set(n.id, ids);
  }

  // Lo que ve la app, como `app_rls`.
  const { PrismaClient } = await import("@/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlApp }) });
  base.alBorrar(() => app.$disconnect());

  for (const yo of negocios) {
    const otros = negocios.filter((n) => n.id !== yo.id).map((n) => n.id);
    const ajenos = otros.map((id) => sembrado.get(id)!);
    const visto = await enNegocio(app, yo.id, async (tx) => ({
      proyectos: await tx.proyecto.findMany({ select: { tenantId: true } }),
      usuarios: await tx.user.findMany({ select: { tenantId: true } }),
      gastos: await tx.proyectoGasto.findMany({ select: { tenantId: true } }),
      cobros: await tx.proyectoPago.findMany({ select: { tenantId: true } }),
      piezas: await tx.tallerPieza.findMany({ select: { tenantId: true } }),
      // Buscado por id, como lo haría una URL adivinada: no aparece.
      proyectoAjeno: await tx.proyecto.findFirst({ where: { id: { in: ajenos.map((a) => a.proyecto) } } }),
      gastoAjeno: await tx.proyectoGasto.findFirst({ where: { id: { in: ajenos.map((a) => a.gasto) } } }),
      // El ingreso busca la usuaria por (negocio, mail): la dueña de otro negocio no entra por este link.
      ingresoAjeno: await tx.user.findFirst({ where: { tenantId: yo.id, email: { in: ajenos.map((a) => a.email) } } }),
    }));
    for (const [qué, filas] of Object.entries({ proyectos: visto.proyectos, usuarios: visto.usuarios, gastos: visto.gastos, cobros: visto.cobros, piezas: visto.piezas })) {
      assert.ok(filas.length >= 1, `${yo.nombre} ve sus ${qué}`);
      assert.ok(filas.every((f) => f.tenantId === yo.id), `${yo.nombre} no ve ${qué} de otro negocio`);
    }
    assert.equal(visto.proyectoAjeno, null, `${yo.nombre}: un proyecto ajeno por id no aparece`);
    assert.equal(visto.gastoAjeno, null, `${yo.nombre}: un gasto ajeno por id no aparece`);
    assert.equal(visto.ingresoAjeno, null, `${yo.nombre}: la usuaria de otro negocio no entra por este link`);

    // Escribir en otro negocio parado en éste: la base lo rechaza o no toca nada.
    const otro = otros[0];
    await assert.rejects(
      enNegocio(app, yo.id, (tx) => tx.proyectoGasto.create({ data: { tenantId: otro, proyectoId: sembrado.get(otro)!.proyecto, descripcion: "Intruso", neto: 1 } })),
      /row-level security|violates|P2003|foreign key/i,
      `${yo.nombre} no carga un gasto en otro negocio`,
    );
    const tocados = await enNegocio(app, yo.id, (tx) => tx.proyecto.updateMany({ where: { id: { in: ajenos.map((a) => a.proyecto) } }, data: { nombre: "pisado" } }));
    assert.equal(tocados.count, 0, `${yo.nombre} no modifica proyectos ajenos`);
  }
  assert.equal(await db.proyecto.count({ where: { nombre: "pisado" } }), 0);

  // Cada uno entra por su propio link (subdominio) y el link de uno no lleva al otro.
  const { resolveTenant } = await import("@/lib/tenant");
  for (const n of negocios) {
    const r = await resolveTenant(`${n.sub}.${DOMINIO_DE_PRUEBA}`);
    assert.equal(r.id, n.id, `${n.sub}.${DOMINIO_DE_PRUEBA} lleva a ${n.nombre}`);
  }
  assert.equal(new Set(negocios.map((n) => n.sub)).size, 3, "tres links distintos");

  // Módulos: el taller no hereda la productora, la productora no ve el taller.
  const modulos = await db.tenant.findMany({ where: { id: { in: [produ.id, taller.tenantId] } }, select: { id: true, modules: true, blueprintId: true } });
  const deProdu = modulos.find((m) => m.id === produ.id)!;
  const deTaller = modulos.find((m) => m.id === taller.tenantId)!;
  assert.equal(deTaller.blueprintId, "taller-stands");
  assert.ok(deTaller.modules.includes("taller-stands"));
  assert.ok(!deProdu.modules.includes("taller-stands"));
});
