import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  procesarEventoBot,
  conversacionDesdeFila,
  conversacionNueva,
  MAX_RESPUESTAS_DESCONOCIDO,
  MAX_AYUDAS_CUIT,
  type ClienteDelRemitente,
  type Conversacion,
  type EventoBot,
  type MensajeEntrante,
  type PuertosBot,
  type ResumenDelMes,
  type SalidaBot,
  type Respuesta,
  type EstadoBot,
  type Efecto,
  type ResultadoLectura,
} from "./bot";
import { formatearPesos, nombreDeArchivo, tituloDeBoton, ultimos4 } from "./mensajes";

// ---------------------------------------------------------------------------
// Datos (inventados; personajes de E1 §2, provisional a confirmar)
// ---------------------------------------------------------------------------

// 2026-10-02 10:00 en Buenos Aires (UTC-3).
const AHORA = new Date("2026-10-02T13:00:00.000Z");
const HORA = 60 * 60 * 1000;
const ESTUDIO = { nombre: "Estudio Paredes" };

const MARTA: ClienteDelRemitente = {
  clienteTenantId: "t-marta",
  alias: "Kiosco de Marta",
  nombreContacto: "Marta",
  verificado: true,
  optOut: false,
  avisoPrivacidadDado: true,
  banco: "Banco Galicia",
};
const RUIZ: ClienteDelRemitente = {
  clienteTenantId: "t-ruiz",
  alias: "Taller Ruiz SRL",
  nombreContacto: "Marta",
  verificado: true,
  optOut: false,
  avisoPrivacidadDado: true,
  banco: "Banco Santander",
};
const NORTE: ClienteDelRemitente = {
  clienteTenantId: "t-norte",
  alias: "Distribuidora Norte SA",
  nombreContacto: null,
  verificado: true,
  optOut: false,
  avisoPrivacidadDado: true,
  banco: null,
};
const SUR: ClienteDelRemitente = { ...NORTE, clienteTenantId: "t-sur", alias: "Almacén Sur" };

// CUITs ficticios con dígito verificador válido (verificados con `cuitValido`).
const CUIT_VALIDO = "20111111112";
const CUIT_DV_MAL = "20111111113";

// ---------------------------------------------------------------------------
// Textos LITERALES de E1 §3.3 (el test compara contra el informe, no contra mensajes.ts)
// ---------------------------------------------------------------------------

const E1 = {
  desconocido:
    "Hola, te escribe el asistente del estudio Estudio Paredes. Este número no está asociado a ningún cliente del estudio. Si sos cliente, respondé con tu CUIT (11 números, sin guiones) y le aviso al estudio para que lo confirme.",
  altaPedida:
    "Gracias. Se lo pasé al estudio; te escribimos cuando esté confirmado. Hasta entonces no puedo recibir archivos.",
  pedirCuit: "Necesito el CUIT: 11 números, sin guiones ni espacios.",
  saludoMarta:
    "Hola Marta. Mandame el extracto del banco tal como lo bajás del home banking (PDF, Excel o CSV) y lo cargo para Kiosco de Marta. También podés escribir *estado* para ver cómo va el mes, o *estudio* para hablar con una persona.",
  recibido: "Recibí extracto-sep.pdf. Lo estoy leyendo; te contesto en un minuto.",
  elegir2: "Recibí extracto-sep.pdf. ¿De cuál negocio es? 1 Kiosco de Marta · 2 Taller Ruiz SRL",
  elegir3: "Recibí extracto-sep.pdf. ¿De cuál negocio es? 1 Kiosco de Marta · 2 Taller Ruiz SRL · 3 Distribuidora Norte SA",
  elegido: "Dale, es de Taller Ruiz SRL. Lo estoy leyendo.",
  leido:
    "Es un extracto de Banco Galicia (cuenta terminada en 4417), del 01/09 al 30/09: 52 movimientos, 38 ingresos por $3.912.400,00. ¿Lo cargo para Kiosco de Marta?",
  duplicado: "Este extracto ya me lo habías mandado el 15/09/2026. No lo cargo de nuevo.",
  fotoPrefijo:
    "Recibí una foto. Todavía no leo fotos: necesito el archivo que baja el home banking (PDF, Excel o CSV).",
  ilegible: "No pude leer bien este archivo. Se lo pasé al estudio para que lo revise; no tenés que hacer nada más.",
  cargado:
    "Cargado. 30 ventas quedan para facturar y 8 necesitan un dato; el estudio las revisa y te mando las facturas cuando estén.",
  descartado: "Listo, lo descarto. Si te equivocaste de archivo, mandame el correcto.",
  antesConfirmar: "Antes decime si cargo el anterior (extracto-sep.pdf): Sí o No.",
  estadoMarta: "Kiosco de Marta, octubre: 2 extractos cargados, 38 facturas emitidas, 4 esperando al estudio.",
  persona: "Le aviso al estudio; te responde una persona en horario de oficina.",
  baja: "Listo, no te voy a escribir más. Si querés volver, mandá *alta*.",
  facturas:
    "Se emitieron 38 facturas de septiembre de Kiosco de Marta por $3.912.400,00. Te mando el resumen y los PDF.",
  privacidad:
    "Los archivos que mandes se usan sólo para la contabilidad de tu negocio y el estudio los borra a los 180 días.",
} as const;

// ---------------------------------------------------------------------------
// Puertos falsos que registran cada llamada
// ---------------------------------------------------------------------------

type Espia = { puertos: PuertosBot; resumenes: string[]; consultas: number };

function espia(
  clientes: ClienteDelRemitente[],
  resumen: (id: string) => ResumenDelMes = () => ({ extractosCargados: 2, facturasEmitidas: 38, esperandoAlEstudio: 4 }),
): Espia {
  const e: Espia = {
    resumenes: [],
    consultas: 0,
    puertos: {
      clientesDelRemitente: async () => {
        e.consultas += 1;
        return clientes.map((c) => congelar({ ...c }));
      },
      resumenDelMes: async (id, mes) => {
        e.resumenes.push(`${id}@${mes}`);
        return resumen(id);
      },
    },
  };
  return e;
}

// ---------------------------------------------------------------------------
// Mensajes y eventos
// ---------------------------------------------------------------------------

/**
 * Evento de prueba. Un mensaje sin `enviadoEn` lo recibe al procesarse con la hora del paso
 * (como si Meta lo hubiera mandado en ese instante); los tests de la ventana lo fijan a mano.
 */
type Paso = Exclude<EventoBot, { tipo: "mensaje" }> | { tipo: "mensaje"; mensaje: MensajeEntrante; enviadoEn?: Date };
function fechar(ev: Paso, ahora: Date): EventoBot {
  return ev.tipo === "mensaje" ? { tipo: "mensaje", mensaje: ev.mensaje, enviadoEn: ev.enviadoEn ?? ahora } : ev;
}

const txt = (texto: string): Paso => ({ tipo: "mensaje", mensaje: { tipo: "texto", texto } });
const doc = (ref = "wamid.A", nombre: string | null = "extracto-sep.pdf", mime = "application/pdf"): Paso => ({
  tipo: "mensaje",
  mensaje: { tipo: "documento", archivo: { ref, nombre, mime, sha256: "abc" } },
});
const img = (ref = "wamid.F"): Paso => ({
  tipo: "mensaje",
  mensaje: { tipo: "imagen", archivo: { ref, nombre: null, mime: "image/jpeg", sha256: "fff" } },
});
const boton = (id: string, titulo = "x"): Paso => ({ tipo: "mensaje", mensaje: { tipo: "boton", id, titulo } });
const otro: Paso = { tipo: "mensaje", mensaje: { tipo: "otro" } as MensajeEntrante };

const LEIDO_OK = {
  tipo: "ok" as const,
  banco: "Banco Galicia",
  cuentaUltimos4: "0070999020000012344417", // CBU entero a propósito: sólo pueden salir los últimos 4
  desde: "2026-09-01",
  hasta: "2026-09-30",
  movimientos: 52,
  ingresos: 38,
  totalIngresos: 3912400,
};

// ---------------------------------------------------------------------------
// Motor de pasos: cada paso pasa por la fila guardada (JSON), como en la base
// ---------------------------------------------------------------------------

/** Simula guardar y volver a leer la fila de `ConversacionWhatsapp`. */
function persistir(c: Conversacion): Conversacion {
  const fila = JSON.parse(
    JSON.stringify({
      estado: c.estado,
      clienteTenantId: c.clienteTenantId,
      vence: c.vence?.toISOString() ?? null,
      silenciadoHasta: c.silenciadoHasta?.toISOString() ?? null,
      contexto: c.contexto,
    }),
  );
  fila.vence = fila.vence ? new Date(fila.vence) : null;
  fila.silenciadoHasta = fila.silenciadoHasta ? new Date(fila.silenciadoHasta) : null;
  const leida = conversacionDesdeFila(fila);
  assert.ok(leida, "la fila guardada se vuelve a leer");
  return leida;
}

/**
 * Congela la entrada entera (conversación, evento, estudio). El módulo es ESM (modo estricto):
 * si el bot escribe en algo que recibió, tira TypeError y el test cae. Así cada paso de cada
 * test ejecuta la promesa de "máquina pura" (no toca la entrada).
 */
