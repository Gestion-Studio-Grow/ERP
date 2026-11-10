// Cadena de frío (Magra T5): dominio puro, probe de la tabla, visibilidad por rubro y el rango
// guardado en la config de la caja (opcional y tolerante).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RANGO_FRIO_POR_DEFECTO,
  cargarCadenaDeFrio,
  estadoCadenaDeFrio,
  estadoDeEquipo,
  leerTemperatura,
  rangoFrioDesdeAfuera,
  resumenPorEquipo,
  validarLectura,
  validarRangoFrio,
  type Lectura,
} from "./cadena-frio";
import { tablaFrioExiste } from "./schema-probe";
import { resolveRubroId, rubroConPerecederos } from "@/blueprints/retail/rubros";
import { guardarConfigCajaEnTx, guardarEtiquetaPaqueteEnTx, guardarRangoFrioEnTx, leerConfigCaja } from "@/lib/supermercado/config-repo";
import { FORMATO_BALANZA_POR_DEFECTO } from "@/lib/supermercado/balanza";
import { ENTIDAD_CONFIG_CAJA } from "@/lib/supermercado/marcas";

// --- Validación ------------------------------------------------------------------------------

test("lectura válida: equipo normalizado, temperatura con coma o signo, nota opcional", () => {
  assert.deepEqual(validarLectura({ equipo: "  Cámara   1 ", temperatura: "3,456", nota: "  " }), {
    ok: true,
    valor: { equipo: "Cámara 1", temperaturaC: 3.46, nota: null },
  });
  assert.equal(validarLectura({ equipo: "Freezer", temperatura: "-18" }).ok, true);
  assert.equal(validarLectura({ equipo: "x".repeat(40), temperatura: 40, nota: "n".repeat(200) }).ok, true);
  assert.equal(validarLectura({ equipo: "x", temperatura: -40 }).ok, true);
});

test("lectura inválida: equipo vacío o largo, temperatura fuera de −40..40 o ilegible, nota larga", () => {
  assert.equal(validarLectura({ equipo: "   ", temperatura: 2 }).ok, false);
  assert.equal(validarLectura({ equipo: null, temperatura: 2 }).ok, false);
  assert.equal(validarLectura({ equipo: "x".repeat(41), temperatura: 2 }).ok, false);
  for (const t of ["", "abc", "40,5", "-41", null, Number.NaN, Infinity]) {
    assert.equal(validarLectura({ equipo: "Cámara", temperatura: t }).ok, false, `temp ${String(t)}`);
  }
  assert.equal(validarLectura({ equipo: "Cámara", temperatura: 2, nota: "n".repeat(201) }).ok, false);
  assert.equal(leerTemperatura(" 2,5 "), 2.5);
});

test("rango: por defecto 0–4; min < max; lo guardado roto se ignora", () => {
  assert.deepEqual(RANGO_FRIO_POR_DEFECTO, { minC: 0, maxC: 4 });
  assert.deepEqual(validarRangoFrio({ minC: "-2", maxC: "5,5" }), { ok: true, valor: { minC: -2, maxC: 5.5 } });
  assert.equal(validarRangoFrio({ minC: "4", maxC: "4" }).ok, false);
  assert.equal(validarRangoFrio({ minC: "-50", maxC: "4" }).ok, false);
  assert.equal(rangoFrioDesdeAfuera(undefined), null);
  assert.equal(rangoFrioDesdeAfuera({ minC: "0", maxC: 4 }), null);
  assert.equal(rangoFrioDesdeAfuera({ minC: 5, maxC: 1 }), null);
  assert.deepEqual(rangoFrioDesdeAfuera({ minC: 1, maxC: 3 }), { minC: 1, maxC: 3 });
});

// --- Estado por equipo ------------------------------------------------------------------------

const diaDe = (d: Date) => d.toISOString().slice(0, 10);
const HOY = "2026-11-10";
let n = 0;
const lec = (equipo: string, temperaturaC: number, iso: string): Lectura => ({
  id: `l${++n}`,
  equipo,
  temperaturaC,
  medidoEn: new Date(iso),
  medidoPor: null,
  nota: null,
});

