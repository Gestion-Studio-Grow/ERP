// Tests del registro de conectores: la forma (validarRegistro, construirRegistro) y el
// comportamiento del simulador (verificarSimulador) EJECUTADO sobre cada conector registrado.
// node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DESCRIPTORES_CATALOGO } from "@/modules/catalog";
import type { ModuleKind } from "@/modules/contract";
import { createHmac } from "node:crypto";
import {
  agruparPorCuenta,
  encabezado,
  normalizarFailClosed,
  verificarFirmaFailClosed,
  type ConectorDescriptor,
  type EntradaCruda,
  type EventoCanonico,
} from "./contrato";
import {
  avisoDeManifiesto,
  conectorFalso,
  conectorManifiestoFalso,
  desafioFalso,
  entradaFirmada,
  firmaFalsa,
} from "./conector-falso";
import {
  CONECTORES,
  RegistroInvalidoError,
  construirRegistro,
  registro,
  validarRegistro,
  verificarSimulador,
} from "./registro";

const errores = (xs: readonly unknown[], cat?: ReadonlyMap<string, ModuleKind>) =>
  validarRegistro(xs, { modulosDelCatalogo: cat }).filter((p) => p.severidad === "error");

const catalogoReal = new Map<string, ModuleKind>(DESCRIPTORES_CATALOGO.map((d) => [d.id, d.kind]));

// ── Los conectores REALES del producto ───────────────────────────────────────

test("cada conector registrado tiene módulo plugin en el catálogo y forma válida", () => {
  assert.deepEqual(errores(CONECTORES, catalogoReal), []);
  assert.doesNotThrow(() => construirRegistro(CONECTORES, { modulosDelCatalogo: catalogoReal }));
});

test("el simulador de cada conector registrado firma igual que su entrada y rechaza lo ajeno", () => {
  for (const c of CONECTORES) {
    assert.deepEqual(verificarSimulador(c), [], `conector ${c.id}`);
  }
});

test("registro() del producto se construye (fail-closed si algo está mal)", () => {
  assert.deepEqual(registro().ids(), CONECTORES.map((c) => c.id));
});

// ── El registro RECHAZA un conector sin simulador ────────────────────────────

test("un conector sin simulador no entra: validarRegistro lo marca y construirRegistro no arranca", () => {
  const { simulador: _sin, ...sinSimulador } = conectorFalso();
  void _sin;
  const problemas = errores([sinSimulador]);
  assert.ok(problemas.some((p) => p.moduloId === "prueba" && /simulador/.test(p.mensaje)), JSON.stringify(problemas));
  assert.throws(
    () => construirRegistro([sinSimulador as unknown as ConectorDescriptor]),
    (e: unknown) => e instanceof RegistroInvalidoError && /simulador/.test(e.message),
  );
  // Un "simulador" que no es función tampoco.
  const conObjeto = { ...conectorFalso(), simulador: { escenarios: [] } } as unknown as ConectorDescriptor;
  assert.throws(() => construirRegistro([conObjeto]), RegistroInvalidoError);
  // Y el que sí lo tiene, entra.
  assert.doesNotThrow(() => construirRegistro([conectorFalso()]));
});

test("el registro rechaza ids repetidos y conectores sin módulo plugin en el catálogo", () => {
  assert.ok(errores([conectorFalso(), conectorFalso()]).some((p) => /repetido/.test(p.mensaje)));
  assert.ok(errores([conectorFalso()], new Map()).some((p) => /catálogo/.test(p.mensaje)));
  assert.ok(errores([conectorFalso()], new Map([["prueba", "capability"]])).some((p) => /plugin/.test(p.mensaje)));
  assert.deepEqual(errores([conectorFalso()], new Map([["prueba", "plugin"]])), []);
});

test("obtener por id no cae en propiedades del prototipo", () => {
  const r = construirRegistro([conectorFalso()]);
  assert.equal(r.obtener("prueba")?.id, "prueba");
  for (const raro of ["__proto__", "constructor", "toString", "hasOwnProperty", ""]) {
    assert.equal(r.obtener(raro), null, raro);
  }
});

