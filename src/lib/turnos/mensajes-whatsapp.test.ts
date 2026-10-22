import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ALIAS_SENIA_PROVISIONAL,
  cuandoEnTexto,
  diaCortoEnTexto,
  linkWhatsApp,
  listaDeServicios,
  mensajeCancelacion,
  mensajeCierreDeCaja,
  mensajeCobro,
  mensajeConfirmacion,
  mensajeMover,
  mensajeNoVino,
  mensajePedidoDeSenia,
  mensajeRecordarSaldo,
  pesosEnTexto,
} from "./mensajes-whatsapp";

// Sábado 24/10/2026 16:00 en Buenos Aires = 19:00 UTC.
const SAB_16 = "2026-10-24T19:00:00.000Z";
const DOM_1730 = "2026-10-25T20:30:00.000Z";
const LAURA = { clienta: "Laura Gómez", servicios: "Piernas completas", inicio: SAB_16, profesional: "Caro" };

/** CH-050: ningún mensaje lleva basura de programación ni un «$0». */
function sinBasura(texto: string) {
  assert.doesNotMatch(texto, /undefined|null|NaN|\$0(?![\d.])/, `basura en: ${texto}`);
  assert.doesNotMatch(texto, /\s{2,}/, `dobles espacios en: ${texto}`);
}

describe("piezas", () => {
  test("pesos argentinos sin decimales cuando son enteros", () => {
    assert.equal(pesosEnTexto(5000), "$5.000");
    assert.equal(pesosEnTexto(142000), "$142.000");
    assert.equal(pesosEnTexto(7500.5), "$7.500,50");
    assert.equal(pesosEnTexto(-2000), "−$2.000");
  });

  test("el día y la hora en la zona del negocio, de 24 horas", () => {
    assert.equal(cuandoEnTexto(SAB_16), "el sábado 24 a las 16:00");
    assert.match(cuandoEnTexto(SAB_16), /^el [a-záéíóú]+ 24 a las 16:00$/);
    assert.match(cuandoEnTexto("2026-10-24T12:05:00.000Z"), / a las 09:05$/);
    assert.equal(cuandoEnTexto("no es fecha"), "");
    assert.match(diaCortoEnTexto("2026-10-22"), /^[a-záéíóú]{3} 22$/);
  });

  test("los servicios en una frase", () => {
    assert.equal(listaDeServicios(["Bozo", "Axilas", "Piernas completas", "Cavado c/tira"]), "Bozo, axilas, piernas completas y cavado c/tira");
    assert.equal(listaDeServicios("Axilas"), "Axilas");
    assert.equal(listaDeServicios(["Peeling", "LED facial"]), "Peeling y LED facial");
    assert.equal(listaDeServicios([" ", ""]), "");
  });
});

describe("confirmación del turno (CH-017)", () => {
  test("con seña recibida: día, hora, profesional y la seña con su medio", () => {
    const m = mensajeConfirmacion({ ...LAURA, senia: { monto: 5000, medio: "TRANSFERENCIA" } });
    assert.match(m, /^¡Hola Laura!/);
    assert.match(m, /\*Piernas completas\*/);
    assert.match(m, /24 a las 16:00/);
    assert.match(m, /con Caro/);
    assert.match(m, /Recibimos tu seña de \$5\.000 por transferencia/);
    sinBasura(m);
  });

  test("sin seña no nombra ninguna seña (ni $0)", () => {
    for (const senia of [null, undefined, { monto: 0 }, { monto: Number.NaN }]) {
      const m = mensajeConfirmacion({ ...LAURA, senia });
      assert.doesNotMatch(m, /seña/i);
      sinBasura(m);
    }
  });

  test("con la dirección del local, y sin profesional ni dirección no deja huecos", () => {
    assert.match(mensajeConfirmacion({ ...LAURA, direccion: "La Alameda, Canning" }), /con Caro en La Alameda, Canning\./);
    const pelado = mensajeConfirmacion({ clienta: "Ana", servicios: "Axilas", inicio: SAB_16, profesional: null, direccion: undefined });
    assert.match(pelado, /Te agendamos \*Axilas\* \*el [a-záéíóú]+ 24 a las 16:00\*\./);
    sinBasura(pelado);
  });

  test("un combo: todas las zonas en una frase", () => {
    const m = mensajeConfirmacion({ ...LAURA, servicios: ["Bozo", "Axilas", "Piernas completas", "Cavado c/tira"] });
    assert.match(m, /\*Bozo, axilas, piernas completas y cavado c\/tira\*/);
  });

  test("el nombre vacío o con basura saluda igual", () => {
    assert.match(mensajeConfirmacion({ ...LAURA, clienta: "  " }), /^¡Hola! /);
    sinBasura(mensajeConfirmacion({ ...LAURA, clienta: "undefined" }));
  });
});

describe("pedido de seña (CH-021)", () => {
  test("con alias: el monto y el alias", () => {
    const m = mensajePedidoDeSenia({ ...LAURA, monto: 5000, alias: "ch.estetica.mp" });
    assert.match(m, /seña de \$5\.000 al alias \*ch\.estetica\.mp\*/);
    sinBasura(m);
  });

  test("sin alias (hoy, provisional) no inventa uno", () => {
    assert.equal(ALIAS_SENIA_PROVISIONAL, null, "provisional a confirmar: ningún alias de ejemplo");
    const m = mensajePedidoDeSenia({ ...LAURA, monto: 5000, alias: ALIAS_SENIA_PROVISIONAL });
    assert.match(m, /seña de \$5\.000: te pasamos por acá los datos para transferir/);
    assert.doesNotMatch(m, /alias/);
    sinBasura(m);
  });

  test("sin monto no pide nada", () => {
    const m = mensajePedidoDeSenia({ ...LAURA, monto: 0, alias: "x" });
    assert.doesNotMatch(m, /seña/);
    sinBasura(m);
  });
});

