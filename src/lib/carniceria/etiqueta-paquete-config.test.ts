import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALTO_ETIQUETA_MM,
  ETIQUETA_PAQUETE_POR_DEFECTO,
  LEYENDA_CONSERVACION,
  etiquetaPaqueteDesdeAfuera,
  validarEtiquetaPaquete,
} from "./etiqueta-paquete-config";
import { guardarConfigCajaEnTx, guardarEtiquetaPaqueteEnTx, leerConfigCaja } from "@/lib/supermercado/config-repo";
import { FORMATO_BALANZA_POR_DEFECTO, type FormatoBalanza } from "@/lib/supermercado/balanza";
import { ENTIDAD_CONFIG_CAJA } from "@/lib/supermercado/marcas";

// --- Validación pura ---------------------------------------------------------------------------

test("validar: acepta leyenda 0–120 y alto entero 30–120 (también como texto)", () => {
  assert.deepEqual(validarEtiquetaPaquete({ leyenda: "  Mantener en frío  ", altoMm: "40" }), {
    ok: true,
    valor: { leyenda: "Mantener en frío", altoMm: 40 },
  });
  assert.equal(validarEtiquetaPaquete({ leyenda: "", altoMm: 30 }).ok, true);
  assert.equal(validarEtiquetaPaquete({ leyenda: "x".repeat(120), altoMm: 120 }).ok, true);
});

test("validar: rechaza leyenda larga, alto fuera de rango, decimal o vacío", () => {
  assert.equal(validarEtiquetaPaquete({ leyenda: "x".repeat(121), altoMm: 50 }).ok, false);
  for (const altoMm of [29, 121, 50.5, "", "abc", null, Number.NaN]) {
    assert.equal(validarEtiquetaPaquete({ leyenda: "ok", altoMm }).ok, false, `alto ${String(altoMm)}`);
  }
  assert.equal(validarEtiquetaPaquete({ leyenda: 3, altoMm: 50 }).ok, false);
});

test("desde afuera: lo roto da null; el default son los valores de hoy", () => {
  assert.deepEqual(ETIQUETA_PAQUETE_POR_DEFECTO, { leyenda: LEYENDA_CONSERVACION, altoMm: ALTO_ETIQUETA_MM });
  assert.equal(ALTO_ETIQUETA_MM, 50);
  assert.equal(etiquetaPaqueteDesdeAfuera(undefined), null);
  assert.equal(etiquetaPaqueteDesdeAfuera({ leyenda: "a", altoMm: "50" }), null);
  assert.equal(etiquetaPaqueteDesdeAfuera({ leyenda: "a", altoMm: 500 }), null);
  assert.deepEqual(etiquetaPaqueteDesdeAfuera({ leyenda: "a", altoMm: 45 }), { leyenda: "a", altoMm: 45 });
});

// --- Repositorio con una base en memoria (sólo auditLog) ---------------------------------------

type Fila = { id: string; tenantId: string; entity: string; entityId: string; action: string; actor: string; changes: unknown; createdAt: Date };

function baseFalsa(inicial: Omit<Fila, "id" | "createdAt">[] = []) {
  const filas: Fila[] = [];
  let n = 0;
  const alta = (d: Omit<Fila, "id" | "createdAt">) => {
    n++;
    const f = { ...d, id: `f${n}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)) };
    filas.push(f);
    return f;
  };
  for (const d of inicial) alta(d);
  const db = {
    auditLog: {
      findMany: async ({ where }: { where: { tenantId: string; entity: string; entityId?: string } }) => {
        const vistas = new Set<string>();
        return filas
          .filter((f) => f.tenantId === where.tenantId && f.entity === where.entity && (!where.entityId || f.entityId === where.entityId))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .filter((f) => (vistas.has(f.entityId) ? false : (vistas.add(f.entityId), true)));
      },
      create: async ({ data }: { data: Omit<Fila, "id" | "createdAt"> }) => ({ id: alta(data).id }),
    },
  };
  return { db: db as unknown as Parameters<typeof leerConfigCaja>[0], filas };
}

const T = "tenant-1";
const FORMATO_GUARDADO: FormatoBalanza = { ...FORMATO_BALANZA_POR_DEFECTO, digitosProducto: 4 };

test("lectura retrocompatible: lo guardado sin etiquetaPaquete se lee igual que antes, con el default", async () => {
  const { db } = baseFalsa([
    { tenantId: T, entity: ENTIDAD_CONFIG_CAJA, entityId: T, action: "guardar", actor: "user:a", changes: { formato: FORMATO_GUARDADO, encargados: ["u1"] } },
  ]);
  const c = await leerConfigCaja(db, T);
  assert.equal(c.porDefecto, false);
  assert.deepEqual(c.encargados, ["u1"]);
  assert.deepEqual(c.etiquetaPaquete, ETIQUETA_PAQUETE_POR_DEFECTO);
  const vacia = await leerConfigCaja(baseFalsa().db, T);
  assert.equal(vacia.porDefecto, true);
  assert.deepEqual(vacia.etiquetaPaquete, ETIQUETA_PAQUETE_POR_DEFECTO);
});

test("guardar la etiqueta no pisa formato ni encargados; guardar la caja después no la borra", async () => {
  const { db, filas } = baseFalsa();
  const v1 = await guardarConfigCajaEnTx(db, T, { config: { formato: FORMATO_GUARDADO, encargados: ["u1", "u2"] }, actor: "user:a", versionLeida: null });
  const antes = await leerConfigCaja(db, T);
  const v2 = await guardarEtiquetaPaqueteEnTx(db, T, { etiquetaPaquete: { leyenda: "Frío", altoMm: 40 }, actor: "user:a", versionLeida: v1 });
  const despues = await leerConfigCaja(db, T);
  assert.deepEqual(despues.formato, antes.formato);
  assert.deepEqual(despues.encargados, ["u1", "u2"]);
  assert.deepEqual(despues.etiquetaPaquete, { leyenda: "Frío", altoMm: 40 });
  // La caja (o la balanza) guarda sin mandar la etiqueta: se conserva.
  await guardarConfigCajaEnTx(db, T, { config: { formato: FORMATO_GUARDADO, encargados: [] }, actor: "user:b", versionLeida: v2 });
  assert.deepEqual((await leerConfigCaja(db, T)).etiquetaPaquete, { leyenda: "Frío", altoMm: 40 });
  assert.equal(filas.length, 3);
});

test("guardar la etiqueta sin config previa no inventa un formato de balanza", async () => {
  const { db } = baseFalsa();
  await guardarEtiquetaPaqueteEnTx(db, T, { etiquetaPaquete: { leyenda: "", altoMm: 30 }, actor: "user:a", versionLeida: null });
  const c = await leerConfigCaja(db, T);
  assert.equal(c.porDefecto, true);
  assert.deepEqual(c.etiquetaPaquete, { leyenda: "", altoMm: 30 });
});

test("guardar la etiqueta con una versión vieja se rechaza", async () => {
  const { db } = baseFalsa();
  await guardarConfigCajaEnTx(db, T, { config: { formato: FORMATO_GUARDADO, encargados: [] }, actor: "user:a", versionLeida: null });
  await assert.rejects(guardarEtiquetaPaqueteEnTx(db, T, { etiquetaPaquete: { leyenda: "x", altoMm: 50 }, actor: "user:a", versionLeida: null }));
});