function congelar<T>(v: T): T {
  if (v !== null && typeof v === "object" && !(v instanceof Date) && !Object.isFrozen(v)) {
    for (const k of Object.keys(v)) congelar((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

class Charla {
  conv: Conversacion | null = null;
  ahora = AHORA;
  e: Espia;
  estudio: { nombre: string | null };
  constructor(e: Espia, estudio: { nombre: string | null } = ESTUDIO) {
    this.e = e;
    this.estudio = estudio;
  }
  async paso(evento: Paso, masMs = 0): Promise<SalidaBot> {
    this.ahora = new Date(this.ahora.getTime() + masMs);
    const s = await procesarEventoBot(
      congelar({
        ahora: this.ahora,
        estudio: { ...this.estudio },
        conversacion: this.conv,
        evento: structuredClone(fechar(evento, this.ahora)),
      }),
      this.e.puertos,
    );
    this.conv = persistir(s.conversacion);
    return s;
  }
  get estado(): EstadoBot | undefined {
    return this.conv?.estado;
  }
}

function textos(s: SalidaBot): string[] {
  return s.respuestas.map((r) => (r.tipo === "texto" || r.tipo === "botones" ? r.texto : `[${r.tipo}]`));
}
function botones(s: SalidaBot): Respuesta & { tipo: "botones" } {
  const b = s.respuestas.find((r) => r.tipo === "botones");
  assert.ok(b && b.tipo === "botones", "la respuesta trae botones");
  return b;
}
function tipos(s: SalidaBot): string[] {
  return s.efectos.map((e) => e.tipo);
}

/** Lleva a Marta (un cliente) hasta `esperando_confirmacion` del extracto wamid.A. */
async function hastaConfirmacion(ch: Charla): Promise<SalidaBot> {
  await ch.paso(doc());
  return ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK }, 5_000);
}

// ---------------------------------------------------------------------------
// 1) La tabla de E1 §3.3, fila por fila
// ---------------------------------------------------------------------------

describe("tabla de estados de E1 §3.3", () => {
  test("desconocido: cualquier mensaje → presentación sin datos → pidiendo_alta", async () => {
    const ch = new Charla(espia([]));
    const s = await ch.paso(txt("hola, les mando el extracto"));
    assert.deepEqual(textos(s), [E1.desconocido]);
    assert.equal(ch.estado, "pidiendo_alta");
  });

  test("pidiendo_alta + CUIT válido → gracias + aviso al estudio, NO asocia → pidiendo_alta", async () => {
    const ch = new Charla(espia([]));
    await ch.paso(txt("hola"));
    const s = await ch.paso(txt("20-11111111-2"));
    assert.deepEqual(textos(s), [E1.altaPedida]);
    assert.deepEqual(s.efectos, [{ tipo: "pedido_de_alta", cuit: CUIT_VALIDO }]);
    assert.equal(ch.estado, "pidiendo_alta");
  });

  test("pidiendo_alta + texto no válido (o CUIT con dígito verificador mal) → pedir CUIT → =", async () => {
    const ch = new Charla(espia([]));
    await ch.paso(txt("hola"));
    const s1 = await ch.paso(txt("no sé mi cuit"));
    assert.deepEqual(textos(s1), [E1.pedirCuit]);
    const s2 = await ch.paso(txt(CUIT_DV_MAL));
    assert.deepEqual(textos(s2), [E1.pedirCuit]);
    assert.equal(s2.efectos.length, 0, "un CUIT con dígito verificador inválido no genera pedido de alta");
    assert.equal(ch.estado, "pidiendo_alta");
  });

  test("inicio + saludo de un número conocido → saludo con nombre y negocio → =", async () => {
    const ch = new Charla(espia([MARTA]));
    const s = await ch.paso(txt("Hola!"));
    assert.deepEqual(textos(s), [E1.saludoMarta]);
    assert.equal(ch.estado, "inicio");
  });

  test("inicio + documento, número con UN cliente → recibido, lo leo → leyendo", async () => {
    const ch = new Charla(espia([MARTA]));
    const s = await ch.paso(doc());
    assert.deepEqual(textos(s), [E1.recibido]);
    assert.deepEqual(s.efectos, [
      {
        tipo: "leer_archivo",
        clienteTenantId: "t-marta",
        archivo: { ref: "wamid.A", nombre: "extracto-sep.pdf", mime: "application/pdf", sha256: "abc" },
      },
    ]);
    assert.equal(ch.estado, "leyendo");
  });

  test("inicio + documento, número con VARIOS clientes → ¿de cuál negocio es? con botones → eligiendo_cliente", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    const s = await ch.paso(doc());
    const b = botones(s);
    assert.equal(b.texto, E1.elegir2);
    assert.deepEqual(
      b.botones.map((x) => x.titulo),
      ["1 Kiosco de Marta", "2 Taller Ruiz SRL"],
      "el título lleva el número de la lista del texto",
    );
    assert.equal(s.efectos.length, 0, "no se lee nada hasta saber de quién es");
    assert.equal(ch.estado, "eligiendo_cliente");
  });

  test("eligiendo_cliente + botón válido → dale, es de {Alias} → leyendo, y se lee para ESE cliente", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    const s0 = await ch.paso(doc());
    const s = await ch.paso(boton(botones(s0).botones[1].id, "Taller Ruiz SRL"));
    assert.deepEqual(textos(s), [E1.elegido]);
    assert.equal(s.efectos.length, 1);
    const e = s.efectos[0];
    assert.ok(e.tipo === "leer_archivo" && e.clienteTenantId === "t-ruiz" && e.archivo.ref === "wamid.A");
    assert.equal(ch.estado, "leyendo");
  });

  test("leyendo → resultado OK → resumen con botones Sí, cargarlo / No → esperando_confirmacion", async () => {
    const ch = new Charla(espia([MARTA]));
    const s = await hastaConfirmacion(ch);
    const b = botones(s);
    assert.equal(b.texto, E1.leido);
    assert.deepEqual(
      b.botones.map((x) => x.titulo),
      ["Sí, cargarlo", "No"],
    );
    assert.equal(ch.estado, "esperando_confirmacion");
    assert.ok(!JSON.stringify(s).includes("0070999020000012344417"), "el CBU entero nunca sale");
  });

  test("leyendo → duplicado exacto → ya me lo habías mandado el {fecha} → inicio", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc());
    // 15/09 21:30 en Buenos Aires = 16/09 00:30 UTC: la fecha se muestra en la zona del negocio.
    const s = await ch.paso({
      tipo: "lectura",
      ref: "wamid.A",
      clienteTenantId: "t-marta",
      resultado: { tipo: "duplicado", recibidoEn: new Date("2026-09-16T00:30:00.000Z") },
    });
    assert.deepEqual(textos(s), [E1.duplicado]);
    assert.equal(ch.estado, "inicio");
  });

  test("leyendo → foto (bytes de imagen en un documento) → todavía no leo fotos → inicio", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc());
    const s = await ch.paso({
      tipo: "lectura",
      ref: "wamid.A",
      clienteTenantId: "t-marta",
      resultado: { tipo: "foto", banco: null },
    });
    assert.equal(s.respuestas.length, 1);
    assert.ok(textos(s)[0].startsWith(E1.fotoPrefijo));
    assert.ok(textos(s)[0].includes("En Banco Galicia:"), "usa el banco del cliente si se sabe");
    assert.equal(ch.estado, "inicio");
  });

  test("leyendo → ilegible / no cuadra el saldo → se lo pasé al estudio (aviso en la bandeja) → inicio", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc());
    const s = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: { tipo: "ilegible" } });
    assert.deepEqual(textos(s), [E1.ilegible]);
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "ilegible", clienteTenantId: "t-marta", ref: "wamid.A" }]);
    assert.equal(ch.estado, "inicio");
  });

  test("esperando_confirmacion + Sí → carga en el negocio del cliente → inicio; al terminar: Cargado. {A} … {R} …", async () => {
    const ch = new Charla(espia([MARTA]));
    const s0 = await hastaConfirmacion(ch);
    const si = botones(s0).botones[0];
    const s = await ch.paso(boton(si.id, si.titulo));
    assert.deepEqual(s.efectos, [{ tipo: "cargar_extracto", clienteTenantId: "t-marta", ref: "wamid.A" }]);
    assert.equal(ch.estado, "inicio");
    const c = await ch.paso(
      {
        tipo: "carga",
        ref: "wamid.A",
        clienteTenantId: "t-marta",
        nombreArchivo: "extracto-sep.pdf",
        resultado: { ok: true, paraFacturar: 30, necesitanDato: 8 },
      },
      3_000,
    );
    assert.deepEqual(textos(c), [E1.cargado]);
    assert.equal(ch.estado, "inicio");
  });

  test("esperando_confirmacion + No → lo descarto → inicio", async () => {
    const ch = new Charla(espia([MARTA]));
    await hastaConfirmacion(ch);
    const s = await ch.paso(txt("no"));
    assert.deepEqual(textos(s), [E1.descartado]);
    assert.deepEqual(s.efectos, [{ tipo: "descartar_extracto", clienteTenantId: "t-marta", ref: "wamid.A" }]);
    assert.equal(ch.estado, "inicio");
  });

  test("esperando_confirmacion + otro archivo → antes decime si cargo el anterior → =", async () => {
    const ch = new Charla(espia([MARTA]));
    await hastaConfirmacion(ch);
    const s = await ch.paso(doc("wamid.B", "octubre.pdf"));
    assert.equal(botones(s).texto, E1.antesConfirmar);
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.B" }]);
    assert.equal(ch.estado, "esperando_confirmacion");
  });

  test("esperando_confirmacion + 24 h sin respuesta → silencio, queda 'sin confirmar' en la bandeja → inicio", async () => {
    const ch = new Charla(espia([MARTA]));
    await hastaConfirmacion(ch);
    const s = await ch.paso({ tipo: "vencimiento" }, 24 * HORA + 1);
    assert.equal(s.respuestas.length, 0);
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" }]);
    assert.equal(ch.estado, "inicio");
  });

  test("cualquiera + estado → resumen del mes → = (también en medio de una confirmación)", async () => {
    const e = espia([MARTA]);
    const ch = new Charla(e);
    await hastaConfirmacion(ch);
    const s = await ch.paso(txt("*Estado*"));
    assert.deepEqual(textos(s), [E1.estadoMarta]);
    assert.deepEqual(e.resumenes, ["t-marta@2026-10"]);
    assert.equal(ch.estado, "esperando_confirmacion");
  });

  test("cualquiera + estudio/humano/hablar → le aviso al estudio → con_persona (el bot calla 24 h o hasta liberar)", async () => {
    for (const palabra of ["estudio", "humano", "hablar"]) {
      const ch = new Charla(espia([MARTA]));
      await hastaConfirmacion(ch);
      const s = await ch.paso(txt(palabra));
      assert.deepEqual(textos(s), [E1.persona], palabra);
      assert.deepEqual(
        tipos(s),
        ["aviso_bandeja", "aviso_bandeja"],
        "el extracto sin confirmar va a la bandeja y se avisa que pide una persona",
      );
      assert.equal(ch.estado, "con_persona");

      const callado = await ch.paso(txt("hola?"), HORA);
      assert.equal(callado.respuestas.length, 0, "con una persona atendiendo, el bot calla");
      const liberado = await ch.paso({ tipo: "liberar" }, HORA);
      assert.equal(liberado.respuestas.length, 0);
      assert.equal(ch.estado, "inicio");
    }
    // Sin liberar: a las 24 h vuelve solo.
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("estudio"));
    assert.equal((await ch.paso(txt("hola"), 23 * HORA)).respuestas.length, 0);
    assert.deepEqual(textos(await ch.paso(txt("hola"), 2 * HORA)), [E1.saludoMarta]);
  });

  test("cualquiera + baja → no te voy a escribir más → baja (opt-out registrado)", async () => {
    const ch = new Charla(espia([MARTA]));
    await hastaConfirmacion(ch);
    const s = await ch.paso(txt("BAJA"));
    assert.deepEqual(textos(s), [E1.baja]);
    assert.deepEqual(
      s.efectos,
      [
        { tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" },
        { tipo: "registrar_baja" },
      ],
      "el extracto que esperaba el Sí queda sin confirmar en la bandeja, y se registra la baja",
    );
    assert.equal(ch.estado, "baja");
  });

  test("salida: facturas emitidas dentro de la ventana → texto + los PDF", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("hola"));
    const s = await ch.paso(
      {
        tipo: "facturas_emitidas",
        clienteTenantId: "t-marta",
        cantidad: 38,
        mes: "2026-09",
        total: 3912400,
        comprobantes: [
          { ref: "pdf-resumen", nombreArchivo: "resumen-septiembre.pdf" },
          { ref: "pdf-1", nombreArchivo: "C-0001-00000001.pdf" },
        ],
      },
      2 * HORA,
    );
    assert.equal(textos(s)[0], E1.facturas);
    assert.deepEqual(s.respuestas.slice(1), [
      { tipo: "documento", ref: "pdf-resumen", nombreArchivo: "resumen-septiembre.pdf" },
      { tipo: "documento", ref: "pdf-1", nombreArchivo: "C-0001-00000001.pdf" },
    ]);
  });

  test("privacidad: primer contacto de un número conocido → aviso una vez, antes de la respuesta", async () => {
    const ch = new Charla(espia([{ ...MARTA, avisoPrivacidadDado: false }]));
    const s = await ch.paso(txt("hola"));
    assert.deepEqual(textos(s), [E1.privacidad, E1.saludoMarta]);
    assert.ok(tipos(s).includes("aviso_privacidad_dado"));
    const ch2 = new Charla(espia([MARTA]));
    assert.deepEqual(textos(await ch2.paso(txt("hola"))), [E1.saludoMarta], "con el aviso ya dado, no se repite");
  });
});

// ---------------------------------------------------------------------------
// 2) Criterio: un número desconocido no obtiene ningún dato ni lista de clientes
// ---------------------------------------------------------------------------

