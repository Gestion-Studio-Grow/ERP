// ============================================================================
// CIERRE DE LA CERT MATÍAS T2+T3 — las reglas puras de las observaciones.
// ============================================================================
// O-1 `.ics` escapa `;` · O-2 una PEDIDA no se cobra · O-3 «no vino, no se cobra» sobre una pagada
// acredita · O-9 la marca de la Bienvenida (lista blanca y JSON) · O-12 el link vigente en un aviso ·
// O-7 el texto de pesos del panel es el de <Plata>. Lo mismo con las acciones reales y Postgres está en
// `cierre-cert-t23-postgres.test.ts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPROBANTE_NO_APLICA, ESTADOS_PAGO, MOTIVO_AUSENTE_NO_SE_COBRA, MOTIVO_AUSENTE_SE_COBRA, MOTIVO_OTRO_CAMBIO_CONFIRMADO, armarIcs, conLinkVigente, escaparIcs, pagoAlCancelar, pagoAlNoVino, puedeCobrarProfe, transicionPago } from "./core";
import { chipEstado, explicacionTerminal } from "@/app/alumno/_vista/estado";
import { MARCA_BIENVENIDA, bienvenidaVista, plantillasConBienvenida, plantillasConCambio, validarCampoConfig } from "./config-campos";
import { partirCifra } from "@/components/ui/display-core";
import { plataTexto } from "@/app/admin/(dashboard)/clases/_plata";

/** Una barra invertida (para leer el escape de un .ics sin pelearse con los escapes del test). */
const BARRA = String.fromCharCode(92);

test("O-1: escaparIcs escapa barra, punto y coma, coma y salto de línea (RFC 5545 §3.3.11)", () => {
  assert.equal(escaparIcs(`Club X; cancha 3, techada${BARRA}norte\nfondo`), `Club X${BARRA}; cancha 3${BARRA}, techada${BARRA}${BARRA}norte${BARRA}nfondo`);
  const ics = armarIcs({
    uid: "c1@clases-padel",
    empiezaEn: new Date("2026-10-23T22:00:00Z"),
    terminaEn: new Date("2026-10-23T23:00:00Z"),
    titulo: "Clase de pádel",
    lugar: "Club X; cancha 3",
    ahora: new Date("2026-10-22T12:00:00Z"),
  });
  assert.ok(ics.includes(`LOCATION:Club X${BARRA}; cancha 3\r\n`), "el ; del lugar va escapado");
});

test("O-2: una PEDIDA no se cobra (ni por transicionPago ni por puedeCobrarProfe); confirmada o dada, sí", () => {
  assert.equal(transicionPago("PENDIENTE", "PEDIDA", "efectivo", "profe"), null);
  assert.equal(transicionPago("EN_REVISION", "PEDIDA", "efectivo", "profe"), null);
  assert.equal(puedeCobrarProfe({ estado: "PEDIDA", pagoEstado: "PENDIENTE", precio: 25_000 }), false);
  assert.equal(transicionPago("PENDIENTE", "CONFIRMADA", "efectivo", "profe"), "PAGADO");
  assert.equal(transicionPago("PENDIENTE", "DADA", "efectivo", "profe"), "PAGADO");
});

