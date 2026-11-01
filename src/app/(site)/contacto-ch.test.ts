// CH sin WhatsApp cargado no promete WhatsApp (QA 29/10): la home, la confirmación, el pie y /reserva.
//   node --import tsx --test "src/app/(site)/contacto-ch.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { comoConfirmamos, notaDeContactoSinPromesa, sinPromesaDeWhatsApp } from "./_ch/contacto-ch";
import { LOCATION_DEFAULTS } from "@/lib/settings";

test("con WhatsApp cargado, los textos de siempre", () => {
  assert.equal(comoConfirmamos("5491140007919"), "Te confirmamos por WhatsApp con el turno tomado.");
  assert.equal(notaDeContactoSinPromesa(LOCATION_DEFAULTS.contactNote, "5491140007919"), LOCATION_DEFAULTS.contactNote);
  const bajada = "Elegí profesional, servicio y horario disponible. Te confirmamos por WhatsApp.";
  assert.equal(sinPromesaDeWhatsApp(bajada, "5491140007919"), bajada);
});

test("sin WhatsApp, ningún texto lo promete", () => {
  assert.equal(comoConfirmamos(""), "Te confirmamos el turno por mensaje o llamado.");
  assert.equal(notaDeContactoSinPromesa(LOCATION_DEFAULTS.contactNote, ""), "Reservas por la web");
  assert.equal(notaDeContactoSinPromesa("WhatsApp con turno confirmado", ""), "Reservas por la web");
  assert.equal(notaDeContactoSinPromesa("Reservas por la web", ""), "Reservas por la web");
  assert.equal(
    sinPromesaDeWhatsApp("Elegí profesional, servicio y horario disponible. Te confirmamos por WhatsApp.", ""),
    "Elegí profesional, servicio y horario disponible. Te confirmamos el turno por mensaje o llamado.",
  );
  assert.equal(
    sinPromesaDeWhatsApp("Te vamos a escribir por WhatsApp para coordinar el pago y confirmar tu turno.", null),
    "Te vamos a escribir para coordinar el pago y confirmar tu turno.",
  );
});

test("los cambios corren sólo con el diseño nuevo: apagado, CH queda como hoy", () => {
  const dir = join(process.cwd(), "src/app/(site)");
  const leer = (f: string) => readFileSync(join(dir, f), "utf8");
  assert.match(leer("layout.tsx"), /chNuevo \? notaDeContactoSinPromesa\(location\.contactNote, whatsapp\) : location\.contactNote/);
  // La bajada de /reserva corre con o sin el diseño nuevo desde 65b427e8 (ronda 2): es la excepción a propósito.
  assert.match(leer("reserva/page.tsx"), /const bajada = sinPromesaDeWhatsApp\(/);
  const modal = leer("_ch/BookingModal.tsx");
  assert.match(modal, /\{waMessage && \(!nuevo \|\| data\.whatsapp\) && \(/, "el botón de WhatsApp sólo se esconde con el diseño nuevo");
  assert.match(modal, /nuevo && !data\.whatsapp\s*\?\s*"Te confirmamos el turno por mensaje o llamado\./);
});
