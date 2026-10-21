import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { armarPaleta, atajosDelClub } from "./paleta-core";

const HOY = "2026-10-17";
const TODAS = [
  { id: "agenda", etiqueta: "Agenda" },
  { id: "buffet", etiqueta: "Buffet" },
  { id: "caja", etiqueta: "Caja" },
  { id: "clientes", etiqueta: "Clientes" },
];

test("sin texto: lo de todos los días con su tecla, como el club de hoy", () => {
  const e = M.generarDemo(HOY, 19 * 60);
  const items = armarPaleta(e, { texto: "", hoy: HOY, dia: HOY, solapas: TODAS });
  assert.deepEqual(items.slice(0, 3).map((i) => [i.titulo, i.atajo]), [["Nuevo turno", "N"], ["Abrir cuenta del buffet", "C"], ["Agenda de hoy", "T"]]);
  assert.equal(items.find((i) => i.titulo === "Caja")?.atajo, "3");
});

test("con texto: el cliente que debe sale en rojo con «debe $X»; turnos y cuentas", () => {
  const e = M.generarDemo(HOY, 19 * 60);
  const deudor = e.clientes.find((c) => c.deuda > 0)!;
  const item = armarPaleta(e, { texto: deudor.nombre.split(" ")[0], hoy: HOY, dia: HOY, solapas: TODAS }).find((i) => i.clave === `c-${deudor.id}`);
  assert.ok(item, "el cliente aparece");
  assert.equal(item.rojo, true);
  assert.match(item.detalle, /^debe \$/);
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha")!;
  assert.ok(armarPaleta(e, { texto: r.titular, hoy: HOY, dia: HOY, solapas: TODAS }).some((i) => i.accion.tipo === "turno" && i.accion.id === r.id));
});

test("sólo lo que quien opera ve: sin Clientes no se buscan clientes", () => {
  const e = M.generarDemo(HOY, 19 * 60);
  const deudor = e.clientes.find((c) => c.deuda > 0)!;
  const items = armarPaleta(e, { texto: deudor.nombre, hoy: HOY, dia: HOY, solapas: TODAS.filter((s) => s.id !== "clientes") });
  assert.equal(items.some((i) => i.grupo === "Cliente"), false);
});

test("los atajos de una tecla se apagan desde la paleta (WCAG 2.1.4): sin teclas a la vista y la opción de prenderlos", () => {
  const e = M.generarDemo(HOY, 19 * 60);
  const prendidos = armarPaleta(e, { texto: "", hoy: HOY, dia: HOY, solapas: TODAS });
  assert.ok(prendidos.some((i) => i.accion.tipo === "atajos" && i.accion.prender === false));
  const apagados = armarPaleta(e, { texto: "", hoy: HOY, dia: HOY, solapas: TODAS, atajos: false });
  assert.ok(apagados.every((i) => i.atajo === ""));
  assert.ok(apagados.some((i) => i.accion.tipo === "atajos" && i.accion.prender === true));
});

test("la ayuda de atajos está en la paleta (con «?» si andan los de una tecla) y se encuentra escribiendo «atajos» o «teclado»", () => {
  const e = M.generarDemo(HOY, 19 * 60);
  const ayuda = armarPaleta(e, { texto: "", hoy: HOY, dia: HOY, solapas: TODAS }).find((i) => i.accion.tipo === "ayudaAtajos");
  assert.ok(ayuda, "la entrada está");
  assert.equal(ayuda.grupo, "Ayuda");
  assert.equal(ayuda.atajo, "?");
  assert.equal(armarPaleta(e, { texto: "", hoy: HOY, dia: HOY, solapas: TODAS, atajos: false }).find((i) => i.accion.tipo === "ayudaAtajos")?.atajo, "");
  for (const q of ["atajos", "teclado"]) assert.ok(armarPaleta(e, { texto: q, hoy: HOY, dia: HOY, solapas: TODAS }).some((i) => i.accion.tipo === "ayudaAtajos"), q);
});

test("la lista de atajos: la del club de hoy, con Ctrl/⌘+Z para deshacer; sin los de una tecla si están apagados", () => {
  const todos = atajosDelClub();
  const que = (teclas: string) => todos.find((a) => a.teclas.join("+") === teclas)?.que ?? "";
  assert.match(que("Ctrl+Z"), /^Deshacer/);
  assert.match(que("Ctrl+K"), /^Buscar/);
  for (const t of ["N", "C", "T", "L", "?", "/", "Esc"]) assert.ok(que(t), t);
  assert.match(atajosDelClub({ mac: true }).map((a) => a.teclas.join("+")).join(" "), /⌘\+Z/);
  const apagados = atajosDelClub({ unaTecla: false });
  assert.ok(apagados.every((a) => !a.unaTecla));
  assert.deepEqual(apagados.map((a) => a.teclas.at(-1)), ["K", "Z", "L", "Esc"]);
});
