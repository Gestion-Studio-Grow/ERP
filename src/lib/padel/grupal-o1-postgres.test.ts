// ============================================================================
// PADEL-CLASES · QA E7 · O-1 del integrante contra Postgres efímero con RLS.
// ============================================================================
//
// Sumar a un alumno que el profe nunca reconoció como integrante le renueva el link UNA vez (O-1:
// el viejo lo pudo sacar quien tipeó ese celular en el turnero). Sumarlo a una segunda grupal, o
// mandarle de nuevo el WhatsApp, NO: si no, el link del WhatsApp anterior moría.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * 3_600_000 + n * DIA).toISOString().slice(0, 10);

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("O-1 integrante: el link se renueva la primera vez y nunca más", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const db = await prismaComoDuenio(base);
  const tenantId = base.a.id;
  await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 0, diasAdelante: 14, maxPendientesPorTel: 2 } });
  await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
  const alumno = async (nombre: string, phone: string, token: string) => {
    const c = await db.client.create({ data: { tenantId, name: nombre, phone } });
    return db.padelAlumno.create({ data: { tenantId, clientId: c.id, token } });
  };
  const juan = await alumno("Juan Pérez", "1161111111", "TokenDeJuanO1Grupal00001");
  const sofia = await alumno("Sofía Ruiz", "1162222222", "TokenDeSofiaO1Grupal0001");
  const profe = await import("@/lib/padel/acciones");
  const grupal = await import("@/lib/padel/acciones-grupal");
  const enA = { negocio: base.a, usuario: base.a.duenia };
  const tokenDeSofia = async () => (await db.padelAlumno.findUniqueOrThrow({ where: { id: sofia.id } })).token;

  // 1ª grupal: Sofía nunca fue reconocida → link nuevo (O-1).
  const r1 = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(2), hora: "10:00", alumnoId: juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ alumnoId: sofia.id }]) }))));
  assert.ok(r1.ok, JSON.stringify(r1));
  const tokenTras1 = await tokenDeSofia();
  assert.notEqual(tokenTras1, sofia.token, "la primera vez se renueva");
  assert.ok(r1.ok && r1.integrantes?.[0]?.wa?.includes(tokenTras1), "el WhatsApp lleva el link vigente");

  // 2ª grupal (por celular, como la tipearía el profe): el link del primer WhatsApp sigue andando.
  const r2 = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(3), hora: "11:00", alumnoId: juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ nombre: "Sofía Ruiz", telefono: "1162222222" }]) }))));
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal(await tokenDeSofia(), tokenTras1, "sumarla a otra grupal no le mata el link");

  // Re-mandar el WhatsApp de su parte tampoco.
  const parte = await db.padelIntegrante.findFirstOrThrow({ where: { tenantId, alumnoId: sofia.id } });
  assert.ok(valor(await ejecutarAccion(enA, () => grupal.avisarIntegrante(parte.id))).ok);
  assert.equal(await tokenDeSofia(), tokenTras1);
});
