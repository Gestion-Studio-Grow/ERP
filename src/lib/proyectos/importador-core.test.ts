// Importador de planillas (Etapa 2 · T3) — núcleo puro: títulos, fechas escritas a mano, Etapa × Status,
// duplicados entre pestañas, huella estable y alias de clientes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBase, MOTIVOS_PERDIDA } from "./gestion-core";
import {
  buscarPersona,
  claveDeImportacion,
  detectarEncabezado,
  fechaLocal,
  leerFechaDifusa,
  leerMes,
  mapearEtapa,
  MOTIVO_CANCELADO,
  MOTIVO_NO_APROBADO,
  normalizarNombre,
  planificarImportacion,
  type BaseImportacion,
  type Celda,
  type HojaCruda,
} from "./importador-core";

const T = ["Cliente", "Proyecto", "Mes", "Año", "Etapa", "Status", "Fecha", "Drive", "Comentario #1", "Fecha #1", "Comentario #2", "Fecha #2"];
const fila = (cliente: string, proyecto: string, extra: Partial<{ mes: Celda; anio: Celda; etapa: string; status: string; fecha: Celda; drive: string; c1: string; f1: Celda; c2: string; f2: Celda }> = {}): Celda[] => [
  cliente,
  proyecto,
  extra.mes ?? "Marzo",
  extra.anio ?? 2026,
  extra.etapa ?? "En curso",
  extra.status ?? "Ingresado",
  extra.fecha ?? null,
  extra.drive ?? null,
  extra.c1 ?? null,
  extra.f1 ?? null,
  extra.c2 ?? null,
  extra.f2 ?? null,
];
const hoja = (nombre: string, ...filas: Celda[][]): HojaCruda => ({ nombre, filas: [T, ...filas] });
const base = (extra: Partial<BaseImportacion> = {}): BaseImportacion => ({ tenantId: "t1", clientes: [], personas: [], claves: [], proyectos: [], ...extra });

test("encabezado: lo encuentra debajo de un título, con alias, Status/Estado y los pares Comentario/Fecha #n", () => {
  const filas: Celda[][] = [["Planilla de estado 2026"], [], ["  Cliente ", "Nombre del evento", "MES", "Año", "Etapa", "Estado", "Productor", "Diseñador", "Fecha del evento", "Link Drive", "Comentario #1", "Fecha #1", "Comentario #2", "Fecha #2"], ["ACME"]];
  const e = detectarEncabezado(filas)!;
  assert.equal(e.fila, 2);
  assert.deepEqual(e.columnas, { cliente: 0, proyecto: 1, mes: 2, anio: 3, etapa: 4, status: 5, productor: 6, diseno: 7, fecha: 8, drive: 9 });
  assert.deepEqual(e.comentarios, [{ n: 1, texto: 10, fecha: 11 }, { n: 2, texto: 12, fecha: 13 }]);
  assert.equal(detectarEncabezado([["Resumen"], ["Total", 3]]), null, "sin Cliente y Proyecto no hay encabezado");
});