// ── verificarSimulador ejecuta la decisión ───────────────────────────────────

test("el conector de prueba y su simulador están de acuerdo", () => {
  assert.deepEqual(verificarSimulador(conectorFalso()), []);
});

test("un verificador que acepta todo no pasa (secreto ajeno y cuerpo alterado)", () => {
  const c = conectorFalso();
  const aceptaTodo: ConectorDescriptor = { ...c, entrada: { ...c.entrada!, verificarFirma: () => ({ ok: true }) } };
  const p = verificarSimulador(aceptaTodo);
  assert.ok(p.some((x) => /otro secreto/.test(x)), p.join("\n"));
  assert.ok(p.some((x) => /cuerpo alterado/.test(x)), p.join("\n"));
});

test("un simulador que firma con otro algoritmo no pasa", () => {
  const c = conectorFalso();
  const sim = c.simulador();
  const firmaMala = (secreto: string): EntradaCruda => {
    const req = sim.escenarios[0].armar(secreto, new Date());
    return { ...req, encabezados: { "x-firma": firmaFalsa(`${secreto}-otro`, req.cuerpo) } };
  };
  const mal: ConectorDescriptor = {
    ...c,
    simulador: () => ({ ...sim, escenarios: [{ ...sim.escenarios[0], armar: firmaMala }] }),
  };
  assert.ok(verificarSimulador(mal).some((x) => /propio simulador/.test(x)));
});

test("sin escenarios, sin fuente, o con salida sin transporte falso: no pasa", () => {
  const c = conectorFalso();
  assert.ok(
    verificarSimulador({ ...c, simulador: () => ({ fuente: "x", escenarios: [] }) }).some((x) => /ningún escenario/.test(x)),
  );
  assert.ok(verificarSimulador({ ...c, simulador: () => ({ ...c.simulador(), fuente: "" }) }).some((x) => /fuente/.test(x)));
  const conSalida: ConectorDescriptor = { ...c, salida: { acciones: [{ id: "enviar-mensaje", descripcion: "Manda." }] } };
  assert.ok(verificarSimulador(conSalida).some((x) => /transporte/.test(x)));
  const conTransporte: ConectorDescriptor = {
    ...conSalida,
    simulador: () => ({
      ...c.simulador(),
      transporte: async () => ({ estado: 200, encabezados: {}, cuerpo: new Uint8Array() }),
    }),
  };
  assert.deepEqual(verificarSimulador(conTransporte), []);
  assert.ok(
    verificarSimulador({
      ...c,
      simulador: () => {
        throw new Error("roto");
      },
    }).some((x) => /lanzó/.test(x)),
  );
});

test("la normalización tiene que dar lo esperado, con la cuenta correcta y claves únicas", () => {
  const c = conectorFalso();
  const sim = c.simulador();
  const esc = sim.escenarios[0];

  const otraCuenta: ConectorDescriptor = {
    ...c,
    simulador: () => ({ ...sim, escenarios: [{ ...esc, esperado: { ...esc.esperado, cuentaExterna: "cuenta-2" } }] }),
  };
  assert.ok(verificarSimulador(otraCuenta).some((x) => /cuenta/.test(x)));

  const otrosTipos: ConectorDescriptor = {
    ...c,
    simulador: () => ({ ...sim, escenarios: [{ ...esc, esperado: { ...esc.esperado, tipos: ["pedido.creado"] } }] }),
  };
  assert.ok(verificarSimulador(otrosTipos).some((x) => /se esperaban/.test(x)));

  const claveRepetida: ConectorDescriptor = {
    ...c,
    simulador: () => ({
      ...sim,
      escenarios: [
        {
          ...esc,
          armar: (s) =>
            entradaFirmada(
              { cuenta: "cuenta-1", mensajes: [{ id: "m1", de: "1", texto: "a" }, { id: "m1", de: "1", texto: "b" }] },
              s,
            ),
        },
      ],
    }),
  };
  assert.ok(verificarSimulador(claveRepetida).some((x) => /misma clave/.test(x)));

  const sinCuenta: ConectorDescriptor = {
    ...c,
    entrada: { ...c.entrada!, normalizar: (p, r) => c.entrada!.normalizar(p, r).map((e) => ({ ...e, cuentaExterna: null })) },
  };
  assert.ok(verificarSimulador(sinCuenta).some((x) => /sin cuenta externa/.test(x)));

  const eventoInvalido: ConectorDescriptor = {
    ...c,
    entrada: { ...c.entrada!, normalizar: (p, r) => c.entrada!.normalizar(p, r).map((e) => ({ ...e, idExterno: "" })) },
  };
  assert.ok(verificarSimulador(eventoInvalido).some((x) => /idExterno/.test(x)));
});

