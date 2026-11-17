/**
 * ARM como negocio propio (GSG-CRM-017 · T4): el vínculo ARM → destino y la asignación entre negocios, EJECUTADO
 * contra Postgres con RLS y la app conectada como `app_rls` (sin BYPASSRLS, no dueña de las tablas). Base efímera
 * local: nada toca Neon. Criterios V1–V8 de Factory-GSG `00-ESTADO/certificacion/GSG-CRM-010.md`.
 *
 * Tres negocios de MIA, ficticios: el ARM (`base.a`, con el CRM prendido), «Producciones» (destino AGENCIA) y
 * «Taller» (destino TALLER). `base.b` es un negocio ajeno, sin vínculo. Datos con dominios .example.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, DOMINIO_DE_PRUEBA, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const AHORA = new Date("2026-11-16T15:00:00Z");
const PASO = { proximoPaso: "Llamar para la reunión", proximoPasoEl: new Date("2026-11-20T15:00:00Z") };
const DATOS_OK = { fechaEvento: "2027-03-10", tipoTrabajo: "experiencia", presupuestoMin: 5_000_000, presupuestoMax: 8_000_000, quienDecide: "Gerencia de marketing", encaje: true };

type Repo = typeof import("./repo");
interface Fixture {
  base: BaseEfimera;
  repo: Repo;
  arm: string;
  prod: string;
  taller: string;
  ajeno: string;
  dir: string;
  dir2: string;
  com1: string;
  /** Dueña de Producciones (para probar que ahí el CRM no está). */
  duenaProd: string;
}

/** ¿La tabla del vínculo existe? (antes del arreglo, no: el test igual corre y falla por lo que mide). */
async function hayTabla(base: BaseEfimera, tabla: string): Promise<boolean> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    const r = await c.query(`SELECT to_regclass($1) AS t`, [`"${tabla}"`]);
    return r.rows[0].t !== null;
  } finally {
    await c.end();
  }
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
    const [prod, taller] = ["mia-prod-test", "mia-taller-test"];
    const dir = base.a.duenia.id;
    const [dir2, com1, duenaProd] = ["arm-dir2", "arm-com1", "prod-duena"];
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    try {
      // El ARM tiene sólo el CRM (V1): blueprint «arm» (provisional a confirmar).
      await c.query(`UPDATE "Tenant" SET "blueprintId" = 'arm' WHERE id = $1`, [arm]);
      for (const [id, nombre, bp] of [
        [prod, "Producciones Demo", "productora"],
        [taller, "Taller Demo", "productora"],
      ]) {
        await c.query(`INSERT INTO "Tenant" (id, name, slug, subdomain, "blueprintId", "updatedAt") VALUES ($1, $2, $1, $1, $3, now())`, [id, nombre, bp]);
      }
      for (const [id, nombre] of [
        [dir2, "Dirección dos"],
        [com1, "Comercial uno"],
      ]) {
        await c.query(`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, $3, $4, 'x', 'RECEPTION'::"UserRole", now())`, [id, arm, nombre, `${id}@arm.example`]);
      }
      await c.query(`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, 'Dueña Producciones', 'duena@prod.example', 'x', 'OWNER'::"UserRole", now())`, [duenaProd, prod]);
      // El vínculo lo carga GSG como dueño de la base (la app sólo lo lee: V2).
      if (await hayTabla(base, "VinculoNegocio")) {
        await c.query(`INSERT INTO "VinculoNegocio" (id, "tenantId", "destinoTenantId", destino, "cargadoPor") VALUES ('vin-prod', $1, $2, 'AGENCIA', 'GSG test'), ('vin-taller', $1, $3, 'TALLER', 'GSG test')`, [arm, prod, taller]);
      }
    } finally {
      await c.end();
    }
    const d = await prismaComoDuenio(base);
    for (const [userId, rol] of [
      [dir, "DIRECCION"],
      [dir2, "DIRECCION"],
      [com1, "COMERCIAL"],
    ]) {
      await d.miembroCrmComercial.create({ data: { tenantId: arm, userId, rol } });
    }
    const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
    const { CRM_COMERCIAL } = await import("@/cambios/interruptores");
    await d.auditLog.create({ data: filaDeInterruptor({ tenantId: arm, interruptor: CRM_COMERCIAL, accion: "encender", operador: "test" }) });
    return { base, repo, arm, prod, taller, ajeno: base.b.id, dir, dir2, com1, duenaProd };
  })();
  return prep;
}

const ctx = (f: Fixture, userId: string) => ({ tenantId: f.arm, userId });

