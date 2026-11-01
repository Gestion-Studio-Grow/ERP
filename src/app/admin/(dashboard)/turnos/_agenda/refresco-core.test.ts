// El refresco de la agenda (punto 9): cuándo relee y cuándo no toca la base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CADA_MS, tocaRefrescar } from "./refresco-core";

test("relee sólo con la pantalla a la vista, sin nadie trabajando encima y cada un minuto", () => {
  assert.equal(tocaRefrescar({ visible: true, ocupada: false, desdeElUltimo: CADA_MS }), true);
  assert.equal(tocaRefrescar({ visible: false, ocupada: false, desdeElUltimo: CADA_MS * 10 }), false, "pestaña oculta: cero lecturas");
  assert.equal(tocaRefrescar({ visible: true, ocupada: true, desdeElUltimo: CADA_MS * 10 }), false, "cajón abierto o tipeando: no se le mueve la pantalla");
  assert.equal(tocaRefrescar({ visible: true, ocupada: false, desdeElUltimo: CADA_MS - 1 }), false, "volver a la pestaña enseguida no relee");
});

test("está sólo en la agenda de hoy", () => {
  const agenda = readFileSync(join(process.cwd(), "src/app/admin/(dashboard)/turnos/AgendaRenglon.tsx"), "utf8");
  assert.match(agenda, /\{dia === hoy && <RefrescoDeAgenda \/>\}/);
});
