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
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

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
    const repo = await import("./repo");
    const arm = base.a.id;
    const [prod, taller] = ["mia-prod-test", "mia-taller-test"];
    const dir = base.a.duenia.id;
    const [dir2, com1] = ["arm-dir2", "arm-com1"];
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
    return { base, repo, arm, prod, taller, ajeno: base.b.id, dir, dir2, com1 };
  })();
  return prep;
}

const ctx = (f: Fixture, userId: string) => ({ tenantId: f.arm, userId });

function ok<T extends { ok: boolean }>(r: T, que = ""): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, `${que}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** Una consulta entrante calificada, con contacto, conversación y destino confirmado: lista para asignar. */
async function lista(f: Fixture, nombre: string, dominio: string, destino: "AGENCIA" | "TALLER" = "AGENCIA"): Promise<string> {
  const { repo } = f;
  const dir = ctx(f, f.dir);
  const op = ok(await repo.proponerOportunidad(dir, { tipo: "CONSULTA", marca: { nombre, dominio }, consultaTexto: `Hola, somos ${nombre} y queremos un stand.`, ...PASO }, AHORA), "consulta");
  ok(await repo.crearContacto(dir, { oportunidadId: op.id, nombre: "Ana Demo", email: `ana@${dominio}`, telefono: "11 2345 6789", deConsultaEntrante: true, papel: "DECIDE" }, AHORA), "contacto");
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
    const asignar = (userId: string) => repo.aplicarPase(ctx(f, userId), id, "ASIGNADA", { comercialUserId: f.com1, ...PASO }, AHORA);
    // Doble clic de una Dirección + otra Dirección a la vez.
    const juntos = await Promise.all([asignar(f.dir), asignar(f.dir), asignar(f.dir2)]);
    assert.equal(juntos.filter((r) => r.ok).length, 1, `ronda ${ronda}: entra exactamente una (${JSON.stringify(juntos)})`);
    // El reintento (la red cortó y la persona aprieta de nuevo): no crea otro.
    const reintento = await asignar(f.dir);
    assert.equal(reintento.ok, false, `ronda ${ronda}: el reintento no asigna de nuevo`);

    const d = await prismaComoDuenio(base);
    const enDestino = await d.proyecto.findMany({ where: { tenantId: f.prod, nombre: { startsWith: `Carrera Demo ${ronda}` } }, select: { id: true } });
    assert.equal(enDestino.length, 1, `ronda ${ronda}: un proyecto en Producciones`);
  }
  assert.deepEqual(await filasDe(base, f.arm), antesArm, "en el ARM no nace ningún proyecto, presupuesto ni cliente (V1)");
  assert.deepEqual(await filasDe(base, f.taller), antesTaller, "en el otro negocio de MIA no queda NADA (V5)");
  assert.deepEqual(await filasDe(base, f.ajeno), antesAjeno, "en un negocio ajeno, tampoco");
});
