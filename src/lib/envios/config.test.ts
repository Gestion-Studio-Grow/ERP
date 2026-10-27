// Leer y guardar la configuración de envíos — con un doble de `auditLog` en memoria que filtra por
// `tenantId` como lo hace la base (el aislamiento con RLS real lo prueba envios-postgres.test.ts).
//   · sin fila → la configuración de siempre, versión null;
//   · guardar → versión nueva; leer devuelve lo guardado;
//   · choque de versión: si otro guardó en el medio, RechazoDeDominio y no se escribe nada;
//   · aislamiento: lo de un negocio no aparece en otro, ni con la versión del otro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMBIO_MIENTRAS_MIRABAS_ENVIOS, guardarConfigEnviosEnTx, leerConfigEnvios } from "./config";
import { configPorDefecto, type ConfigEnvios } from "./modelo";
import { ENTIDAD_CONFIG_ENVIOS } from "./marcas";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";

type Fila = { id: string; tenantId: string; entity: string; entityId: string | null; action: string; actor: string; changes: unknown; createdAt: Date; channel: string };

function dobleDeBase() {
  const filas: Fila[] = [];
  let n = 0;
  const auditLog = {
    async findMany(args: { where: { tenantId: string; entity: string; entityId?: string }; take?: number }) {
      const w = args.where;
      const out = filas
        .filter((f) => f.tenantId === w.tenantId && f.entity === w.entity && (w.entityId === undefined || f.entityId === w.entityId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.id < a.id ? -1 : 1));
      return args.take ? out.slice(0, args.take) : out;
    },
    async create(args: { data: Omit<Fila, "id" | "createdAt"> }) {
      n += 1;
      const fila = { ...args.data, id: `fila-${String(n).padStart(4, "0")}`, createdAt: new Date(Date.UTC(2026, 9, 22, 12, 0, n)) };
      filas.push(fila);
      return { id: fila.id };
    },
  };
  return { db: { auditLog } as never, filas };
}

const MAGRA = "tenant-magra";
const SHINE = "tenant-shine";

const configMagra: ConfigEnvios = {
  retiroEnLocal: true,
  horarioRetiro: "Lun a sáb 9–19",
  pedidoMinimoEnvio: 20000,
  zonas: [{ id: "barrios", nombre: "Canning – barrios cerrados", costo: 4000, gratisDesde: 60000, franjas: ["L-S 11-13"] }],
  franjasRetiro: [],
  tiendaPausada: null,
};

test("sin configuración guardada, se lee la de siempre con versión null", async () => {
  const { db } = dobleDeBase();
  assert.deepEqual(await leerConfigEnvios(db, MAGRA), { ...configPorDefecto(), version: null });
});

test("guardar y leer: la fila es de ConfigEnvios con el tenantId del negocio, y la versión avanza (MG-030)", async () => {
  const { db, filas } = dobleDeBase();
  const v1 = await guardarConfigEnviosEnTx(db, MAGRA, { config: configMagra, actor: "user:mariano", versionLeida: null });
  const leida = await leerConfigEnvios(db, MAGRA);
  assert.deepEqual(leida, { ...configMagra, version: v1 });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].entity, ENTIDAD_CONFIG_ENVIOS);
  assert.equal(filas[0].tenantId, MAGRA);
  assert.equal(filas[0].entityId, MAGRA);
  assert.equal(filas[0].actor, "user:mariano");

  const v2 = await guardarConfigEnviosEnTx(db, MAGRA, { config: { ...configMagra, pedidoMinimoEnvio: null }, actor: "user:mariano", versionLeida: v1 });
  assert.notEqual(v2, v1);
  const otra = await leerConfigEnvios(db, MAGRA);
  assert.equal(otra.version, v2);
  assert.equal(otra.pedidoMinimoEnvio, null);
});