describe("número desconocido", () => {
  // Asociaciones SIN verificar: el puerto las devuelve, el bot no debe usarlas nunca.
  const SIN_VERIFICAR = [
    { ...MARTA, verificado: false },
    { ...RUIZ, verificado: false },
  ];
  const PERMITIDOS = new Set<string>([E1.desconocido, E1.altaPedida, E1.pedirCuit, E1.baja]);
  const PROHIBIDO = ["Kiosco de Marta", "Taller Ruiz", "t-marta", "t-ruiz", "Marta", "Galicia", "Santander"];

  const ATAQUES: Paso[] = [
    txt("hola"),
    txt("estado"),
    txt("estudio"),
    txt("1"),
    txt("Kiosco de Marta"),
    txt("sí"),
    doc(),
    img(),
    boton("cliente:1:1", "Kiosco de Marta"),
    boton("confirmar:1:si", "Sí, cargarlo"),
    boton("t-marta", "t-marta"),
    otro,
    { tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK },
    {
      tipo: "facturas_emitidas",
      clienteTenantId: "t-marta",
      cantidad: 3,
      mes: "2026-09",
      total: 1000,
      comprobantes: [{ ref: "p", nombreArchivo: "p.pdf" }],
    },
    txt(CUIT_VALIDO),
  ];

  for (const [nombre, clientes] of [
    ["sin ninguna asociación", []],
    ["con asociaciones sin verificar", SIN_VERIFICAR],
  ] as const) {
    test(`${nombre}: sólo textos fijos, ni un nombre, ni un id, ni un resumen, ni un archivo leído`, async () => {
      const e = espia([...clientes]);
      const ch = new Charla(e);
      let respuestas = 0;
      for (const ev of ATAQUES) {
        const s = await ch.paso(ev, 60_000);
        for (const t of textos(s)) assert.ok(PERMITIDOS.has(t), `texto no permitido a un desconocido: ${t}`);
        for (const r of s.respuestas) assert.equal(r.tipo, "texto", "a un desconocido no se le mandan botones, PDF ni plantillas");
        const salida = JSON.stringify({ respuestas: s.respuestas, conversacion: s.conversacion });
        for (const p of PROHIBIDO) assert.ok(!salida.includes(p), `se filtró "${p}" en ${salida}`);
        for (const ef of s.efectos) {
          assert.ok(
            ["pedido_de_alta", "descartar_archivo", "aviso_bandeja", "comprobantes_sin_enviar"].includes(ef.tipo),
            `efecto no permitido para un desconocido: ${ef.tipo}`,
          );
        }
        assert.ok(ch.estado === "pidiendo_alta" || ch.estado === "desconocido");
        respuestas += s.respuestas.length;
      }
      assert.deepEqual(e.resumenes, [], "nunca se consulta el resumen de un cliente");
      assert.ok(respuestas <= MAX_RESPUESTAS_DESCONOCIDO, `respuestas en la ventana: ${respuestas}`);
    });
  }

  test("una presentación por ventana de 24 h; ayudas con tope; un solo pedido de alta", async () => {
    const ch = new Charla(espia([]));
    assert.deepEqual(textos(await ch.paso(txt("hola"))), [E1.desconocido]);
    for (let i = 0; i < MAX_AYUDAS_CUIT; i++) assert.deepEqual(textos(await ch.paso(txt("??"))), [E1.pedirCuit]);
    assert.deepEqual(textos(await ch.paso(txt("??"))), [], "después del tope de ayudas, silencio");
    const alta = await ch.paso(txt(CUIT_VALIDO));
    assert.deepEqual(textos(alta), [E1.altaPedida]);
    const otraVez = await ch.paso(txt("20123456786"));
    assert.deepEqual(textos(otraVez), [], "ya pidió el alta: silencio");
    assert.ok(!tipos(otraVez).includes("pedido_de_alta"), "no se inunda la bandeja del estudio");
    // pasadas las 24 h, vuelve a presentarse
    assert.deepEqual(textos(await ch.paso(txt("hola"), 24 * HORA)), [E1.desconocido]);
  });

  test("un archivo de un desconocido nunca se lee: se descarta", async () => {
    const ch = new Charla(espia([]));
    const s = await ch.paso(doc("wamid.X"));
    assert.deepEqual(textos(s), [E1.desconocido]);
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.X" }]);
  });

  test("si el número deja de estar verificado a mitad de un trámite: se suelta sin revelar nada y un botón forjado no carga", async () => {
    const clientes: ClienteDelRemitente[] = [MARTA, RUIZ];
    const e: Espia = espia([]);
    e.puertos.clientesDelRemitente = async () => clientes.map((c) => ({ ...c }));
    const ch = new Charla(e);
    const s0 = await ch.paso(doc());
    assert.equal(ch.estado, "eligiendo_cliente");
    const idBoton = botones(s0).botones[0].id;

    clientes.splice(0, clientes.length, { ...MARTA, verificado: false }, { ...RUIZ, verificado: false });
    const s = await ch.paso(boton(idBoton, "Kiosco de Marta"));
    assert.deepEqual(textos(s), [E1.desconocido]);
    assert.ok(!tipos(s).includes("leer_archivo"));
    assert.ok(tipos(s).includes("descartar_archivo"));
    const guardado = JSON.stringify(ch.conv);
    assert.ok(!guardado.includes("t-marta") && !guardado.includes("Kiosco"), "la fila no conserva la lista de clientes");
    const forjado = await ch.paso(boton("confirmar:1:si", "Sí, cargarlo"));
    assert.ok(!tipos(forjado).includes("cargar_extracto"));
  });

  test("el nombre del estudio es el único dato: sin nombre, se presenta igual sin inventarlo", async () => {
    const ch = new Charla(espia([]), { nombre: null });
    const [t] = textos(await ch.paso(txt("hola")));
    assert.ok(t.startsWith("Hola, te escribe el asistente del estudio. Este número no está asociado"));
  });
});

// ---------------------------------------------------------------------------
// 3) Criterio: un número con dos clientes elige
// ---------------------------------------------------------------------------

describe("número con varios clientes", () => {
  test("elige escribiendo el número o el nombre del negocio", async () => {
    for (const respuesta of ["2", "el 2", "taller ruiz srl"]) {
      const ch = new Charla(espia([MARTA, RUIZ]));
      await ch.paso(doc());
      const s = await ch.paso(txt(respuesta));
      assert.deepEqual(textos(s), [E1.elegido], respuesta);
      const e = s.efectos[0];
      assert.ok(e.tipo === "leer_archivo" && e.clienteTenantId === "t-ruiz", respuesta);
    }
  });

  test("los botones llevan índice y secuencia, nunca el id del negocio", async () => {
    const ch = new Charla(espia([MARTA, RUIZ, NORTE]));
    const s = await ch.paso(doc());
    const b = botones(s);
    assert.equal(b.texto, E1.elegir3);
    for (const x of b.botones) {
      assert.match(x.id, /^cliente:\d+:\d$/);
      assert.ok(!x.id.includes("t-"), x.id);
      assert.ok(Array.from(x.titulo).length <= 20, x.titulo);
    }
  });

  test("opción inexistente, botón forjado o de una pregunta vieja → vuelve a preguntar, no lee nada", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    const s0 = await ch.paso(doc());
    const secuencia = botones(s0).botones[0].id.split(":")[1];
    for (const ev of [
      txt("3"),
      txt("0"),
      txt("cualquiera"),
      boton(`cliente:${secuencia}:3`, "Otro"),
      boton(`cliente:${Number(secuencia) - 1}:1`, "Kiosco de Marta"),
      boton(`confirmar:${secuencia}:si`, "Sí, cargarlo"),
    ]) {
      const s = await ch.paso(ev);
      assert.ok(!tipos(s).includes("leer_archivo"), JSON.stringify(ev));
      assert.ok(botones(s).texto.startsWith("No te entendí. ¿De cuál negocio es extracto-sep.pdf?"));
      assert.equal(ch.estado, "eligiendo_cliente");
    }
  });

  test("si una opción dejó de estar verificada, no se puede elegir y la lista se rearma sin ella", async () => {
    const clientes: ClienteDelRemitente[] = [MARTA, RUIZ, NORTE];
    const e = espia([]);
    e.puertos.clientesDelRemitente = async () => clientes.map((c) => ({ ...c }));
    const ch = new Charla(e);
    const s0 = await ch.paso(doc());
    const idRuiz = botones(s0).botones[1].id;
    clientes[1] = { ...RUIZ, verificado: false };
    const s = await ch.paso(boton(idRuiz, "Taller Ruiz SRL"));
    assert.ok(!tipos(s).includes("leer_archivo"));
    const b = botones(s);
    assert.ok(!b.texto.includes("Taller Ruiz"), b.texto);
    assert.deepEqual(
      b.botones.map((x) => x.titulo),
      ["1 Kiosco de Marta", "2 Distribuidora Nor…"],
    );
    assert.notEqual(b.botones[0].id.split(":")[1], idRuiz.split(":")[1], "con otra lista, otra secuencia");
  });

  test("más de tres clientes: lista numerada sin botones", async () => {
    const ch = new Charla(espia([MARTA, RUIZ, NORTE, SUR]));
    const s = await ch.paso(doc());
    assert.equal(s.respuestas.length, 1);
    assert.equal(s.respuestas[0].tipo, "texto");
    assert.equal(
      textos(s)[0],
      "Recibí extracto-sep.pdf. ¿De cuál negocio es? 1 Kiosco de Marta · 2 Taller Ruiz SRL · 3 Distribuidora Norte SA · 4 Almacén Sur",
    );
    const r = await ch.paso(txt("4"));
    const e = r.efectos[0];
    assert.ok(e.tipo === "leer_archivo" && e.clienteTenantId === "t-sur");
  });

  test("estado con dos clientes: una línea por negocio verificado; el no verificado ni se consulta", async () => {
    const e = espia([MARTA, RUIZ, { ...NORTE, verificado: false }]);
    const ch = new Charla(e);
    const s = await ch.paso(txt("estado"));
    assert.deepEqual(textos(s), [
      `${E1.estadoMarta}\nTaller Ruiz SRL, octubre: 2 extractos cargados, 38 facturas emitidas, 4 esperando al estudio.`,
    ]);
    assert.deepEqual(e.resumenes, ["t-marta@2026-10", "t-ruiz@2026-10"]);
  });

  test("el saludo nombra los negocios del número (y sólo los verificados)", async () => {
    const ch = new Charla(espia([MARTA, RUIZ, { ...NORTE, verificado: false }]));
    const [t] = textos(await ch.paso(txt("hola")));
    assert.ok(t.includes("lo cargo para Kiosco de Marta o Taller Ruiz SRL."), t);
    assert.ok(!t.includes("Distribuidora"), t);
  });

  test("se vence la elección a las 24 h → se suelta el archivo, sin mensaje", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    await ch.paso(doc());
    const s = await ch.paso({ tipo: "vencimiento" }, 24 * HORA);
    assert.equal(s.respuestas.length, 0);
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.A" }]);
    assert.equal(ch.estado, "inicio");
  });
});

// ---------------------------------------------------------------------------
// 4) Criterio: una foto recibe el texto de "todavía no leo fotos"
// ---------------------------------------------------------------------------

describe("fotos", () => {
  test("foto de un cliente con banco conocido → texto de E1 con la instrucción del banco, sin leer nada", async () => {
    const ch = new Charla(espia([MARTA]));
    const s = await ch.paso(img("wamid.F"));
    assert.deepEqual(textos(s), [
      `${E1.fotoPrefijo} En Banco Galicia: entrá al home banking desde la computadora, abrí los movimientos de la cuenta y descargalos en PDF o Excel.`,
    ]);
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.F" }]);
    assert.equal(ch.estado, "inicio");
  });

  test("foto mandada como documento (mime image/*) → mismo texto", async () => {
    const ch = new Charla(espia([MARTA]));
    const s = await ch.paso(doc("wamid.G", "IMG_2044.jpg", "image/jpeg"));
    assert.ok(textos(s)[0].startsWith(E1.fotoPrefijo));
    assert.ok(!tipos(s).includes("leer_archivo"));
  });

  test("foto de un número con varios clientes → no pregunta de quién es; sin banco, sin instrucción", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    const s = await ch.paso(img());
    assert.deepEqual(textos(s), [E1.fotoPrefijo]);
    assert.equal(ch.estado, "inicio");
  });

  test("foto sin banco conocido → sólo el pedido del archivo", async () => {
    const ch = new Charla(espia([NORTE]));
    assert.deepEqual(textos(await ch.paso(img())), [E1.fotoPrefijo]);
  });
});

// ---------------------------------------------------------------------------
// 5) Criterio: la baja silencia
// ---------------------------------------------------------------------------

