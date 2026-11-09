// Importador de planillas (Etapa 2 · T3) — núcleo puro: títulos, fechas escritas a mano, Etapa × Status,
// duplicados entre pestañas, huella estable y alias de clientes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBase, MOTIVOS_PERDIDA } from "./gestion-core";
import { cambioLegible } from "./ficha-core";
import {
  buscarPersona,
  claveDeImportacion,
  detectarEncabezado,
  fechaLocal,
  leerFechaDifusa,
  leerMes,
  mapearEtapa,
  mensajeDeDatosCrudos,
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
  assert.equal(est("General", 5), "repetida", "en conflicto no se carga ninguna: General no decide, el conflicto queda en los productores");
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
  assert.equal(despues.yaEnBase.length, 3, "las de General que también están en un productor siguen como repetidas");
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
  assert.equal(claveDeImportacion("t1", "coca cola", "fiesta fin de ano", 2026, 12), fiesta.clave);
  assert.notEqual(claveDeImportacion("t2", "coca cola", "fiesta fin de ano", 2026, 12), fiesta.clave, "la clave es por negocio");
});

// ── Vuelta 1 de la certificación ─────────────────────────────────────────────

test("Drive como hipervínculo (chip de Sheets): la URL segura va a la carpeta; la insegura, sólo al mensaje", () => {
  const h = hoja("Julieta", fila("Acme", "Gala", { drive: "Carpeta" }), fila("Beta", "Feria", { drive: "Carpeta" }), fila("Gamma", "Expo", { drive: "https://drive.google.com/visible" }));
  // La columna Drive es la 7; las filas de datos son la 1, 2 y 3 de la matriz.
  h.links = { "1:7": "https://drive.google.com/drive/folders/abc", "2:7": "javascript:alert(1)", "3:7": "http://inseguro" };
  const p = planificarImportacion([h], base());
  const [gala, feria, expo] = ["Gala", "Feria", "Expo"].map((n) => p.altas.find((a) => a.nombre === n)!);
  assert.equal(gala.carpetaUrl, "https://drive.google.com/drive/folders/abc");
  assert.equal(gala.driveTexto, "Carpeta (https://drive.google.com/drive/folders/abc)");
  assert.equal(feria.carpetaUrl, null, "un link que no es https no va a la carpeta");
  assert.match(mensajeDeDatosCrudos(feria), /Drive: Carpeta \(javascript:alert\(1\)\)/, "queda anotado en el mensaje de datos");
  assert.ok(feria.avisos.some((a) => /no es https/.test(a)));
  assert.equal(expo.carpetaUrl, "https://drive.google.com/visible", "con link inseguro, el texto https visible sigue sirviendo");
});

test("evento que se repite en el año: un proyecto por mes; General + productor del mismo mes sigue siendo uno", () => {
  const hojas = [
    hoja("General", fila("Acme", "Desayuno de prensa", { mes: 3 }), fila("Acme", "Desayuno de prensa", { mes: 9 })),
    hoja("Julieta", fila("Acme", "Desayuno de prensa", { mes: 3, etapa: "Aprobado" }), fila("Acme", "Desayuno de prensa", { mes: "Septiembre" })),
  ];
  const p = planificarImportacion(hojas, base());
  assert.equal(p.altas.length, 2, "marzo y septiembre son dos proyectos");
  assert.deepEqual(p.altas.map((a) => [a.hoja, a.mes]).sort(), [["Julieta", 3], ["Julieta", 9]]);
  assert.equal(p.repetidas.length, 2, "las de General quedan como repetidas de su mes");
  assert.equal(new Set(p.altas.map((a) => a.clave)).size, 2);
  assert.equal(p.altas.find((a) => a.mes === 3)!.clave, claveDeImportacion("t1", "acme", "desayuno de prensa", 2026, 3));
  // Estable: misma planilla → misma huella; con las claves anotadas no se repite nada.
  assert.equal(planificarImportacion(hojas, base()).huella, p.huella);
  assert.equal(planificarImportacion(hojas, base({ claves: p.altas.map((a) => a.clave) })).altas.length, 0);
  // Un solo mes: la clave lleva el mes igual (no depende del resto del archivo); sin mes, el año solo.
  const uno = planificarImportacion([hoja("Julieta", fila("Acme", "Desayuno de prensa", { mes: 3 }))], base());
  assert.equal(uno.altas[0].clave, claveDeImportacion("t1", "acme", "desayuno de prensa", 2026, 3));
  const sinMesSolo = planificarImportacion([hoja("Julieta", fila("Acme", "Desayuno de prensa", { mes: "" }))], base());
  assert.equal(sinMesSolo.altas[0].clave, claveDeImportacion("t1", "acme", "desayuno de prensa", 2026));
  // La fila sin mes dentro de un evento repetido no se adivina: se dice por qué.
  const sinMes = planificarImportacion([hoja("Julieta", fila("Acme", "Desayuno", { mes: 3 }), fila("Acme", "Desayuno", { mes: 9 }), fila("Acme", "Desayuno", { mes: "" }))], base());
  assert.equal(sinMes.altas.length, 2);
  assert.match(sinMes.errores[0].motivo, /varios meses \(3, 9\).*completá la columna Mes/);
});

