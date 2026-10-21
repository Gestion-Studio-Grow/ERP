// G8 en el servidor: un guardado de alguien que no es dueño del ERP no puede pisar ni borrar usuarios ni PIN; sólo
// pasa el PIN propio de recepción (src/lib/club/delicado.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "./motor.mjs";
import { conservarLoDelicado } from "./delicado";

const HOY = "2026-10-17";
const sobre = (e: M.EstadoClub) => JSON.stringify({ v: 1, estado: e, secuencia: M.secuenciaIds(), guardado: 1 });
const usuarios = (texto: string) => (JSON.parse(texto) as { estado: M.EstadoClub }).estado.usuarios;

test("recepción guarda con los PIN cambiados, borrados o con un usuario nuevo: quedan los de la base", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  const tocado = structuredClone(vigente);
  const duenio = tocado.usuarios.find((u) => u.rol === "duenio")!;
  duenio.pin = "0000"; // le pisa el PIN a un dueño
  tocado.usuarios = tocado.usuarios.filter((u) => u.rol === "duenio" || u.id !== tocado.usuarios.find((x) => x.rol === "recepcion")!.id); // borra a uno
  tocado.usuarios.push({ id: "u-intruso", nombre: "Intruso", rol: "duenio", pin: "4321", activo: true }); // se suma de dueño
  tocado.caja.fondo = 12345; // lo demás sí pasa
  const r = conservarLoDelicado(sobre(vigente), sobre(tocado));
  assert.equal(r.corregido, true);
  assert.deepEqual(usuarios(r.texto), vigente.usuarios, "los usuarios y los PIN quedan como en la base");
  assert.equal((JSON.parse(r.texto) as { estado: M.EstadoClub }).estado.caja.fondo, 12345, "el resto del club se guarda");
});

test("el PIN propio de recepción sí pasa (válido para su rol); el de un dueño, nunca desde recepción; tampoco un cambio de rol", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  const tocado = structuredClone(vigente);
  const recep = tocado.usuarios.find((u) => u.rol === "recepcion")!;
  const nuevoPin = recep.pin === "47" ? "58" : "47";
  recep.pin = nuevoPin;
  const r = conservarLoDelicado(sobre(vigente), sobre(tocado));
  assert.equal(usuarios(r.texto).find((u) => u.id === recep.id)!.pin, nuevoPin);
  // Un PIN que no es del largo de su rol, no.
  const malo = structuredClone(vigente);
  malo.usuarios.find((u) => u.id === recep.id)!.pin = "123456";
  assert.equal(usuarios(conservarLoDelicado(sobre(vigente), sobre(malo)).texto).find((u) => u.id === recep.id)!.pin, vigente.usuarios.find((u) => u.id === recep.id)!.pin);
  // Subirse a dueño, no.
  const sube = structuredClone(vigente);
  sube.usuarios.find((u) => u.id === recep.id)!.rol = "duenio";
  assert.deepEqual(usuarios(conservarLoDelicado(sobre(vigente), sobre(sube)).texto), vigente.usuarios);
});

test("sin cambios en los usuarios, el texto pasa tal cual; si algo no se puede leer, no se toca", () => {
  const e = M.generarDemo(HOY, 19 * 60);
  const t = sobre(e);
  assert.deepEqual(conservarLoDelicado(t, t), { texto: t, corregido: false });
  assert.deepEqual(conservarLoDelicado("{roto", t), { texto: t, corregido: false });
});
