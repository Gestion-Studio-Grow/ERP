// RENDÍ contra una base migrada de verdad (Postgres local, con `20261104120000_rendiciones` aplicada sólo ahí).
//
// Las únicas impiden dos rendiciones del mismo gasto y dos asientos del mismo anticipo; el PIN es uno por usuario; y
// con el rol de la app (RLS) el negocio B no ve las filas del negocio A en ninguna de las tres tablas nuevas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const esUnica = (e: unknown) => (e as { code?: string }).code === "P2002";

test("Rendí: un gasto, una rendición; un asiento por anticipo; PIN único; aislado por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  const proyecto = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 1, clientId: a.clientes[0], nombre: "Stand", servicio: "ARQUITECTURA", etapa: "APROBADO" } });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Comercial", rol: "COMERCIAL" } });
  const gasto = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: proyecto.id, descripcion: "Taxi al predio", neto: 12500 } });
  const rendicion = { tenantId: a.id, proyectoId: proyecto.id, gastoId: gasto.id, personaId: persona.id, medio: "PROPIO", montoCentavos: 1250000 };

  await duenio.proyectoRendicion.create({ data: rendicion });
  await assert.rejects(duenio.proyectoRendicion.create({ data: rendicion }), esUnica, "el mismo gasto no se rinde dos veces");
  await assert.rejects(duenio.proyectoRendicion.create({ data: { ...rendicion, montoCentavos: 0 } }), "monto > 0 en la base");

  const anticipo = await duenio.proyectoAnticipo.create({ data: { tenantId: a.id, personaId: persona.id, montoCentavos: 10000000 } });
  const egreso = { tenantId: a.id, type: "EGRESO" as const, amount: 100000, createdBy: "user:qa", proyectoAnticipoId: anticipo.id };
  await duenio.cashMovement.create({ data: egreso });
  await assert.rejects(duenio.cashMovement.create({ data: egreso }), esUnica, "un egreso por anticipo");

  const pin = { tenantId: a.id, userId: a.recepcion.id, hash: "h1", venceEl: new Date(Date.now() + 300_000) };
  await duenio.proyectoPinIngreso.create({ data: { ...pin, fallosEl: [new Date(), new Date(), new Date()] } });
  await assert.rejects(duenio.proyectoPinIngreso.create({ data: pin }), esUnica, "un código vivo por usuario");
  const pisado = await duenio.proyectoPinIngreso.update({ where: { tenantId_userId: { tenantId: a.id, userId: a.recepcion.id } }, data: { hash: "h2", intentos: 0 } });
  assert.equal(pisado.fallosEl.length, 3, "pedir otro código no reinicia la ventana");

  // Conectado como el rol de la app (`app_rls`, sin BYPASSRLS): las políticas se aplican de verdad.
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import("@/generated/prisma/client"), import("@prisma/adapter-pg")]);
  const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlApp }) });
  base.alBorrar(() => app.$disconnect());
  const cuantasVe = (tenantId: string, tabla: string) =>
    app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      const filas = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${tabla}"`);
      return Number(filas[0].n);
    });
  for (const tabla of ["ProyectoRendicion", "ProyectoAnticipo", "ProyectoPinIngreso"]) {
    assert.equal(await cuantasVe(a.id, tabla), 1, `${tabla}: A ve la suya`);
    assert.equal(await cuantasVe(b.id, tabla), 0, `${tabla}: B no ve la de A`);
  }
});