function ok<T extends { ok: boolean }>(r: T, que = ""): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, `${que}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** Una consulta entrante calificada, con contacto, conversación y destino confirmado: lista para asignar. */
let telefonos = 0;
async function lista(f: Fixture, nombre: string, dominio: string, destino: "AGENCIA" | "TALLER" = "AGENCIA"): Promise<string> {
  const telefono = `11 2345 ${String(1000 + ++telefonos)}`;
  const { repo } = f;
  const dir = ctx(f, f.dir);
  const op = ok(await repo.proponerOportunidad(dir, { tipo: "CONSULTA", marca: { nombre, dominio }, consultaTexto: `Hola, somos ${nombre} y queremos un stand.`, ...PASO }, AHORA), "consulta");
  ok(await repo.crearContacto(dir, { oportunidadId: op.id, nombre: "Ana Demo", email: `ana@${dominio}`, telefono, deConsultaEntrante: true, papel: "DECIDE" }, AHORA), "contacto");
  ok(await repo.comprobarIdentidad(dir, op.id, { emailDeQuienEscribe: `ana@${dominio}` }, AHORA));
  ok(await repo.aplicarPase(dir, op.id, "EN_CONVERSACION", {}, AHORA));
  ok(await repo.registrarRespuesta(dir, op.id, "Necesitamos 36 m2 para la expo de marzo.", AHORA));
  ok(await repo.actualizarDatos(dir, op.id, { datos: DATOS_OK, monto: 6_500_000, moneda: "ARS" }, AHORA));
  ok(await repo.aplicarPase(dir, op.id, "CALIFICADA", {}, AHORA));
  ok(await repo.confirmarDestino(dir, op.id, destino, AHORA));
  return op.id;
}

/** Cuántas filas tiene un negocio en las tablas que una asignación podría tocar (mirado como dueño). */
async function filasDe(base: BaseEfimera, tenantId: string): Promise<Record<string, number>> {
  const d = await prismaComoDuenio(base);
  const [proyectos, presupuestos, clientes] = await Promise.all([
    d.proyecto.count({ where: { tenantId } }),
    d.proyectoPresupuesto.count({ where: { tenantId } }),
    d.client.count({ where: { tenantId } }),
  ]);
  return { proyectos, presupuestos, clientes };
}

test("V3 · V5 · carrera: doble clic, dos Direcciones a la vez y el reintento dan UN proyecto en UN destino (varias rondas)", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const antesArm = await filasDe(base, f.arm);
  const antesTaller = await filasDe(base, f.taller);
  const antesAjeno = await filasDe(base, f.ajeno);
  for (let ronda = 1; ronda <= 3; ronda++) {
    const id = await lista(f, `Carrera Demo ${ronda}`, `carrera${ronda}.example`);
    const asignar = (userId: string): ReturnType<Repo["aplicarPase"]> => repo.aplicarPase(ctx(f, userId), id, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA);
    // Doble clic de una Dirección + otra Dirección a la vez.
    const juntos: Awaited<ReturnType<Repo["aplicarPase"]>>[] = await Promise.all([asignar(f.dir), asignar(f.dir), asignar(f.dir2)]);
    assert.equal(juntos.filter((r) => r.ok).length, 1, `ronda ${ronda}: entra exactamente una (${JSON.stringify(juntos)})`);
    // El reintento (la red cortó y la persona aprieta de nuevo): no crea otro.
    const reintento = await asignar(f.dir);
    assert.equal(reintento.ok, false, `ronda ${ronda}: el reintento no asigna de nuevo`);

    const d = await prismaComoDuenio(base);
    const enDestino: { id: string }[] = await d.proyecto.findMany({ where: { tenantId: f.prod, nombre: { startsWith: `Carrera Demo ${ronda}` } }, select: { id: true } });
    assert.equal(enDestino.length, 1, `ronda ${ronda}: un proyecto en Producciones`);
  }
  assert.deepEqual(await filasDe(base, f.arm), antesArm, "en el ARM no nace ningún proyecto, presupuesto ni cliente (V1)");
  assert.deepEqual(await filasDe(base, f.taller), antesTaller, "en el otro negocio de MIA no queda NADA (V5)");
  assert.deepEqual(await filasDe(base, f.ajeno), antesAjeno, "en un negocio ajeno, tampoco");
});

/** SQL crudo como la app (`app_rls`, con RLS), en una transacción del negocio `tenantId`. */
async function comoApp<T>(base: BaseEfimera, tenantId: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
}

async function codigoDeError(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

test("V2 · sin vínculo no hay asignación; el vínculo lo carga sólo GSG (la app no lo escribe)", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  // GSG apaga el vínculo con Producciones (destino Agencia): no se asigna y nada se escribe. (El motor todavía no deja
  // asignar destino Taller: entra con T5, cuando se integre el Taller.)
  await d.vinculoNegocio.update({ where: { id: "vin-prod" }, data: { activo: false } });
  try {
    const id = await lista(f, "Sin Vinculo Demo", "sinvinculo.example");
    const antes = { prod: await filasDe(base, f.prod), taller: await filasDe(base, f.taller), arm: await filasDe(base, f.arm) };
    const r = await repo.aplicarPase(ctx(f, f.dir), id, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA);
    assert.equal(r.ok, false);
    assert.match((r as { motivo: string }).motivo, /no tiene un negocio vinculado/);
    const fila = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true, destinoTenantId: true } });
    assert.equal(fila.etapa, "CALIFICADA", "la etapa no cambió");
    assert.equal(fila.destinoTenantId, null);
    assert.deepEqual({ prod: await filasDe(base, f.prod), taller: await filasDe(base, f.taller), arm: await filasDe(base, f.arm) }, antes, "nada escrito en ningún negocio");
    // El rechazo quedó registrado.
    assert.ok(await d.actividadComercial.findFirst({ where: { tenantId: f.arm, oportunidadId: id, tipo: "ACCION_RECHAZADA" } }));
  } finally {
    await d.vinculoNegocio.update({ where: { id: "vin-prod" }, data: { activo: true } });
  }
  // La app (`app_rls`) lee el vínculo de su negocio, pero no lo crea, no lo cambia ni lo borra.
  assert.equal(await comoApp(base, f.arm, async (c) => (await c.query(`SELECT count(*)::int AS n FROM "VinculoNegocio"`)).rows[0].n), 2);
  assert.equal(await codigoDeError(comoApp(base, f.arm, (c) => c.query(`INSERT INTO "VinculoNegocio" (id, "tenantId", "destinoTenantId", destino, "cargadoPor") VALUES ('x', $1, $2, 'AGENCIA', 'app')`, [f.arm, f.ajeno]))), "42501");
  assert.equal(await codigoDeError(comoApp(base, f.arm, (c) => c.query(`UPDATE "VinculoNegocio" SET "destinoTenantId" = $1`, [f.ajeno]))), "42501");
  assert.equal(await codigoDeError(comoApp(base, f.arm, (c) => c.query(`DELETE FROM "VinculoNegocio"`))), "42501");
});

test("V4 · sin saltear RLS: la app corre como app_rls, y cada negocio ve sólo lo suyo del vínculo y de la asignación", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { base } = f;
  // El rol de la app no es superusuario ni saltea RLS.
  const rol = await comoApp(base, f.arm, async (c) => (await c.query(`SELECT current_user AS u, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0]);
  assert.deepEqual(rol, { u: "app_rls", rolsuper: false, rolbypassrls: false });
  assert.equal(process.env.DATABASE_URL, base.urlApp, "la app del test usa la conexión de app_rls");
  const id = await lista(f, "Aislada Demo", "aislada.example");
  const r = await f.repo.aplicarPase(ctx(f, f.dir), id, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA);
  assert.equal(r.ok, true, JSON.stringify(r));
  // Desde el ARM no se ve la asignación recibida ni el proyecto del destino; desde el destino no se ve el vínculo ni la oportunidad.
  const cuenta = (tenant: string, tabla: string) => comoApp(base, tenant, async (c) => (await c.query(`SELECT count(*)::int AS n FROM "${tabla}"`)).rows[0].n as number);
  assert.equal(await cuenta(f.arm, "AsignacionRecibida"), 0);
  assert.equal(await cuenta(f.arm, "Proyecto"), 0);
  assert.equal(await cuenta(f.prod, "VinculoNegocio"), 0);
  assert.equal(await cuenta(f.prod, "Oportunidad"), 0);
  assert.ok((await cuenta(f.prod, "AsignacionRecibida")) >= 1);
  assert.equal(await cuenta(f.taller, "AsignacionRecibida"), 0);
  // Con el GUC del ARM, una fila del destino no se puede escribir (WITH CHECK de la base).
  const p = await (await prismaComoDuenio(base)).proyecto.findFirstOrThrow({ where: { tenantId: f.prod }, select: { id: true } });
  assert.equal(
    await codigoDeError(comoApp(base, f.arm, (c) => c.query(`INSERT INTO "AsignacionRecibida" (id, "tenantId", "origenTenantId", "origenOportunidadId", "proyectoId") VALUES ('y', $1, $2, 'z', $3)`, [f.prod, f.arm, p.id]))),
    "42501",
  );
});