test("fechas: vacía, Date de la planilla, texto exacto, ambigua decidida por el Mes, rango y difusa", () => {
  const ctx = { anio: 2026, mes: 3 };
  // 1. vacía
  assert.equal(leerFechaDifusa(null, ctx).tipo, "vacia");
  assert.equal(leerFechaDifusa("", ctx).tipo, "vacia");
  // 2. Date de SheetJS (medianoche local o UTC: el día no se corre)
  const d = leerFechaDifusa(new Date("2026-03-15T03:00:00Z"), ctx);
  assert.equal(d.tipo, "exacta");
  assert.deepEqual(d.desde, fechaLocal(2026, 3, 15));
  assert.equal(d.aviso, undefined);
  assert.deepEqual(leerFechaDifusa(new Date("2026-03-15T00:00:00Z"), ctx).desde, fechaLocal(2026, 3, 15));
  const invertida = leerFechaDifusa(new Date("2026-05-03T03:00:00Z"), ctx);
  assert.match(invertida.aviso ?? "", /invertido/, "Date con mes distinto de la columna Mes → aviso");
  // 3. texto exacto
  assert.deepEqual(leerFechaDifusa("15/03/2026", ctx).desde, fechaLocal(2026, 3, 15));
  assert.deepEqual(leerFechaDifusa("15/3", ctx).desde, fechaLocal(2026, 3, 15), "sin año: el de la columna Año");
  assert.deepEqual(leerFechaDifusa("6 de marzo", ctx).desde, fechaLocal(2026, 3, 6));
  assert.deepEqual(leerFechaDifusa("6 dic 2025", ctx).desde, fechaLocal(2025, 12, 6));
  assert.deepEqual(leerFechaDifusa(20, ctx).desde, fechaLocal(2026, 3, 20), "un número suelto es el día del Mes");
  const usa = leerFechaDifusa("03/15/2026", ctx);
  assert.deepEqual(usa.desde, fechaLocal(2026, 3, 15));
  assert.match(usa.aviso ?? "", /invertido/);
  // 4. ambigua: los dos ≤ 12 → decide el Mes; si no coincide ninguno, no se carga
  assert.deepEqual(leerFechaDifusa("05/03/2026", { anio: 2026, mes: 3 }).desde, fechaLocal(2026, 3, 5));
  assert.deepEqual(leerFechaDifusa("05/03/2026", { anio: 2026, mes: 5 }).desde, fechaLocal(2026, 5, 3));
  const amb = leerFechaDifusa("05/03/2026", { anio: 2026, mes: 7 });
  assert.equal(amb.tipo, "ambigua");
  assert.equal(amb.desde, undefined);
  assert.equal(amb.texto, "05/03/2026");
  // 5. rango
  const r = leerFechaDifusa("4 al 6 de diciembre", { anio: 2026, mes: 12 });
  assert.equal(r.tipo, "rango");
  assert.deepEqual([r.desde, r.hasta], [fechaLocal(2026, 12, 4), fechaLocal(2026, 12, 6)]);
  const r2 = leerFechaDifusa("del 30/11 al 2/12", { anio: 2026, mes: 11 });
  assert.equal(r2.tipo, "rango");
  assert.deepEqual([r2.desde, r2.hasta], [fechaLocal(2026, 11, 30), fechaLocal(2026, 12, 2)]);
  assert.deepEqual(leerFechaDifusa("4-6 dic", { anio: 2026, mes: 12 }).hasta, fechaLocal(2026, 12, 6));
  assert.deepEqual(leerFechaDifusa("4-6", { anio: 2026, mes: 6 }).desde, fechaLocal(2026, 6, 4), "«4-6» a secas es una fecha, no un rango");
  // 6. difusa
  for (const t of ["fines de marzo", "a definir", "TBD", "31/02/2026"]) {
    const f = leerFechaDifusa(t, ctx);
    assert.ok(f.tipo === "difusa", `${t} → ${f.tipo}`);
    assert.equal(f.desde, undefined);
  }
  assert.equal(leerMes("Septiembre"), 9);
  assert.equal(leerMes("set"), 9);
  assert.equal(leerMes("03 - Marzo"), 3);
});

test("Etapa × Status: la matriz completa y los perdidos con su motivo sumable", () => {
  const casos: [string, string, string, string | null][] = [
    ["En curso", "Ingresado", "PEDIDO", null],
    ["En curso", "Cotizando", "PRESUPUESTO", null],
    ["En curso", "Presentado", "PROPUESTA", null],
    ["Aprobado", "", "APROBADO", null],
    ["Aprobado", "Presentado", "APROBADO", null],
    ["Finalizado", "", "CIERRE", null],
    ["No aprobado", "Presentado", "PROPUESTA", MOTIVO_NO_APROBADO],
    ["Cancelado", "", "PEDIDO", MOTIVO_CANCELADO],
    ["CANCELADO", "Cotizando", "PRESUPUESTO", MOTIVO_CANCELADO],
  ];
  for (const [e, s, etapa, motivo] of casos) {
    const r = mapearEtapa(e, s);
    assert.ok(r.ok, `${e}/${s}`);
    if (r.ok) assert.deepEqual([r.etapa, r.motivoPerdida], [etapa, motivo], `${e}/${s}`);
  }
  assert.equal(mapearEtapa("En curso", "").ok, true, "status vacío: Pedido con aviso");
  assert.equal(mapearEtapa("Pausado", "").ok, false);
  assert.equal(mapearEtapa("", "").ok, false);
  // Los motivos importados siguen sumando en los reportes (motivoBase).
  assert.ok((MOTIVOS_PERDIDA as readonly string[]).includes(motivoBase(MOTIVO_CANCELADO)));
  assert.ok((MOTIVOS_PERDIDA as readonly string[]).includes(motivoBase(MOTIVO_NO_APROBADO)));
});

test("nombres: sin tildes, puntuación ni forma societaria; persona por nombre o nombre de pila único", () => {
  assert.equal(normalizarNombre("Coca-Cola S.A."), "coca cola");
  assert.equal(normalizarNombre("  ACME  S.R.L "), "acme");
  assert.equal(normalizarNombre("Café Martínez SAS"), "cafe martinez");
  assert.equal(normalizarNombre("Sasa"), "sasa");
  const personas = [{ id: "p1", nombre: "Julieta Pérez" }, { id: "p2", nombre: "Juan Gómez" }, { id: "p3", nombre: "Juan Díaz" }];
  assert.deepEqual(buscarPersona("julieta perez", personas), { personaId: "p1", nombre: "Julieta Pérez" });
  assert.deepEqual(buscarPersona("Julieta", personas), { personaId: "p1", nombre: "Julieta Pérez" });
  assert.deepEqual(buscarPersona("Juan", personas), { personaId: null, nombre: "Juan" }, "dos Juan: no se adivina");
});

