// Ronda 2, P0: identidad por rubro en el motor de turnos compartido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comoSigueElTurno, destinoPropio, estadoPublicoDelTurno, nombrePublico, rubroDelTurnoDe } from "./rubro-del-turno";

test("rubro: manda el blueprint del alta; el slug es la red de contención", () => {
  assert.equal(rubroDelTurnoDe({ blueprintId: "taller", slug: "otro" }), "taller");
  assert.equal(rubroDelTurnoDe({ blueprintId: null, slug: "agr" }), "taller");
  assert.equal(rubroDelTurnoDe({ blueprintId: "profe-padel", slug: "matiasconsoli" }), "clases");
  assert.equal(rubroDelTurnoDe({ blueprintId: null, slug: "beauty-spa" }), "agenda");
});

test("el taller y el profe van a sus páginas; la estética se queda en las compartidas", () => {
  assert.equal(destinoPropio("taller", "reserva"), "/taller/turno");
  assert.equal(destinoPropio("taller", "servicios"), "/taller#que-hacemos");
  assert.equal(destinoPropio("taller", "turno", "abc"), "/taller/turno/abc");
  assert.equal(destinoPropio("taller", "confirmacion", "abc"), "/taller/turno/abc?nuevo=1");
  assert.equal(destinoPropio("clases", "reserva"), "/clases");
  // MEDIA-4 del certificador: el turno y la confirmación del profe se quedan (el turnero no tiene la vista de un turno)
  // y el link de reseña (?resena=1) nunca redirige, en ningún rubro.
  assert.equal(destinoPropio("clases", "turno", "abc"), null);
  assert.equal(destinoPropio("clases", "confirmacion", "abc"), null);
  assert.equal(destinoPropio("taller", "turno", "abc", { resena: true }), null);
  assert.equal(destinoPropio("taller", "confirmacion", "abc", { resena: true }), "/taller/turno/abc?nuevo=1");
  for (const r of ["reserva", "servicios", "servicio", "turno", "confirmacion"] as const) assert.equal(destinoPropio("agenda", r, "x"), null);
});

test("«Pendiente de pago» sólo con seña; WhatsApp sólo con número", () => {
  assert.deepEqual(estadoPublicoDelTurno(null), { texto: "A confirmar", conSena: false });
  assert.deepEqual(estadoPublicoDelTurno(0), { texto: "A confirmar", conSena: false });
  assert.deepEqual(estadoPublicoDelTurno(5000), { texto: "Pendiente de pago", conSena: true });
  assert.ok(!comoSigueElTurno({ conSena: false, hayWhatsApp: false }).includes("WhatsApp"));
  assert.ok(!comoSigueElTurno({ conSena: false, hayWhatsApp: true }).includes("pago"));
  assert.match(comoSigueElTurno({ conSena: true, hayWhatsApp: true }), /WhatsApp/);
});

test("los nombres de ejemplo del alta no se muestran al público", () => {
  assert.equal(nombrePublico("Box de ejemplo (editable)"), null);
  assert.equal(nombrePublico("Mecánico de ejemplo (editable)"), null);
  assert.equal(nombrePublico("Cabina 2"), "Cabina 2");
  assert.equal(nombrePublico(""), null);
});

test("las páginas compartidas del motor consultan el rubro y no prometen pago sin seña", () => {
  const leer = (f: string) => readFileSync(f, "utf8");
  for (const f of ["src/app/(site)/reserva/page.tsx", "src/app/(site)/servicios/page.tsx", "src/app/(site)/servicios/[id]/page.tsx", "src/app/(site)/reserva/turno/[id]/page.tsx", "src/app/(site)/reserva/confirmacion/[id]/page.tsx"]) {
    assert.match(leer(f), /destinoPropio\(await rubroDelTurno\(\)/, f);
  }
  const conf = leer("src/app/(site)/reserva/confirmacion/[id]/page.tsx");
  assert.ok(!conf.includes(">Pendiente de pago<") && !conf.includes("Pendiente de pago\n"), "estado fijo");
  assert.ok(!conf.includes("Te vamos a escribir por WhatsApp para coordinar el pago"), "promesa fija");
});