test("V5 · V6 · viajan el cliente, el brief y la conversación; en el ARM no quedan montos; el destino devuelve sólo el estado", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const id = await lista(f, "Viaje Demo", "viaje.example");
  ok(await repo.aplicarPase(ctx(f, f.dir), id, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA), "asignar");

  const op = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true, monto: true, proyectoId: true, destinoTenantId: true, proyectoDestinoId: true, duenoUserId: true } });
  assert.equal(op.etapa, "ASIGNADA");
  assert.equal(op.monto, null, "en el ARM no queda el monto");
  assert.equal(op.proyectoId, null, "el ARM no tiene proyecto propio");
  assert.equal(op.destinoTenantId, f.prod);
  assert.equal(op.duenoUserId, f.com1);
  const p = await d.proyecto.findUniqueOrThrow({ where: { id: op.proyectoDestinoId! }, select: { tenantId: true, etapa: true, brief: true, contactoEmail: true, contactoNombre: true, presupuestoEstimado: true, client: { select: { name: true, email: true, tenantId: true } } } });
  assert.equal(p.tenantId, f.prod);
  assert.equal(p.etapa, "PEDIDO");
  assert.equal(p.client.tenantId, f.prod);
  assert.equal(p.client.name, "Viaje Demo");
  assert.equal(p.client.email, "ana@viaje.example");
  assert.equal(p.contactoNombre, "Ana Demo");
  assert.equal(p.presupuestoEstimado, 6_500_000, "el monto viajó al destino");
  assert.match(p.brief, /Puntaje: 100/);
  assert.match(p.brief, /Conversación en el CRM:/);
  assert.match(p.brief, /Consulta del cliente: Hola, somos Viaje Demo/);
  assert.match(p.brief, /Respondió el cliente: Necesitamos 36 m2/);
  assert.equal(await d.proyectoPresupuesto.count({ where: { tenantId: f.prod, proyectoId: op.proyectoDestinoId! } }), 1);
  // Registro en los dos lados.
  assert.ok(await d.auditLog.findFirst({ where: { tenantId: f.prod, action: "proyecto.crear", entityId: op.proyectoDestinoId! } }), "registro en el destino");
  const pase = await d.actividadComercial.findFirstOrThrow({ where: { tenantId: f.arm, oportunidadId: id, tipo: "PASE", texto: { contains: "Asignada" } }, select: { texto: true } });
  assert.match(pase.texto, /nace en Producciones Demo/);

  // El destino la gana → el ARM la cierra; nada más vuelve.
  assert.equal(ok(await repo.ponerAlDia(ctx(f, f.dir), AHORA)).cerradas, 0);
  await d.proyecto.update({ where: { id: op.proyectoDestinoId! }, data: { etapa: "APROBADO", contactoEmail: "otro@privado.example" } });
  assert.equal(ok(await repo.ponerAlDia(ctx(f, f.dir), AHORA)).cerradas, 1);
  assert.equal((await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true } })).etapa, "GANADA");

  // Otra se pierde en el destino → PERDIDA con el motivo. Ningún dato del destino queda en el ARM.
  const id2 = await lista(f, "Perdida Demo", "perdida.example");
  ok(await repo.aplicarPase(ctx(f, f.dir), id2, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA));
  const op2 = await d.oportunidad.findUniqueOrThrow({ where: { id: id2 }, select: { proyectoDestinoId: true } });
  await d.proyecto.update({ where: { id: op2.proyectoDestinoId! }, data: { perdidoEl: AHORA, motivoPerdida: "Eligieron otra agencia" } });
  // Un proyecto del destino que NO nació de este ARM no se lee aunque una oportunidad apunte a él (lectura acotada).
  const ajeno = await d.proyecto.findFirstOrThrow({ where: { tenantId: f.prod, id: { notIn: [op.proyectoDestinoId!, op2.proyectoDestinoId!] } }, select: { id: true } }).catch(() => null);
  ok(await repo.ponerAlDia(ctx(f, f.dir), AHORA));
  const cerrada = await d.oportunidad.findUniqueOrThrow({ where: { id: id2 }, select: { etapa: true, motivo: true, nota: true } });
  assert.equal(cerrada.etapa, "PERDIDA");
  // GSG-CRM-018c: un motivo que no es del catálogo del proyecto cruza como «Otro», sin su texto.
  assert.equal(cerrada.motivo, "OTRO");
  assert.doesNotMatch(cerrada.nota ?? "", /Eligieron otra agencia/);
  const textos = (await d.actividadComercial.findMany({ where: { tenantId: f.arm }, select: { texto: true } })).map((a) => a.texto).join("\n");
  assert.doesNotMatch(textos, /otro@privado\.example/, "un dato personal del destino no vuelve al ARM");
  void ajeno;
});