// ── Firma que no cubre el cuerpo (estilo Mercado Pago: firma un manifiesto, no el cuerpo) ─────

const AHORA = new Date("2026-09-24T12:00:00Z");
const SECRETO_APP = "secreto-de-la-app-en-el-proveedor";
const enc = new TextEncoder();

/**
 * La reproducción del refutador: firma "id;ts" (la cuenta NO va firmada) y un `normalizar` que
 * saca la cuenta y el id del CUERPO. Declara bien lo que firma, así que su forma es válida.
 */
function conectorQueCreeEnElCuerpo(): ConectorDescriptor {
  const firma = (s: string, id: string, ts: string) => createHmac("sha256", s).update(`id:${id};ts:${ts};`).digest("hex");
  const base = conectorFalso();
  const armar = (secreto: string, ahora: Date): EntradaCruda => {
    const ts = String(Math.floor(ahora.getTime() / 1000));
    return {
      metodo: "POST",
      encabezados: { "x-id": "m1", "x-ts": ts, "x-firma": firma(secreto, "m1", ts) },
      consulta: {},
      cuerpo: enc.encode(JSON.stringify({ cuenta: "cuenta-1", mensajes: [{ id: "m1", de: "1", texto: "a" }] })),
    };
  };
  return {
    ...base,
    entrada: {
      ...base.entrada!,
      firmaCubreCuerpo: false,
      encabezadosFirmados: ["x-id", "x-ts", "x-firma"],
      verificarFirma(req, s) {
        const id = encabezado(req, "x-id") ?? "";
        const ts = encabezado(req, "x-ts") ?? "";
        return encabezado(req, "x-firma") === firma(s, id, ts) ? { ok: true } : { ok: false, motivo: "firma_invalida" };
      },
      // Hereda el normalizar de conectorFalso: lee p.cuenta y m.id del cuerpo.
    },
    simulador: () => ({
      fuente: "fixture de prueba",
      escenarios: [
        {
          id: "e",
          descripcion: "manifiesto sin la cuenta",
          armar,
          esperado: { tipos: ["mensaje.recibido"], cuentaExterna: "cuenta-1" },
          alteraciones: (r) => [{ ...r, encabezados: { ...r.encabezados, "x-id": "m2" } }],
        },
      ],
      desafio: base.simulador().desafio,
    }),
  };
}

test("firma de manifiesto con cuenta, id e instante firmados en encabezados: entra", () => {
  const c = conectorManifiestoFalso();
  assert.deepEqual(errores([c]), []);
  assert.deepEqual(verificarSimulador(c, AHORA), []);
  assert.doesNotThrow(() => construirRegistro([c]));
});

test("REFUTADOR: un conector que saca cuenta e id del cuerpo sin firma NO entra al registro", () => {
  const c = conectorQueCreeEnElCuerpo();
  // La forma es válida (declara lo que firma)…
  assert.deepEqual(errores([c]), []);
  // …pero al ejecutarlo, normalizar no recibe el cuerpo: no puede sacar de ahí ni la cuenta ni la clave.
  const p = verificarSimulador(c, AHORA);
  assert.ok(p.some((x) => /normalizar lanzó/.test(x)), p.join("\n"));
});