test("plan: productor gana sobre General, sólo-General se revisa, dos productores es conflicto, ya cargado no se repite", () => {
  const hojas = [
    hoja("General", fila("ACME", "Lanzamiento"), fila("ACME SRL", "Stand Expo"), fila("Beta", "Gala"), fila("Gamma", "Feria")),
    hoja("Julieta", fila("Acme S.R.L.", "Lanzamiento", { etapa: "Aprobado" })),
    hoja("Sin asignar", fila("Beta", "Gala")),
    hoja("Pedro", fila("Gamma", "Feria")),
    hoja("Juan", fila("Gamma", "Feria"), fila("", ""), fila("Delta", "")),
  ];
  const p = planificarImportacion(hojas, base({ personas: [{ id: "pj", nombre: "Julieta Pérez" }] }));
  const est = (h: string, f: number) => p.filas.find((x) => x.hoja === h && x.fila === f)?.estado;
  assert.equal(est("Julieta", 2), "carga");
  assert.equal(est("General", 2), "repetida");
  assert.equal(est("Sin asignar", 2), "carga");
  assert.equal(est("General", 4), "repetida");
  assert.equal(est("General", 3), "revisar", "sólo en General: se carga para revisar");
  assert.equal(est("Pedro", 2), "error");
  assert.equal(est("Juan", 2), "error");
  assert.equal(est("General", 5), "error", "en conflicto no se carga ninguna");
  assert.match(p.filas.find((x) => x.hoja === "Pedro")!.motivo, /Conflicto/);
  assert.equal(est("Juan", 4), "error", "falta el proyecto");
  assert.equal(p.filas.filter((x) => x.hoja === "Juan").length, 2, "la fila vacía no cuenta");

  assert.equal(p.altas.length, 3);
  const lanz = p.altas.find((a) => a.nombre === "Lanzamiento")!;
  assert.equal(lanz.etapa, "APROBADO");
  assert.deepEqual(lanz.productor, { personaId: "pj", nombre: "Julieta Pérez" }, "el productor sale de la pestaña");
  assert.deepEqual(lanz.creadoEl, fechaLocal(2026, 3, 1));
  assert.deepEqual(p.clientesNuevos.map((c) => c.norm).sort(), ["acme", "beta"], "ACME y Acme S.R.L. son un solo cliente nuevo");

  // Misma planilla, misma base → misma huella; con las claves ya anotadas, todo «ya está».
  assert.equal(planificarImportacion(hojas, base({ personas: [{ id: "pj", nombre: "Julieta Pérez" }] })).huella, p.huella);
  const despues = planificarImportacion(hojas, base({ personas: [{ id: "pj", nombre: "Julieta Pérez" }], claves: p.altas.map((a) => a.clave) }));
  assert.equal(despues.altas.length, 0);
  assert.notEqual(despues.huella, p.huella);
  assert.equal(despues.yaEnBase.length, 5);
});

test("plan: clientes existentes por alias, proyecto cargado a mano, perdido con fecha del último comentario", () => {
  const hojas = [
    hoja(
      "Julieta",
      fila("Coca-Cola S.A.", "Activación verano", { etapa: "Cancelado", c1: "Llamamos", f1: "02/03/2026", c2: "Canceló", f2: new Date("2026-03-10T03:00:00Z") }),
      fila("Coca Cola", "Fiesta fin de año", { mes: 12, fecha: "4 al 6 de diciembre", drive: "https://drive.google.com/x", c1: "Pidió render" }),
      fila("Quilmes", "Stand", { drive: "http://inseguro" }),
    ),
  ];
  const p = planificarImportacion(hojas, base({ clientes: [{ id: "c1", nombre: "coca cola" }, { id: "c2", nombre: "COCA-COLA" }], proyectos: [{ cliente: "Quilmes S.A.", nombre: "stand", anio: 2026 }] }));
  assert.equal(p.altas.length, 2);
  assert.ok(p.altas.every((a) => a.cliente.id === "c1"), "el primero de la base gana");
  assert.deepEqual(p.clientesNuevos, []);
  const act = p.altas[0];
  assert.equal(act.motivoPerdida, MOTIVO_CANCELADO);
  assert.deepEqual(act.perdidoEl, fechaLocal(2026, 3, 10));
  assert.equal(act.comentarios.length, 2);
  const fiesta = p.altas[1];
  assert.deepEqual([fiesta.fechaEvento, fiesta.fechaFin], [fechaLocal(2026, 12, 4), fechaLocal(2026, 12, 6)]);
  assert.equal(fiesta.carpetaUrl, "https://drive.google.com/x");
  assert.equal(p.filas[2].estado, "yaEnBase", "Quilmes / Stand ya está cargado a mano");
  assert.equal(claveDeImportacion("t1", "coca cola", "fiesta fin de ano", 2026), fiesta.clave);
  assert.notEqual(claveDeImportacion("t2", "coca cola", "fiesta fin de ano", 2026), fiesta.clave, "la clave es por negocio");
});