describe("baja", () => {
  test("después de la baja no sale NINGÚN mensaje, y lo pendiente queda en la bandeja", async () => {
    const e = espia([MARTA]);
    const ch = new Charla(e);
    await ch.paso(doc()); // queda leyendo
    await ch.paso(txt("baja"));
    const eventos: Paso[] = [
      txt("hola"),
      txt("estado"),
      txt("estudio"),
      txt("sí"),
      doc("wamid.Z"),
      img(),
      otro,
      { tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK },
      {
        tipo: "carga",
        ref: "wamid.Q",
        clienteTenantId: "t-marta",
        nombreArchivo: "q.pdf",
        resultado: { ok: true, paraFacturar: 1, necesitanDato: 0 },
      },
      {
        tipo: "facturas_emitidas",
        clienteTenantId: "t-marta",
        cantidad: 2,
        mes: "2026-09",
        total: 50,
        comprobantes: [{ ref: "p1", nombreArchivo: "p1.pdf" }],
      },
      txt("baja"),
      { tipo: "vencimiento" },
    ];
    const efectos: Efecto[] = [];
    for (const ev of eventos) {
      const s = await ch.paso(ev, 10 * HORA);
      assert.deepEqual(s.respuestas, [], `habló en baja ante ${JSON.stringify(ev)}`);
      assert.equal(ch.estado, "baja");
      efectos.push(...s.efectos);
    }
    assert.deepEqual(e.resumenes, [], "en baja ni se consulta el resumen");
    const t = efectos.map((x) => x.tipo);
    assert.ok(!t.includes("leer_archivo") && !t.includes("cargar_extracto"));
    const hay = (x: Efecto) => efectos.some((y) => JSON.stringify(y) === JSON.stringify(x));
    assert.ok(hay({ tipo: "descartar_archivo", ref: "wamid.Z" }), "el documento que llega en baja se descarta");
    assert.ok(hay({ tipo: "descartar_archivo", ref: "wamid.F" }), "la foto que llega en baja se descarta");
    assert.ok(
      hay({ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" }),
      "el extracto que se estaba leyendo queda para el estudio",
    );
    assert.ok(
      hay({ tipo: "comprobantes_sin_enviar", clienteTenantId: "t-marta", refs: ["p1"] }),
      "las facturas quedan sin enviar por WhatsApp",
    );
  });

  test("una baja registrada en la cartera (opt-out) silencia aunque la conversación diga otra cosa", async () => {
    const ch = new Charla(espia([{ ...MARTA, optOut: true }]));
    const s = await ch.paso(txt("hola"));
    assert.deepEqual(s.respuestas, []);
    assert.equal(ch.estado, "baja");
  });

  test("con dos clientes, basta un opt-out para callar al número", async () => {
    const ch = new Charla(espia([MARTA, { ...RUIZ, optOut: true }]));
    assert.deepEqual((await ch.paso(doc())).respuestas, []);
  });

  test("'alta' vuelve a abrir la conversación", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("baja"));
    const s = await ch.paso(txt("alta"), HORA);
    assert.ok(tipos(s).includes("registrar_alta"));
    assert.deepEqual(textos(s), [E1.saludoMarta]);
    assert.equal(ch.estado, "inicio");
  });

  test("la baja funciona aunque esté atendiendo una persona", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("estudio"));
    const s = await ch.paso(txt("no me escribas más"));
    assert.deepEqual(textos(s), [E1.baja]);
    assert.equal(ch.estado, "baja");
  });

  test("un desconocido también puede darse de baja, y después calla", async () => {
    const ch = new Charla(espia([]));
    await ch.paso(txt("hola"));
    const s = await ch.paso(txt("baja"));
    assert.deepEqual(textos(s), [E1.baja]);
    assert.ok(tipos(s).includes("registrar_baja"));
    assert.deepEqual((await ch.paso(txt(CUIT_VALIDO))).respuestas, []);
  });

  test("baja/alta en bucle desde un desconocido no supera el tope de respuestas", async () => {
    const ch = new Charla(espia([]));
    let n = 0;
    for (let i = 0; i < 10; i++) {
      n += (await ch.paso(txt("baja"))).respuestas.length;
      n += (await ch.paso(txt("alta"))).respuestas.length;
    }
    assert.ok(n <= MAX_RESPUESTAS_DESCONOCIDO, `respuestas: ${n}`);
  });
});

// ---------------------------------------------------------------------------
// 6) Confirmación atada al extracto, ventana de WhatsApp y avisos a destiempo
// ---------------------------------------------------------------------------

describe("confirmación y avisos del sistema", () => {
  test("un 'Sí, cargarlo' de una pregunta vieja no confirma el extracto nuevo", async () => {
    const ch = new Charla(espia([MARTA]));
    const viejo = botones(await hastaConfirmacion(ch)).botones[0];
    await ch.paso(txt("no"));
    await ch.paso(doc("wamid.B", "octubre.pdf"));
    await ch.paso({ tipo: "lectura", ref: "wamid.B", clienteTenantId: "t-marta", resultado: LEIDO_OK });
    const s = await ch.paso(boton(viejo.id, viejo.titulo));
    assert.ok(!tipos(s).includes("cargar_extracto"));
    assert.equal(botones(s).texto, "¿Lo cargo para Kiosco de Marta? Respondé Sí o No.");
    assert.equal(ch.estado, "esperando_confirmacion");
    const ok = await ch.paso(txt("Sí, cargarlo"));
    assert.deepEqual(ok.efectos, [{ tipo: "cargar_extracto", clienteTenantId: "t-marta", ref: "wamid.B" }]);
  });

  test("una lectura de otro archivo (a destiempo) no habla: va a la bandeja", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc("wamid.A"));
    const s = await ch.paso({ tipo: "lectura", ref: "wamid.OTRO", clienteTenantId: "t-marta", resultado: LEIDO_OK });
    assert.deepEqual(s.respuestas, []);
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.OTRO" }]);
    assert.equal(ch.estado, "leyendo");
  });

  test("una lectura del mismo archivo para OTRO negocio verificado del número: no pide confirmación, va a la bandeja", async () => {
    for (const [resultado, motivo] of [
      [LEIDO_OK, "sin_confirmar"],
      [{ tipo: "ilegible" as const }, "ilegible"],
    ] as const) {
      const ch = new Charla(espia([MARTA, RUIZ]));
      await ch.paso(doc());
      await ch.paso(txt("1")); // Marta
      const s = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-ruiz", resultado });
      assert.deepEqual(s.respuestas, [], resultado.tipo);
      assert.deepEqual(
        s.efectos,
        [{ tipo: "aviso_bandeja", motivo, clienteTenantId: "t-ruiz", ref: "wamid.A" }],
        "la lectura de Ruiz no se pierde: queda para el estudio",
      );
      assert.equal(ch.estado, "leyendo");
      assert.equal(ch.conv?.clienteTenantId, "t-marta", "el trámite de Marta sigue esperando su lectura");
    }
  });

  test("la misma lectura repetida no vuelve a preguntar ni duplica avisos", async () => {
    const ch = new Charla(espia([MARTA]));
    await hastaConfirmacion(ch);
    const s = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK });
    assert.deepEqual(s.respuestas, []);
    assert.deepEqual(s.efectos, []);
  });

  test("fuera de la ventana de 24 h: la lectura no pide confirmación por WhatsApp (queda sin confirmar)", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc());
    const s = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK }, 24 * HORA);
    assert.deepEqual(s.respuestas, []);
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" }]);
    assert.equal(ch.estado, "inicio");

    // Guarda propia: trámite todavía vigente pero el último mensaje del cliente tiene más de 24 h.
    const fila = conversacionDesdeFila({
      estado: "leyendo",
      clienteTenantId: "t-marta",
      vence: new Date(AHORA.getTime() + HORA),
      contexto: {
        ultimoEntranteEn: new Date(AHORA.getTime() - 25 * HORA).toISOString(),
        secuencia: 0,
        archivo: { ref: "wamid.A", nombre: "sep.pdf", mime: "application/pdf", sha256: null },
      },
    });
    const g = await procesarEventoBot(
      {
        ahora: AHORA,
        estudio: ESTUDIO,
        conversacion: fila,
        evento: { tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK },
      },
      espia([MARTA]).puertos,
    );
    assert.deepEqual(g.respuestas, []);
    assert.deepEqual(g.efectos, [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" }]);
    assert.equal(g.conversacion.estado, "inicio");
  });

  test("facturas fuera de la ventana → plantilla aprobada, y los PDF quedan pendientes", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("hola"));
    const s = await ch.paso(
      {
        tipo: "facturas_emitidas",
        clienteTenantId: "t-marta",
        cantidad: 1,
        mes: "2026-09",
        total: 1234.5,
        comprobantes: [{ ref: "p1", nombreArchivo: "p1.pdf" }],
      },
      3 * 24 * HORA,
    );
    assert.deepEqual(s.respuestas, [
      { tipo: "plantilla", nombre: "comprobantes_emitidos", parametros: ["1", "septiembre", "Kiosco de Marta", "$1.234,50"] },
    ]);
    assert.deepEqual(s.efectos, [{ tipo: "comprobantes_sin_enviar", clienteTenantId: "t-marta", refs: ["p1"] }]);
  });

  test("facturas de un cliente que no es de este número → no se le mandan", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("hola"));
    const s = await ch.paso({
      tipo: "facturas_emitidas",
      clienteTenantId: "t-ruiz",
      cantidad: 5,
      mes: "2026-09",
      total: 10,
      comprobantes: [{ ref: "p9", nombreArchivo: "p9.pdf" }],
    });
    assert.deepEqual(s.respuestas, []);
    assert.ok(!JSON.stringify(s).includes("Taller"));
    assert.deepEqual(s.efectos, [{ tipo: "comprobantes_sin_enviar", clienteTenantId: "t-ruiz", refs: ["p9"] }]);
  });

  test("una carga que falla avisa al estudio y al cliente", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("hola"));
    const s = await ch.paso({ tipo: "carga", ref: "wamid.A", clienteTenantId: "t-marta", nombreArchivo: "sep.pdf", resultado: { ok: false } });
    assert.deepEqual(textos(s), ["No pude cargar sep.pdf. Se lo pasé al estudio para que lo revise; no tenés que hacer nada más."]);
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "carga_fallida", clienteTenantId: "t-marta", ref: "wamid.A" }]);
  });

  test("si el cliente del extracto deja de estar asociado antes del Sí, no se carga", async () => {
    const clientes: ClienteDelRemitente[] = [MARTA, RUIZ];
    const e = espia([]);
    e.puertos.clientesDelRemitente = async () => clientes.map((c) => ({ ...c }));
    const ch = new Charla(e);
    await ch.paso(doc());
    await ch.paso(txt("1"));
    await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK });
    assert.equal(ch.estado, "esperando_confirmacion");
    clientes[0] = { ...MARTA, verificado: false };
    const s = await ch.paso(txt("sí"));
    assert.ok(!tipos(s).includes("cargar_extracto"));
    assert.deepEqual(
      s.efectos,
      [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" }],
      "el extracto que esperaba el Sí no se pierde: queda sin confirmar para el estudio",
    );
    assert.equal(ch.estado, "inicio");
    assert.equal(ch.conv?.clienteTenantId, null);
  });

  test("si el cliente que se está leyendo deja de estar verificado, el trámite se suelta y no se habla de ese archivo", async () => {
    const clientes: ClienteDelRemitente[] = [MARTA, RUIZ];
    const e = espia([]);
    e.puertos.clientesDelRemitente = async () => clientes.map((c) => ({ ...c }));
    const ch = new Charla(e);
    await ch.paso(doc());
    await ch.paso(txt("2")); // Ruiz: queda leyendo
    assert.equal(ch.estado, "leyendo");
    clientes[1] = { ...RUIZ, verificado: false };
    const s = await ch.paso(txt("hola"));
    assert.equal(ch.estado, "inicio");
    assert.equal(ch.conv?.contexto.archivo, null);
    assert.ok(!textos(s).join(" ").includes("extracto-sep.pdf"), textos(s).join(" "));
    assert.ok(!textos(s).join(" ").includes("Taller"), "el negocio que ya no está verificado no se nombra");
    // Cuando termina la lectura de Ruiz, va a la bandeja sin escribirle.
    const l = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-ruiz", resultado: LEIDO_OK });
    assert.deepEqual(l.respuestas, []);
    assert.deepEqual(l.efectos, [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-ruiz", ref: "wamid.A" }]);
  });
});

// ---------------------------------------------------------------------------
// 7) Pureza, determinismo y robustez
// ---------------------------------------------------------------------------