test("REFUTADOR: firma capturada + cuerpo de otra cuenta → ni otro negocio ni otra clave de deduplicación", () => {
  // El ataque exacto: la request legítima firmada, con el cuerpo cambiado a la cuenta víctima.
  const forjar = (req: EntradaCruda): EntradaCruda => ({
    ...req,
    cuerpo: enc.encode(JSON.stringify({ cuenta: "cuenta-VICTIMA", mensajes: [{ id: "m1-bis", de: "1", texto: "forjado" }], data: { id: "m1-bis" } })),
  });

  // (a) El conector que creía en el cuerpo: la firma pasa, pero el pipeline no produce nada.
  const ingenuo = conectorQueCreeEnElCuerpo();
  const legitIngenuo = ingenuo.simulador().escenarios[0].armar(SECRETO_APP, AHORA);
  const forjadaIngenuo = forjar(legitIngenuo);
  assert.deepEqual(verificarFirmaFailClosed(ingenuo, forjadaIngenuo, SECRETO_APP, AHORA), { ok: true });
  const r1 = normalizarFailClosed(ingenuo, forjadaIngenuo);
  assert.equal(r1.ok, false, "sin cuerpo firmado no hay de dónde sacar la cuenta");

  // (b) El conector bien hecho: la forjada produce EXACTAMENTE los mismos eventos que la legítima.
  const bien = conectorManifiestoFalso();
  const legit = avisoDeManifiesto(SECRETO_APP, AHORA);
  const forjada: EntradaCruda = {
    ...forjar(legit),
    encabezados: { ...legit.encabezados, "x-request-id": "otra", "x-cuenta-real": "cuenta-VICTIMA" },
    consulta: { type: "merchant_order", user_id: "cuenta-VICTIMA" },
  };
  assert.deepEqual(verificarFirmaFailClosed(bien, forjada, SECRETO_APP, AHORA), { ok: true });
  const a = normalizarFailClosed(bien, legit);
  const b = normalizarFailClosed(bien, forjada);
  assert.ok(a.ok && b.ok);
  assert.deepEqual(b, a);
  const ruteo = agruparPorCuenta((b as { eventos: EventoCanonico[] }).eventos);
  assert.deepEqual([...ruteo.porCuenta.entries()].map(([k, v]) => [k, v.map((e) => e.idExterno)]), [["cuenta-1", ["pago:pago-1"]]]);

  // (c) Y cambiar la cuenta firmada sin volver a firmar no pasa la firma.
  const otraCuenta = { ...legit, encabezados: { ...legit.encabezados, "x-cuenta": "cuenta-VICTIMA" } };
  assert.equal(verificarFirmaFailClosed(bien, otraCuenta, SECRETO_APP, AHORA).ok, false);
});

test("declarar firmado un encabezado que la firma no cubre no entra", () => {
  const c = conectorManifiestoFalso();
  const mentiroso: ConectorDescriptor = {
    ...c,
    entrada: { ...c.entrada!, encabezadosFirmados: [...c.entrada!.encabezadosFirmados!, "x-request-id"] },
  };
  const p = verificarSimulador(mentiroso, AHORA);
  assert.ok(p.some((x) => /declara firmado el encabezado "x-request-id"/.test(x)), p.join("\n"));
  // Y uno declarado que ningún escenario trae tampoco se acepta a ciegas.
  const fantasma: ConectorDescriptor = { ...c, entrada: { ...c.entrada!, consultaFirmada: ["data.id"] } };
  assert.ok(verificarSimulador(fantasma, AHORA).some((x) => /ningún escenario lo trae/.test(x)));
});

test("un verificador que no mira un encabezado declarado firmado no pasa", () => {
  // Declara x-cuenta firmado, pero su verificador la pisa con la del escenario: acepta con
  // cualquier x-cuenta o sin ella. Si pasara, x-cuenta (qué negocio) llegaría a normalizar sin firma.
  const c = conectorManifiestoFalso();
  const flojo: ConectorDescriptor = {
    ...c,
    entrada: {
      ...c.entrada!,
      verificarFirma(req, s, ahora) {
        const conCuenta = { ...req, encabezados: { ...req.encabezados, "x-cuenta": "cuenta-1" } };
        return c.entrada!.verificarFirma(conCuenta, s, ahora);
      },
    },
  };
  const p = verificarSimulador(flojo, AHORA);
  assert.ok(p.some((x) => /declara firmado el encabezado "x-cuenta" y la firma pasa/.test(x)), p.join("\n"));
});