test("V5 · el rango de presupuesto se conserva hasta asignar; al asignar viaja al proyecto y en el ARM queda sólo «tenía presupuesto: sí»", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const id = await lista(f, "Rango Demo", "rango.example");
  const antes = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { datos: true } });
  assert.deepEqual([(antes.datos as Record<string, unknown>).presupuestoMin, (antes.datos as Record<string, unknown>).presupuestoMax], [5_000_000, 8_000_000], "calificada: el rango sigue en el ARM");
  ok(await repo.aplicarPase(ctx(f, f.dir), id, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA), "asignar");

  const op = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { datos: true, monto: true, proyectoDestinoId: true } });
  const datos = op.datos as Record<string, unknown>;
  assert.equal(op.monto, null);
  assert.equal("presupuestoMin" in datos, false, `sin rango en el ARM: ${JSON.stringify(datos)}`);
  assert.equal("presupuestoMax" in datos, false, `sin rango en el ARM: ${JSON.stringify(datos)}`);
  assert.equal(datos.teniaPresupuesto, true, "queda sólo si tenía presupuesto");
  assert.equal(datos.tipoTrabajo, "experiencia", "el resto de los datos queda");
  // Viajó al proyecto en la misma asignación.
  const p = await d.proyecto.findUniqueOrThrow({ where: { id: op.proyectoDestinoId! }, select: { presupuestoEstimado: true, brief: true } });
  assert.equal(p.presupuestoEstimado, 6_500_000);
  assert.match(p.brief, /5\.000\.000 a \$\s8\.000\.000/, "el rango viaja en el brief del proyecto");
  // La ficha del ARM ya no muestra montos: «tenía presupuesto: sí».
  const fi = ok(await repo.ficha(ctx(f, f.dir), id, AHORA));
  assert.equal(fi.brief.presupuesto, "Tenía presupuesto: sí");
  assert.doesNotMatch(JSON.stringify(fi), /5\.000\.000|8\.000\.000|5000000|8000000|6500000/, "ningún monto en la ficha del ARM");
  assert.equal(fi.puntaje.puntaje, 100, "el puntaje no cambia por vaciar el rango");
  // Un monto o un rango no vuelve a entrar por la ficha de una asignada.
  const r = await repo.actualizarDatos(ctx(f, f.dir), id, { datos: { presupuestoMin: 1_000_000 } }, AHORA);
  assert.equal(r.ok, false);
  const r2 = await repo.actualizarDatos(ctx(f, f.dir), id, { monto: 1_000_000 }, AHORA);
  assert.equal(r2.ok, false);
  const despues = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { datos: true, monto: true } });
  assert.equal("presupuestoMin" in (despues.datos as Record<string, unknown>), false);
  assert.equal(despues.monto, null);
});