describe("pureza y robustez", () => {
  test("si el puerto de asociaciones falla, no se contesta nada (el error sube)", async () => {
    const e = espia([MARTA]);
    e.puertos.clientesDelRemitente = async () => {
      throw new Error("base caída");
    };
    await assert.rejects(
      procesarEventoBot({ ahora: AHORA, estudio: ESTUDIO, conversacion: null, evento: fechar(txt("hola"), AHORA) }, e.puertos),
      /base caída/,
    );
  });

  test("si el resumen del mes falla, se avisa sin inventar números", async () => {
    const e = espia([MARTA], () => {
      throw new Error("x");
    });
    const s = await procesarEventoBot(
      { ahora: AHORA, estudio: ESTUDIO, conversacion: null, evento: fechar(txt("estado"), AHORA) },
      e.puertos,
    );
    assert.deepEqual(textos(s), [
      "No pude ver cómo va el mes ahora. Probá en un rato o escribí *estudio* para hablar con una persona.",
    ]);
  });

  test("determinista: la misma entrada da la misma salida", async () => {
    const entrada = { ahora: AHORA, estudio: ESTUDIO, conversacion: null, evento: fechar(doc(), AHORA) };
    const a = await procesarEventoBot(entrada, espia([MARTA, RUIZ]).puertos);
    const b = await procesarEventoBot(entrada, espia([MARTA, RUIZ]).puertos);
    assert.deepEqual(a, b);
  });

  test("una fila rota o con un estado inventado se lee como conversación nueva (quién es, lo decide el puerto)", async () => {
    assert.equal(conversacionDesdeFila(null), null);
    assert.equal(conversacionDesdeFila({ estado: "admin" }), null);
    assert.equal(conversacionDesdeFila({ estado: 3 }), null);
    const rara = conversacionDesdeFila({
      estado: "esperando_confirmacion",
      clienteTenantId: "t-marta",
      vence: "no-es-fecha",
      contexto: { archivo: { ref: 5 }, secuencia: -2, desconocido: { desde: "x" } },
    });
    assert.ok(rara);
    assert.equal(rara.vence, null);
    assert.equal(rara.contexto.archivo, null);
    assert.equal(rara.contexto.secuencia, 0);
    // Un trámite sin archivo o sin plazo se suelta; un desconocido con esa fila no carga nada.
    const s = await procesarEventoBot(
      { ahora: AHORA, estudio: ESTUDIO, conversacion: rara, evento: fechar(boton("confirmar:0:si", "Sí, cargarlo"), AHORA) },
      espia([]).puertos,
    );
    assert.ok(!tipos(s).includes("cargar_extracto"));
    assert.deepEqual(textos(s), [E1.desconocido]);
  });

  test("una ventana de desconocido con contadores ilegibles cuenta como agotada", async () => {
    const conv = conversacionNueva();
    const fila = conversacionDesdeFila({
      estado: "pidiendo_alta",
      vence: new Date(AHORA.getTime() + HORA),
      contexto: { ...conv.contexto, desconocido: { desde: AHORA.toISOString(), saludado: true, respuestas: "mucho" } },
    });
    const s = await procesarEventoBot(
      { ahora: AHORA, estudio: ESTUDIO, conversacion: fila, evento: fechar(txt("hola"), AHORA) },
      espia([]).puertos,
    );
    assert.deepEqual(s.respuestas, []);
  });

  test("bot.ts y mensajes.ts no importan base, red ni Prisma", () => {
    const leer = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
    const imports = (f: string) =>
      Array.from(leer(f).matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)).map((m) => m[1]);
    assert.deepEqual(imports("./bot.ts").sort(), ["./mensajes", "@/lib/cuit", "@/lib/datetime"]);
    assert.deepEqual(imports("./mensajes.ts"), []);
    const fuente = leer("./bot.ts");
    assert.ok(!/Date\.now\(|new Date\(\)|Math\.random/.test(fuente), "sin reloj ni azar propios");
  });
});

// ---------------------------------------------------------------------------
// 8) Formato
// ---------------------------------------------------------------------------

describe("formato", () => {
  test("pesos en formato argentino", () => {
    assert.equal(formatearPesos(3912400), "$3.912.400,00");
    assert.equal(formatearPesos(0.1 + 0.2), "$0,30");
    assert.equal(formatearPesos(1234.5), "$1.234,50");
    assert.equal(formatearPesos(-15), "-$15,00");
    assert.equal(formatearPesos(Number.NaN), "$0,00");
  });

  test("de una cuenta sólo salen los últimos 4 dígitos", () => {
    assert.equal(ultimos4("0070999020000012344417"), "4417");
    assert.equal(ultimos4("***4417"), "4417");
    assert.equal(ultimos4("12"), null);
  });

  test("el nombre del archivo que manda el remitente se sanea (una línea, con tope)", () => {
    assert.equal(nombreDeArchivo("a\nb\u202Ec.pdf"), "a b c.pdf");
    assert.equal(nombreDeArchivo(null), "el archivo");
    assert.equal(Array.from(nombreDeArchivo("x".repeat(500))).length, 60);
    assert.equal(tituloDeBoton("Distribuidora Norte SA"), "Distribuidora Norte…");
  });

  test("singulares", async () => {
    const ch = new Charla(espia([MARTA], () => ({ extractosCargados: 1, facturasEmitidas: 1, esperandoAlEstudio: 0 })));
    assert.deepEqual(textos(await ch.paso(txt("estado"))), [
      "Kiosco de Marta, octubre: 1 extracto cargado, 1 factura emitida, 0 esperando al estudio.",
    ]);
    await ch.paso(doc());
    const s = await ch.paso({
      tipo: "lectura",
      ref: "wamid.A",
      clienteTenantId: "t-marta",
      resultado: { ...LEIDO_OK, banco: null, cuentaUltimos4: null, movimientos: 1, ingresos: 1, totalIngresos: 500 },
    });
    assert.equal(
      botones(s).texto,
      "Es un extracto bancario, del 01/09 al 30/09: 1 movimiento, 1 ingreso por $500,00. ¿Lo cargo para Kiosco de Marta?",
    );
  });
});

// ---------------------------------------------------------------------------
// 9) Regla 5: los avisos del sistema sólo van al número que tiene ESE cliente
//    verificado, y sólo dentro de la ventana de 24 h de WhatsApp
// ---------------------------------------------------------------------------

describe("regla 5: avisos del sistema (destinatario y ventana)", () => {
  const CARGA_OK_RUIZ: EventoBot = {
    tipo: "carga",
    ref: "wamid.R",
    clienteTenantId: "t-ruiz",
    nombreArchivo: "ruiz-sep.pdf",
    resultado: { ok: true, paraFacturar: 30, necesitanDato: 8 },
  };
  const CARGA_MAL_RUIZ: EventoBot = {
    tipo: "carga",
    ref: "wamid.R",
    clienteTenantId: "t-ruiz",
    nombreArchivo: "ruiz-sep.pdf",
    resultado: { ok: false },
  };
  const DE_RUIZ = ["Taller", "Ruiz", "ruiz-sep", "30 ventas", "Santander", "Cargado", "No pude cargar"];

  /** Número que sólo tiene a Marta verificada y acaba de escribir (ventana abierta). */
  async function numeroDeMarta(): Promise<Charla> {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("hola"));
    return ch;
  }

  test("carga OK de un negocio que no es de este número → 0 respuestas, aunque la ventana esté abierta", async () => {
    const ch = await numeroDeMarta();
    const s = await ch.paso(CARGA_OK_RUIZ, 60_000);
    assert.deepEqual(s.respuestas, []);
    assert.deepEqual(s.efectos, []);
    const salida = JSON.stringify(s);
    for (const p of DE_RUIZ.filter((x) => x !== "Ruiz" && x !== "ruiz-sep")) assert.ok(!salida.includes(p), p);
    // Control: el MISMO evento, al número que sí tiene a Ruiz verificado, se cuenta.
    const deRuiz = new Charla(espia([RUIZ]));
    await deRuiz.paso(txt("hola"));
    assert.deepEqual(textos(await deRuiz.paso(CARGA_OK_RUIZ, 60_000)), [E1.cargado]);
  });

  test("carga FALLIDA de un negocio que no es de este número → 0 respuestas; el estudio igual se entera", async () => {
    const ch = await numeroDeMarta();
    const s = await ch.paso(CARGA_MAL_RUIZ, 60_000);
    assert.deepEqual(s.respuestas, []);
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "carga_fallida", clienteTenantId: "t-ruiz", ref: "wamid.R" }]);
    for (const p of DE_RUIZ) assert.ok(!JSON.stringify(s.respuestas).includes(p), p);
  });

  test("carga de un negocio que dejó de estar verificado para este número (antes lo estaba) → 0 respuestas", async () => {
    const clientes: ClienteDelRemitente[] = [MARTA, RUIZ];
    const e = espia([]);
    e.puertos.clientesDelRemitente = async () => clientes.map((c) => ({ ...c }));
    const ch = new Charla(e);
    await ch.paso(txt("hola"));
    clientes[1] = { ...RUIZ, verificado: false };
    for (const ev of [CARGA_OK_RUIZ, CARGA_MAL_RUIZ]) {
      const s = await ch.paso(ev, 60_000);
      assert.deepEqual(s.respuestas, [], JSON.stringify(ev));
    }
  });

  test("lectura de un negocio que no es de este número, con el mismo ref del trámite en curso → no habla ni toca el trámite", async () => {
    for (const resultado of [LEIDO_OK, { tipo: "ilegible" as const }, { tipo: "foto" as const, banco: "Banco Santander" }]) {
      const ch = new Charla(espia([MARTA]));
      await ch.paso(doc("wamid.A"));
      const s = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-ruiz", resultado });
      assert.deepEqual(s.respuestas, [], resultado.tipo);
      assert.equal(ch.estado, "leyendo", "el trámite de Marta sigue esperando su lectura");
      assert.equal(ch.conv?.clienteTenantId, "t-marta");
      for (const ef of s.efectos) {
        assert.ok(ef.tipo === "aviso_bandeja" && ef.clienteTenantId === "t-ruiz", "sólo queda para el estudio");
      }
    }
  });

  test("facturas de un negocio que no es de este número, fuera de la ventana → tampoco plantilla", async () => {
    const ch = await numeroDeMarta();
    const s = await ch.paso(
      {
        tipo: "facturas_emitidas",
        clienteTenantId: "t-ruiz",
        cantidad: 5,
        mes: "2026-09",
        total: 10,
        comprobantes: [{ ref: "p9", nombreArchivo: "p9.pdf" }],
      },
      3 * 24 * HORA,
    );
    assert.deepEqual(s.respuestas, []);
    assert.deepEqual(s.efectos, [{ tipo: "comprobantes_sin_enviar", clienteTenantId: "t-ruiz", refs: ["p9"] }]);
  });

  test("ventana: la carga se cuenta hasta 1 ms antes de las 24 h; desde las 24 h, silencio (OK y fallida)", async () => {
    const cargaMarta = (ok: boolean): EventoBot => ({
      tipo: "carga",
      ref: "wamid.A",
      clienteTenantId: "t-marta",
      nombreArchivo: "sep.pdf",
      resultado: ok ? { ok: true, paraFacturar: 30, necesitanDato: 8 } : { ok: false },
    });
    const adentro = await numeroDeMarta();
    assert.deepEqual(textos(await adentro.paso(cargaMarta(true), 24 * HORA - 1)), [E1.cargado]);

    for (const ok of [true, false]) {
      const ch = await numeroDeMarta();
      const s = await ch.paso(cargaMarta(ok), 24 * HORA);
      assert.deepEqual(s.respuestas, [], `carga ${ok ? "OK" : "fallida"} fuera de la ventana`);
      assert.deepEqual(
        s.efectos,
        ok ? [] : [{ tipo: "aviso_bandeja", motivo: "carga_fallida", clienteTenantId: "t-marta", ref: "wamid.A" }],
      );
    }
  });

  test("ventana: sin ningún mensaje del remitente guardado, no hay texto libre", async () => {
    const s = await procesarEventoBot(
      congelar({
        ahora: AHORA,
        estudio: ESTUDIO,
        conversacion: null,
        evento: {
          tipo: "carga",
          ref: "wamid.A",
          clienteTenantId: "t-marta",
          nombreArchivo: "sep.pdf",
          resultado: { ok: true, paraFacturar: 1, necesitanDato: 0 },
        } as EventoBot,
      }),
      espia([MARTA]).puertos,
    );
    assert.deepEqual(s.respuestas, []);
  });

  test("ventana: la lectura fuera de las 24 h no escribe nada, sea cual sea el resultado; lo pendiente va a la bandeja", async () => {
    // Trámite vigente (vence en 1 h) pero el último mensaje del remitente tiene 25 h.
    const leyendoFueraDeVentana = () =>
      conversacionDesdeFila({
        estado: "leyendo",
        clienteTenantId: "t-marta",
        vence: new Date(AHORA.getTime() + HORA),
        contexto: {
          ultimoEntranteEn: new Date(AHORA.getTime() - 25 * HORA).toISOString(),
          secuencia: 0,
          archivo: { ref: "wamid.A", nombre: "sep.pdf", mime: "application/pdf", sha256: null },
        },
      });
    const casos: { resultado: ResultadoLectura; efectos: Efecto[] }[] = [
      { resultado: { tipo: "ilegible" }, efectos: [{ tipo: "aviso_bandeja", motivo: "ilegible", clienteTenantId: "t-marta", ref: "wamid.A" }] },
      { resultado: { tipo: "duplicado", recibidoEn: "2026-09-16T00:30:00.000Z" }, efectos: [] },
      { resultado: { tipo: "foto", banco: null }, efectos: [] },
      { resultado: LEIDO_OK, efectos: [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" }] },
    ];
    for (const c of casos) {
      const s = await procesarEventoBot(
        congelar({
          ahora: AHORA,
          estudio: ESTUDIO,
          conversacion: leyendoFueraDeVentana(),
          evento: { tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: c.resultado },
        }),
        espia([MARTA]).puertos,
      );
      assert.deepEqual(s.respuestas, [], c.resultado.tipo);
      assert.deepEqual(s.efectos, c.efectos, c.resultado.tipo);
      assert.equal(s.conversacion.estado, "inicio", c.resultado.tipo);
    }
  });

  test("ventana: la misma lectura ilegible DENTRO de la ventana sí se cuenta (control)", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc());
    const s = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: { tipo: "ilegible" } }, 23 * HORA);
    assert.deepEqual(textos(s), [E1.ilegible]);
  });
});

