// Tests del CORE del MONITOREO de cartera (producto Contador) — lógica pura,
// sin DB y sin reloj del sistema (node:test, mismo runner del repo). Cubren:
//  - las señales que hoy fallan EN SILENCIO (perfil fiscal incompleto, cert),
//  - la severidad y el semáforo resultante,
//  - el orden por urgencia (estable) y la cabecera,
//  - que un cliente pausado NO genere ruido.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIAS_AVISO_CERT,
  DIAS_COLA_ESTANCADA,
  DIAS_SILENCIO,
  evaluarCartera,
  evaluarCliente,
  ordenarPorUrgencia,
  perfilFiscalCompleto,
  resumirMonitor,
  type HechosCliente,
} from "./monitor-core";

// ── helpers ──────────────────────────────────────────────────────────────────

const AHORA = "2026-08-25T12:00:00.000Z";

/** Días a partir de AHORA, en ISO (positivo = futuro). */
const enDias = (d: number) =>
  new Date(Date.parse(AHORA) + d * 24 * 60 * 60 * 1000).toISOString();

/** Cliente SANO: ninguna señal. Cada test rompe una sola cosa. */
const sano = (over: Partial<HechosCliente> = {}): HechosCliente => ({
  clienteTenantId: "cli-1",
  alias: "Kiosco de Marta",
  estadoCartera: "activa",
  arcaCuit: "20111111112",
  arcaPuntoVenta: 3,
  arcaHomologacion: false,
  emisionHabilitada: true,
  certVenceAt: enDias(180),
  facturasMes: 10,
  capFacturasMes: 159,
  rechazadasMes: 0,
  outboxTrabados: 0,
  pendientesRevision: 0,
  revisionMasViejaAt: null,
  ultimaActividadAt: enDias(-1),
  ...over,
});

const ids = (h: HechosCliente) => evaluarCliente(h, AHORA).senales.map((s) => s.id);

// ── el piso: un cliente sano no dispara nada ─────────────────────────────────

test("un cliente sano no genera ninguna señal (el tablero calla cuando todo anda)", () => {
  const fila = evaluarCliente(sano(), AHORA);
  assert.deepEqual(fila.senales, []);
  assert.equal(fila.estado, "ok");
  assert.equal(fila.urgencia, 0);
});

// ── la señal #1: lo que hoy falla en silencio ────────────────────────────────

test("sin CUIT cargado: crítico — es exactamente lo que hace fallar la emisión sin avisar", () => {
  const fila = evaluarCliente(sano({ arcaCuit: null }), AHORA);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["perfil_fiscal_incompleto"],
  );
  assert.equal(fila.senales[0].severidad, "critico");
  assert.equal(fila.estado, "critico");
});

test("el placeholder histórico 20000000000 NO cuenta como CUIT válido", () => {
  // Es el valor que devolvía getFiscalProfile para todos los tenants antes del
  // fix 885758b: si lo diéramos por bueno, el monitor pintaría verde justo el
  // caso que emitiría con el CUIT equivocado.
  assert.equal(perfilFiscalCompleto(sano({ arcaCuit: "20000000000" })), false);
  assert.deepEqual(ids(sano({ arcaCuit: "20000000000" })), ["perfil_fiscal_incompleto"]);
});

test("CUIT de largo inválido y punto de venta faltante: los dos rompen el perfil", () => {
  assert.equal(perfilFiscalCompleto(sano({ arcaCuit: "2011111" })), false);
  assert.equal(perfilFiscalCompleto(sano({ arcaPuntoVenta: null })), false);
  assert.equal(perfilFiscalCompleto(sano({ arcaPuntoVenta: 0 })), false);
});

test("el CUIT con guiones se normaliza: no es un error de carga", () => {
  assert.equal(perfilFiscalCompleto(sano({ arcaCuit: "20-11111111-2" })), true);
});

// ── certificado ──────────────────────────────────────────────────────────────

test("certificado vencido: crítico, con los días vencidos en el detalle", () => {
  const fila = evaluarCliente(sano({ certVenceAt: enDias(-3) }), AHORA);
  const cert = fila.senales.find((s) => s.id === "cert_vencido");
  assert.ok(cert, "debe haber señal de certificado vencido");
  assert.equal(cert.severidad, "critico");
  assert.match(cert.detalle, /3 día/);
});

