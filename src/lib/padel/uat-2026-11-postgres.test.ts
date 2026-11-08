// ============================================================================
// UAT 11/2026 (docs/tenants/matiasconsoli/UAT-2026-11.md) — seguridad y plata, con las ACCIONES REALES
// contra Postgres + RLS (base efímera, nunca Neon).
//   R1  Recepción NO cambia el alias/CBU ni el titular (dónde entra la plata); precio y horarios, sí.
//   P1  La Plata del negocio (pantalla y .csv) es de quien tiene `reports:read`: el OWNER. Ni el
//       PROFESSIONAL ni RECEPTION la ven.
//   C2  El alumno cancela con el comprobante EN_REVISION: queda en Pendientes, «Está bien» la deja a
//       favor y «No es válido» la descarta (no es deuda). El camino entero del alumno, por su link.
//
//   node --import tsx --test src/lib/padel/uat-2026-11-postgres.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const H = 3_600_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * H + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let sembrado: Awaited<ReturnType<typeof sembrar>> | null = null;

async function sembrar(base: BaseEfimera) {
  const db = await prismaComoDuenio(base);
  // La app Clases es de módulo duro: sin `padel-clases` asignado, `requireApp` no la abre a nadie.
  await db.tenant.update({ where: { id: base.a.id }, data: { modules: { push: "padel-clases" } } });
  await db.padelConfig.create({
    data: { tenantId: base.a.id, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 120, diasAdelante: 14, maxPendientesPorTel: 2, aliasCbu: "alias.del.duenio", titularCuenta: "Dueño Real" },
  });
  await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId: base.a.id, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
  const profe = await db.user.create({
    data: { tenantId: base.a.id, name: "Profe ayudante", email: "ayudante@negocio-a.erp.test", passwordHash: "x", role: "PROFESSIONAL" },
    select: { id: true },
  });
  return { db, profe };
}

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "5000" });
  if (!sembrado) sembrado = await sembrar(base);
  return {
    base,
    db: sembrado.db,
    profeId: sembrado.profe.id,
    alumno: await import("@/lib/padel/acciones-alumno"),
    profe: await import("@/lib/padel/acciones"),
    config: await import("@/lib/padel/acciones-config"),
    datos: await import("@/lib/padel/datos.server"),
    guardia: await import("@/lib/padel/plata-guardia"),
    exportar: await import("@/app/admin/(dashboard)/clases/plata/exportar/route"),
  };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof preparar>>>;

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}
const duenia = (c: Ctx) => ({ negocio: c.base.a, usuario: c.base.a.duenia });
const recepcion = (c: Ctx) => ({ negocio: c.base.a, usuario: c.base.a.recepcion });
const profesional = (c: Ctx) => ({ negocio: c.base.a, usuario: { id: c.profeId } });
let n = 0;
const link = (c: Ctx) => ({ negocio: c.base.a, headers: { "x-forwarded-for": `198.51.100.${(n++ % 250) + 1}` } });
const cuenta = (c: Ctx) => c.db.padelConfig.findUniqueOrThrow({ where: { tenantId: c.base.a.id }, select: { aliasCbu: true, titularCuenta: true, precioIndividual: true } });