// ---------------------------------------------------------------------------
// 10) Máquina pura: la entrada no se toca
// ---------------------------------------------------------------------------

describe("pureza de la entrada", () => {
  test("congelar hace que cualquier escritura en la entrada tire (el módulo corre en modo estricto)", () => {
    const o = congelar({ a: { b: 1 }, c: [{ d: 1 }] });
    assert.throws(() => {
      (o.a as { b: number }).b = 2;
    }, TypeError);
    assert.throws(() => {
      (o.c[0] as { d: number }).d = 2;
    }, TypeError);
  });

  test("la baja de un desconocido no suma sobre la entrada ni comparte el contador con la salida", async () => {
    const entrada = {
      ahora: AHORA,
      estudio: ESTUDIO,
      conversacion: conversacionDesdeFila({
        estado: "pidiendo_alta",
        vence: new Date(AHORA.getTime() + HORA),
        contexto: {
          ...conversacionNueva().contexto,
          desconocido: { desde: AHORA.toISOString(), respuestas: 1, ayudas: 0, saludado: true, solicitudEn: null },
        },
      }),
      evento: fechar(txt("baja"), AHORA),
    };
    const antes = JSON.stringify(entrada);
    const a = await procesarEventoBot(entrada, espia([]).puertos);
    assert.equal(JSON.stringify(entrada), antes, "la entrada quedó igual");
    assert.equal(entrada.conversacion?.contexto.desconocido?.respuestas, 1);
    assert.equal(a.conversacion.contexto.desconocido?.respuestas, 2);
    assert.notEqual(a.conversacion.contexto.desconocido, entrada.conversacion?.contexto.desconocido);
    const b = await procesarEventoBot(entrada, espia([]).puertos);
    assert.deepEqual(b, a, "procesar dos veces la misma entrada da lo mismo");
    assert.equal(a.conversacion.contexto.desconocido?.respuestas, 2, "la segunda llamada no cambió la primera salida");
  });
});

// ---------------------------------------------------------------------------
// 11) Botones de "¿De cuál negocio es?": títulos únicos y no vacíos
// ---------------------------------------------------------------------------

describe("títulos de los botones de negocio", () => {
  test("dos alias que se recortan igual y uno vacío → títulos distintos, no vacíos y de hasta 20 caracteres", async () => {
    const clientes: ClienteDelRemitente[] = [
      { ...NORTE, clienteTenantId: "t-n1", alias: "Distribuidora Norte SA" },
      { ...NORTE, clienteTenantId: "t-n2", alias: "Distribuidora Norte SRL" },
      { ...NORTE, clienteTenantId: "t-n3", alias: "" },
    ];
    const ch = new Charla(espia(clientes));
    const b = botones(await ch.paso(doc()));
    const titulos = b.botones.map((x) => x.titulo);
    assert.deepEqual(titulos, ["1 Distribuidora Nor…", "2 Distribuidora Nor…", "3"]);
    assert.equal(new Set(titulos).size, titulos.length, "únicos dentro del mensaje");
    for (const t of titulos) {
      assert.ok(t.trim().length > 0, "no vacío");
      assert.ok(Array.from(t).length <= 20, t);
    }
    assert.equal(new Set(b.botones.map((x) => x.id)).size, 3, "ids únicos");
  });

  test("tres alias iguales → tres títulos distintos", async () => {
    const clientes = [1, 2, 3].map((i) => ({ ...NORTE, clienteTenantId: `t-${i}`, alias: "Kiosco" }));
    const b = botones(await new Charla(espia(clientes)).paso(doc()));
    assert.deepEqual(
      b.botones.map((x) => x.titulo),
      ["1 Kiosco", "2 Kiosco", "3 Kiosco"],
    );
  });
});

// ---------------------------------------------------------------------------
// 12) Fotos en medio de un trámite
// ---------------------------------------------------------------------------

describe("fotos en cualquier estado", () => {
  test("eligiendo_cliente + foto → todavía no leo fotos; la pregunta sigue en pie y sus botones valen", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    const s0 = await ch.paso(doc());
    const s = await ch.paso(img("wamid.F"));
    assert.deepEqual(textos(s), [E1.fotoPrefijo]);
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.F" }]);
    assert.equal(ch.estado, "eligiendo_cliente");
    const r = await ch.paso(boton(botones(s0).botones[1].id, "2 Taller Ruiz SRL"));
    assert.deepEqual(r.efectos, [
      {
        tipo: "leer_archivo",
        clienteTenantId: "t-ruiz",
        archivo: { ref: "wamid.A", nombre: "extracto-sep.pdf", mime: "application/pdf", sha256: "abc" },
      },
    ]);
  });

  test("leyendo + foto → todavía no leo fotos (con el banco del cliente); la lectura en curso sigue", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc());
    const s = await ch.paso(img("wamid.F"));
    assert.equal(s.respuestas.length, 1);
    assert.ok(textos(s)[0].startsWith(E1.fotoPrefijo));
    assert.ok(textos(s)[0].includes("En Banco Galicia:"));
    assert.ok(!textos(s)[0].includes("mandame el otro de nuevo"), "no invita a reenviar la foto");
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.F" }]);
    assert.equal(ch.estado, "leyendo");
    const l = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK });
    assert.equal(botones(l).texto, E1.leido);
  });

  test("esperando_confirmacion + foto (también como documento image/*) → todavía no leo fotos; el Sí de antes carga", async () => {
    const ch = new Charla(espia([MARTA]));
    const si = botones(await hastaConfirmacion(ch)).botones[0];
    for (const ev of [img("wamid.F"), doc("wamid.G", "IMG_1.jpg", "image/jpeg")]) {
      const s = await ch.paso(ev);
      assert.ok(textos(s)[0].startsWith(E1.fotoPrefijo));
      assert.ok(!tipos(s).includes("leer_archivo"));
      assert.equal(ch.estado, "esperando_confirmacion");
    }
    const ok = await ch.paso(boton(si.id, si.titulo));
    assert.deepEqual(ok.efectos, [{ tipo: "cargar_extracto", clienteTenantId: "t-marta", ref: "wamid.A" }]);
  });
});

// ---------------------------------------------------------------------------
// 13) Elegir un negocio cuyo nombre es una palabra de comando
// ---------------------------------------------------------------------------

describe("elección antes que comandos", () => {
  for (const alias of ["Estudio", "Contador", "Persona", "Ok", "Estado"]) {
    test(`un negocio llamado "${alias}" se elige por su nombre (no pasa a una persona ni suelta el archivo)`, async () => {
      const ch = new Charla(espia([{ ...MARTA, alias }, RUIZ]));
      await ch.paso(doc());
      const s = await ch.paso(txt(alias));
      assert.deepEqual(s.efectos, [
        {
          tipo: "leer_archivo",
          clienteTenantId: "t-marta",
          archivo: { ref: "wamid.A", nombre: "extracto-sep.pdf", mime: "application/pdf", sha256: "abc" },
        },
      ]);
      assert.deepEqual(textos(s), [`Dale, es de ${alias}. Lo estoy leyendo.`]);
      assert.equal(ch.estado, "leyendo");
    });
  }

  test("sin un negocio con ese nombre, 'estado' mientras se elige da el estado y la pregunta sigue", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    await ch.paso(doc());
    const s = await ch.paso(txt("estado"));
    assert.equal(textos(s).length, 1);
    assert.ok(textos(s)[0].startsWith("Kiosco de Marta, octubre:"));
    assert.equal(ch.estado, "eligiendo_cliente");
  });

  test("'baja' gana siempre, aunque un negocio se llame así", async () => {
    const ch = new Charla(espia([{ ...MARTA, alias: "Baja" }, RUIZ]));
    await ch.paso(doc());
    const s = await ch.paso(txt("baja"));
    assert.deepEqual(textos(s), [E1.baja]);
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.A" }, { tipo: "registrar_baja" }]);
    assert.equal(ch.estado, "baja");
  });
});

// ---------------------------------------------------------------------------
// 14) Nada se pierde: segundo archivo y persona atendiendo
// ---------------------------------------------------------------------------

describe("nada se pierde", () => {
  test("eligiendo_cliente + otro documento → se descarta ESE (no el primero) y se vuelve a preguntar", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    await ch.paso(doc("wamid.A"));
    const s = await ch.paso(doc("wamid.B", "octubre.pdf"));
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.B" }]);
    assert.equal(
      botones(s).texto,
      "Antes decime de cuál negocio es el anterior (extracto-sep.pdf): 1 Kiosco de Marta · 2 Taller Ruiz SRL",
    );
    assert.equal(ch.conv?.contexto.archivo?.ref, "wamid.A");
  });

  test("leyendo + otro documento → se descarta ESE y se pide de nuevo después", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc("wamid.A"));
    const s = await ch.paso(doc("wamid.B", "octubre.pdf"));
    assert.deepEqual(s.efectos, [{ tipo: "descartar_archivo", ref: "wamid.B" }]);
    assert.deepEqual(textos(s), ["Todavía estoy leyendo extracto-sep.pdf. Cuando te conteste, mandame el otro de nuevo."]);
    assert.equal(ch.conv?.contexto.archivo?.ref, "wamid.A");
  });

  test("con una persona atendiendo, lo que termine el sistema no se le cuenta al remitente pero queda en la bandeja", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(doc("wamid.A"));
    await ch.paso(txt("estudio"));
    assert.equal(ch.estado, "con_persona");
    const casos: [EventoBot, Efecto[]][] = [
      [
        { tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-marta", resultado: LEIDO_OK },
        [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-marta", ref: "wamid.A" }],
      ],
      [
        { tipo: "lectura", ref: "wamid.B", clienteTenantId: "t-marta", resultado: { tipo: "ilegible" } },
        [{ tipo: "aviso_bandeja", motivo: "ilegible", clienteTenantId: "t-marta", ref: "wamid.B" }],
      ],
      [
        { tipo: "carga", ref: "wamid.C", clienteTenantId: "t-marta", nombreArchivo: "c.pdf", resultado: { ok: false } },
        [{ tipo: "aviso_bandeja", motivo: "carga_fallida", clienteTenantId: "t-marta", ref: "wamid.C" }],
      ],
      [
        {
          tipo: "facturas_emitidas",
          clienteTenantId: "t-marta",
          cantidad: 2,
          mes: "2026-09",
          total: 50,
          comprobantes: [{ ref: "p1", nombreArchivo: "p1.pdf" }],
        },
        [{ tipo: "comprobantes_sin_enviar", clienteTenantId: "t-marta", refs: ["p1"] }],
      ],
    ];
    for (const [ev, esperado] of casos) {
      const s = await ch.paso(ev, 60_000);
      assert.deepEqual(s.respuestas, [], JSON.stringify(ev));
      assert.deepEqual(s.efectos, esperado, JSON.stringify(ev));
      assert.equal(ch.estado, "con_persona");
    }
  });
});

