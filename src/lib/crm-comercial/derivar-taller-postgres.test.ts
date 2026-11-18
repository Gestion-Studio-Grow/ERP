/**
 * E-1 (GSG-MIA-090 · INT-16): «Derivar al Taller» tiene que hacer nacer el proyecto en MIA Taller, igual que asignar
 * a la Agencia hace nacer el suyo en Producciones. Antes del arreglo el pase escribía sólo en el ARM: la oportunidad
 * quedaba «Derivada al Taller» y en el Taller no había nada.
 *
 * EJECUTADO contra Postgres con RLS, la app conectada como `app_rls` (sin BYPASSRLS). Base efímera local: nada toca
 * Neon. Tres negocios ficticios de MIA: el ARM (`base.a`), «Producciones» (destino AGENCIA, rubro `productora`) y
 * «Taller» (destino TALLER, rubro `taller-stands`, como `mia-taller`). `base.b` es un negocio ajeno. Datos .example.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const AHORA = new Date("2026-11-18T15:00:00Z");
const PASO = { proximoPaso: "Llamar para la reunión", proximoPasoEl: new Date("2026-11-20T15:00:00Z") };
const DATOS_OK = { fechaEvento: "2027-03-10", tipoTrabajo: "stand_modular", presupuestoMin: 5_000_000, presupuestoMax: 8_000_000, quienDecide: "Gerencia de marketing", encaje: true };

type Repo = typeof import("./repo");
type Res = Awaited<ReturnType<Repo["aplicarPase"]>>;
interface Fixture {
  base: BaseEfimera;
  repo: Repo;
  arm: string;
  prod: string;
  taller: string;
  ajeno: string;
  dir: string;
  dir2: string;
  calif: string;
}

let prep: Promise<Fixture> | null = null;
async function preparar(t: import("node:test").TestContext): Promise<Fixture | null> {
  const base = await laBase(t);
  if (!base) return null;
  prep ??= (async () => {
    apuntarLaAppA(base);
    prepararAccionesDeServidor();
    const repo = await import("./repo");
    const arm = base.a.id;
    const [prod, taller] = ["mia-prod-e1", "mia-taller-e1"];
    const dir = base.a.duenia.id;
    const [dir2, calif] = ["arm-e1-dir2", "arm-e1-calif"];
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    try {
      await c.query(`UPDATE "Tenant" SET "blueprintId" = 'arm' WHERE id = $1`, [arm]);
      for (const [id, nombre, bp] of [
        [prod, "Producciones Demo", "productora"],
        [taller, "Taller Demo", "taller-stands"],
      ]) {
        await c.query(`INSERT INTO "Tenant" (id, name, slug, subdomain, "blueprintId", "updatedAt") VALUES ($1, $2, $1, $1, $3, now())`, [id, nombre, bp]);
      }
      for (const [id, nombre] of [
        [dir2, "Dirección dos"],
        [calif, "Calificador"],
      ]) {
        await c.query(`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, $3, $4, 'x', 'RECEPTION'::"UserRole", now())`, [id, arm, nombre, `${id}@arm.example`]);
      }
      // El vínculo lo carga GSG como dueño de la base (la app sólo lo lee).
      await c.query(`INSERT INTO "VinculoNegocio" (id, "tenantId", "destinoTenantId", destino, "cargadoPor") VALUES ('vin-e1-prod', $1, $2, 'AGENCIA', 'GSG test'), ('vin-e1-taller', $1, $3, 'TALLER', 'GSG test')`, [arm, prod, taller]);
    } finally {
      await c.end();
    }
    const d = await prismaComoDuenio(base);
    for (const [userId, rol, puesto] of [
      [dir, "DIRECCION", null],
      [dir2, "DIRECCION", null],
      [calif, "PUESTO", "calificador"],
    ] as const) {
      await d.miembroCrmComercial.create({ data: { tenantId: arm, userId, rol, puesto } });
    }
    const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
    const { CRM_COMERCIAL } = await import("@/cambios/interruptores");
    await d.auditLog.create({ data: filaDeInterruptor({ tenantId: arm, interruptor: CRM_COMERCIAL, accion: "encender", operador: "test" }) });
    return { base, repo, arm, prod, taller, ajeno: base.b.id, dir, dir2, calif };
  })();
  return prep;
}

const ctx = (f: Fixture, userId: string) => ({ tenantId: f.arm, userId });

function ok<T extends { ok: boolean }>(r: T, que = ""): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, `${que}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** Una consulta en conversación, con contacto, datos y destino Taller confirmado por Dirección: lista para derivar. */
let telefonos = 0;
async function paraDerivar(f: Fixture, nombre: string, dominio: string): Promise<string> {
  const telefono = `11 3456 ${String(1000 + ++telefonos)}`;
  const { repo } = f;
  const dir = ctx(f, f.dir);
  const op = ok(await repo.proponerOportunidad(dir, { tipo: "CONSULTA", marca: { nombre, dominio }, consultaTexto: `Hola, somos ${nombre} y queremos un stand.`, ...PASO }, AHORA), "consulta");
  ok(await repo.crearContacto(dir, { oportunidadId: op.id, nombre: "Ana Demo", email: `ana@${dominio}`, telefono, deConsultaEntrante: true, papel: "DECIDE" }, AHORA), "contacto");
  ok(await repo.comprobarIdentidad(dir, op.id, { emailDeQuienEscribe: `ana@${dominio}` }, AHORA));
  ok(await repo.aplicarPase(dir, op.id, "EN_CONVERSACION", {}, AHORA));
  ok(await repo.registrarRespuesta(dir, op.id, "Necesitamos un stand de 18 m2 para la expo de marzo.", AHORA));
  ok(await repo.actualizarDatos(dir, op.id, { datos: DATOS_OK, monto: 6_500_000, moneda: "ARS" }, AHORA));
  ok(await repo.confirmarDestino(dir, op.id, "TALLER", AHORA), "destino Taller");
  return op.id;
}

