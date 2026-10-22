import { test } from "node:test";
import assert from "node:assert/strict";
import { COOKIE_ALUMNO, RESPUESTA_FRENADO, VIDA_COOKIE_SEG, decidirPedidoDeLink, opcionesCookie, respuestaLinkPedido, tokenAEntregar } from "./sesion-alumno";

const JUAN = "Jn4mR8tPq2Lx7Vw9Zb3Kc5Hd";
const OTRO = "Ot8rQ1wE5rT9yU3iO7pA2sD6";

test("H2/E31: un atacante con el celular de otro alumno NO recibe su link", () => {
  // Sin cookie (otro navegador): nada.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: null }), null);
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: undefined }), null);
  // Con la cookie de OTRO alumno (el atacante es alumno también): nada.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: OTRO }), null);
  // Cookie basura o casi igual: nada.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: "../etc/passwd" }), null);
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: JUAN.slice(0, -1) + "X" }), null);
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: JUAN + "x" }), null);
});

test("M-003/M-004: el alumno nuevo recibe su link; el de siempre, sólo desde su mismo teléfono", () => {
  assert.equal(tokenAEntregar({ esNuevo: true, tokenAlumno: JUAN, tokenCookie: null }), JUAN, "nuevo: es su primer link");
  assert.equal(tokenAEntregar({ esNuevo: true, tokenAlumno: JUAN, tokenCookie: OTRO }), JUAN, "nuevo en un teléfono compartido");
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: JUAN }), JUAN, "mismo dispositivo");
});

test("cookie padel_alumno: httpOnly, SameSite=Lax, Path=/, un año; Secure salvo en localhost", () => {
  assert.equal(COOKIE_ALUMNO, "padel_alumno");
  const prod = opcionesCookie("agendaprofe.gsgapp.com.ar");
  assert.deepEqual(prod, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: VIDA_COOKIE_SEG });
  assert.equal(VIDA_COOKIE_SEG, 31_536_000);
  assert.equal(opcionesCookie("localhost:3000").secure, false);
  assert.equal(opcionesCookie("127.0.0.1:3000").secure, false);
  assert.equal(opcionesCookie("matias.localhost").secure, false);
  assert.equal(opcionesCookie(null).secure, true, "sin host, del lado seguro");
  assert.equal(opcionesCookie("localhost.evil.com").secure, true);
});

test("M-005/M-006: «Pedí tu link» responde lo mismo exista o no el celular, y nunca devuelve el link", () => {
  const existe = decidirPedidoDeLink({ frenado: false, esAlumno: true, yaPedidoHaceRato: false, profe: "Matías" });
  const noExiste = decidirPedidoDeLink({ frenado: false, esAlumno: false, yaPedidoHaceRato: false, profe: "Matías" });
  assert.ok(existe.ok && noExiste.ok);
  assert.equal(existe.mensaje, noExiste.mensaje, "mismo texto: no revela quién es alumno");
  assert.equal(existe.mensaje, "Si ese celular es de un alumno de Matías, le llega su link por WhatsApp.");
  assert.equal(existe.avisar, true, "al alumno de verdad le llega");
  assert.equal(noExiste.avisar, false, "y para un celular que no existe no se crea nada");
  assert.doesNotMatch(JSON.stringify(existe), /alumno\/|token/i);
  assert.equal(respuestaLinkPedido(""), "Si ese celular es de un alumno de el profe, le llega su link por WhatsApp.");
});

test("M-007: frenado → «Probá de nuevo», sin aviso; dentro de los 10 min no se repite el WhatsApp", () => {
  assert.deepEqual(decidirPedidoDeLink({ frenado: true, esAlumno: true, yaPedidoHaceRato: false, profe: "Matías" }), { ok: false, error: RESPUESTA_FRENADO });
  const repetido = decidirPedidoDeLink({ frenado: false, esAlumno: true, yaPedidoHaceRato: true, profe: "Matías" });
  assert.ok(repetido.ok);
  assert.equal(repetido.avisar, false);
});

test("guardia de código: pedirClase entrega el token sólo vía tokenAEntregar y pedirMiLink nunca lo devuelve", async () => {
  const { readFileSync } = await import("node:fs");
  const fuente = readFileSync(new URL("./acciones.ts", import.meta.url), "utf8");
  const cuerpo = (nombre: string) => {
    const i = fuente.indexOf(`export async function ${nombre}(`);
    assert.ok(i >= 0, nombre);
    const j = fuente.indexOf("\nexport async function ", i + 10);
    return fuente.slice(i, j < 0 ? undefined : j);
  };
  const pedir = cuerpo("pedirClase");
  assert.match(pedir, /tokenAEntregar\(/);
  assert.doesNotMatch(pedir, /token:\s*r\.alumno\.token/, "nunca el token del alumno a pelo");
  const link = cuerpo("pedirMiLink");
  assert.doesNotMatch(link, /return \{[^}]*token/, "la respuesta no lleva el token");
  assert.doesNotMatch(link, /return \{[^}]*wa:/, "ni el link de WhatsApp con el link adentro");
});