test("choque de versión: si otro guardó en el medio, RechazoDeDominio y no se pisa nada", async () => {
  const { db, filas } = dobleDeBase();
  const v1 = await guardarConfigEnviosEnTx(db, MAGRA, { config: configMagra, actor: "user:a", versionLeida: null });
  // Las dos personas abrieron la pantalla en v1; la primera guarda.
  await guardarConfigEnviosEnTx(db, MAGRA, { config: { ...configMagra, pedidoMinimoEnvio: 25000 }, actor: "user:a", versionLeida: v1 });
  // La segunda guarda con la versión vieja: rechazo, con el texto para mostrar.
  await assert.rejects(
    guardarConfigEnviosEnTx(db, MAGRA, { config: { ...configMagra, pedidoMinimoEnvio: 30000 }, actor: "user:b", versionLeida: v1 }),
    (e: unknown) => e instanceof RechazoDeDominio && e.message === CAMBIO_MIENTRAS_MIRABAS_ENVIOS,
  );
  // Quien cree que es la primera vez (versión null) también choca.
  await assert.rejects(
    guardarConfigEnviosEnTx(db, MAGRA, { config: configMagra, actor: "user:b", versionLeida: null }),
    (e: unknown) => e instanceof RechazoDeDominio,
  );
  assert.equal(filas.length, 2);
  assert.equal((await leerConfigEnvios(db, MAGRA)).pedidoMinimoEnvio, 25000);
});

test("una configuración inválida se rechaza antes de escribir", async () => {
  const { db, filas } = dobleDeBase();
  await assert.rejects(
    guardarConfigEnviosEnTx(db, MAGRA, { config: { ...configMagra, zonas: [], retiroEnLocal: false }, actor: "user:a", versionLeida: null }),
    (e: unknown) => e instanceof RechazoDeDominio && /al menos una zona/.test(e.message),
  );
  assert.equal(filas.length, 0);
});

test("una fila ilegible cae a la de siempre pero conserva la versión (el próximo guardado no choca)", async () => {
  const { db, filas } = dobleDeBase();
  await (db as { auditLog: { create: (a: unknown) => Promise<unknown> } }).auditLog.create({
    data: { tenantId: MAGRA, entity: ENTIDAD_CONFIG_ENVIOS, entityId: MAGRA, action: "guardar", actor: "x", changes: { config: { zonas: "roto" , retiroEnLocal: false } }, channel: "admin" },
  });
  const leida = await leerConfigEnvios(db, MAGRA);
  assert.equal(leida.version, filas[0].id);
  assert.deepEqual({ ...leida, version: null }, { ...configPorDefecto(), version: null });
  await guardarConfigEnviosEnTx(db, MAGRA, { config: configMagra, actor: "user:a", versionLeida: leida.version });
});

test("aislamiento por negocio: Shine no ve las zonas de Magra ni puede guardar con su versión (MG-037)", async () => {
  const { db, filas } = dobleDeBase();
  const vMagra = await guardarConfigEnviosEnTx(db, MAGRA, { config: configMagra, actor: "user:mariano", versionLeida: null });
  assert.deepEqual(await leerConfigEnvios(db, SHINE), { ...configPorDefecto(), version: null });
  // Shine manda la versión de Magra: no es la vigente de Shine (no tiene ninguna) → rechazo.
  await assert.rejects(
    guardarConfigEnviosEnTx(db, SHINE, { config: configMagra, actor: "user:shine", versionLeida: vMagra }),
    (e: unknown) => e instanceof RechazoDeDominio,
  );
  // Shine guarda lo suyo: no toca lo de Magra.
  await guardarConfigEnviosEnTx(db, SHINE, { config: configPorDefecto(), actor: "user:shine", versionLeida: null });
  assert.equal((await leerConfigEnvios(db, MAGRA)).version, vMagra);
  assert.deepEqual((await leerConfigEnvios(db, SHINE)).zonas, []);
  assert.deepEqual(filas.map((f) => f.tenantId), [MAGRA, SHINE]);
});