test("anti-replay: con firmaIncluyeInstante, una firma de hace 6 minutos o con 6 de adelanto se rechaza", () => {
  const c = conectorManifiestoFalso();
  const sinVentana: ConectorDescriptor = {
    ...c,
    entrada: {
      ...c.entrada!,
      // Verifica la firma y se olvida de la ventana.
      verificarFirma: (req, s) => c.entrada!.verificarFirma(req, s, new Date(Number(encabezado(req, "x-ts")) * 1000)),
    },
  };
  const p = verificarSimulador(sinVentana, AHORA);
  assert.ok(p.some((x) => /hace más de 5 minutos \(replay\)/.test(x)), p.join("\n"));
  assert.ok(p.some((x) => /adelanto \(replay\)/.test(x)), p.join("\n"));
});

test("firma de manifiesto sin declararla: el cuerpo alterado se acepta y no entra", () => {
  const c = conectorManifiestoFalso();
  const { firmaCubreCuerpo: _f, ...resto } = c.entrada!;
  void _f;
  const p = verificarSimulador({ ...c, entrada: resto }, AHORA);
  assert.ok(p.some((x) => /cuerpo alterado/.test(x)), p.join("\n"));
});

test("firma de manifiesto sin alteraciones, o con una alteración que no toca lo firmado: no entra", () => {
  const c = conectorManifiestoFalso();
  const esc = c.simulador().escenarios[0];
  const con = (alteraciones: typeof esc.alteraciones): ConectorDescriptor => ({
    ...c,
    simulador: () => ({ ...c.simulador(), escenarios: [{ ...esc, alteraciones }] }),
  });
  const sin = verificarSimulador(con(undefined), AHORA);
  assert.ok(sin.some((x) => /no trae alteraciones/.test(x)), sin.join("\n"));
  const floja = verificarSimulador(con((req) => [{ ...req, cuerpo: enc.encode("{}") }]), AHORA);
  assert.ok(floja.some((x) => /acepta la alteración 1/.test(x)), floja.join("\n"));
});

test("forma: firmaCubreCuerpo sin nada firmado declarado, nombres inválidos y tipos raros son error", () => {
  const c = conectorManifiestoFalso();
  const e = c.entrada!;
  assert.ok(errores([{ ...c, entrada: { ...e, encabezadosFirmados: [], consultaFirmada: [] } }]).some((p) => /no se declara ningún/.test(p.mensaje)));
  assert.ok(errores([{ ...c, entrada: { ...e, encabezadosFirmados: ["X-Id"] } }]).some((p) => /encabezadosFirmados/.test(p.mensaje)));
  assert.ok(errores([{ ...c, entrada: { ...e, encabezadosFirmados: ["x-id", "x-id"] } }]).some((p) => /repetido/.test(p.mensaje)));
  assert.ok(errores([{ ...c, entrada: { ...e, consultaFirmada: ["__proto__"] } }]).some((p) => /consultaFirmada/.test(p.mensaje)));
  assert.ok(errores([{ ...c, entrada: { ...e, consultaFirmada: "data.id" } }]).some((p) => /lista/.test(p.mensaje)));
  assert.ok(errores([{ ...c, entrada: { ...e, firmaIncluyeInstante: "si" } }]).some((p) => /firmaIncluyeInstante/.test(p.mensaje)));
  const base = conectorFalso();
  assert.ok(errores([{ ...base, entrada: { ...base.entrada!, firmaCubreCuerpo: "no" } }]).some((p) => /firmaCubreCuerpo/.test(p.mensaje)));
});