test("certificado por vencer dentro de la ventana de aviso: atención, no crítico", () => {
  const fila = evaluarCliente(sano({ certVenceAt: enDias(DIAS_AVISO_CERT - 1) }), AHORA);
  const cert = fila.senales.find((s) => s.id === "cert_por_vencer");
  assert.ok(cert);
  assert.equal(cert.severidad, "atencion");
  assert.equal(fila.estado, "atencion");
});

test("certificado lejos de vencer: sin señal (la ventana no se adelanta)", () => {
  assert.deepEqual(ids(sano({ certVenceAt: enDias(DIAS_AVISO_CERT + 1) })), []);
});

test("sin credencial cargada: crítico y distinto de 'vencido' (la acción es otra)", () => {
  assert.deepEqual(ids(sano({ certVenceAt: null })), ["sin_credencial"]);
});

// ── ya emitió mal / no llega a emitir ────────────────────────────────────────

test("comprobantes rechazados por ARCA: crítico", () => {
  const fila = evaluarCliente(sano({ rechazadasMes: 2 }), AHORA);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["facturas_rechazadas"],
  );
  assert.equal(fila.estado, "critico");
});

test("outbox trabado: crítico — el comprobante existe pero no llega a ARCA", () => {
  assert.deepEqual(ids(sano({ outboxTrabados: 4 })), ["outbox_trabado"]);
});

// ── tope del monotributo ─────────────────────────────────────────────────────

test("tope alcanzado: crítico (bloquea la emisión), no mera advertencia", () => {
  const fila = evaluarCliente(sano({ facturasMes: 159, capFacturasMes: 159 }), AHORA);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["tope_alcanzado"],
  );
  assert.equal(fila.estado, "critico");
});

test("cerca del tope (80%): atención, y no se duplica con 'tope alcanzado'", () => {
  const fila = evaluarCliente(sano({ facturasMes: 80, capFacturasMes: 100 }), AHORA);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["cerca_del_tope"],
  );
  assert.equal(fila.pctCap, 0.8);
});

test("justo debajo del umbral: sin señal de tope", () => {
  assert.deepEqual(ids(sano({ facturasMes: 79, capFacturasMes: 100 })), []);
});

// ── trabajo humano y silencio ────────────────────────────────────────────────

test("cola de revisión estancada: alerta recién cuando la más vieja pasa el umbral", () => {
  const fresca = sano({ pendientesRevision: 5, revisionMasViejaAt: enDias(-1) });
  assert.deepEqual(ids(fresca), []);

  const vieja = sano({
    pendientesRevision: 5,
    revisionMasViejaAt: enDias(-DIAS_COLA_ESTANCADA),
  });
  assert.deepEqual(ids(vieja), ["cola_estancada"]);
});

test("silencio de ingesta: un cliente activo que hace días no da señales de vida", () => {
  assert.deepEqual(ids(sano({ ultimaActividadAt: enDias(-DIAS_SILENCIO) })), [
    "silencio_de_ingesta",
  ]);
});

test("cliente que nunca tuvo actividad: también entra como silencio, con otro detalle", () => {
  const fila = evaluarCliente(sano({ ultimaActividadAt: null }), AHORA);
  const s = fila.senales.find((x) => x.id === "silencio_de_ingesta");
  assert.ok(s);
  assert.match(s.detalle, /Nunca/);
});

// ── entorno de emisión ───────────────────────────────────────────────────────

test("emisión apagada y homologación se avisan, pero como atención", () => {
  assert.deepEqual(ids(sano({ emisionHabilitada: false })), ["emision_apagada"]);
  assert.deepEqual(ids(sano({ arcaHomologacion: true })), ["emision_apagada"]);
});

test("apagada y en homologación a la vez: una sola señal, no dos", () => {
  // Decir dos veces lo mismo es la forma de que dejen de leerse las alertas.
  assert.deepEqual(ids(sano({ emisionHabilitada: false, arcaHomologacion: true })), [
    "emision_apagada",
  ]);
});

// ── pausados: silencio deliberado ────────────────────────────────────────────

test("un cliente pausado no genera señales aunque esté roto", () => {
  const fila = evaluarCliente(
    sano({ estadoCartera: "pausada", arcaCuit: null, certVenceAt: null, rechazadasMes: 9 }),
    AHORA,
  );
  assert.equal(fila.estado, "pausado");
  assert.deepEqual(fila.senales, []);
  assert.equal(fila.urgencia, 0);
});