describe("mover, cancelar, no vino", () => {
  test("mover dice el día nuevo, con quién y el de antes (CH-025)", () => {
    const m = mensajeMover({ ...LAURA, inicio: DOM_1730, profesional: "Lu", inicioAnterior: SAB_16 });
    assert.match(m, /Te pasamos el turno de \*Piernas completas\* al \*[a-záéíóú]+ 25 a las 17:30\* con Lu \(era el [a-záéíóú]+ 24 a las 16:00\)\./);
    sinBasura(m);
    sinBasura(mensajeMover({ clienta: "Ana", servicios: [], inicio: DOM_1730 }));
  });

  test("cancelar: quién canceló cambia el tono; la seña dice su destino", () => {
    const negocio = mensajeCancelacion({ ...LAURA, quien: "negocio", senia: { monto: 5000, destino: "devolver" } });
    assert.match(negocio, /disculpas/);
    assert.match(negocio, /Te devolvemos la seña de \$5\.000\./);
    const clienta = mensajeCancelacion({ ...LAURA, quien: "clienta", senia: { monto: 5000, destino: "retener" } });
    assert.match(clienta, /Listo, cancelamos/);
    assert.match(clienta, /queda para el negocio/);
    const sinSenia = mensajeCancelacion({ ...LAURA, quien: "clienta", senia: { monto: 0, destino: "retener" } });
    assert.doesNotMatch(sinSenia, /seña/);
    [negocio, clienta, sinSenia].forEach(sinBasura);
  });

  test("no vino: pregunta si está todo bien; la seña a favor", () => {
    const m = mensajeNoVino({ ...LAURA, senia: { monto: 5000, destino: "a-favor" } });
    assert.match(m, /Te esperábamos el [a-záéíóú]+ 24 a las 16:00 para \*Piernas completas\*/);
    assert.match(m, /te queda a favor/);
    sinBasura(m);
    sinBasura(mensajeNoVino(LAURA));
  });
});

describe("plata: saldo, cobro, cierre", () => {
  test("recordar saldo con y sin alias; sin saldo no hay mensaje", () => {
    const m = mensajeRecordarSaldo({ clienta: "Laura Gómez", saldo: 9000, servicio: "Piernas completas", inicio: SAB_16, alias: "ch.mp" });
    assert.match(m, /saldo de \$9\.000 de \*Piernas completas\* del [a-záéíóú]+ 24\./);
    assert.match(m, /alias \*ch\.mp\*/);
    sinBasura(m);
    sinBasura(mensajeRecordarSaldo({ clienta: "Laura", saldo: 9000 }));
    assert.equal(mensajeRecordarSaldo({ clienta: "Laura", saldo: 0 }), "");
  });

  test("comprobante del cobro", () => {
    const m = mensajeCobro({ clienta: "Laura", monto: 27000, medio: "EFECTIVO", servicio: "Piernas", saldo: 0 });
    assert.equal(m, "¡Hola Laura! Recibimos $27.000 en efectivo por *Piernas*. ¡Gracias! 💚");
    assert.match(mensajeCobro({ clienta: "Laura", monto: 10000, medio: "MERCADOPAGO", saldo: 8000 }), /Queda un saldo de \$8\.000\./);
    assert.equal(mensajeCobro({ clienta: "Laura", monto: 0 }), "");
  });

  test("cierre de caja (CH-038): diferencia con signo, columnas en cero afuera, turnos", () => {
    const m = mensajeCierreDeCaja({
      dia: "2026-10-24",
      efectivo: { monto: 118000, diferencia: -2000 },
      mercadoPago: { monto: 64000 },
      tarjeta: { monto: 0 },
      turnos: 14,
      nota: "faltó cambio",
    });
    assert.match(m, /^Cierre [a-záéíóú]{3} 24: Efectivo \$118\.000 \(−\$2\.000\), MP\/Transf\. \$64\.000 · 14 turnos\. Qué pasó: faltó cambio\.$/);
    sinBasura(m);
    const vacio = mensajeCierreDeCaja({ dia: "2026-10-24", efectivo: { monto: 0 }, turnos: 0 });
    assert.match(vacio, /Efectivo \$0\.$/, "el efectivo se informa aunque sea cero: es el cierre");
  });
});

describe("el link", () => {
  test("wa.me con el 549 y el texto con tildes y emoji bien codificados (CH-050)", () => {
    const texto = mensajeConfirmacion({ ...LAURA, senia: { monto: 5000, medio: "TRANSFERENCIA" } });
    const href = linkWhatsApp("11 5566-7788", texto);
    assert.ok(href?.startsWith("https://wa.me/5491155667788?text="));
    assert.equal(decodeURIComponent(href!.split("?text=")[1]), texto);
    assert.match(href!, /%C2%A1Hola/, "el ¡ viaja codificado");
  });

  test("un teléfono que no es un celular argentino no da link", () => {
    assert.equal(linkWhatsApp("123", "hola"), null);
    assert.equal(linkWhatsApp(null, "hola"), null);
  });
});