test("V6 · motivo de pérdida: al ARM cruza sólo el motivo de catálogo; el detalle libre queda en el proyecto del destino", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const DETALLE = "Juan Perez (11-5555-0000) dijo que con $ 2.000.000 no llega";
  const libre = /Juan|Perez|5555|2\.000\.000|no llega/;
  // Por la ficha (traer el cierre) y por «poner al día».
  const porFicha = await lista(f, "Motivo Demo", "motivo.example");
  const porDia = await lista(f, "Motivo Dos Demo", "motivo2.example");
  for (const id of [porFicha, porDia]) ok(await repo.aplicarPase(ctx(f, f.dir), id, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA), "asignar");
  const proyectoDe = async (id: string) => (await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { proyectoDestinoId: true } })).proyectoDestinoId!;
  await d.proyecto.update({ where: { id: await proyectoDe(porFicha) }, data: { perdidoEl: AHORA, motivoPerdida: `Eligió otra productora — ${DETALLE}` } });
  await d.proyecto.update({ where: { id: await proyectoDe(porDia) }, data: { perdidoEl: AHORA, motivoPerdida: `Sin presupuesto del cliente — ${DETALLE}` } });
  assert.deepEqual(ok(await repo.traerCierreDelProyecto(ctx(f, f.com1), porFicha, AHORA)), { ok: true, etapa: "PERDIDA", cerrada: true });
  ok(await repo.ponerAlDia(ctx(f, f.dir), AHORA));

  const [a, b] = await Promise.all([porFicha, porDia].map((id) => d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true, motivo: true, nota: true } })));
  assert.deepEqual([a.etapa, a.motivo], ["PERDIDA", "ELIGIO_OTRO"]);
  assert.deepEqual([b.etapa, b.motivo], ["PERDIDA", "SIN_PRESUPUESTO"]);
  for (const o of [a, b]) assert.doesNotMatch(o.nota ?? "", libre, `el detalle libre no cruza: ${o.nota}`);
  const textos = (await d.actividadComercial.findMany({ where: { tenantId: f.arm, oportunidadId: { in: [porFicha, porDia] } }, select: { texto: true } })).map((x) => x.texto).join("\n");
  assert.doesNotMatch(textos, libre, "ni en la línea de tiempo del ARM");
  // En el destino el detalle sigue entero.
  assert.match((await d.proyecto.findUniqueOrThrow({ where: { id: await proyectoDe(porFicha) }, select: { motivoPerdida: true } })).motivoPerdida ?? "", /Juan Perez/);
});

test("C-03 (e) · un lead «no encaja» con 85 puntos no llega a «Calificada»; con encaje «sí», sí", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const dir = ctx(f, f.dir);
  const op = ok(await repo.proponerOportunidad(dir, { tipo: "CONSULTA", marca: { nombre: "Encaje Demo", dominio: "encaje.example" }, consultaTexto: "Queremos un cumpleaños.", ...PASO }, AHORA));
  ok(await repo.crearContacto(dir, { oportunidadId: op.id, nombre: "Eva Demo", email: "eva@encaje.example", telefono: "11 2345 9001", deConsultaEntrante: true, papel: "DECIDE" }, AHORA));
  ok(await repo.comprobarIdentidad(dir, op.id, { emailDeQuienEscribe: "eva@encaje.example" }, AHORA));
  ok(await repo.aplicarPase(dir, op.id, "EN_CONVERSACION", {}, AHORA));
  assert.equal(ok(await repo.actualizarDatos(dir, op.id, { datos: { ...DATOS_OK, encaje: false } }, AHORA)).puntaje, 85);
  const r = await repo.aplicarPase(dir, op.id, "CALIFICADA", {}, AHORA);
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /el encaje marcado «sí»/);
  assert.equal((await d.oportunidad.findUniqueOrThrow({ where: { id: op.id }, select: { etapa: true } })).etapa, "EN_CONVERSACION");
  ok(await repo.actualizarDatos(dir, op.id, { datos: { encaje: true } }, AHORA));
  ok(await repo.aplicarPase(dir, op.id, "CALIFICADA", {}, AHORA), "con encaje «sí» califica");
});

