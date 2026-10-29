// G8 en el servidor: un guardado de alguien que no es dueño del ERP no puede pisar ni borrar usuarios ni PIN; sólo
// pasa el PIN propio de recepción (src/lib/club/delicado.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "./motor.mjs";
import { CONFIG_DELICADA, conservarLoDelicado } from "./delicado";

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
  tocado.clientes[0].nombre = "Ana Editada"; // lo demás sí pasa
  const r = conservarLoDelicado(sobre(vigente), sobre(tocado));
  assert.equal(r.corregido, true);
  assert.deepEqual(usuarios(r.texto), vigente.usuarios, "los usuarios y los PIN quedan como en la base");
  assert.equal((JSON.parse(r.texto) as { estado: M.EstadoClub }).estado.clientes[0].nombre, "Ana Editada", "el resto del club se guarda");
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

test("una sal que no es texto en hex no se estrena desde recepción, y un PIN viejo con espacios igual pasa a hash (Gate 21/10, O1/O2)", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  delete (vigente as { salPin?: string }).salPin;
  const raro = { ...structuredClone(vigente), salPin: { no: "texto" } };
  const r = conservarLoDelicado(sobre(vigente), sobre(raro as unknown as M.EstadoClub));
  assert.equal(r.corregido, true);
  assert.equal("salPin" in (JSON.parse(r.texto) as { estado: object }).estado, false, "la sal rara no queda");
  // PIN guardado con un espacio de más: el hash que manda recepción (que recorta) se acepta igual.
  const conEspacio = structuredClone(vigente);
  const duenio = conEspacio.usuarios.find((u) => u.rol === "duenio")!;
  duenio.pin = ` ${duenio.pin} `;
  const pasado = structuredClone(conEspacio);
  M.pasarPinesAHash(pasado);
  assert.equal(conservarLoDelicado(sobre(conEspacio), sobre(pasado)).corregido, false);
});

// ───── F5 (CERT-B4 vuelta 4): «Reglas y precios» y «Avisos» que mueven plata o permisos ─────

const estadoDe = (texto: string) => (JSON.parse(texto) as { estado: M.EstadoClub }).estado;
const RETIRO_LU = { monto: 1000, usuarioId: "u-lu", pin: "33" };
const ALAS_19 = { fecha: HOY, min: 19 * 60 + 15 };

test("F5: recepción baja la firma de caja a 2 y toca precios, seña, fondo, alias y avisos: queda todo como en la base y su PIN de 2 no firma un retiro", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  vigente.config.caja = { largoPinFirma: 4, pedirNombreJugador: false };
  const tocado = structuredClone(vigente);
  tocado.config.caja = { largoPinFirma: 2, pedirNombreJugador: true };
  tocado.config.tarifas[0].precioHora = 1;
  tocado.config.politica.senaPct = 0;
  tocado.config.politica.horasCancelacionLibre = 0;
  tocado.config.bloqueoMin = 60;
  tocado.config.cobro = { alias: "alias.de.recepcion" };
  (tocado.config as { contactos?: Record<string, string> }).contactos = { "u-rober": "5491199999999" };
  tocado.caja.fondo = 999999;
  tocado.clientes[0].nombre = "Ana Editada"; // lo que recepción sí puede cambiar
  // Sin la red, el ataque funciona: con la firma en 2, recepción firma el retiro con su PIN.
  const sinRed = M.hidratarEstado(JSON.parse(sobre(tocado)));
  assert.ok(sinRed.ok);
  assert.equal(M.retiroCajaFuerte(sinRed.estado, RETIRO_LU, ALAS_19).ok, true, "el ataque tiene dientes sin la red");

  const r = conservarLoDelicado(sobre(vigente), sobre(tocado));
  assert.equal(r.corregido, true);
  const quedo = estadoDe(r.texto);
  for (const [objeto, clave] of CONFIG_DELICADA)
    assert.deepEqual((quedo[objeto] as unknown as Record<string, unknown>)[clave], (vigente[objeto] as unknown as Record<string, unknown>)[clave], `${objeto}.${clave} queda como en la base`);
  assert.equal(quedo.clientes[0].nombre, "Ana Editada", "lo demás se guarda");
  const conRed = M.hidratarEstado(JSON.parse(r.texto));
  assert.ok(conRed.ok);
  assert.equal(M.largoFirmaCaja(conRed.estado), 4);
  const intento = M.retiroCajaFuerte(conRed.estado, RETIRO_LU, ALAS_19);
  assert.equal(intento.ok, false, "recepción con PIN de 2 no firma el retiro");
  assert.equal((intento as { pinCorto?: boolean }).pinCorto, true, "lo frena el largo de la firma");
});

test("F5: si la base no tenía firma configurada, recepción no la estrena en 2 (vale la de fábrica, 4)", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  delete (vigente.config as { caja?: unknown }).caja;
  const tocado = structuredClone(vigente);
  tocado.config.caja = { largoPinFirma: 2 };
  const r = conservarLoDelicado(sobre(vigente), sobre(tocado));
  assert.equal(r.corregido, true);
  assert.equal("caja" in estadoDe(r.texto).config, false, "no queda la firma de recepción");
  const h = M.hidratarEstado(JSON.parse(r.texto));
  assert.ok(h.ok);
  assert.equal(M.largoFirmaCaja(h.estado), 4);
});

test("F5: un guardado de recepción con la configuración igual a la base pasa tal cual (sin corregir ni re-serializar)", () => {
  const vigente = M.generarDemo(HOY, 19 * 60);
  vigente.config.caja = { largoPinFirma: 4 };
  const tocado = structuredClone(vigente);
  tocado.clientes[0].nombre = "Ana Editada";
  const t = sobre(tocado);
  assert.deepEqual(conservarLoDelicado(sobre(vigente), t), { texto: t, corregido: false });
});