test("armar() con encabezados en mayúsculas no pasa: la entrada los recibe en minúsculas", () => {
  const c = conectorFalso();
  const esc = c.simulador().escenarios[0];
  const mayus: ConectorDescriptor = {
    ...c,
    simulador: () => ({
      ...c.simulador(),
      escenarios: [{ ...esc, armar: (s, a) => { const r = esc.armar(s, a); return { ...r, encabezados: { "X-Firma": r.encabezados["x-firma"] } }; } }],
    }),
  };
  assert.ok(verificarSimulador(mayus).some((x) => /minúsculas/.test(x)));
});

// ── Desafío (GET de verificación) ────────────────────────────────────────────

test("desafío: un responder que acepta todo, o sin la request del simulador, no pasa", () => {
  const c = conectorFalso();
  const aceptaTodo: ConectorDescriptor = {
    ...c,
    entrada: { ...c.entrada!, desafio: { variable: "PRUEBA_VERIFY_TOKEN", responder: (req) => ({ estado: 200, cuerpo: req.consulta["hub.challenge"] ?? "" }) } },
  };
  const p = verificarSimulador(aceptaTodo);
  assert.ok(p.some((x) => /GET sin token/.test(x)), p.join("\n"));
  assert.ok(p.some((x) => /otro token/.test(x)), p.join("\n"));
  const { desafio: _d, ...simSinDesafio } = c.simulador();
  void _d;
  assert.ok(verificarSimulador({ ...c, simulador: () => simSinDesafio }).some((x) => /no trae desafio\(\)/.test(x)));
});

test("normalizar no determinista (clave al azar) no pasa: la deduplicación necesita la misma clave", () => {
  const c = conectorManifiestoFalso();
  let n = 0;
  const azar: ConectorDescriptor = {
    ...c,
    entrada: { ...c.entrada!, normalizar: (pl, r) => c.entrada!.normalizar(pl, r).map((e) => ({ ...e, idExterno: `${e.idExterno}-${n++}` })) },
  };
  const p = verificarSimulador(azar, AHORA);
  assert.ok(p.some((x) => /no es determinista/.test(x)), p.join("\n"));
});

// ── Lo que encontró el refutador (ronda 2) ───────────────────────────────────

/** El conector de manifiesto con un verificador que CANONICALIZA lo firmado antes del HMAC. */
function conVerificadorQueCanonicaliza(canon: (v: string) => string, normalizarTambien = false): ConectorDescriptor {
  const c = conectorManifiestoFalso();
  const canonizada = (req: EntradaCruda): EntradaCruda => ({
    ...req,
    encabezados: Object.fromEntries(
      Object.entries(req.encabezados).map(([k, v]) => [k, ["x-cuenta", "x-id", "x-ts"].includes(k) ? canon(v) : v]),
    ),
  });
  return {
    ...c,
    entrada: {
      ...c.entrada!,
      verificarFirma: (req, s, ahora) => c.entrada!.verificarFirma(canonizada(req), s, ahora),
      normalizar: normalizarTambien ? (pl, req) => c.entrada!.normalizar(pl, canonizada(req)) : c.entrada!.normalizar,
    },
  };
}

test("REFUTADOR r2: un verificador que hace trim (o ignora mayúsculas) de lo firmado no pasa: cambiaría la clave de deduplicación", () => {
  // La reproducción exacta: con la firma capturada y x-id = " pago-1", la firma pasa y el
  // evento sale con otra clave ("pago: pago-1"): el mismo pago asentado dos veces.
  const trim = conVerificadorQueCanonicaliza((v) => v.trim());
  const legit = avisoDeManifiesto(SECRETO_APP, AHORA);
  const forjada: EntradaCruda = { ...legit, encabezados: { ...legit.encabezados, "x-id": ` ${legit.encabezados["x-id"]}` } };
  assert.deepEqual(verificarFirmaFailClosed(trim, forjada, SECRETO_APP, AHORA), { ok: true });
  const b = normalizarFailClosed(trim, forjada);
  assert.ok(b.ok && b.eventos[0].idExterno !== "pago:pago-1", "sin el control, la clave cambia");
  // verificarSimulador lo marca: ya no entra al test de los conectores registrados.
  const p = verificarSimulador(trim, AHORA);
  assert.ok(p.some((x) => /encabezado "x-(cuenta|id)" con espacio adelante y el evento cambia/.test(x)), p.join("\n"));

  const minusculas = verificarSimulador(conVerificadorQueCanonicaliza((v) => v.toLowerCase()), AHORA);
  assert.ok(minusculas.some((x) => /encabezado "x-cuenta" con las mayúsculas cambiadas y el evento cambia/.test(x)), minusculas.join("\n"));

  // Si normalizar canonicaliza IGUAL que el verificador (Mercado Pago firma data.id en
  // minúsculas), el evento es el mismo y está bien: el control no es más estricto de lo que hace falta.
  assert.deepEqual(verificarSimulador(conVerificadorQueCanonicaliza((v) => v.toLowerCase(), true), AHORA), []);
  assert.deepEqual(verificarSimulador(conVerificadorQueCanonicaliza((v) => v.trim(), true), AHORA), []);
});