test("O-3: «No vino» sobre una pagada — no se cobra → a favor; se cobra → igual; sin pagar → nada", () => {
  assert.deepEqual(pagoAlNoVino({ pagoEstado: "PAGADO", pagoMedio: "EFECTIVO" }, false), { pagoEstado: "ACREDITADO" });
  assert.deepEqual(pagoAlNoVino({ pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR" }, false), { pagoEstado: "PENDIENTE", pagoMedio: null }, "el saldo que usó le vuelve");
  assert.equal(pagoAlNoVino({ pagoEstado: "PAGADO", pagoMedio: "TRANSFERENCIA" }, true), null);
  assert.equal(pagoAlNoVino({ pagoEstado: "PENDIENTE" }, false), null);
  // O-3c: un comprobante por revisar de una clase que no se cobra queda «no aplica» (deja de esperar).
  assert.deepEqual(pagoAlNoVino({ pagoEstado: "EN_REVISION" }, false), { pagoEstado: "PENDIENTE", pagoNota: COMPROBANTE_NO_APLICA });
  assert.equal(pagoAlNoVino({ pagoEstado: "EN_REVISION" }, true), null, "si se cobra igual, el comprobante se revisa como siempre");
});

test("O-3b: la máquina pura (`acreditar`) y las acciones (pagoAlCancelar / pagoAlNoVino) dicen lo mismo", () => {
  for (const pago of ESTADOS_PAGO) {
    const c = { pagoEstado: pago, pagoMedio: "EFECTIVO" };
    // Cancelada / rechazada.
    for (const estado of ["CANCELADA", "RECHAZADA"]) {
      assert.equal(transicionPago(pago, estado, "acreditar", "profe") === "ACREDITADO", pagoAlCancelar(c)?.pagoEstado === "ACREDITADO", `${pago} ${estado}`);
    }
    // No vino: «no se cobra» acredita lo pagado; «se cobra» nunca.
    assert.equal(transicionPago(pago, "AUSENTE", "acreditar", "profe", MOTIVO_AUSENTE_NO_SE_COBRA) === "ACREDITADO", pagoAlNoVino(c, false)?.pagoEstado === "ACREDITADO", `${pago} ausente no se cobra`);
    assert.equal(transicionPago(pago, "AUSENTE", "acreditar", "profe", MOTIVO_AUSENTE_SE_COBRA), null);
    assert.equal(pagoAlNoVino(c, true), null);
  }
  // Una clase viva nunca se acredita, y una ausente sin decir si se cobra, tampoco.
  assert.equal(transicionPago("PAGADO", "CONFIRMADA", "acreditar", "profe"), null);
  assert.equal(transicionPago("PAGADO", "AUSENTE", "acreditar", "profe"), null);
});

test("O-5c: el pedido de cambio que se cayó porque quedó el otro no dice «no puede ese horario»", () => {
  const base = { id: "x", empiezaEn: new Date(), terminaEn: new Date(), estado: "RECHAZADA" as const, pagoEstado: "PENDIENTE", pagoMedio: null, precio: 25_000, rechazadaEl: new Date(), canceladaEl: null };
  assert.equal(explicacionTerminal({ ...base, motivoCancel: MOTIVO_OTRO_CAMBIO_CONFIRMADO } as never, "Matías"), "Ya confirmaste otro horario para esa clase.");
  assert.doesNotMatch(chipEstado("RECHAZADA", "Matías", MOTIVO_OTRO_CAMBIO_CONFIRMADO).texto, /no puede/);
  assert.equal(chipEstado("RECHAZADA", "Matías").texto, "Matías no puede ese horario", "un rechazo del profe sigue diciendo eso");
  assert.equal(explicacionTerminal({ ...base, motivoCancel: null } as never, "Matías"), "Matías no puede ese horario.");
});

test("O-9: la marca de la Bienvenida — sólo `true` pasa la lista blanca, y editar un texto no la borra", () => {
  assert.deepEqual(validarCampoConfig("bienvenidaVista", true), { ok: true, v: { tipo: "bienvenida" } });
  assert.equal(validarCampoConfig("bienvenidaVista", "true").ok, false);
  assert.equal(validarCampoConfig(MARCA_BIENVENIDA, true).ok, false, "la clave interna no se escribe directo");
  assert.equal(validarCampoConfig("plantilla._bienvenidaVista", "x").ok, false);
  const con = plantillasConBienvenida({ recordatorio: "Hola {nombre}", otraCosa: 3 });
  assert.deepEqual(con, { recordatorio: "Hola {nombre}", [MARCA_BIENVENIDA]: "1" }, "sólo claves válidas + la marca");
  assert.equal(bienvenidaVista(con), true);
  const editado = plantillasConCambio(con, "recordatorio", null);
  assert.equal(bienvenidaVista(editado), true, "restaurar un texto no la borra");
  assert.equal(bienvenidaVista(plantillasConCambio({}, "recordatorio", "x")), false);
  assert.equal(bienvenidaVista(null), false);
  assert.equal(bienvenidaVista([]), false);
});

test("O-12: conLinkVigente cambia el token del link del alumno (todas las veces), y nada más", () => {
  const viejo = "Hola Juan! Te recuerdo la clase. Desde tu link: https://x.erp.test/alumno/AbC_-123viejo y /alumno/AbC_-123viejo/calendario/c1";
  assert.equal(
    conLinkVigente(viejo, "NUEVO_tok-9"),
    "Hola Juan! Te recuerdo la clase. Desde tu link: https://x.erp.test/alumno/NUEVO_tok-9 y /alumno/NUEVO_tok-9/calendario/c1",
  );
  assert.equal(conLinkVigente("sin link", "T"), "sin link");
});

test("O-7: el texto de pesos del panel es EXACTAMENTE el que pinta <Plata sinCentavos>", () => {
  for (const n of [0, 25_000, 36_000, 1_234_567, 25_000.4]) assert.equal(plataTexto(n), partirCifra(n, "plata", true).texto);
  assert.equal(plataTexto(25_000), "$25.000");
});