test("«4-6» con Mes=4: ¿rango o fecha? no se carga una fecha exacta en silencio", () => {
  const r = leerFechaDifusa("4-6", { anio: 2026, mes: 4 });
  assert.equal(r.tipo, "ambigua");
  assert.equal(r.desde, undefined);
  assert.match(r.aviso!, /¿rango del 4 al 6 o una fecha\?/);
  assert.deepEqual(leerFechaDifusa("4/6", { anio: 2026, mes: 4 }).desde, fechaLocal(2026, 4, 6), "con barra sigue decidiendo el Mes");
  assert.deepEqual(leerFechaDifusa("4-6", { anio: 2026, mes: 6 }).desde, fechaLocal(2026, 6, 4), "dd-mm del mes de la columna: fecha");
  const p = planificarImportacion([hoja("Julieta", fila("Acme", "Gala", { mes: 4, fecha: "4-6" }))], base());
  assert.equal(p.altas[0].fechaEvento, null);
  assert.equal(p.filas[0].estado, "revisar");
});

test("historial: la marca del importador se lee en criollo, lo demás pasa igual", () => {
  const marca = { id: "x", entidad: "Importacion", campo: "clave", antes: null, despues: "a".repeat(64) };
  assert.deepEqual(cambioLegible(marca), { id: "x", entidad: "Importacion", campo: "Origen", antes: null, despues: "Importado de planilla" });
  const otro = { entidad: "Proyecto", campo: "Etapa", antes: "Pedido", despues: "Aprobado" };
  assert.equal(cambioLegible(otro), otro);
});

// ── Vuelta 2 de la certificación: la clave de una fila no depende del resto del archivo ──────────────────────

const K3 = claveDeImportacion("t1", "acme", "desayuno", 2026, 3);

test("A1 · subida 1 sólo marzo; subida 2 suma septiembre: septiembre entra y marzo ya está", () => {
  const p1 = planificarImportacion([hoja("Julieta", fila("Acme", "Desayuno", { mes: 3 }))], base());
  assert.equal(p1.altas[0].clave, K3);
  const p2 = planificarImportacion(
    [hoja("Julieta", fila("Acme", "Desayuno", { mes: 3 }), fila("Acme", "Desayuno", { mes: 9 }))],
    base({ claves: [K3], proyectos: [{ cliente: "Acme", nombre: "Desayuno", anio: 2026, mes: 3 }] }),
  );
  assert.deepEqual(p2.altas.map((a) => a.mes), [9], "septiembre se carga");
  assert.equal(p2.yaEnBase.length, 1, "marzo ya está");
});

test("A2 · igual que A1 pero el proyecto se renombró en el ERP: la marca de marzo lo protege, no se duplica", () => {
  const p2 = planificarImportacion(
    [hoja("Julieta", fila("Acme", "Desayuno", { mes: 3 }), fila("Acme", "Desayuno", { mes: 9 }))],
    base({ claves: [K3], proyectos: [{ cliente: "Acme", nombre: "Desayuno de prensa (marzo)", anio: 2026, mes: 3 }] }),
  );
  assert.deepEqual(p2.altas.map((a) => a.mes), [9]);
  // Cargado a mano en marzo (sin marca): la fila de marzo ya está; la de septiembre, no.
  const aMano = planificarImportacion(
    [hoja("Julieta", fila("Acme", "Desayuno", { mes: 3 }), fila("Acme", "Desayuno", { mes: 9 }))],
    base({ proyectos: [{ cliente: "Acme", nombre: "Desayuno", anio: 2026, mes: 3 }] }),
  );
  assert.deepEqual(aMano.altas.map((a) => a.mes), [9]);
  // Proyecto del ERP sin mes conocido: cubre todo el año (no se duplica por las dudas).
  const sinMes = planificarImportacion([hoja("Julieta", fila("Acme", "Desayuno", { mes: 9 }))], base({ proyectos: [{ cliente: "Acme", nombre: "Desayuno", anio: 2026 }] }));
  assert.equal(sinMes.altas.length, 0);
});

test("A3 · General dice marzo y el productor dice abril (corrigió el mes): gana la del productor, un solo proyecto", () => {
  const p = planificarImportacion([hoja("General", fila("Acme", "Desayuno", { mes: 3 })), hoja("Julieta", fila("Acme", "Desayuno", { mes: 4 }))], base());
  assert.deepEqual(p.altas.map((a) => [a.hoja, a.mes]), [["Julieta", 4]]);
  assert.match(p.repetidas[0].motivo, /pestaña de su productor/);
});

test("A4/A5 · huella estable con meses repetidos; la misma planilla en otro negocio da otras claves", () => {
  const hs = [hoja("General", fila("Acme", "Desayuno", { mes: 3 }), fila("Acme", "Desayuno", { mes: "" })), hoja("Julieta", fila("Acme", "Desayuno", { mes: 3 }), fila("Acme", "Desayuno", { mes: 9 }))];
  assert.equal(planificarImportacion(hs, base()).huella, planificarImportacion(hs, base()).huella);
  const a = planificarImportacion(hs, base()), b = planificarImportacion(hs, base({ tenantId: "t2" }));
  assert.ok(a.altas.every((x) => !b.altas.some((y) => y.clave === x.clave)));
});

test("fila sin mes de un proyecto que en el archivo tiene mes: no se adivina; si ya está en el ERP, ya está", () => {
  const hs = [hoja("Julieta", fila("Acme", "Desayuno", { mes: 3 }), fila("Acme", "Desayuno", { mes: "" }))];
  const p = planificarImportacion(hs, base());
  assert.deepEqual(p.altas.map((a) => a.mes), [3]);
  assert.match(p.errores[0].motivo, /mes 3 y esta fila no dice el mes/);
  const despues = planificarImportacion(hs, base({ claves: [K3], proyectos: [{ cliente: "Acme", nombre: "Desayuno", anio: 2026, mes: 3 }] }));
  assert.equal(despues.altas.length, 0);
  assert.equal(despues.yaEnBase.length, 2);
});
