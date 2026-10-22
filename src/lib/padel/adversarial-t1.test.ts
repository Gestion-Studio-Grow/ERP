// Pruebas adversariales del Agente Maestro Certificador — Tanda 1 Matías (CERT-matias-t1, ADV-1…8),
// traídas al repo tal cual, salvo donde las observaciones O-3, O-4 y O-5 cambiaron la regla a
// propósito (marcado «O-x» en cada caso). Las pruebas propias de cada observación viven en
// core.test.ts, whatsapp-cloud.test.ts y sesion-alumno.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  tokenValido, telefonoAlumno, transicionClase, transicionPago, esDeuda, esPagable, totalDeuda,
  saldoAFavor, saldoCubre, pagoAlCancelar, puedeCancelarAlumno, franjasLibres, ESTADOS_QUE_OCUPAN, type ClaseConPago, type Franja,
} from "./core";
import { tokenAEntregar, opcionesCookie, decidirPedidoDeLink, respuestaLinkPedido } from "./sesion-alumno";
import { interpretarRespuesta, respuestaAlAlumno, botonRespuestaMeta } from "./whatsapp-cloud";

const nuevoToken = () => randomBytes(18).toString("base64url"); // igual que acciones.ts:87
const JUAN = nuevoToken();
const LUCIA = nuevoToken();
const TOKEN_TENANT_B = nuevoToken();

// ── 1. Otro alumno con el mismo celular ─────────────────────────────────────
test("ADV-1 otro alumno (o un tercero) con el celular de Juan: nunca recibe el token de Juan", () => {
  // Sin cookie, con cookie ajena, con cookie de un alumno de OTRO tenant: nada.
  for (const cookie of [null, undefined, "", LUCIA, TOKEN_TENANT_B, JUAN.toUpperCase(), JUAN.slice(1), " " + JUAN]) {
    assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: cookie }), null, `cookie=${String(cookie)}`);
  }
  // Sólo el mismo dispositivo.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: JUAN }), JUAN);
});

test("ADV-1b el mismo celular escrito distinto normaliza al MISMO alumno (no crea uno «nuevo» con token)", () => {
  const formas = ["11 5555-1234", "1155551234", "+54 9 11 5555 1234", "+5491155551234", "011 15 5555 1234", "549 11 5555 1234"];
  const canon = telefonoAlumno("1155551234");
  assert.equal(canon, "1155551234");
  for (const f of formas) assert.equal(telefonoAlumno(f), canon, f);
  // Basura: vacío → no crea nada.
  for (const f of ["", "abc", "123", "5555-1234", "+1 555 123 4567"]) assert.equal(telefonoAlumno(f), "", f);
});

// ── 2. Token adivinado ──────────────────────────────────────────────────────
test("ADV-2 token adivinado o malformado: tokenValido lo frena antes de tocar la base", () => {
  for (const t of ["../etc/passwd", "abc", "a".repeat(19), "a".repeat(65), "con espacio 12345678901", "x'; DROP TABLE--", JUAN + "/", null, 42, {}]) {
    assert.equal(tokenValido(t), false, String(t));
  }
  assert.equal(tokenValido(JUAN), true);
  assert.equal(JUAN.length, 24, "18 bytes → 24 chars base64url (144 bits de entropía)");
  // Un token «casi igual» (último carácter distinto) tampoco entrega nada.
  const casi = JUAN.slice(0, -1) + (JUAN.endsWith("A") ? "B" : "A");
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: JUAN, tokenCookie: casi }), null);
});

// ── 3. Cookie de otro tenant ────────────────────────────────────────────────
test("ADV-3 cookie emitida por el tenant A no vale en el tenant B", () => {
  // En B, el alumno de ese celular tiene OTRO token: la comparación falla.
  assert.equal(tokenAEntregar({ esNuevo: false, tokenAlumno: TOKEN_TENANT_B, tokenCookie: JUAN }), null);
  // La cookie es host-only (sin Domain) → el navegador ni la manda al host de B.
  const o = opcionesCookie("agendaprofe.gsgapp.com.ar");
  assert.equal("domain" in o, false, "sin Domain: host-only");
  assert.deepEqual(o, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 31_536_000 });
  // Hosts que intentan parecer locales siguen Secure.
  for (const h of ["localhost.evil.com", "evil.com:3000", "127.0.0.1.nip.io", "[::1]:3000.evil"]) assert.equal(opcionesCookie(h).secure, true, h);
  for (const h of ["localhost", "LOCALHOST:3000", "127.0.0.1", "[::1]", "matias.localhost:3000"]) assert.equal(opcionesCookie(h).secure, false, h);
});

