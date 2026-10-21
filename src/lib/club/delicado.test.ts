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

test("con PIN con hash (21/10): la sal del club no la cambia otro puesto; el PIN propio de recepción con hash pasa, el de un dueño no", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  M.pasarPinesAHash(vigente);
  const tocado = structuredClone(vigente);
  // Recepción cambia su PIN (con la misma sal) e intenta cambiar la sal y el PIN de un dueño.
  const lu = tocado.usuarios.find((u) => u.rol === "recepcion")!;
  lu.pin = M.hashPin("58", vigente.salPin!);
  lu.pinLargo = 2;
  tocado.usuarios.find((u) => u.rol === "duenio")!.pin = M.hashPin("9090", vigente.salPin!);
  const r = conservarLoDelicado(sobre(vigente), sobre(tocado));
  const quedo = JSON.parse(r.texto) as { estado: M.EstadoClub };
  assert.equal(r.corregido, true);
  assert.ok(M.pinCoincide(quedo.estado, quedo.estado.usuarios.find((u) => u.id === lu.id)!, "58"), "el PIN propio de recepción pasa");
  const duenio = vigente.usuarios.find((u) => u.rol === "duenio")!;
  assert.equal(quedo.estado.usuarios.find((u) => u.id === duenio.id)!.pin, duenio.pin, "el del dueño queda como estaba");
  // Cambiar la sal: no pasa (invalidaría todos los PIN).
  const otraSal = structuredClone(vigente);
  otraSal.salPin = "00112233445566778899aabbccddeeff";
  const r2 = conservarLoDelicado(sobre(vigente), sobre(otraSal));
  assert.equal((JSON.parse(r2.texto) as { estado: M.EstadoClub }).estado.salPin, vigente.salPin);
  assert.equal(r2.corregido, true);
});

test("recepción abre una foto de antes del hash y la guarda con los PIN pasados a hash: pasa sin corregir (es el mismo PIN); otro PIN con hash, no", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  delete (vigente as { salPin?: string }).salPin;
  const pasado = structuredClone(vigente);
  M.pasarPinesAHash(pasado);
  const r = conservarLoDelicado(sobre(vigente), sobre(pasado));
  assert.equal(r.corregido, false, "la primera pasada a hash no es un intento de pisar PIN");
  // Con la misma sal, el PIN de un dueño cambiado por otro (con hash) sí se corrige.
  const tocado = structuredClone(pasado);
  const duenio = tocado.usuarios.find((u) => u.rol === "duenio")!;
  duenio.pin = M.hashPin("9090", tocado.salPin!);
  const r2 = conservarLoDelicado(sobre(vigente), sobre(tocado));
  const quedo = JSON.parse(r2.texto) as { estado: M.EstadoClub };
  assert.equal(r2.corregido, true);
  const original = vigente.usuarios.find((u) => u.id === duenio.id)!;
  assert.ok(M.pinCoincide(quedo.estado, quedo.estado.usuarios.find((u) => u.id === duenio.id)!, original.pin!), "el dueño sigue entrando con su PIN");
  assert.ok(!M.pinCoincide(quedo.estado, quedo.estado.usuarios.find((u) => u.id === duenio.id)!, "9090"));
});