/** Cuántas filas tiene un negocio en las tablas que una derivación podría tocar (mirado como dueño). */
async function filasDe(base: BaseEfimera, tenantId: string): Promise<Record<string, number>> {
  const d = await prismaComoDuenio(base);
  const [proyectos, presupuestos, clientes, recibidas] = await Promise.all([
    d.proyecto.count({ where: { tenantId } }),
    d.proyectoPresupuesto.count({ where: { tenantId } }),
    d.client.count({ where: { tenantId } }),
    d.asignacionRecibida.count({ where: { tenantId } }),
  ]);
  return { proyectos, presupuestos, clientes, recibidas };
}

const todos = async (f: Fixture) => ({ arm: await filasDe(f.base, f.arm), prod: await filasDe(f.base, f.prod), taller: await filasDe(f.base, f.taller), ajeno: await filasDe(f.base, f.ajeno) });

test("E-1 · derivar al Taller con vínculo activo: nace UN proyecto en el Taller (cliente, presupuesto v1, AsignacionRecibida) y el CRM cierra con la referencia", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const id = await paraDerivar(f, "Derivar Demo", "derivar.example");
  const antes = await todos(f);
  const r = await repo.aplicarPase(ctx(f, f.dir), id, "DERIVADA_AL_TALLER", {}, AHORA);
  ok(r, "derivar");
  assert.equal((r as { etapa: string }).etapa, "DERIVADA_AL_TALLER");

  const d = await prismaComoDuenio(base);
  const o = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true, destinoTenantId: true, proyectoDestinoId: true, monto: true } });
  assert.equal(o.etapa, "DERIVADA_AL_TALLER");
  assert.equal(o.destinoTenantId, f.taller, "la oportunidad guarda en qué negocio nació el proyecto");
  assert.ok(o.proyectoDestinoId, "la oportunidad guarda la referencia al proyecto");
  assert.equal(o.monto, null, "el monto viaja al Taller: en el ARM no queda (igual que al asignar)");

  const p = await d.proyecto.findFirstOrThrow({ where: { id: o.proyectoDestinoId as string }, select: { tenantId: true, nombre: true, clientId: true } });
  assert.equal(p.tenantId, f.taller, "el proyecto es del Taller");
  assert.match(p.nombre, /^Derivar Demo/);
  assert.ok(await d.client.findFirst({ where: { id: p.clientId as string, tenantId: f.taller } }), "el cliente quedó en el Taller");
  const pres = await d.proyectoPresupuesto.findMany({ where: { tenantId: f.taller, proyectoId: o.proyectoDestinoId as string }, select: { version: true } });
  assert.deepEqual(pres.map((x) => x.version), [1], "presupuesto v1");
  assert.equal(await d.asignacionRecibida.count({ where: { tenantId: f.taller, origenTenantId: f.arm, origenOportunidadId: id } }), 1);

  const despues = await todos(f);
  assert.deepEqual(despues.arm, antes.arm, "en el ARM no nace ningún proyecto, presupuesto ni cliente");
  assert.deepEqual(despues.prod, antes.prod, "a Producciones no cruza nada");
  assert.deepEqual(despues.ajeno, antes.ajeno, "a un negocio ajeno, tampoco");
  assert.equal(despues.taller.proyectos, antes.taller.proyectos + 1);
  assert.equal(despues.taller.presupuestos, antes.taller.presupuestos + 1);
  assert.equal(despues.taller.recibidas, antes.taller.recibidas + 1);

  const reg = await d.actividadComercial.findFirst({ where: { tenantId: f.arm, oportunidadId: id, tipo: "PASE" }, orderBy: { createdAt: "desc" }, select: { texto: true } });
  assert.match(reg?.texto ?? "", /El proyecto nace en Taller Demo/, "el registro del CRM dice en qué negocio nació");

  const ficha = ok(await repo.ficha(ctx(f, f.dir), id, AHORA), "ficha");
  assert.equal((ficha as { negocioDestino: string | null }).negocioDestino, "Taller Demo", "la ficha muestra en qué negocio nació");
});