// ── 4. Respuestas por WhatsApp ──────────────────────────────────────────────
test("ADV-4 «No», «no», «NO puedo»: preguntan, NO cancelan", () => {
  for (const t of ["No", "no", "NO puedo", "No.", "¡NO!", "no❌", "No 🙏", "NO VOY", "No puedo 😢"]) {
    assert.equal(interpretarRespuesta(t), "quiereCancelar", t);
  }
});

test("ADV-4b «cancelar» minúscula cancela (M-016/M-017); O-4: con signos o emojis pregunta; emojis solos no hacen nada", () => {
  for (const t of ["cancelar", "CANCELAR", "  cancelar  "]) assert.equal(interpretarRespuesta(t), "cancelar", t);
  for (const t of ["CANCELAR.", "Cancelar!", "CANCELAR ❌", "❌ cancelar"]) assert.equal(interpretarRespuesta(t), "quiereCancelar", t);
  for (const t of ["👍", "❌", "🙏🙏", "", "   ", "😢😢😢"]) assert.equal(interpretarRespuesta(t), null, JSON.stringify(t));
  // Botón con payload CANCELAR: cancela aunque el texto sea otro; payload cualquier otro: por texto.
  assert.equal(interpretarRespuesta("hola", "CANCELAR"), "cancelar");
  assert.equal(interpretarRespuesta("hola", "cancelar "), "cancelar");
  assert.equal(interpretarRespuesta("cancelar", "VOY"), "cancelar", "texto manda si el payload no es CANCELAR");
  assert.equal(interpretarRespuesta("hola", "OTRO"), null);
});

test("ADV-4c (O-4 cerrada): una PREGUNTA «¿cancelar?» o «cancelar??» ya no cancela: pregunta", () => {
  assert.equal(interpretarRespuesta("¿cancelar?"), "quiereCancelar");
  assert.equal(interpretarRespuesta("cancelar??"), "quiereCancelar");
  assert.equal(interpretarRespuesta("cancelar..."), "quiereCancelar");
});

test("ADV-4d frases con «no» que no son cancelación no cancelan ni preguntan", () => {
  for (const t of ["no hay drama, voy", "no sé si llego", "No gracias", "nos vemos", "noo", "nop", "ahora no", "no, gracias"]) {
    assert.notEqual(interpretarRespuesta(t), "cancelar", t);
    assert.notEqual(interpretarRespuesta(t), "quiereCancelar", t);
  }
  // «no, gracias» → normaliza a «no gracias» → null (no pregunta). Correcto: no es intención de cancelar.
});

test("ADV-4e inyección en el payload del botón: sólo CANCELAR exacto (trim+upper) cancela", () => {
  const envolver = (m: Record<string, unknown>) => ({ entry: [{ changes: [{ value: { messages: [m] } }] }] });
  const b = botonRespuestaMeta(envolver({ from: "+54 9 11 5555-1234", id: "wamid.x", type: "button", button: { payload: "CANCELAR; DROP", text: "x" } }));
  assert.equal(b?.from, "5491155551234", "from queda sólo con dígitos");
  assert.equal(interpretarRespuesta(b!.text, b!.payload), null);
  // Sin id o sin from: se ignora.
  assert.equal(botonRespuestaMeta(envolver({ from: "549", type: "button", button: { payload: "CANCELAR" } })), null);
  assert.equal(botonRespuestaMeta(envolver({ id: "w", type: "button", button: { payload: "CANCELAR" } })), null);
  assert.equal(botonRespuestaMeta({ entry: "x" }), null);
  assert.equal(botonRespuestaMeta(undefined), null);
});