test("REFUTADOR r2: una alteración que se rechaza por un motivo trivial no cuenta", () => {
  const c = conectorManifiestoFalso();
  const esc = c.simulador().escenarios[0];
  const con = (alteraciones: typeof esc.alteraciones): ConectorDescriptor => ({
    ...c,
    simulador: () => ({ ...c.simulador(), escenarios: [{ ...esc, alteraciones }] }),
  });
  // Encabezados en mayúsculas: se rechaza antes de llamar al conector; no prueba nada.
  const mayus = verificarSimulador(
    con((req) => [{ ...req, encabezados: Object.fromEntries(Object.entries(req.encabezados).map(([k, v]) => [k.toUpperCase(), v])) }]),
    AHORA,
  );
  assert.ok(mayus.some((x) => /alteración 1 no tiene la forma/.test(x)), mayus.join("\n"));
  assert.ok(mayus.some((x) => /no trae alteraciones/.test(x)), mayus.join("\n"));
  // Sacar la firma: se rechaza por "sin firma", tampoco prueba que la firma cubra algo.
  const sinFirma = verificarSimulador(
    con((req) => {
      const { "x-firma": _f, ...resto } = req.encabezados;
      void _f;
      return [{ ...req, encabezados: resto }];
    }),
    AHORA,
  );
  assert.ok(sinFirma.some((x) => /no trae alteraciones/.test(x)), sinFirma.join("\n"));
  // Una que no es una request.
  assert.ok(verificarSimulador(con(() => [null as unknown as EntradaCruda]), AHORA).some((x) => /no tiene la forma/.test(x)));
  // La del fixture (el instante cambiado con la misma firma) sí cuenta.
  assert.deepEqual(verificarSimulador(c, AHORA), []);
});

test("desafío: el GET del simulador sin el token no pasa, aunque traiga el eco", () => {
  const c = conectorFalso();
  // Acepta si no viene token (y compara sólo si viene): un GET vacío no pasa porque no hay eco,
  // pero el del simulador sin hub.verify_token sí; eso es lo que tiene que agarrar.
  const flojo: ConectorDescriptor = {
    ...c,
    entrada: {
      ...c.entrada!,
      desafio: {
        variable: "PRUEBA_VERIFY_TOKEN",
        responder: (req, esperado) => {
          const recibido = req.consulta["hub.verify_token"];
          if (recibido !== undefined && recibido !== esperado) return null;
          return { estado: 200, cuerpo: req.consulta["hub.challenge"] ?? "" };
        },
      },
    },
  };
  const p = verificarSimulador(flojo);
  assert.ok(p.some((x) => /acepta un GET sin token/.test(x)), p.join("\n"));
  assert.ok(!p.some((x) => /otro token/.test(x)), "con otro token sí rechaza: sólo el control nuevo lo agarra");
  // Un simulador cuyo GET no trae el token no prueba nada.
  const sinToken: ConectorDescriptor = { ...c, simulador: () => ({ ...c.simulador(), desafio: () => desafioFalso("otro-token-fijo") }) };
  assert.ok(verificarSimulador(sinToken).some((x) => /no trae el token/.test(x)));
});