test("R1 — Recepción no cambia la cuenta de cobro; precio y horarios, sí. El dueño, todo", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  for (const [clave, v] of [["aliasCbu", "alias.desviado"], ["titularCuenta", "Otro Titular"]] as const) {
    const r: { ok: boolean } = valor(await ejecutarAccion(recepcion(c), () => c.config.guardarCampoConfig(clave, v)));
    assert.equal(r.ok, false, `${clave}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(
    { aliasCbu: (await cuenta(c)).aliasCbu, titularCuenta: (await cuenta(c)).titularCuenta },
    { aliasCbu: "alias.del.duenio", titularCuenta: "Dueño Real" },
    "la cuenta a la que transfieren los alumnos no se movió",
  );
  assert.ok(valor(await ejecutarAccion(recepcion(c), () => c.config.guardarCampoConfig("precioIndividual", "27000"))).ok);
  assert.equal(Number((await cuenta(c)).precioIndividual), 27_000);
  assert.ok(valor(await ejecutarAccion(recepcion(c), () => c.config.guardarCampoConfig("horarios", [{ diaSemana: 1, desde: "08:00", hasta: "12:00" }]))).ok);

  assert.ok(valor(await ejecutarAccion(duenia(c), () => c.config.guardarCampoConfig("aliasCbu", "alias.nuevo.duenio"))).ok);
  assert.equal((await cuenta(c)).aliasCbu, "alias.nuevo.duenio");
  // El profesional ni siquiera tiene `agenda:manage` fuera de la agenda: lo rebota la guardia.
  assert.equal((await ejecutarAccion(profesional(c), () => c.config.guardarCampoConfig("aliasCbu", "alias.profe"))).tipo, "redireccion");
  assert.equal((await cuenta(c)).aliasCbu, "alias.nuevo.duenio");
});

test("P1 — la Plata (pantalla y .csv) es del dueño: el profesional y recepción no la ven", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const pedido = () => new Request("http://negocio-a.erp.test/admin/clases/plata/exportar?periodo=mes");

  for (const quien of [profesional(c), recepcion(c)]) {
    const csv: Response = valor(await ejecutarAccion(quien, () => c.exportar.GET(pedido())));
    assert.equal(csv.status, 403, "sin el .csv de los cobros");
    const pantalla: SalidaDeAccion<unknown> = await ejecutarAccion(quien, () => c.guardia.requirePlataDeClases());
    assert.equal(pantalla.tipo, "redireccion");
    assert.ok(pantalla.tipo === "redireccion" && !pantalla.destino.includes("/plata"), "la pantalla lo saca de Plata");
  }
  const csv: Response = valor(await ejecutarAccion(duenia(c), () => c.exportar.GET(pedido())));
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
  assert.equal((await ejecutarAccion(duenia(c), () => c.guardia.requirePlataDeClases())).tipo, "respuesta");
});

async function alumnoConClase(c: Ctx, nombre: string, h: string) {
  n++;
  const cl = await c.db.client.create({ data: { tenantId: c.base.a.id, name: nombre, phone: `11591${String(10000 + n)}` } });
  const token = `TokenUat202611Alumno${String(n).padStart(6, "0")}`;
  const al = await c.db.padelAlumno.create({ data: { tenantId: c.base.a.id, clientId: cl.id, token } });
  const empiezaEn = aLas(fechaEn(5), h);
  const clase = await c.db.padelClase.create({
    data: { tenantId: c.base.a.id, alumnoId: al.id, clientId: cl.id, empiezaEn, terminaEn: new Date(empiezaEn.getTime() + H), estado: "CONFIRMADA", confirmadaEl: new Date(), origen: "PROFE", precio: 25_000 },
    select: { id: true },
  });
  return { alumnoId: al.id, token, claseId: clase.id };
}

/** El alumno, por su link: manda el comprobante y después cancela (en término). */
async function mandaYCancela(c: Ctx, a: { token: string; claseId: string }) {
  assert.ok(valor(await ejecutarAccion(link(c), () => c.alumno.subirComprobante(a.token, a.claseId, PNG))).ok, "sube el comprobante");
  const r = valor(await ejecutarAccion(link(c), () => c.alumno.cancelarDesdeLink(a.token, a.claseId)));
  assert.ok(r.ok, JSON.stringify(r));
  const f = await c.db.padelClase.findUniqueOrThrow({ where: { id: a.claseId } });
  assert.deepEqual([f.estado, f.pagoEstado], ["CANCELADA", "EN_REVISION"]);
  const bandeja = valor(await ejecutarAccion(duenia(c), () => c.datos.pendientes()));
  const enLaBandeja = bandeja.comprobantes.find((x) => x.id === a.claseId);
  assert.equal(enLaBandeja?.estado, "CANCELADA", "queda en Pendientes, marcada como cancelada");
}

test("C2 — cancela con el comprobante en revisión → «Está bien»: a favor, sale de Pendientes y no se duplica", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const a = await alumnoConClase(c, "Carla Cancela", "10:00");
  await mandaYCancela(c, a);

  const r = valor(await ejecutarAccion(duenia(c), () => c.profe.moverPago(a.claseId, "validar")));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal((await c.db.padelClase.findUniqueOrThrow({ where: { id: a.claseId } })).pagoEstado, "ACREDITADO");
  const ficha = valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(a.alumnoId)))!;
  assert.equal(ficha.aFavor, 25_000, "la transferencia le queda a favor");
  assert.equal(ficha.debe, 0);
  const bandeja = valor(await ejecutarAccion(duenia(c), () => c.datos.pendientes()));
  assert.ok(!bandeja.comprobantes.some((x) => x.id === a.claseId), "ya no espera en Pendientes");

  // Un segundo «Está bien» (doble toque, otra pestaña) no la acredita dos veces.
  const otra = valor(await ejecutarAccion(duenia(c), () => c.profe.moverPago(a.claseId, "validar")));
  assert.equal(otra.ok, false);
  assert.equal(valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(a.alumnoId)))!.aFavor, 25_000);
});

test("C2 — cancela con el comprobante en revisión → «No es válido»: se descarta, no es deuda ni saldo", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const a = await alumnoConClase(c, "Nora Novale", "12:00");
  await mandaYCancela(c, a);

  const r = valor(await ejecutarAccion(duenia(c), () => c.profe.devolverComprobante(a.claseId, "MONTO")));
  assert.ok(r.ok, JSON.stringify(r));
  const f = await c.db.padelClase.findUniqueOrThrow({ where: { id: a.claseId } });
  assert.deepEqual([f.estado, f.pagoEstado], ["CANCELADA", "PENDIENTE"]);
  const ficha = valor(await ejecutarAccion(duenia(c), () => c.datos.ficha(a.alumnoId)))!;
  assert.equal(ficha.aFavor, 0);
  assert.equal(ficha.debe, 0, "una cancelada no se cobra");
  // Y el alumno no puede volver a mandar comprobante de una clase cancelada.
  assert.equal(valor(await ejecutarAccion(link(c), () => c.alumno.subirComprobante(a.token, a.claseId, PNG))).ok, false);
});
