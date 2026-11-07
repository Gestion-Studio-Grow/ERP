// Importador de la planilla de status (MIA T1): CSV con «;» y comillas, columnas por alias, duplicados (en el archivo y
// contra el negocio), personas por nombre, status → etapa y fecha del evento difusa.

import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDeProyecto, columnasDe, estadoDeStatus, leerCsv, leerFechaEvento, MAX_FILAS_CSV, normalizar, planDeImportacion } from "./importar-status-core";

const PERSONAS = [
  { id: "per-ana", nombre: "Ana Pérez" },
  { id: "per-luis", nombre: "Luis Gómez" },
  { id: "per-x1", nombre: "Sol Díaz" },
  { id: "per-x2", nombre: "sol diaz" },
];

test("CSV: separador «;» de Excel, comillas con «;» y saltos adentro, comillas dobles, BOM y CRLF", () => {
  const t = '﻿Cliente;Proyecto\r\n"Acme; S.A.";"Stand ""Expo""\nnuevo"\r\n\r\nBeta;Lanzamiento\r\n';
  assert.deepEqual(leerCsv(t), [["Cliente", "Proyecto"], ["Acme; S.A.", 'Stand "Expo"\nnuevo'], ["Beta", "Lanzamiento"]]);
  assert.deepEqual(leerCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(leerCsv("a\tb\n1\t2\n"), [["a", "b"], ["1", "2"]]);
});

test("columnas por alias, sin acentos ni mayúsculas; faltan cliente o proyecto → error", () => {
  const { indices, error } = columnasDe(["Etapa", "CLIENTE", "Evento", "Productor", "Comercial", "Fecha del Evento"]);
  assert.equal(error, null);
  assert.deepEqual(indices, { status: 0, cliente: 1, proyecto: 2, productor: 3, comercial: 4, fecha: 5 });
  assert.match(columnasDe(["Cliente", "Status"]).error ?? "", /proyecto/);
  assert.match(columnasDe(["Nada"]).error ?? "", /cliente y proyecto/);
});

test("status de la planilla → etapas del ERP; perdidos con motivo de la lista; lo desconocido avisa", () => {
  assert.deepEqual(estadoDeStatus("Ingresado"), { etapa: "PEDIDO", motivoPerdida: null, reconocido: true });
  assert.equal(estadoDeStatus("COTIZANDO").etapa, "PRESUPUESTO");
  assert.equal(estadoDeStatus("Presentado").etapa, "PROPUESTA");
  assert.equal(estadoDeStatus("Aprobado").etapa, "APROBADO");
  assert.equal(estadoDeStatus("Finalizado").etapa, "CIERRE");
  assert.equal(estadoDeStatus("").etapa, "PEDIDO");
  assert.match(estadoDeStatus("No aprobado").motivoPerdida ?? "", /^Otro — /);
  assert.match(estadoDeStatus("Cancelado").motivoPerdida ?? "", /^El cliente canceló el evento — /);
  assert.deepEqual(estadoDeStatus("en pausa"), { etapa: "PEDIDO", motivoPerdida: null, reconocido: false });
});

test("fecha del evento: día/mes/año o ISO se vuelve fecha; lo difuso queda como texto «a confirmar»", () => {
  assert.deepEqual(leerFechaEvento("12/11/2026"), { fecha: "2026-11-12", texto: null });
  assert.deepEqual(leerFechaEvento("4-6-2026"), { fecha: "2026-06-04", texto: null });
  assert.deepEqual(leerFechaEvento("2026-12-04"), { fecha: "2026-12-04", texto: null });
  assert.deepEqual(leerFechaEvento("a confirmar"), { fecha: null, texto: "a confirmar" });
  assert.deepEqual(leerFechaEvento("4 al 6 de diciembre"), { fecha: null, texto: "4 al 6 de diciembre" });
  assert.deepEqual(leerFechaEvento("13/10"), { fecha: null, texto: "13/10" }, "sin año no se adivina");
  assert.deepEqual(leerFechaEvento("31/02/2026"), { fecha: null, texto: "31/02/2026" }, "fecha imposible queda como texto");
  assert.deepEqual(leerFechaEvento("01/01/1905"), { fecha: null, texto: "01/01/1905" }, "la fecha de 1905 de la planilla no pasa");
  assert.deepEqual(leerFechaEvento("   "), { fecha: null, texto: null });
});

test("plan: nuevas, repetidas en el archivo (sin acentos ni mayúsculas), ya existentes y con error", () => {
  const csv = [
    "Cliente;Proyecto;Productor;Comercial;Status;Fecha del evento",
    "Fundación Ñandú;Stand Expo Agro;Ana Pérez;Luis Gómez;Cotizando;a confirmar",
    "fundacion ñandu;STAND EXPO  AGRO;Ana Pérez;;Presentado;",
    "Acme;Lanzamiento;Juan Nadie;Sol Díaz;No aprobado;12/11/2026",
    "Beta;Convención anual;;;Raro;",
    ";Sin cliente;;;;",
    "Gamma;Ya cargado;;;;",
  ].join("\n");
  const existentes = new Set([claveDeProyecto("GAMMA", "ya cargado")]);
  const plan = planDeImportacion(csv, existentes, PERSONAS);
  assert.equal(plan.error, null);
  assert.deepEqual(plan.resumen, { nueva: 3, repetida: 1, existe: 1, error: 1 });
  const [f1, f2, f3, f4, f5, f6] = plan.filas;
  assert.equal(f1.linea, 2);
  assert.equal(f1.estado, "nueva");
  assert.equal(f1.productorId, "per-ana");
  assert.equal(f1.comercialId, "per-luis");
  assert.equal(f1.etapa, "PRESUPUESTO");
  assert.deepEqual(f1.fecha, { fecha: null, texto: "a confirmar" });
  assert.equal(f2.estado, "repetida");
  assert.match(f2.motivo ?? "", /línea 2/);
  assert.equal(f2.productorId, null, "una repetida no asigna a nadie");
  assert.equal(f3.estado, "nueva");
  assert.equal(f3.productorId, null);
  assert.ok(f3.avisos.some((x) => /Juan Nadie.*no está en el equipo/.test(x)));
  assert.equal(f3.comercialId, null, "dos «Sol Díaz»: no se adivina");
  assert.ok(f3.avisos.some((x) => /dos personas/.test(x)));
  assert.ok(f3.motivoPerdida);
  assert.equal(f3.fecha.fecha, "2026-11-12");
  assert.equal(f4.estado, "nueva");
  assert.ok(f4.avisos.some((x) => /Raro/.test(x)));
  assert.equal(f5.estado, "error");
  assert.equal(f6.estado, "existe");
});

test("plan: la misma planilla contra OTRO negocio no ve los proyectos ni las personas del primero", () => {
  const csv = "cliente,proyecto,productor\nAcme,Stand,Ana Pérez\n";
  const enA = planDeImportacion(csv, new Set([claveDeProyecto("Acme", "Stand")]), PERSONAS);
  const enB = planDeImportacion(csv, new Set(), []);
  assert.equal(enA.filas[0].estado, "existe");
  assert.equal(enB.filas[0].estado, "nueva");
  assert.equal(enB.filas[0].productorId, null, "Ana es de A: en B queda sin asignar");
});

test("plan: archivo vacío, sin títulos, gigante o con demasiadas filas → error y ninguna fila", () => {
  assert.match(planDeImportacion("", new Set(), []).error ?? "", /no trae filas/);
  assert.match(planDeImportacion("cliente,proyecto\n", new Set(), []).error ?? "", /no trae filas/);
  assert.match(planDeImportacion("a,b\n1,2", new Set(), []).error ?? "", /falta la columna/);
  const muchas = "cliente,proyecto\n" + Array.from({ length: MAX_FILAS_CSV + 1 }, (_, i) => `c${i},p${i}`).join("\n");
  const r = planDeImportacion(muchas, new Set(), []);
  assert.match(r.error ?? "", /muchas filas/);
  assert.equal(r.filas.length, 0);
  assert.match(planDeImportacion("cliente,proyecto\n" + "x".repeat(600_000), new Set(), []).error ?? "", /muy grande/);
});

test("normalizar: acentos, eñes, mayúsculas y espacios de más", () => {
  assert.equal(normalizar("  Fundación   ÑANDÚ "), "fundacion nandu");
  assert.equal(claveDeProyecto("Acme ", "stand  1"), claveDeProyecto("ACME", "Stand 1"));
});