// ---------------------------------------------------------------------------
// 15) Criterio "un número con dos clientes elige": el extracto cae en el negocio ELEGIDO
// ---------------------------------------------------------------------------

const ARCHIVO_A = { ref: "wamid.A", nombre: "extracto-sep.pdf", mime: "application/pdf", sha256: "abc" };

/** El mismo mensaje, con el timestamp de Meta fijado a mano. */
function mandadoEn(ev: Paso, enviadoEn: Date): Paso {
  return ev.tipo === "mensaje" ? { tipo: "mensaje", mensaje: ev.mensaje, enviadoEn } : ev;
}

describe("el extracto cae en el negocio que eligió el remitente", () => {
  // Se muestran [Marta, Ruiz, Norte] y se elige Ruiz, el del MEDIO. Después de mostrar la lista
  // el puerto devuelve los negocios en el mismo orden o en otro ([Norte, Marta, Ruiz]). Así una
  // decisión que tome una posición fija de la lista de hoy (`clientes[k]`, para cualquier k) cae
  // en otro negocio en al menos uno de los dos órdenes, y el test da rojo.
  const MOSTRADOS: readonly ClienteDelRemitente[] = [MARTA, RUIZ, NORTE];
  const ORDENES = { "mismo orden": MOSTRADOS, "otro orden": [NORTE, MARTA, RUIZ] } as const;
  const ELECCIONES = {
    botón: (s0: SalidaBot) => boton(botones(s0).botones[1].id, "2 Taller Ruiz SRL"),
    número: () => txt("2"),
    nombre: () => txt("Taller Ruiz SRL"),
  } as const;
  const COMBOS = (Object.keys(ELECCIONES) as (keyof typeof ELECCIONES)[]).flatMap((el) =>
    (Object.keys(ORDENES) as (keyof typeof ORDENES)[]).map((o) => [el, o] as const),
  );
  const LECTURA_RUIZ: EventoBot = { tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-ruiz", resultado: LEIDO_OK };
  const PREGUNTA_RUIZ =
    "Es un extracto de Banco Galicia (cuenta terminada en 4417), del 01/09 al 30/09: 52 movimientos, 38 ingresos por $3.912.400,00. ¿Lo cargo para Taller Ruiz SRL?";
  const CARGAR_RUIZ: Efecto = { tipo: "cargar_extracto", clienteTenantId: "t-ruiz", ref: "wamid.A" };
  const SIN_CONFIRMAR_RUIZ: Efecto = { tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-ruiz", ref: "wamid.A" };

  type Recorrido = { nombre: string; ch: Charla; ultima: SalidaBot; efectos: Efecto[] };

  /** doc → elegir Ruiz (por botón, número o nombre) → el puerto cambia (o no) de orden → leyendo. */
  async function hastaLeyendoRuiz(el: keyof typeof ELECCIONES, o: keyof typeof ORDENES): Promise<Recorrido> {
    let lista: readonly ClienteDelRemitente[] = MOSTRADOS;
    const e = espia([]);
    e.puertos.clientesDelRemitente = async () => lista.map((c) => congelar({ ...c }));
    const ch = new Charla(e);
    const s0 = await ch.paso(doc());
    lista = ORDENES[o];
    const s1 = await ch.paso(ELECCIONES[el](s0));
    const nombre = `${el}, ${o}`;
    assert.deepEqual(textos(s1), [E1.elegido], nombre);
    return { nombre, ch, ultima: s1, efectos: [...s0.efectos, ...s1.efectos] };
  }

  /** … → lectura OK de Ruiz → esperando_confirmacion. */
  async function hastaConfirmarRuiz(el: keyof typeof ELECCIONES, o: keyof typeof ORDENES): Promise<Recorrido> {
    const r = await hastaLeyendoRuiz(el, o);
    const confirmacion = await r.ch.paso(LECTURA_RUIZ, 5_000);
    return { ...r, ultima: confirmacion, efectos: [...r.efectos, ...confirmacion.efectos] };
  }

  test("la lectura de Ruiz pregunta por Taller Ruiz SRL y el trámite queda en t-ruiz", async () => {
    for (const [el, o] of COMBOS) {
      const { nombre, ch, ultima, efectos } = await hastaConfirmarRuiz(el, o);
      const b = botones(ultima);
      assert.equal(b.texto, PREGUNTA_RUIZ, nombre);
      assert.deepEqual(
        b.botones.map((x) => x.titulo),
        ["Sí, cargarlo", "No"],
        nombre,
      );
      assert.equal(ch.estado, "esperando_confirmacion", nombre);
      assert.equal(ch.conv?.clienteTenantId, "t-ruiz", nombre);
      assert.deepEqual(efectos, [{ tipo: "leer_archivo", clienteTenantId: "t-ruiz", archivo: ARCHIVO_A }], nombre);
    }
  });

  test("Sí, por botón o por texto → cargar_extracto en t-ruiz; al terminar la carga de Ruiz, 'Cargado'", async () => {
    for (const [el, o] of COMBOS) {
      for (const si of ["botón", "sí", "Sí, cargarlo", "dale"]) {
        const { nombre, ch, ultima } = await hastaConfirmarRuiz(el, o);
        const b = botones(ultima).botones[0];
        const s = await ch.paso(si === "botón" ? boton(b.id, b.titulo) : txt(si));
        assert.deepEqual(s.efectos, [CARGAR_RUIZ], `${nombre}, ${si}`);
        assert.deepEqual(s.respuestas, [], `${nombre}, ${si}`);
        assert.equal(ch.estado, "inicio");
        const c = await ch.paso(
          {
            tipo: "carga",
            ref: "wamid.A",
            clienteTenantId: "t-ruiz",
            nombreArchivo: "extracto-sep.pdf",
            resultado: { ok: true, paraFacturar: 30, necesitanDato: 8 },
          },
          3_000,
        );
        assert.deepEqual(textos(c), [E1.cargado], `${nombre}, ${si}`);
      }
    }
  });

  test("No, por botón o por texto → descartar_extracto en t-ruiz", async () => {
    for (const [el, o] of COMBOS) {
      for (const no of ["botón", "no", "descartalo"]) {
        const { nombre, ch, ultima } = await hastaConfirmarRuiz(el, o);
        const b = botones(ultima).botones[1];
        const s = await ch.paso(no === "botón" ? boton(b.id, b.titulo) : txt(no));
        assert.deepEqual(s.efectos, [{ tipo: "descartar_extracto", clienteTenantId: "t-ruiz", ref: "wamid.A" }], `${nombre}, ${no}`);
        assert.deepEqual(textos(s), [E1.descartado]);
        assert.equal(ch.estado, "inicio");
      }
    }
  });

  test("ni Sí ni No → repregunta por Taller Ruiz SRL sin cargar nada; el Sí de después carga en Ruiz", async () => {
    for (const [el, o] of COMBOS) {
      const { nombre, ch } = await hastaConfirmarRuiz(el, o);
      const s = await ch.paso(txt("capaz"));
      assert.equal(botones(s).texto, "¿Lo cargo para Taller Ruiz SRL? Respondé Sí o No.", nombre);
      assert.deepEqual(s.efectos, [], nombre);
      assert.deepEqual((await ch.paso(txt("si"))).efectos, [CARGAR_RUIZ], nombre);
    }
  });

  test("si el trámite se suelta (vence, baja, estudio), el extracto queda sin confirmar en t-ruiz", async () => {
    const salidas: [string, (ch: Charla) => Promise<SalidaBot>, Efecto[]][] = [
      ["vence", (ch) => ch.paso({ tipo: "vencimiento" }, 24 * HORA + 1), [SIN_CONFIRMAR_RUIZ]],
      ["baja", (ch) => ch.paso(txt("baja")), [SIN_CONFIRMAR_RUIZ, { tipo: "registrar_baja" }]],
      [
        "estudio",
        (ch) => ch.paso(txt("estudio")),
        [SIN_CONFIRMAR_RUIZ, { tipo: "aviso_bandeja", motivo: "pide_persona", clienteTenantId: "t-ruiz", ref: null }],
      ],
    ];
    for (const [el, o] of COMBOS) {
      for (const [como, soltar, esperado] of salidas) {
        const { nombre, ch } = await hastaConfirmarRuiz(el, o);
        assert.deepEqual((await soltar(ch)).efectos, esperado, `${nombre}, ${como}`);
      }
    }
  });

  test("foto en la confirmación → instrucción del banco de Ruiz; el Sí de antes sigue cargando en Ruiz", async () => {
    for (const [el, o] of COMBOS) {
      const { nombre, ch, ultima } = await hastaConfirmarRuiz(el, o);
      const s = await ch.paso(img("wamid.F"));
      assert.ok(textos(s)[0].includes("En Banco Santander:"), `${nombre}: ${textos(s)[0]}`);
      const b = botones(ultima).botones[0];
      assert.deepEqual((await ch.paso(boton(b.id, b.titulo))).efectos, [CARGAR_RUIZ], nombre);
    }
  });

  test("la lectura de Ruiz resulta ser una foto → instrucción del banco de Ruiz (no del primero de la lista)", async () => {
    for (const [el, o] of COMBOS) {
      const { nombre, ch } = await hastaLeyendoRuiz(el, o);
      const s = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-ruiz", resultado: { tipo: "foto", banco: null } });
      assert.ok(textos(s)[0].includes("En Banco Santander:"), `${nombre}: ${textos(s)[0]}`);
    }
  });

  test("facturas de Ruiz a un número con tres negocios → nombran a Taller Ruiz SRL (texto y plantilla)", async () => {
    const facturasRuiz: EventoBot = {
      tipo: "facturas_emitidas",
      clienteTenantId: "t-ruiz",
      cantidad: 38,
      mes: "2026-09",
      total: 3912400,
      comprobantes: [{ ref: "p1", nombreArchivo: "p1.pdf" }],
    };
    for (const o of Object.keys(ORDENES) as (keyof typeof ORDENES)[]) {
      const adentro = new Charla(espia([...ORDENES[o]]));
      await adentro.paso(txt("hola"));
      assert.equal(textos(await adentro.paso(facturasRuiz, HORA))[0], E1.facturas.replace("Kiosco de Marta", "Taller Ruiz SRL"), o);
      const afuera = new Charla(espia([...ORDENES[o]]));
      await afuera.paso(txt("hola"));
      const s = await afuera.paso(facturasRuiz, 30 * HORA);
      assert.deepEqual(
        s.respuestas,
        [{ tipo: "plantilla", nombre: "comprobantes_emitidos", parametros: ["38", "septiembre", "Taller Ruiz SRL", "$3.912.400,00"] }],
        o,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 16) Elegir por nombre: repetidos, vacíos y nombres que son comandos
// ---------------------------------------------------------------------------

describe("elegir por nombre sin adivinar", () => {
  test("dos negocios que se llaman igual al normalizar → no elige ninguno: pregunta por número, y el número elige", async () => {
    const A = { ...NORTE, clienteTenantId: "t-a", alias: "Almacén Sur" };
    const B = { ...NORTE, clienteTenantId: "t-b", alias: "Almacen Sur" };
    const ch = new Charla(espia([A, B]));
    await ch.paso(doc());
    const s = await ch.paso(txt("almacen sur"));
    assert.deepEqual(s.efectos, [], "no lee nada para ninguno de los dos");
    assert.equal(
      botones(s).texto,
      "Hay más de un negocio con ese nombre. ¿De cuál es extracto-sep.pdf? Respondé con el número: 1 Almacén Sur · 2 Almacen Sur",
    );
    assert.equal(ch.estado, "eligiendo_cliente");
    const r = await ch.paso(txt("2"));
    assert.deepEqual(r.efectos, [{ tipo: "leer_archivo", clienteTenantId: "t-b", archivo: ARCHIVO_A }]);
  });

  test("tres 'Kiosco' + 'Kiosco' → vuelve a preguntar con los mismos botones, y el botón elige", async () => {
    const clientes = [1, 2, 3].map((i) => ({ ...NORTE, clienteTenantId: `t-${i}`, alias: "Kiosco" }));
    const ch = new Charla(espia(clientes));
    const s0 = await ch.paso(doc());
    const s = await ch.paso(txt("Kiosco"));
    assert.deepEqual(s.efectos, []);
    assert.ok(botones(s).texto.startsWith("Hay más de un negocio con ese nombre."), botones(s).texto);
    assert.deepEqual(
      botones(s).botones.map((x) => x.id),
      botones(s0).botones.map((x) => x.id),
      "misma lista, misma secuencia: los botones de antes siguen valiendo",
    );
    const r = await ch.paso(boton(botones(s0).botones[2].id, "3 Kiosco"));
    assert.deepEqual(r.efectos, [{ tipo: "leer_archivo", clienteTenantId: "t-3", archivo: ARCHIVO_A }]);
  });

  test("dos negocios llamados 'Estudio' + 'estudio' → pregunta por número; no pasa a una persona ni suelta el archivo", async () => {
    const ch = new Charla(espia([{ ...MARTA, alias: "Estudio" }, { ...RUIZ, alias: "estudio" }]));
    await ch.paso(doc());
    const s = await ch.paso(txt("estudio"));
    assert.deepEqual(s.efectos, []);
    assert.ok(botones(s).texto.startsWith("Hay más de un negocio con ese nombre."));
    assert.equal(ch.estado, "eligiendo_cliente");
  });

  test("un texto que queda vacío al normalizarlo ('?', '...', '*') no elige al negocio de nombre vacío", async () => {
    const ch = new Charla(espia([{ ...NORTE, clienteTenantId: "t-vacio", alias: "" }, MARTA]));
    await ch.paso(doc());
    for (const t of ["?", "...", "*", "¡!"]) {
      const s = await ch.paso(txt(t));
      assert.deepEqual(s.efectos, [], t);
      assert.ok(botones(s).texto.startsWith("No te entendí."), t);
      assert.equal(ch.estado, "eligiendo_cliente", t);
    }
  });
});

// ---------------------------------------------------------------------------
// 17) Pedir una persona en medio de un trámite: nada se pierde
// ---------------------------------------------------------------------------

describe("pedir una persona en medio de un trámite", () => {
  test("eligiendo_cliente + 'estudio' → el archivo sin negocio NO se descarta: va con el aviso para la persona", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    const s0 = await ch.paso(doc());
    const s = await ch.paso(txt("estudio"));
    assert.deepEqual(textos(s), [E1.persona]);
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "pide_persona", clienteTenantId: null, ref: "wamid.A" }]);
    assert.equal(ch.estado, "con_persona");
    // Lo decide la persona: después de liberar, el botón viejo no lee el archivo para nadie.
    await ch.paso({ tipo: "liberar" }, HORA);
    const viejo = await ch.paso(boton(botones(s0).botones[1].id, "2 Taller Ruiz SRL"));
    assert.ok(!tipos(viejo).includes("leer_archivo"));
  });

  test("leyendo + 'estudio' → la lectura que termina después queda para el estudio, sin escribirle", async () => {
    const ch = new Charla(espia([MARTA, RUIZ]));
    await ch.paso(doc());
    await ch.paso(txt("2"));
    const s = await ch.paso(txt("estudio"));
    assert.deepEqual(s.efectos, [{ tipo: "aviso_bandeja", motivo: "pide_persona", clienteTenantId: "t-ruiz", ref: null }]);
    const l = await ch.paso({ tipo: "lectura", ref: "wamid.A", clienteTenantId: "t-ruiz", resultado: LEIDO_OK });
    assert.deepEqual(l.respuestas, []);
    assert.deepEqual(l.efectos, [{ tipo: "aviso_bandeja", motivo: "sin_confirmar", clienteTenantId: "t-ruiz", ref: "wamid.A" }]);
  });
});

// ---------------------------------------------------------------------------
// 18) Ventana de 24 h contada desde que el remitente MANDÓ el mensaje (timestamp de Meta)
// ---------------------------------------------------------------------------

describe("ventana con el timestamp de Meta", () => {
  const CARGA_MARTA: EventoBot = {
    tipo: "carga",
    ref: "wamid.A",
    clienteTenantId: "t-marta",
    nombreArchivo: "sep.pdf",
    resultado: { ok: true, paraFacturar: 30, necesitanDato: 8 },
  };
  const FACTURAS_MARTA: EventoBot = {
    tipo: "facturas_emitidas",
    clienteTenantId: "t-marta",
    cantidad: 1,
    mes: "2026-09",
    total: 1234.5,
    comprobantes: [{ ref: "p1", nombreArchivo: "p1.pdf" }],
  };
  const PLANTILLA_MARTA: Respuesta = {
    tipo: "plantilla",
    nombre: "comprobantes_emitidos",
    parametros: ["1", "septiembre", "Kiosco de Marta", "$1.234,50"],
  };
  const hace = (ms: number) => new Date(AHORA.getTime() - ms);

  async function mensajeMandadoHace(ms: number): Promise<Charla> {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(mandadoEn(txt("hola"), hace(ms)));
    return ch;
  }

  test("un mensaje mandado hace 23 h y procesado ahora deja 1 h de ventana, no 24", async () => {
    const ch = await mensajeMandadoHace(23 * HORA);
    assert.equal(ch.conv?.contexto.ultimoEntranteEn, hace(23 * HORA).toISOString());
    assert.deepEqual(textos(await ch.paso(CARGA_MARTA, HORA - 1)), [E1.cargado], "1 ms antes del cierre, se cuenta");
    const tarde = await mensajeMandadoHace(23 * HORA);
    assert.deepEqual((await tarde.paso(CARGA_MARTA, HORA)).respuestas, [], "a las 24 h del envío, silencio");
  });

  test("facturas a la hora 24 del envío (procesado 23 h tarde): plantilla y PDF pendientes, no texto libre que Meta rechace", async () => {
    const ch = await mensajeMandadoHace(23 * HORA);
    const s = await ch.paso(FACTURAS_MARTA, HORA);
    assert.deepEqual(s.respuestas, [PLANTILLA_MARTA]);
    assert.deepEqual(s.efectos, [{ tipo: "comprobantes_sin_enviar", clienteTenantId: "t-marta", refs: ["p1"] }]);
  });

  test("un timestamp en el futuro no estira la ventana: cuenta como la hora de proceso", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(mandadoEn(txt("hola"), new Date(AHORA.getTime() + 5 * HORA)));
    assert.equal(ch.conv?.contexto.ultimoEntranteEn, AHORA.toISOString());
    assert.deepEqual((await ch.paso(CARGA_MARTA, 24 * HORA)).respuestas, []);
  });

  test("un timestamp ilegible o ausente no abre la ventana (fail-closed), pero el mensaje se contesta", async () => {
    const ch = new Charla(espia([MARTA]));
    const s = await ch.paso(mandadoEn(txt("hola"), new Date(Number.NaN)));
    assert.deepEqual(textos(s), [E1.saludoMarta], "la respuesta al mensaje sale igual");
    assert.equal(ch.conv?.contexto.ultimoEntranteEn, null);
    assert.deepEqual((await ch.paso(CARGA_MARTA, 60_000)).respuestas, []);

    const sinFecha = await procesarEventoBot(
      congelar({
        ahora: AHORA,
        estudio: ESTUDIO,
        conversacion: null,
        evento: { tipo: "mensaje", mensaje: { tipo: "texto", texto: "hola" } } as unknown as EventoBot,
      }),
      espia([MARTA]).puertos,
    );
    assert.equal(sinFecha.conversacion.contexto.ultimoEntranteEn, null);
  });

  test("un mensaje viejo procesado después de uno nuevo no achica la ventana", async () => {
    const ch = new Charla(espia([MARTA]));
    await ch.paso(txt("hola")); // mandado AHORA
    await ch.paso(mandadoEn(txt("esto lo mandé antes"), hace(2 * HORA)), 60_000);
    assert.equal(ch.conv?.contexto.ultimoEntranteEn, AHORA.toISOString());
    assert.deepEqual(textos(await ch.paso(CARGA_MARTA, 24 * HORA - 1 - 60_000)), [E1.cargado]);
  });
});

// ---------------------------------------------------------------------------
// 19) Privacidad en el primer contacto, lo inicie quien lo inicie
// ---------------------------------------------------------------------------

describe("privacidad en el primer contacto", () => {
  const SIN_AVISO: ClienteDelRemitente = { ...MARTA, avisoPrivacidadDado: false };
  const FACTURAS_MARTA: EventoBot = {
    tipo: "facturas_emitidas",
    clienteTenantId: "t-marta",
    cantidad: 38,
    mes: "2026-09",
    total: 3912400,
    comprobantes: [{ ref: "p1", nombreArchivo: "p1.pdf" }],
  };
  /** Conversación en inicio con la ventana abierta (el remitente escribió hace 1 h). */
  const conVentana = () =>
    conversacionDesdeFila({
      estado: "inicio",
      contexto: { ultimoEntranteEn: new Date(AHORA.getTime() - HORA).toISOString(), secuencia: 0 },
    });
  const correr = (conversacion: Conversacion | null, evento: EventoBot, clientes: ClienteDelRemitente[]) =>
    procesarEventoBot(congelar({ ahora: AHORA, estudio: ESTUDIO, conversacion, evento }), espia(clientes).puertos);

  test("un aviso del sistema dentro de la ventana, sin el aviso dado → el aviso de privacidad va adelante", async () => {
    const carga = await correr(
      conVentana(),
      { tipo: "carga", ref: "wamid.A", clienteTenantId: "t-marta", nombreArchivo: "a.pdf", resultado: { ok: true, paraFacturar: 30, necesitanDato: 8 } },
      [SIN_AVISO],
    );
    assert.deepEqual(textos(carga), [E1.privacidad, E1.cargado]);
    assert.deepEqual(tipos(carga), ["aviso_privacidad_dado"]);
    const facturas = await correr(conVentana(), FACTURAS_MARTA, [SIN_AVISO]);
    assert.deepEqual(textos(facturas), [E1.privacidad, E1.facturas, "[documento]"]);
  });

  test("facturas fuera de la ventana a un número sin el aviso dado → no sale la plantilla; quedan sin enviar", async () => {
    const s = await correr(null, FACTURAS_MARTA, [SIN_AVISO]);
    assert.deepEqual(s.respuestas, []);
    assert.deepEqual(s.efectos, [{ tipo: "comprobantes_sin_enviar", clienteTenantId: "t-marta", refs: ["p1"] }]);
    // Control: con el aviso dado, el mismo evento sí manda la plantilla.
    const control = await correr(null, FACTURAS_MARTA, [MARTA]);
    assert.equal(control.respuestas[0]?.tipo, "plantilla");
  });

  test("ningún archivo se lee sin el aviso: el primer documento de un número sin aviso lo trae en la misma salida", async () => {
    const ch = new Charla(espia([SIN_AVISO]));
    const s = await ch.paso(doc());
    assert.deepEqual(textos(s), [E1.privacidad, E1.recibido]);
    assert.deepEqual(tipos(s), ["leer_archivo", "aviso_privacidad_dado"]);
  });

  test("decisión provisional: 'baja' como primer mensaje sólo confirma la baja (sin el aviso de archivos)", async () => {
    const ch = new Charla(espia([SIN_AVISO]));
    const s = await ch.paso(txt("baja"));
    assert.deepEqual(textos(s), [E1.baja]);
    assert.ok(!tipos(s).includes("aviso_privacidad_dado"));
  });
});