test("V6 · el estado se lee sólo de proyectos que nacieron de este ARM", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  // Un proyecto de Producciones cargado ahí, a mano, y ganado.
  const cli = await d.client.create({ data: { tenantId: f.prod, name: "Propio de Producciones", phone: "5491100000001" }, select: { id: true } });
  const propio = await d.proyecto.create({ data: { tenantId: f.prod, numero: 9001, clientId: cli.id, nombre: "Propio", servicio: "EVENTOS", etapa: "APROBADO" }, select: { id: true } });
  // Una oportunidad del ARM forzada a apuntar a ese proyecto (como si alguien escribiera la columna a mano).
  const forzada = await d.oportunidad.create({
    data: { tenantId: f.arm, tipo: "CONSULTA", etapa: "ASIGNADA", duenoUserId: f.com1, destinoTenantId: f.prod, proyectoDestinoId: propio.id, ...PASO, creadaPor: f.dir },
    select: { id: true },
  });
  ok(await repo.ponerAlDia(ctx(f, f.dir), AHORA));
  assert.equal((await d.oportunidad.findUniqueOrThrow({ where: { id: forzada.id }, select: { etapa: true } })).etapa, "ASIGNADA", "no se cerró con un proyecto que no es suyo");
});

test("B2 · la asignada trae el cierre de SU proyecto desde la ficha: en curso no cambia; ganada en el destino, ganada acá; sólo Dirección o su comercial", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const id = await lista(f, "Cierre Demo", "cierre.example");
  ok(await repo.aplicarPase(ctx(f, f.dir), id, "ASIGNADA", { comercialUserId: f.dir2, ...PASO }, AHORA), "asignar");
  // El comercial que NO la atiende no la trae (la atiende dir2).
  const ajeno = await repo.traerCierreDelProyecto(ctx(f, f.com1), id, AHORA);
  assert.equal(ajeno.ok, false);
  assert.match((ajeno as { motivo: string }).motivo, /Dirección o el comercial que la atiende/);
  // En curso: no cambia nada.
  assert.deepEqual(ok(await repo.traerCierreDelProyecto(ctx(f, f.dir2), id, AHORA)), { ok: true, etapa: "ASIGNADA", cerrada: false });
  const op = await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { proyectoDestinoId: true, etapa: true } });
  assert.equal(op.etapa, "ASIGNADA");
  // Se gana en el destino (lo cierra quien ve todos los proyectos allá) y se trae.
  await d.proyecto.update({ where: { id: op.proyectoDestinoId! }, data: { etapa: "APROBADO" } });
  assert.deepEqual(ok(await repo.traerCierreDelProyecto(ctx(f, f.dir2), id, AHORA)), { ok: true, etapa: "GANADA", cerrada: true });
  assert.equal((await d.oportunidad.findUniqueOrThrow({ where: { id }, select: { etapa: true } })).etapa, "GANADA");
  // Ya cerrada: no se trae de nuevo.
  assert.equal((await repo.traerCierreDelProyecto(ctx(f, f.dir), id, AHORA)).ok, false);
  // Una que no es asignada no trae nada.
  const otra = await lista(f, "Cierre Demo Dos", "cierre2.example");
  assert.equal((await repo.traerCierreDelProyecto(ctx(f, f.dir), otra, AHORA)).ok, false);
});