test("estado: en rango, fuera de rango (los bordes cuentan como dentro), sin lectura hoy", () => {
  const r = RANGO_FRIO_POR_DEFECTO;
  assert.equal(estadoDeEquipo(lec("C", 4, "2026-11-10T12:00:00Z"), r, HOY, diaDe), "ok");
  assert.equal(estadoDeEquipo(lec("C", 0, "2026-11-10T12:00:00Z"), r, HOY, diaDe), "ok");
  assert.equal(estadoDeEquipo(lec("C", 4.01, "2026-11-10T12:00:00Z"), r, HOY, diaDe), "fuera-de-rango");
  assert.equal(estadoDeEquipo(lec("C", -0.5, "2026-11-10T12:00:00Z"), r, HOY, diaDe), "fuera-de-rango");
  assert.equal(estadoDeEquipo(lec("C", 9, "2026-11-09T23:00:00Z"), r, HOY, diaDe), "sin-lectura-hoy");
});

test("resumen: agrupa sin mayúsculas, usa la última lectura y pone arriba lo que pide acción", () => {
  const lecturas = [
    lec("Cámara 1", 7, "2026-11-10T08:00:00Z"),
    lec("cámara 1", 3, "2026-11-10T10:00:00Z"),
    lec("Exhibidora", 6, "2026-11-10T09:00:00Z"),
    lec("Freezer", -18, "2026-11-08T09:00:00Z"),
  ];
  const r = resumenPorEquipo(lecturas, RANGO_FRIO_POR_DEFECTO, HOY, diaDe);
  assert.deepEqual(
    r.map((e) => [e.equipo, e.estado, e.lecturas.length]),
    [
      ["Exhibidora", "fuera-de-rango", 1],
      ["Freezer", "sin-lectura-hoy", 1],
      ["cámara 1", "ok", 2],
    ],
  );
  assert.equal(r[2].ultima.temperaturaC, 3);
  // Con el rango del negocio cambiado (freezer aparte no se modela: un solo rango por negocio).
  assert.equal(resumenPorEquipo(lecturas, { minC: 0, maxC: 8 }, HOY, diaDe)[0].estado, "sin-lectura-hoy");
});

// --- Probe y visibilidad -----------------------------------------------------------------------

test("probe: sólo information_schema; sin tabla o con error → false", async () => {
  const consultas: string[] = [];
  const db = (n: number | Error) => ({
    $queryRaw: async <T,>(q: TemplateStringsArray): Promise<T> => {
      consultas.push(q.join("?"));
      if (n instanceof Error) throw n;
      return [{ n }] as T;
    },
  });
  assert.equal(await tablaFrioExiste(db(1)), true);
  assert.equal(await tablaFrioExiste(db(0)), false);
  assert.equal(await tablaFrioExiste(db(new Error("caída"))), false);
  assert.ok(consultas.every((c) => c.includes("information_schema.tables") && c.includes("'RegistroFrio'")));
  assert.ok(consultas.every((c) => !/FROM\s+"RegistroFrio"/.test(c)));
});

test("sin la tabla: «En preparación» y CERO consultas a RegistroFrio", async () => {
  let leidas = 0;
  const r = await cargarCadenaDeFrio(true, { migrada: async () => false, leer: async () => (leidas++, []) });
  assert.deepEqual(r, { estado: "falta-migracion" });
  assert.equal(leidas, 0);
  const ok = await cargarCadenaDeFrio(true, { migrada: async () => true, leer: async () => (leidas++, ["x"]) });
  assert.deepEqual(ok, { estado: "lista", datos: ["x"] });
  assert.equal(leidas, 1);
});

const perecederosDe = (slug: string, blueprintId: string | null = null) => rubroConPerecederos(resolveRubroId({ slug, blueprintId }));

test("un negocio sin perecederos (CH) no ve la sección, ni con la tabla aplicada; MAGRA sí", async () => {
  assert.equal(perecederosDe("beauty-spa"), false, "CH: servicios");
  assert.equal(estadoCadenaDeFrio(perecederosDe("beauty-spa"), true), "no-aplica");
  assert.equal(estadoCadenaDeFrio(perecederosDe("shinevelas"), true), "no-aplica");
  assert.equal(estadoCadenaDeFrio(perecederosDe("magra"), true), "lista");
  assert.equal(estadoCadenaDeFrio(perecederosDe("magra"), false), "falta-migracion");
  let preguntas = 0;
  const ch = await cargarCadenaDeFrio(perecederosDe("beauty-spa"), {
    migrada: async () => (preguntas++, true),
    leer: async () => (preguntas++, []),
  });
  assert.deepEqual(ch, { estado: "no-aplica" });
  assert.equal(preguntas, 0, "CH no pregunta ni por la tabla");
});