test("E-1 · carrera: doble clic, dos Direcciones a la vez y el reintento dan UN proyecto en el Taller (varias rondas)", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const antes = await todos(f);
  for (let ronda = 1; ronda <= 3; ronda++) {
    const id = await paraDerivar(f, `Carrera Taller ${ronda}`, `carrerataller${ronda}.example`);
    const derivar = (userId: string): Promise<Res> => repo.aplicarPase(ctx(f, userId), id, "DERIVADA_AL_TALLER", {}, AHORA);
    const juntos = await Promise.all([derivar(f.dir), derivar(f.dir), derivar(f.dir2)]);
    assert.equal(juntos.filter((r) => r.ok).length, 1, `ronda ${ronda}: entra exactamente una (${JSON.stringify(juntos)})`);
    const reintento = await derivar(f.dir);
    assert.equal(reintento.ok, false, `ronda ${ronda}: el reintento no deriva de nuevo`);
    const d = await prismaComoDuenio(base);
    const enTaller = await d.proyecto.count({ where: { tenantId: f.taller, nombre: { startsWith: `Carrera Taller ${ronda}` } } });
    assert.equal(enTaller, 1, `ronda ${ronda}: un proyecto en el Taller`);
  }
  const despues = await todos(f);
  assert.equal(despues.taller.proyectos, antes.taller.proyectos + 3, "tres rondas, tres proyectos");
  assert.deepEqual(despues.arm, antes.arm);
  assert.deepEqual(despues.prod, antes.prod);
  assert.deepEqual(despues.ajeno, antes.ajeno);
});