test("V7 · «ya es cliente» y exclusividad consultan los vinculados con un sí o no, sin traer datos del cliente ajeno", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  await d.client.create({ data: { tenantId: f.prod, name: "Bodega Vieja SA", email: "compras@bodegavieja.example", phone: "5491100000002" } });
  const r = await repo.proponerOportunidad(ctx(f, f.dir), { tipo: "PROSPECTO", marca: { nombre: "Bodega Vieja", dominio: "bodegavieja.example" }, ...PASO }, AHORA);
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /ya es cliente/);
  assert.doesNotMatch(JSON.stringify(r), /compras@|Bodega Vieja SA|5491100000002/, "la respuesta no trae campos del cliente ajeno");
  // La lectura acotada contesta sólo sí o no.
  const si = await repo.clienteEnVinculados(ctx(f, f.dir), [
    { nombre: "Bodega Vieja SA", dominio: null, emails: [] },
    { nombre: "Nadie Demo", dominio: "nadie.example", emails: [] },
  ]);
  assert.deepEqual(si, [true, false]);
  // Una marca que no es cliente en ningún vinculado sí se propone.
  ok(await repo.proponerOportunidad(ctx(f, f.dir), { tipo: "PROSPECTO", marca: { nombre: "Marca Nueva Demo", dominio: "nueva.example" }, ...PASO }, AHORA));

  // Exclusividad: un competidor del mismo rubro, cliente del Taller, va al mismo evento → aviso con el nombre del ARM.
  const ev = await d.eventoRelevado.create({ data: { tenantId: f.arm, clave: "expo vino|2027-05-10|mendoza", nombre: "Expo Vino", fecha: new Date("2027-05-10"), lugar: "Predio", region: "Mendoza", urlFuente: "https://vino.example", verificacion: "confirmado" } });
  const comp = await d.marcaRelevada.create({ data: { tenantId: f.arm, clave: "vinos rivales", nombre: "Vinos Rivales", dominio: "rivales.example", rubro: "Bodega" } });
  await d.eventoMarca.create({ data: { tenantId: f.arm, eventoId: ev.id, marcaId: comp.id, rol: "SPONSOR", urlFuente: "https://vino.example/sponsors", verificacion: "confirmado" } });
  await d.client.create({ data: { tenantId: f.taller, name: "Otro nombre en el Taller", email: "pagos@rivales.example", phone: "5491100000003" } });
  const conAviso = ok(await repo.proponerOportunidad(ctx(f, f.dir), { tipo: "PROSPECTO", marca: { nombre: "Bodega Nueva Demo", dominio: "bodeganueva.example", rubro: "bodega" }, eventoId: ev.id, ...PASO }, AHORA));
  assert.match(conAviso.aviso ?? "", /Vinos Rivales/);
  assert.doesNotMatch(conAviso.aviso ?? "", /Otro nombre en el Taller|pagos@/);
});

test("V7 · con un dominio de correo genérico (gmail, hotmail, yahoo…) no se compara por dominio: sin falso «ya es cliente»", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const genericos = ["gmail.com", "hotmail.com", "hotmail.com.ar", "yahoo.com.ar", "outlook.com", "outlook.es", "live.com", "icloud.com", "protonmail.com", "proton.me"];
  for (const [i, dom] of genericos.entries()) {
    await d.client.create({ data: { tenantId: f.prod, name: `Cliente genérico ${i}`, email: `alguien${i}@${dom}`, phone: `54911000010${String(i).padStart(2, "0")}` } });
  }
  const si = await repo.clienteEnVinculados(ctx(f, f.dir), [
    ...genericos.map((dom) => ({ nombre: `Marca nueva ${dom}`, dominio: dom, emails: [] })),
    { nombre: null, dominio: "WWW.Gmail.com", emails: [] },
    // Un mail conocido exacto sigue contando, aunque sea de Gmail.
    { nombre: null, dominio: "gmail.com", emails: ["alguien0@gmail.com"] },
  ]);
  assert.deepEqual(si, [...genericos.map(() => false), false, true]);
  // La marca nueva con mail de Gmail se puede proponer.
  ok(await repo.proponerOportunidad(ctx(f, f.dir), { tipo: "PROSPECTO", marca: { nombre: "Marca Gmail Demo", dominio: "gmail.com" }, ...PASO }, AHORA), "marca nueva con dominio genérico");
  // Un dominio propio sigue comparándose por dominio.
  await d.client.create({ data: { tenantId: f.prod, name: "Propia SA", email: "pagos@propia.example", phone: "5491100000199" } });
  assert.deepEqual(await repo.clienteEnVinculados(ctx(f, f.dir), [{ nombre: null, dominio: "propia.example", emails: [] }]), [true]);
});

/** Un pedido como si viniera del negocio `slug` (host del subdominio). */
const negocio = (slug: string) => ({ host: `${slug}.${DOMINIO_DE_PRUEBA}` }) as unknown as NegocioDePrueba;

test("V1 · el ARM no corre Proyectos y el destino no tiene el CRM: llamadas rechazadas en los dos sentidos", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { base } = f;
  const d = await prismaComoDuenio(base);
  const antes = await filasDe(base, f.arm);
  // En el ARM: crear un proyecto o convertir una consulta en proyecto → no entra (lleva al CRM) y no escribe.
  const ficha = await import("@/lib/proyectos/acciones-ficha");
  const fd = new FormData();
  fd.set("nombre", "Proyecto en el ARM");
  fd.set("clienteNuevo", "Cliente ARM");
  fd.set("telefono", "1123456789");
  const r1: SalidaDeAccion<unknown> = await ejecutarAccion({ negocio: base.a, usuario: { id: f.dir } }, () => ficha.crearLead(fd));
  assert.deepEqual([r1.tipo, (r1 as { destino?: string }).destino], ["redireccion", "/admin/crm"]);
  const consultas = await import("@/lib/proyectos/acciones-consultas");
  const r2: SalidaDeAccion<unknown> = await ejecutarAccion({ negocio: base.a, usuario: { id: f.dir } }, () => consultas.convertirEnLead({ id: "cualquiera" }));
  assert.equal(r2.tipo, "redireccion");
  assert.deepEqual(await filasDe(base, f.arm), antes, "nada escrito en el ARM");
  // En el destino: el CRM no está prendido → toda acción del CRM rechaza sin escribir.
  const crm = await import("./acciones");
  const opsAntes = await d.oportunidad.count({ where: { tenantId: f.prod } });
  const r3 = await ejecutarAccion({ negocio: negocio(f.prod), usuario: { id: f.duenaProd } }, () => crm.proponerOportunidad({ tipo: "CONSULTA", proximoPaso: "x", proximoPasoEl: AHORA.toISOString() } as never));
  assert.equal(r3.tipo, "respuesta", JSON.stringify(r3));
  assert.match(JSON.stringify((r3 as { valor: unknown }).valor), /no está activado/);
  assert.equal(await d.oportunidad.count({ where: { tenantId: f.prod } }), opsAntes);
});