// --- Rango en la config de la caja (base en memoria, sólo auditLog) -----------------------------

type Fila = { id: string; tenantId: string; entity: string; entityId: string; action: string; actor: string; changes: unknown; createdAt: Date };

function baseFalsa() {
  const filas: Fila[] = [];
  let k = 0;
  const db = {
    auditLog: {
      findMany: async ({ where }: { where: { tenantId: string; entity: string; entityId?: string } }) => {
        const vistas = new Set<string>();
        return filas
          .filter((f) => f.tenantId === where.tenantId && f.entity === where.entity && (!where.entityId || f.entityId === where.entityId))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .filter((f) => (vistas.has(f.entityId) ? false : (vistas.add(f.entityId), true)));
      },
      create: async ({ data }: { data: Omit<Fila, "id" | "createdAt"> }) => {
        k++;
        const f = { ...data, id: `f${k}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, k)) };
        filas.push(f);
        return { id: f.id };
      },
    },
  };
  return { db: db as unknown as Parameters<typeof leerConfigCaja>[0], filas };
}

const T = "tenant-1";

test("config: sin guardar → 0–4; guardar el rango no pisa etiqueta ni balanza; guardar la caja no lo borra", async () => {
  const { db, filas } = baseFalsa();
  assert.deepEqual((await leerConfigCaja(db, T)).rangoFrio, RANGO_FRIO_POR_DEFECTO);
  const v1 = await guardarConfigCajaEnTx(db, T, { config: { formato: FORMATO_BALANZA_POR_DEFECTO, encargados: ["u1"] }, actor: "user:a", versionLeida: null });
  const v2 = await guardarEtiquetaPaqueteEnTx(db, T, { etiquetaPaquete: { leyenda: "Frío", altoMm: 40 }, actor: "user:a", versionLeida: v1 });
  const v3 = await guardarRangoFrioEnTx(db, T, { rangoFrio: { minC: -1, maxC: 3 }, actor: "user:a", versionLeida: v2 });
  let c = await leerConfigCaja(db, T);
  assert.deepEqual(c.rangoFrio, { minC: -1, maxC: 3 });
  assert.deepEqual(c.etiquetaPaquete, { leyenda: "Frío", altoMm: 40 });
  assert.deepEqual(c.encargados, ["u1"]);
  assert.equal(c.porDefecto, false);
  await guardarConfigCajaEnTx(db, T, { config: { formato: FORMATO_BALANZA_POR_DEFECTO, encargados: [] }, actor: "user:b", versionLeida: v3 });
  c = await leerConfigCaja(db, T);
  assert.deepEqual(c.rangoFrio, { minC: -1, maxC: 3 });
  assert.deepEqual(c.etiquetaPaquete, { leyenda: "Frío", altoMm: 40 });
  assert.equal(filas.length, 4);
  assert.ok(filas.every((f) => f.entity === ENTIDAD_CONFIG_CAJA));
});

test("config: un rango guardado roto se lee como el de fábrica; versión vieja se rechaza", async () => {
  const { db, filas } = baseFalsa();
  await guardarRangoFrioEnTx(db, T, { rangoFrio: { minC: 0, maxC: 4 }, actor: "user:a", versionLeida: null });
  (filas[0].changes as Record<string, unknown>).rangoFrio = { minC: "x" };
  assert.deepEqual((await leerConfigCaja(db, T)).rangoFrio, RANGO_FRIO_POR_DEFECTO);
  assert.equal((await leerConfigCaja(db, T)).porDefecto, true, "guardar el rango no inventa un formato de balanza");
  await assert.rejects(guardarRangoFrioEnTx(db, T, { rangoFrio: { minC: 1, maxC: 2 }, actor: "user:a", versionLeida: null }));
});
