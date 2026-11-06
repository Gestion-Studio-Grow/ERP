// RENDÍ — regresión de la certificación adversarial de las tandas 1 y 2, contra una base migrada (las Server Actions REALES).
//
// M1: aprobar exige el gasto vivo y la ficha no anula un gasto con rendición viva. M2: el comprobante no sale por la ruta
// de archivos del proyecto (Diseño pasa sus guardas). MB1: quien rindió y quedó sin ficha no aprueba lo suyo. T1: las FKs
// compuestas (id, tenantId) no dejan colgar una rendición o un anticipo de filas de otro negocio. Corre también con
// PGlite (`node scripts/qa/p1-pglite.mjs <este archivo>`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { GASTO_EN_RENDICION } from "./rendiciones-core";

const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";

test("Rendí regresión: gasto anulado, comprobante privado, autoaprobación sin ficha, FKs por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { rendirGasto, aprobarRendicion, rechazarRendicion } = await import("./acciones-rendiciones");
  const { anularGastoFicha } = await import("./acciones-ficha");
  const { GET } = await import("@/app/admin/(dashboard)/proyectos/[id]/archivo/[archivoId]/route");

  const usuario = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@a.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  const [dis, adm] = await Promise.all([usuario("Disenio"), usuario("Admin")]);
  const persona = (userId: string, rol: string) => duenio.proyectoPersona.create({ data: { tenantId: a.id, userId, nombre: rol, rol }, select: { id: true } });
  const pProd = await persona(a.recepcion.id, "PRODUCCION");
  const pDis = await persona(dis.id, "DISENO");
  const pAdm = await persona(adm.id, "ADMINISTRACION");
  const pDue = await persona(a.duenia.id, "DIRECCION");
  const p1 = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 1, clientId: a.clientes[0], nombre: "Stand 1", servicio: "ARQUITECTURA", etapa: "APROBADO" }, select: { id: true } });
  await duenio.proyectoEquipo.createMany({ data: [pProd, pDis, pAdm, pDue].map((p) => ({ tenantId: a.id, proyectoId: p1.id, personaId: p.id })) });

  const enA = (id: string) => ({ negocio: a, usuario: { id } });
  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  const valor = async <R,>(p: Promise<{ tipo: string }>): Promise<R> => {
    const r = await p;
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as unknown as { valor: R }).valor;
  };
  type Res = { ok: boolean; error?: string };
  const rendir = (uid: string, clave: string) => valor<Res>(ejecutarAccion(enA(uid), () => rendirGasto(form({ proyectoId: p1.id, clave, descripcion: "Taxi", monto: "1000", medio: "PROPIO", foto: FOTO }))));
  const revisar = (uid: string, fn: typeof aprobarRendicion, id: string) => valor<Res>(ejecutarAccion(enA(uid), () => fn(form({ id, comentario: "motivo" }))));
  const ultima = async () => (await duenio.proyectoRendicion.findMany({ where: { tenantId: a.id }, orderBy: { createdAt: "desc" }, take: 1 }))[0];

  // M1: la ficha no anula un gasto con rendición viva; aprobar con el gasto anulado (por fuera) tampoco pasa.
  assert.equal((await rendir(a.recepcion.id, "regr-aaaaaaaaaaaaaaaa-0001")).ok, true);
  const r1 = await ultima();
  const anular = await valor<Res>(ejecutarAccion(enA(adm.id), () => anularGastoFicha(form({ id: r1.gastoId }))));
  assert.equal(anular.ok, false);
  assert.equal(anular.error, GASTO_EN_RENDICION);
  assert.equal((await duenio.proyectoGasto.findUnique({ where: { id: r1.gastoId } }))?.anuladoEl, null);
  await duenio.proyectoGasto.update({ where: { id: r1.gastoId }, data: { anuladoEl: new Date() } });
  assert.equal((await revisar(adm.id, aprobarRendicion, r1.id)).ok, false, "no se aprueba un gasto anulado");
  assert.equal((await duenio.proyectoRendicion.findUnique({ where: { id: r1.id } }))?.estado, "enviada");
  // Rechazada, la ficha ya puede anular (el gasto ya está anulado por el rechazo: no pasa nada dos veces).
  assert.equal((await revisar(adm.id, rechazarRendicion, r1.id)).ok, true);
  assert.equal((await valor<Res>(ejecutarAccion(enA(adm.id), () => anularGastoFicha(form({ id: r1.gastoId }))))).error, undefined);

  // M2: Diseño ve el proyecto, pero el comprobante no sale por la ruta de archivos.
  assert.equal((await rendir(a.recepcion.id, "regr-aaaaaaaaaaaaaaaa-0002")).ok, true);
  const r2 = await ultima();
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: { push: "proyectos" } } });
  const otro = await duenio.proyectoArchivo.create({ data: { tenantId: a.id, proyectoId: p1.id, tipo: "RENDER", nombre: "Render", datos: FOTO }, select: { id: true } });
  const bajar = (archivoId: string) => ejecutarAccion(enA(dis.id), () => GET(new Request(`https://negocio-a.erp.test/admin/proyectos/${p1.id}/archivo/${archivoId}`), { params: Promise.resolve({ id: p1.id, archivoId }) }));
  const control = await bajar(otro.id);
  assert.equal((control as unknown as { valor?: Response }).valor?.status, 200, JSON.stringify(control));
  const ruta = await ejecutarAccion(enA(dis.id), () => GET(new Request(`https://negocio-a.erp.test/admin/proyectos/${p1.id}/archivo/${r2.archivoId}`), { params: Promise.resolve({ id: p1.id, archivoId: r2.archivoId! }) }));
  assert.equal((ruta as unknown as { valor?: Response }).valor?.status, 404, JSON.stringify(ruta));

  // MB1: la Dirección rinde, su ficha queda inactiva (actor `user:<id>`) y aun así no aprueba lo suyo.
  assert.equal((await rendir(a.duenia.id, "regr-aaaaaaaaaaaaaaaa-0003")).ok, true);
  const r3 = await ultima();
  assert.equal(r3.personaId, pDue.id);
  await duenio.proyectoPersona.update({ where: { id: pDue.id }, data: { activa: false } });
  const propia = await revisar(a.duenia.id, aprobarRendicion, r3.id);
  assert.equal(propia.ok, false);
  assert.match(propia.error ?? "", /lo propio/);

  // T1: FKs compuestas. Una rendición de A no cuelga de un gasto, persona o anticipo de B, ni un anticipo de A de una persona de B.
  const pB = await duenio.proyectoPersona.create({ data: { tenantId: b.id, nombre: "Ajena", rol: "PRODUCCION" }, select: { id: true } });
  const pyB = await duenio.proyecto.create({ data: { tenantId: b.id, numero: 1, clientId: b.clientes[0], nombre: "Ajeno", servicio: "ARQUITECTURA", etapa: "APROBADO" }, select: { id: true } });
  const gB = await duenio.proyectoGasto.create({ data: { tenantId: b.id, proyectoId: pyB.id, descripcion: "Ajeno", neto: 1 }, select: { id: true } });
  const antB = await duenio.proyectoAnticipo.create({ data: { tenantId: b.id, personaId: pB.id, montoCentavos: 100 }, select: { id: true } });
  const gA = await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: p1.id, descripcion: "Propio", neto: 1 }, select: { id: true } });
  const fila = { tenantId: a.id, proyectoId: p1.id, gastoId: gA.id, personaId: pProd.id, medio: "PROPIO", montoCentavos: 100 };
  await assert.rejects(duenio.proyectoRendicion.create({ data: { ...fila, gastoId: gB.id } }), "gasto de otro negocio");
  await assert.rejects(duenio.proyectoRendicion.create({ data: { ...fila, personaId: pB.id } }), "persona de otro negocio");
  await assert.rejects(duenio.proyectoRendicion.create({ data: { ...fila, proyectoId: pyB.id } }), "proyecto de otro negocio");
  await assert.rejects(duenio.proyectoRendicion.create({ data: { ...fila, medio: "ANTICIPO", anticipoId: antB.id } }), "anticipo de otro negocio");
  await assert.rejects(duenio.proyectoRendicion.create({ data: { ...fila, medio: "ANTICIPO" } }), "ANTICIPO sin anticipo (CHECK)");
  await assert.rejects(duenio.proyectoAnticipo.create({ data: { tenantId: a.id, personaId: pB.id, montoCentavos: 100 } }), "anticipo a persona de otro negocio");
  await assert.rejects(duenio.proyectoAnticipo.create({ data: { tenantId: a.id, personaId: pProd.id, proyectoId: pyB.id, montoCentavos: 100 } }), "anticipo a proyecto de otro negocio");
  // El control: con todo del mismo negocio, entra.
  await duenio.proyectoRendicion.create({ data: fila });
});