// ── orden y agregación ───────────────────────────────────────────────────────

test("el orden pone primero lo crítico y desempata alfabético (lista estable)", () => {
  const { filas } = evaluarCartera(
    [
      sano({ clienteTenantId: "c-ok", alias: "Zapatería Zulu" }),
      sano({ clienteTenantId: "c-at", alias: "Bar Bruno", certVenceAt: enDias(5) }),
      sano({ clienteTenantId: "c-cr", alias: "Almacén Ana", arcaCuit: null }),
    ],
    AHORA,
  );
  assert.deepEqual(
    filas.map((f) => f.clienteTenantId),
    ["c-cr", "c-at", "c-ok"],
  );
});

test("con la misma urgencia, el orden es determinístico entre recargas", () => {
  const a = sano({ clienteTenantId: "c-1", alias: "Bar Bruno", arcaCuit: null });
  const b = sano({ clienteTenantId: "c-2", alias: "Almacén Ana", arcaCuit: null });
  const primera = ordenarPorUrgencia([evaluarCliente(a, AHORA), evaluarCliente(b, AHORA)]);
  const segunda = ordenarPorUrgencia([evaluarCliente(b, AHORA), evaluarCliente(a, AHORA)]);
  assert.deepEqual(
    primera.map((f) => f.clienteTenantId),
    segunda.map((f) => f.clienteTenantId),
  );
});

test("varias señales suman urgencia: el más roto queda arriba", () => {
  const unaSola = evaluarCliente(sano({ arcaCuit: null }), AHORA);
  const varias = evaluarCliente(sano({ arcaCuit: null, rechazadasMes: 3 }), AHORA);
  assert.ok(varias.urgencia > unaSola.urgencia);
});

test("la cabecera cuenta por estado y aparte los que HOY no pueden emitir", () => {
  const { resumen } = evaluarCartera(
    [
      sano({ clienteTenantId: "c-1", alias: "A", arcaCuit: null }), // no puede emitir
      sano({ clienteTenantId: "c-2", alias: "B", certVenceAt: enDias(-1) }), // no puede emitir
      sano({ clienteTenantId: "c-3", alias: "C", outboxTrabados: 2 }), // crítico, pero puede
      sano({ clienteTenantId: "c-4", alias: "D", certVenceAt: enDias(5) }), // atención
      sano({ clienteTenantId: "c-5", alias: "E" }), // ok
      sano({ clienteTenantId: "c-6", alias: "F", estadoCartera: "pausada" }),
    ],
    AHORA,
  );
  assert.deepEqual(resumen, {
    total: 6,
    criticos: 3,
    enAtencion: 1,
    ok: 1,
    pausados: 1,
    sinPoderEmitir: 2,
  });
});

test("cartera vacía: cabecera en cero, sin romper", () => {
  const { filas, resumen } = evaluarCartera([], AHORA);
  assert.deepEqual(filas, []);
  assert.equal(resumen.total, 0);
  assert.equal(resumen.sinPoderEmitir, 0);
});

// ── robustez ─────────────────────────────────────────────────────────────────

test("una fecha corrupta no rompe la evaluación ni inventa una señal", () => {
  const fila = evaluarCliente(sano({ certVenceAt: "no-es-fecha" }), AHORA);
  assert.equal(
    fila.senales.some((s) => s.id === "cert_vencido" || s.id === "cert_por_vencer"),
    false,
  );
});

test("cap en cero no divide por cero ni dispara alerta de tope", () => {
  const fila = evaluarCliente(sano({ capFacturasMes: 0, facturasMes: 500 }), AHORA);
  assert.equal(fila.pctCap, 0);
  assert.equal(
    fila.senales.some((s) => s.id === "tope_alcanzado" || s.id === "cerca_del_tope"),
    false,
  );
});

test("resumirMonitor sobre filas ya evaluadas es consistente con evaluarCartera", () => {
  const hechos = [sano({ clienteTenantId: "c-1", alias: "A", arcaCuit: null }), sano()];
  const directo = resumirMonitor(hechos.map((h) => evaluarCliente(h, AHORA)));
  assert.deepEqual(directo, evaluarCartera(hechos, AHORA).resumen);
});