test("V8 · una sola puerta: la consulta del formulario (clasificada por #179) abre la oportunidad del ARM, una vez", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const { registrarConsulta } = await import("@/lib/proyectos/consultas.server");
  const enviar = (texto: string, email: string) => runInTenantContext(f.arm, () => registrarConsulta({ tenantId: f.arm, canal: "WEB", nombre: "Lucía Demo", email, empresa: "Puerta Demo", texto }));
  const r = await enviar("Hola, queremos un stand para la expo de marzo, ¿cómo trabajan?", "lucia@puerta.example");
  assert.equal(r.ok, true, JSON.stringify(r));
  const consultaId = (r as { id: string }).id;
  const op = await d.oportunidad.findFirstOrThrow({ where: { tenantId: f.arm, consultaId }, select: { id: true, tipo: true, etapa: true, consultaTexto: true, contactoId: true, creadaPor: true } });
  assert.equal(op.tipo, "CONSULTA");
  assert.match(op.consultaTexto ?? "", /stand para la expo/);
  assert.ok(op.contactoId, "el contacto de la consulta queda cargado");
  // Otra vez la misma consulta (reintento o dos a la vez) → la misma oportunidad.
  const otra = await Promise.all([repo.oportunidadDesdeConsulta(f.arm, consultaId), repo.oportunidadDesdeConsulta(f.arm, consultaId)]);
  for (const x of otra) assert.equal(ok(x).id, op.id);
  assert.equal(await d.oportunidad.count({ where: { tenantId: f.arm, consultaId } }), 1);
  // Lo que el clasificador marca como «no es un cliente» no abre oportunidad.
  const prov = await enviar("Somos proveedores de lonas, ofrecemos servicios de impresión.", "ventas@lonas.example");
  assert.equal(prov.ok, true);
  assert.equal(await d.oportunidad.count({ where: { tenantId: f.arm, consultaId: (prov as { id: string }).id } }), 0);
});

test("V8 · lo que no abre oportunidad se ve en el CRM de Dirección (no en Consultas, que el ARM no tiene), con su aviso", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  const { repo, base } = f;
  const d = await prismaComoDuenio(base);
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const { registrarConsulta } = await import("@/lib/proyectos/consultas.server");
  const r = await runInTenantContext(f.arm, () =>
    registrarConsulta({ tenantId: f.arm, canal: "WEB", nombre: "Ramiro Demo", email: "ramiro@insumos.example", empresa: "Insumos Demo", texto: "Somos proveedores de telas, ofrecemos servicios de impresión para stands." }),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  const consultaId = (r as { id: string }).id;
  assert.equal(await d.oportunidad.count({ where: { tenantId: f.arm, consultaId } }), 0);
  // Dirección la ve en el CRM, con lo que escribió.
  const v = ok(await repo.consultasSinOportunidad(ctx(f, f.dir)));
  assert.equal(v.esArm, true);
  const fila = v.consultas.find((c) => c.id === consultaId);
  assert.ok(fila, "la consulta descartada por el clasificador está en la lista");
  assert.equal(fila.intencion, "NO_CLIENTE");
  assert.match(fila.texto ?? "", /proveedores de telas/);
  // El aviso no lleva a Proyectos (el ARM no lo tiene) y se ve en el CRM.
  const aviso = await d.proyectoAviso.findFirstOrThrow({ where: { tenantId: f.arm, destinatario: f.dir, texto: { contains: "Ramiro Demo" } }, select: { enlace: true } });
  assert.doesNotMatch(aviso.enlace ?? "", /\/admin\/proyectos/);
  assert.ok(v.avisos.some((a) => /Ramiro Demo/.test(a.texto)), "el aviso se ve en el CRM");
  // Las que abrieron oportunidad no están; un comercial no ve la lista; otro negocio no ve nada del ARM.
  const conOp = await d.oportunidad.findFirst({ where: { tenantId: f.arm, consultaId: { not: null } }, select: { consultaId: true } });
  if (conOp) assert.equal(v.consultas.some((c) => c.id === conOp.consultaId), false);
  assert.equal((await repo.consultasSinOportunidad(ctx(f, f.com1))).ok, false);
  assert.equal((await repo.consultasSinOportunidad({ tenantId: f.ajeno, userId: base.b.duenia.id })).ok, false);
});