// ── 5. Clase pagada que se cancela y después se reprograma ──────────────────
test("ADV-5 pagada → cancelada (ACREDITADO) → reprogramada con saldo → cancelada otra vez → devuelta", () => {
  const P = 25_000;
  // 1) Clase confirmada y pagada por transferencia.
  const c1 = { estado: "CONFIRMADA", pagoEstado: "PAGADO", pagoMedio: "TRANSFERENCIA", precio: P };
  // 2) El profe la cancela → ACREDITADO.
  assert.equal(transicionClase(c1.estado, "cancelar", "profe"), "CANCELADA");
  const cambio1 = pagoAlCancelar(c1);
  assert.deepEqual(cambio1, { pagoEstado: "ACREDITADO" });
  const c1c = { ...c1, estado: "CANCELADA", ...cambio1 };
  let clases: ClaseConPago[] = [c1c];
  assert.equal(saldoAFavor(clases), P);
  assert.equal(esDeuda(c1c), false);
  assert.equal(esPagable(c1c), false);
  assert.equal(totalDeuda(clases), 0);
  // 3) Se reprograma: la nueva nace PAGADA con SALDO_A_FAVOR (saldo cubre entera).
  assert.equal(saldoCubre(saldoAFavor(clases), P), true);
  const c2 = { estado: "CONFIRMADA", pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR", precio: P };
  clases = [c1c, c2];
  assert.equal(saldoAFavor(clases), 0, "el saldo se consumió");
  assert.equal(esPagable(c2), false, "no se le pide plata de nuevo");
  // 3b) No se puede «cobrar efectivo» ni subir comprobante de una ya pagada con saldo.
  assert.equal(transicionPago(c2.pagoEstado, c2.estado, "efectivo", "profe"), null);
  assert.equal(transicionPago(c2.pagoEstado, c2.estado, "subir", "alumno"), null);
  // 3c) Con saldo 0, «Le devolví» sobre c1c no corre (en acciones: saldoEnTx < precio → ErrorNegocio).
  assert.equal(saldoAFavor(clases) < P, true, "devolverSaldo lo rechazaría: ya se usó");
  // 4) La reprogramada también se cancela → vuelve a PENDIENTE sin medio y el saldo reaparece UNA vez.
  const cambio2 = pagoAlCancelar(c2);
  assert.deepEqual(cambio2, { pagoEstado: "PENDIENTE", pagoMedio: null });
  const c2c = { ...c2, estado: "CANCELADA", ...cambio2 };
  clases = [c1c, c2c];
  assert.equal(saldoAFavor(clases), P, "vuelven $ 25.000, no $ 50.000");
  assert.equal(esDeuda(c2c), false, "una cancelada sin pagar no es deuda");
  // 5) «Le devolví» → DEVUELTO → saldo 0.
  assert.equal(transicionPago("ACREDITADO", "CANCELADA", "devolver", "profe"), "DEVUELTO");
  assert.equal(transicionPago("ACREDITADO", "CANCELADA", "devolver", "alumno"), null, "el alumno no se devuelve solo");
  clases = [{ ...c1c, pagoEstado: "DEVUELTO" }, c2c];
  assert.equal(saldoAFavor(clases), 0);
  // 6) Nunca negativo aunque los datos vengan rotos.
  assert.equal(saldoAFavor([c2]), 0, "usado sin acreditado: 0, no −25.000");
});

test("ADV-5b saldo parcial y redondeo: $ 24.999,99 no cubre $ 25.000; dos acreditadas sí cubren una grupal", () => {
  assert.equal(saldoCubre(24_999.99, 25_000), false);
  assert.equal(saldoCubre(25_000, 25_000), true);
  const dos = [
    { estado: "CANCELADA", pagoEstado: "ACREDITADO", pagoMedio: "EFECTIVO", precio: 25_000 },
    { estado: "CANCELADA", pagoEstado: "ACREDITADO", pagoMedio: "EFECTIVO", precio: 25_000 },
  ];
  assert.equal(saldoCubre(saldoAFavor(dos), 36_000), true);
  assert.equal(saldoAFavor([...dos, { estado: "CONFIRMADA", pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR", precio: 36_000 }]), 14_000);
});

test("ADV-5c acreditar sólo desde PAGADO y sólo si la clase murió; una RECHAZADA pagada también acredita", () => {
  assert.equal(pagoAlCancelar({ pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA" }), null, "comprobante sin validar: no entró plata");
  assert.equal(pagoAlCancelar({ pagoEstado: "ACREDITADO" }), null);
  assert.equal(pagoAlCancelar({ pagoEstado: "DEVUELTO" }), null);
  assert.equal(transicionPago("PAGADO", "RECHAZADA", "acreditar", "profe"), "ACREDITADO");
  assert.equal(transicionPago("PAGADO", "SIN_RESPUESTA", "acreditar", "profe"), null, "un pedido nunca estuvo pagado");
});

// ── 6. Pedido vencido en el borde de la hora ────────────────────────────────
test("ADV-6 vencer: sólo PEDIDA, sólo el sistema; en el borde (empiezaEn == ahora) el filtro es `lt` → todavía no vence", () => {
  assert.equal(transicionClase("PEDIDA", "vencer", "sistema"), "SIN_RESPUESTA");
  assert.equal(transicionClase("PEDIDA", "vencer", "profe"), null);
  assert.equal(transicionClase("PEDIDA", "vencer", "alumno"), null);
  assert.equal(transicionClase("CONFIRMADA", "vencer", "sistema"), null);
  // O-3 (cerrada): si el alumno vino igual, el profe la DA (y después la cobra). Lo demás, nada.
  assert.equal(transicionClase("SIN_RESPUESTA", "dar", "profe"), "DADA");
  for (const ev of ["confirmar", "rechazar", "ausente", "cancelar"] as const) {
    assert.equal(transicionClase("SIN_RESPUESTA", ev, "profe"), null, ev);
  }
  // El alumno no puede cancelar un SIN_RESPUESTA (ya no existe) ni pagar.
  const vencida = { estado: "SIN_RESPUESTA", pagoEstado: "PENDIENTE", pagoMedio: null, precio: 25_000 };
  assert.equal(esPagable(vencida), false);
  assert.equal(esDeuda(vencida), false);
  assert.equal(ESTADOS_QUE_OCUPAN.includes("SIN_RESPUESTA"), false, "libera la franja (M-031)");
  assert.equal(transicionPago("PENDIENTE", "SIN_RESPUESTA", "efectivo", "profe"), null, "no se cobra un pedido vencido");
  // Borde de cancelación del alumno: exactamente a la anticipación todavía puede; 1 ms después, no.
  const empieza = new Date("2026-10-23T19:00:00-03:00");
  const a120 = new Date(empieza.getTime() - 120 * 60_000);
  assert.equal(puedeCancelarAlumno("CONFIRMADA", empieza, a120, 120), true);
  assert.equal(puedeCancelarAlumno("CONFIRMADA", empieza, new Date(a120.getTime() + 1), 120), false);
  assert.equal(puedeCancelarAlumno("PEDIDA", empieza, a120, 120), true, "un pedido también se cancela desde WhatsApp");
  assert.equal(puedeCancelarAlumno("SIN_RESPUESTA", empieza, a120, 120), false);
});

test("ADV-6b franja de un SIN_RESPUESTA se vuelve a ofrecer (M-031) — y una PEDIDA viva sigue ocupando", () => {
  const franjas: Franja[] = [{ diaSemana: 2, fecha: null, desde: "08:00", hasta: "10:00", tipo: "DA" }];
  const ahora = new Date("2026-10-19T23:00:00-03:00");
  const slot = new Date("2026-10-20T08:00:00-03:00");
  const ocupadaPorPedida = [{ startsAt: slot, endsAt: new Date(slot.getTime() + 3_600_000) }];
  const libresConPedida = franjasLibres({ fecha: "2026-10-20", franjas, ocupadas: ocupadaPorPedida, duracionMin: 60, anticipacionMin: 0, ahora });
  assert.equal(libresConPedida.includes(slot.toISOString()), false, "PEDIDA ocupa");
  // datos.server.ts:105 arma `ocupadas` con ESTADOS_QUE_OCUPAN → una SIN_RESPUESTA no entra en la lista.
  const libresSinPedida = franjasLibres({ fecha: "2026-10-20", franjas, ocupadas: [], duracionMin: 60, anticipacionMin: 0, ahora });
  assert.equal(libresSinPedida.includes(slot.toISOString()), true, "SIN_RESPUESTA libera");
});

// ── 7. Enumeración por «Pedí tu link» ───────────────────────────────────────
test("ADV-7 la respuesta de «Pedí tu link» es byte a byte igual exista o no el alumno, y nunca lleva token", () => {
  const casos = [
    decidirPedidoDeLink({ frenado: false, esAlumno: true, yaPedidoHaceRato: false, profe: "Matías" }),
    decidirPedidoDeLink({ frenado: false, esAlumno: false, yaPedidoHaceRato: false, profe: "Matías" }),
    decidirPedidoDeLink({ frenado: false, esAlumno: true, yaPedidoHaceRato: true, profe: "Matías" }),
  ];
  const textos = new Set(casos.map((c) => (c.ok ? c.mensaje : c.error)));
  assert.equal(textos.size, 1, "un solo texto para los tres casos");
  assert.equal(respuestaLinkPedido("Matías"), "Si ese celular es de un alumno de Matías, le llega su link por WhatsApp.");
  for (const c of casos) assert.doesNotMatch(JSON.stringify(c), /token|alumno\//i);
  // Frenado: también igual exista o no.
  const f1 = decidirPedidoDeLink({ frenado: true, esAlumno: true, yaPedidoHaceRato: false, profe: "M" });
  const f2 = decidirPedidoDeLink({ frenado: true, esAlumno: false, yaPedidoHaceRato: false, profe: "M" });
  assert.deepEqual(f1, f2);
});

test("ADV-7b la respuesta al alumno por WhatsApp no filtra datos de otro", () => {
  assert.equal(respuestaAlAlumno({ tipo: "fueraDeTermino", profe: "" }), "Ya está fuera del plazo para cancelar. Le aviso al profe.");
  assert.doesNotMatch(respuestaAlAlumno({ tipo: "cancelada", turnero: "https://x/clases" }), /alumno\//);
});

// ── 8. Deuda: la misma regla para el profe y el alumno ──────────────────────
test("ADV-8 M-029/M-030: misma regla; el groupBy del profe (DADA, precio>0, notIn PAGADO/ACREDITADO/DEVUELTO/EN_REVISION) ≡ esDeuda", () => {
  const todas: { estado: string; pagoEstado: string; pagoMedio: null; precio: number }[] = [];
  for (const estado of ["PEDIDA", "CONFIRMADA", "DADA", "AUSENTE", "RECHAZADA", "CANCELADA", "SIN_RESPUESTA"])
    for (const pagoEstado of ["PENDIENTE", "EN_REVISION", "PAGADO", "ACREDITADO", "DEVUELTO"])
      for (const precio of [0, 25_000]) todas.push({ estado, pagoEstado, pagoMedio: null, precio });
  const groupByProfe = (c: { estado: string; pagoEstado: string; precio: number }) =>
    c.estado === "DADA" && c.precio > 0 && !["PAGADO", "ACREDITADO", "DEVUELTO", "EN_REVISION"].includes(c.pagoEstado);
  for (const c of todas) assert.equal(esDeuda(c), groupByProfe(c), JSON.stringify(c));
  // O-5 (cerrada): DADA + EN_REVISION ya no es «Debés»: va aparte, «en revisión».
  assert.equal(esDeuda({ estado: "DADA", pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA", precio: 25_000 }), false);
  // AUSENTE con precio no es deuda hoy (M-045 lo define en T2: «No vino → se cobra igual»).
  assert.equal(esDeuda({ estado: "AUSENTE", pagoEstado: "PENDIENTE", pagoMedio: null, precio: 25_000 }), false);
});

test("ADV-8b guardia: el groupBy de la deuda en el panel (datos.server.ts) excluye lo que está en revisión, igual que esDeuda", async () => {
  const { readFileSync } = await import("node:fs");
  const datos = readFileSync(new URL("./datos.server.ts", import.meta.url), "utf8");
  // T4: el filtro quedó en `sinPagar` (lo usan las dadas, las ausentes y las tardías que se cobran) y
  // suma POR_PARTICIPANTE (la deuda de una grupal es de cada persona). La guardia sigue siendo la misma:
  // lo que está en revisión y lo ya resuelto no es deuda.
  assert.match(datos, /const sinPagar = \{ precio: \{ gt: 0 \}, pagoEstado: \{ notIn: \[\.\.\.PAGOS_SIN_DEUDA, "EN_REVISION"\] \} \};/);
  assert.match(datos, /estado: "DADA", \.\.\.sinPagar \}/);
  const { PAGOS_SIN_DEUDA } = await import("./core");
  for (const p of ["PAGADO", "ACREDITADO", "DEVUELTO"]) assert.ok(PAGOS_SIN_DEUDA.includes(p), p);
});
