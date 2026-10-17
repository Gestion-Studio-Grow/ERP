// El repositorio de la foto del club SIN base (BP-3): versión optimista numérica, poda (la vigente + la última de
// cada día de caja de la ventana; una restauración no borra lo que reemplazó), restaurar sólo un dueño, y que la
// versión y la poda se calculan sin traer la foto. Contra Postgres de verdad (RLS A/B, caja al centavo):
// estado-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as M from "./motor.mjs";
import {
  CAMBIO_MIENTRAS_MIRABAS,
  ENTIDAD_CLUB_ESTADO,
  crearRepoDelClub,
  idsParaPodar,
  metaDeFila,
  type CorrerEnElNegocio,
  type MetaDeFoto,
} from "./estado-repo";
import { leerSobre, resumenDelRespaldo } from "./foto";
import { PURGE_EXEMPT_ENTITIES } from "@/lib/audit-retention";

const TENANT = "tenant-a";
const EJEMPLO = readFileSync(path.join(__dirname, "fixtures", "respaldo-ejemplo.json"), "utf8");
const chico = () => JSON.stringify({ v: 1, estado: M.crearClubReal("2026-10-17"), secuencia: 0 });
/** 15:00 UTC = 12:00 en Argentina: el comienzo del día de caja `dia`. */
const mediodia = (dia: string, horas = 0) => Date.parse(`${dia}T15:00:00Z`) + horas * 3600_000;

interface Fila {
  id: string;
  tenantId: string;
  entity: string;
  entityId: string | null;
  action: string;
  actor: string;
  changes: unknown;
  createdAt: Date;
}

/** `auditLog` en memoria: lo justo que usa el repositorio, y anota qué columnas se pidieron. */
function baseFalsa() {
  const filas: Fila[] = [];
  const selects: string[][] = [];
  let n = 0;
  const coincide = (f: Fila, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && "in" in (v as object) ? ((v as { in: string[] }).in).includes(f[k as keyof Fila] as string) : f[k as keyof Fila] === v,
    );
  const proyectar = (f: Fila, select: Record<string, boolean>) => Object.fromEntries(Object.keys(select).map((k) => [k, f[k as keyof Fila]]));
  const auditLog = {
    async findMany({ where, select }: { where: Record<string, unknown>; select: Record<string, boolean> }) {
      selects.push(Object.keys(select));
      return filas.filter((f) => coincide(f, where)).map((f) => proyectar(f, select));
    },
    async findFirst({ where, select }: { where: Record<string, unknown>; select: Record<string, boolean> }) {
      selects.push(Object.keys(select));
      const f = filas.find((x) => coincide(x, where));
      return f ? proyectar(f, select) : null;
    },
    async create({ data }: { data: Omit<Fila, "id" | "createdAt"> }) {
      const f = { ...data, changes: JSON.parse(JSON.stringify(data.changes)), id: `f${++n}`, createdAt: new Date() } as Fila;
      filas.push(f);
      return { id: f.id };
    },
    async deleteMany({ where }: { where: Record<string, unknown> }) {
      const borrar = filas.filter((f) => coincide(f, where));
      for (const f of borrar) filas.splice(filas.indexOf(f), 1);
      return { count: borrar.length };
    },
  };
  const correr: CorrerEnElNegocio = async (tenantId, fn) => {
    assert.equal(tenantId, TENANT);
    return fn({ auditLog } as never);
  };
  return { filas, selects, correr, metas: () => filas.flatMap((f) => metaDeFila(f) ?? []) };
}

test("la foto del club no la borra la purga de la auditoría", () => {
  assert.ok((PURGE_EXEMPT_ENTITIES as readonly string[]).includes(ENTIDAD_CLUB_ESTADO));
  assert.equal(ENTIDAD_CLUB_ESTADO, "ClubEstado");
});

test("versión optimista numérica: 0 → 1 → 2; quien guarda con una versión vieja choca y se entera de la actual", async () => {
  const b = baseFalsa();
  const repo = crearRepoDelClub(b.correr);
  assert.equal(await repo.leerVigente(TENANT), null);
  const r1 = await repo.guardar(TENANT, chico(), 0, "user:recepcion", mediodia("2026-10-17", 1));
  assert.deepEqual(r1, { ok: true, version: 1, podadas: 0 });
  const r2 = await repo.guardar(TENANT, chico(), 1, "user:recepcion", mediodia("2026-10-17", 2));
  assert.equal(r2.ok && r2.version, 2);
  // Otra terminal que había leído la versión 1:
  assert.deepEqual(await repo.guardar(TENANT, chico(), 1, "user:otra", mediodia("2026-10-17", 3)), { ok: false, motivo: CAMBIO_MIENTRAS_MIRABAS, version: 2 });
  assert.deepEqual(await repo.guardar(TENANT, chico(), 0, "user:otra", mediodia("2026-10-17", 3)), { ok: false, motivo: CAMBIO_MIENTRAS_MIRABAS, version: 2 });
  const v = await repo.leerVigente(TENANT);
  assert.equal(v?.version, 2);
  assert.equal(v?.por, "user:recepcion");
  assert.equal(v?.dia, "2026-10-17");
  // La fila: entidad del club, un documento por negocio, la metadata en `action`.
  const f = b.filas.at(-1)!;
  assert.deepEqual([f.entity, f.entityId, f.action, f.tenantId], [ENTIDAD_CLUB_ESTADO, TENANT, "guardar:2:2026-10-17", TENANT]);
});