test("E-1 · el pase propuesto por el Calificador y aprobado por Dirección da lo mismo: un proyecto en el Taller", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const id = await paraDerivar(f, "Propuesta Taller", "propuestataller.example");
  // El puesto ve la oportunidad porque tiene una tarea en curso sobre ella (como en la cola real).
  const dd = await prismaComoDuenio(base);
  await dd.tareaComercial.create({ data: { tenantId: f.arm, oportunidadId: id, para: "calificador", tipo: "CALIFICAR", estado: "EN_CURSO", tomadaPor: f.calif, tomadaEl: AHORA, creadaPor: f.dir } });
  ok(await repo.proponerPase(ctx(f, f.calif), id, "DERIVADA_AL_TALLER", {}, AHORA), "propone el Calificador");
  const antes = await filasDe(base, f.taller);
  const r = await repo.aprobarPasePropuesto(ctx(f, f.dir), id, {}, AHORA);
  ok(r, "aprueba Dirección");
  assert.equal((r as { etapa: string }).etapa, "DERIVADA_AL_TALLER");
  const d = await prismaComoDuenio(base);
  const o = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true, destinoTenantId: true, proyectoDestinoId: true, pasePropuesto: true } });
  assert.equal(o.etapa, "DERIVADA_AL_TALLER");
  assert.equal(o.pasePropuesto, null);
  assert.equal(o.destinoTenantId, f.taller);
  assert.equal((await filasDe(base, f.taller)).proyectos, antes.proyectos + 1);
  assert.equal(await d.proyecto.count({ where: { id: o.proyectoDestinoId as string, tenantId: f.taller } }), 1);
  // Aprobar de nuevo (doble clic de Dirección): ya no hay propuesta, no nace otro.
  assert.equal((await repo.aprobarPasePropuesto(ctx(f, f.dir), id, {}, AHORA)).ok, false);
  assert.equal((await filasDe(base, f.taller)).proyectos, antes.proyectos + 1);
});

test("E-1 · sin vínculo activo al Taller no nace nada: rechazo con el aviso, la etapa no cambia y 0 filas en los negocios", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const id = await paraDerivar(f, "Sin Vinculo Taller", "sinvinculotaller.example");
  await d.vinculoNegocio.update({ where: { id: "vin-e1-taller" }, data: { activo: false } });
  try {
    const antes = await todos(f);
    const etapaAntes = (await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true } })).etapa;
    const r = await repo.aplicarPase(ctx(f, f.dir), id, "DERIVADA_AL_TALLER", {}, AHORA);
    assert.equal(r.ok, false, `sin vínculo no deriva: ${JSON.stringify(r)}`);
    assert.match((r as { motivo: string }).motivo, /no tiene un negocio vinculado/, "el aviso lo dice");
    const o = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true, destinoTenantId: true, proyectoDestinoId: true } });
    assert.equal(o.etapa, etapaAntes, "la etapa no cambió");
    assert.equal(o.destinoTenantId, null);
    assert.equal(o.proyectoDestinoId, null);
    assert.deepEqual(await todos(f), antes, "nada escrito en ningún negocio");
  } finally {
    await d.vinculoNegocio.update({ where: { id: "vin-e1-taller" }, data: { activo: true } });
  }
});

test("E-1 · todo o nada: si el Taller no puede crear el proyecto, la etapa en el CRM no cambia", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const id = await paraDerivar(f, "Falla Taller", "fallataller.example");
  const etapaAntes = (await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true } })).etapa;
  const antes = await todos(f);
  // Se le quita a la app, por un momento, el permiso de crear presupuestos: la fase del destino falla a mitad de camino.
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query(`REVOKE INSERT ON "ProyectoPresupuesto" FROM app_rls`);
    const r = await repo.aplicarPase(ctx(f, f.dir), id, "DERIVADA_AL_TALLER", {}, AHORA).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
    assert.equal(r.ok, false, "la derivación no se da por hecha");
  } finally {
    await c.query(`GRANT INSERT ON "ProyectoPresupuesto" TO app_rls`);
    await c.end();
  }
  const o = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true, destinoTenantId: true, proyectoDestinoId: true } });
  assert.equal(o.etapa, etapaAntes, "la etapa no cambió");
  assert.equal(o.proyectoDestinoId, null);
  assert.deepEqual(await todos(f), antes, "ni el proyecto ni el cliente quedaron a medias en el Taller");
});