test("la versión y la poda se calculan sin traer la foto: sólo se lee `changes` de la vigente", async () => {
  const b = baseFalsa();
  const repo = crearRepoDelClub(b.correr);
  for (let v = 0; v < 5; v++) await repo.guardar(TENANT, chico(), v, "user:x", mediodia("2026-10-17", v));
  b.selects.length = 0;
  await repo.guardar(TENANT, chico(), 5, "user:x", mediodia("2026-10-17", 6));
  await repo.leerVigente(TENANT);
  assert.equal(b.selects.filter((s) => s.includes("changes")).length, 1, JSON.stringify(b.selects));
  assert.deepEqual(b.selects[0], ["id", "action"]);
});

test("una foto que no es del club no se guarda (y no gasta versión)", async () => {
  const b = baseFalsa();
  const repo = crearRepoDelClub(b.correr);
  const r = await repo.guardar(TENANT, '{"v":1,"estado":{}}', 0, "user:x");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.motivo, "FOTO_INVALIDA");
  assert.equal((await repo.guardar(TENANT, chico(), -1, "user:x")).ok, false, "versión negativa");
  assert.equal(b.filas.length, 0);
});

test("poda al guardar: queda la vigente y la última foto de cada día de caja", async () => {
  const b = baseFalsa();
  const repo = crearRepoDelClub(b.correr);
  let v = 0;
  for (const dia of ["2026-10-15", "2026-10-16", "2026-10-17"]) {
    for (let h = 0; h < 4; h++) {
      const r = await repo.guardar(TENANT, chico(), v, "user:x", mediodia(dia, h * 5));
      assert.ok(r.ok);
      v = r.version;
    }
  }
  // 12 guardados: del 15 y del 16 queda la última de cada uno; del 17 (el de hoy) la vigente.
  assert.deepEqual(b.metas().map((m) => [m.version, m.dia]), [[4, "2026-10-15"], [8, "2026-10-16"], [12, "2026-10-17"]]);
  // 11:59 del 18 todavía es la caja del 17 (de 12 a 12): reemplaza a la vigente del 17.
  const r = await repo.guardar(TENANT, chico(), 12, "user:x", mediodia("2026-10-18") - 60_000);
  assert.deepEqual(r, { ok: true, version: 13, podadas: 1 });
  assert.deepEqual(b.metas().map((m) => m.version), [4, 8, 13]);
});

test("poda (pura): ventana de días; una restauración conserva la foto que reemplazó", () => {
  const f = (version: number, dia: string, accion: MetaDeFoto["accion"] = "guardar"): MetaDeFoto => ({ id: `f${version}`, accion, version, dia });
  // Ventana de 3 días: lo del 10 se va aunque sea la última de su día.
  assert.deepEqual(idsParaPodar([f(1, "2026-10-10"), f(2, "2026-10-12"), f(3, "2026-10-13"), f(4, "2026-10-14"), f(5, "2026-10-14")], 3), ["f1", "f4"]);
  // Restaurar el mismo día: queda la de antes de restaurar (f2) y la restaurada vigente (f3); después del siguiente
  // guardado del día, la restaurada pasa a ser reemplazada por la vigente, pero la de ANTES de restaurar sigue.
  assert.deepEqual(idsParaPodar([f(1, "2026-10-17"), f(2, "2026-10-17"), f(3, "2026-10-17", "restaurar")]), ["f1"]);
  assert.deepEqual(idsParaPodar([f(2, "2026-10-17"), f(3, "2026-10-17", "restaurar"), f(4, "2026-10-17")]), ["f3"]);
  // La vigente nunca se borra, aunque esté sola.
  assert.deepEqual(idsParaPodar([f(9, "2026-10-17")]), []);
  assert.deepEqual(idsParaPodar([]), []);
});

test("restaurar: sólo un dueño; valida con el motor, no pide versión y devuelve el resumen (caja al centavo)", async () => {
  const b = baseFalsa();
  const repo = crearRepoDelClub(b.correr);
  await repo.guardar(TENANT, chico(), 0, "user:recepcion", mediodia("2026-10-17", 1));
  assert.deepEqual(await repo.restaurar(TENANT, EJEMPLO, { actor: "user:recepcion", rol: "RECEPTION" }), { ok: false, motivo: "SOLO_DUENIO", detalle: "Restaurar un respaldo lo hace un dueño." });
  const malo = await repo.restaurar(TENANT, '{"v":3}', { actor: "user:duenia", rol: "OWNER" });
  assert.equal(!malo.ok && malo.motivo, "FOTO_INVALIDA");
  const r = await repo.restaurar(TENANT, EJEMPLO, { actor: "user:duenia", rol: "OWNER" }, mediodia("2026-10-17", 3));
  assert.ok(r.ok);
  assert.equal(r.version, 2);
  const ejemplo = leerSobre(EJEMPLO);
  assert.ok(ejemplo.ok);
  assert.deepEqual(r.resumen, resumenDelRespaldo(ejemplo.estado));
  // Lo vigente es el respaldo: misma caja por día, mismos conteos.
  const v = await repo.leerVigente(TENANT);
  const releida = leerSobre(v!.texto);
  assert.ok(releida.ok);
  assert.deepEqual(resumenDelRespaldo(releida.estado), r.resumen);
  assert.equal(b.filas.at(-1)?.action, "restaurar:2:2026-10-17");
  assert.equal(b.filas.at(-1)?.actor, "user:duenia");
  // La foto de antes de restaurar (versión 1) sigue: si el archivo era el equivocado, se vuelve atrás.
  assert.deepEqual(b.metas().map((m) => m.version), [1, 2]);
});
