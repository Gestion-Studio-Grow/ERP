// Tests del CORE del MONITOREO de cartera (producto Contador) — lógica pura,
// sin DB y sin reloj del sistema (node:test, mismo runner del repo). Cubren:
//  - las señales que hoy fallan EN SILENCIO (perfil fiscal incompleto, cert),
//  - la severidad y el semáforo resultante,
//  - el orden por urgencia (estable) y la cabecera,
//  - que un cliente pausado NO genere ruido,
//  - que lo que es de la PLATAFORMA (emisión apagada, ARCA simulado, clientes en
//    prueba) se diga UNA vez y no en cada fila,
//  - la caja sin cerrar, el cupo del plan (que no es la categoría del monotributo),
//  - la pasada única por cliente (recolectarCliente / recorrerCartera) con un tx falso,
//  - y la FORMA de la puerta: nada que lea con un tenantId ajeno queda publicado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import {
  DIAS_AVISO_CERT,
  DIAS_COLA_ESTANCADA,
  DIAS_SILENCIO,
  avisosDePlataforma,
  emiteConValidezFiscal,
  evaluarCartera,
  evaluarCliente,
  ordenarPorUrgencia,
  peorSenal,
  perfilFiscalCompleto,
  resumirMonitor,
  titularMonitor,
  type ContextoPlataforma,
  type HechosCliente,
} from "./monitor-core";
import {
  decidirPuntoVentaAlta,
  recolectarCliente,
  recorrerCartera,
  validarAltaCliente,
  type FilaCarteraDb,
  type MetaCliente,
  type RecorridoPorts,
} from "./cartera-core";
import { filtrosFacturacionMes } from "./bancos-glue";
import { lastClosedDayTx } from "./caja/frontera-cierre";

// ── helpers ──────────────────────────────────────────────────────────────────

const AHORA = "2026-08-25T12:00:00.000Z"; // 25/08/2026, 09:00 hora argentina

/** Días a partir de AHORA, en ISO (positivo = futuro). */
const enDias = (d: number) =>
  new Date(Date.parse(AHORA) + d * 24 * 60 * 60 * 1000).toISOString();

/** La plataforma "normal": emisión encendida y ARCA en producción. */
const REAL: ContextoPlataforma = { emisionHabilitada: true, modoArca: "real" };

/** Cliente SANO: ninguna señal. Cada test rompe una sola cosa. */
const sano = (over: Partial<HechosCliente> = {}): HechosCliente => ({
  clienteTenantId: "cli-1",
  alias: "Kiosco de Marta",
  estadoCartera: "activa",
  arcaCuit: "20111111112",
  arcaPuntoVenta: 3,
  arcaHomologacion: false,
  credencialCargada: true,
  certVenceAt: enDias(180),
  facturasMes: 10,
  capFacturasMes: 159,
  rechazadasMes: 0,
  outboxTrabados: 0,
  pendientesRevision: 0,
  revisionMasViejaAt: null,
  ultimaActividadAt: enDias(-1),
  caja: null,
  ...over,
});

const ids = (h: HechosCliente, p: ContextoPlataforma = REAL) =>
  evaluarCliente(h, AHORA, p).senales.map((s) => s.id);

/** Todo el texto que ve el contador de una fila. */
const textos = (h: HechosCliente, p: ContextoPlataforma = REAL) =>
  evaluarCliente(h, AHORA, p)
    .senales.map((s) => `${s.titulo} ${s.detalle} ${s.accion}`)
    .join(" | ");

// ── el piso: un cliente sano no dispara nada ─────────────────────────────────

test("un cliente sano no genera ninguna señal (el tablero calla cuando todo anda)", () => {
  const fila = evaluarCliente(sano(), AHORA, REAL);
  assert.deepEqual(fila.senales, []);
  assert.equal(fila.estado, "ok");
  assert.equal(fila.urgencia, 0);
});

// ── la señal #1: lo que hoy falla en silencio ────────────────────────────────

test("sin CUIT cargado: crítico — es exactamente lo que hace fallar la emisión sin avisar", () => {
  const fila = evaluarCliente(sano({ arcaCuit: null }), AHORA, REAL);
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

test("sin punto de venta: la acción es pedírselo a GSG, no un botón a una pantalla donde no se puede", () => {
  const s = evaluarCliente(sano({ arcaPuntoVenta: null }), AHORA, REAL).senales[0];
  assert.equal(s.id, "perfil_fiscal_incompleto");
  assert.match(s.detalle, /punto de venta/);
  assert.match(s.accion, /Gestión Studio Grow/);
  assert.deepEqual(s.resuelve, { quien: "gsg" });
  // No promete un campo que el formulario de alta todavía no tiene (AltaCliente.tsx).
  assert.doesNotMatch(s.accion, /alta/i);
});

// ── certificado ──────────────────────────────────────────────────────────────

test("certificado vencido: crítico, con los días vencidos en el detalle", () => {
  const fila = evaluarCliente(sano({ certVenceAt: enDias(-3) }), AHORA, REAL);
  const cert = fila.senales.find((s) => s.id === "cert_vencido");
  assert.ok(cert, "debe haber señal de certificado vencido");
  assert.equal(cert.severidad, "critico");
  assert.match(cert.detalle, /3 días/);
  assert.deepEqual(cert.resuelve, { quien: "gsg" }); // la carga es de operador
});

test("certificado por vencer dentro de la ventana de aviso: atención, no crítico", () => {
  const fila = evaluarCliente(sano({ certVenceAt: enDias(DIAS_AVISO_CERT - 1) }), AHORA, REAL);
  const cert = fila.senales.find((s) => s.id === "cert_por_vencer");
  assert.ok(cert);
  assert.equal(cert.severidad, "atencion");
  assert.equal(fila.estado, "atencion");
});

test("certificado lejos de vencer: sin señal (la ventana no se adelanta)", () => {
  assert.deepEqual(ids(sano({ certVenceAt: enDias(DIAS_AVISO_CERT + 1) })), []);
});

test("sin credencial cargada: crítico y distinto de 'vencido' (la acción es otra)", () => {
  assert.deepEqual(ids(sano({ credencialCargada: false, certVenceAt: null })), ["sin_credencial"]);
});

test("credencial cargada sin vencimiento legible: no se inventa 'sin certificado'", () => {
  assert.deepEqual(ids(sano({ credencialCargada: true, certVenceAt: null })), []);
});

test("en homologación del CLIENTE, sin credencial sigue siendo crítico (no se baja por homologación)", () => {
  // La credencial se resuelve por cliente también en homologación: sin ella el despacho
  // falla cerrado. Bajarla por `arcaHomologacion` escondería justo el bloqueo real.
  const h = sano({ arcaHomologacion: true, credencialCargada: false, certVenceAt: null });
  assert.deepEqual(ids(h, REAL), ["sin_credencial"]);
  assert.deepEqual(ids(h, { emisionHabilitada: true, modoArca: "homologacion" }), ["sin_credencial"]);
});

test("con ARCA en modo SIMULADO el certificado no se usa: ni sin_credencial ni cert_* por fila", () => {
  const stub: ContextoPlataforma = { emisionHabilitada: true, modoArca: "stub" };
  assert.deepEqual(ids(sano({ credencialCargada: false, certVenceAt: null }), stub), []);
  assert.deepEqual(ids(sano({ certVenceAt: enDias(-3) }), stub), []);
  assert.deepEqual(ids(sano({ certVenceAt: enDias(5) }), stub), []);
  // …pero el perfil fiscal sí: sin CUIT o punto de venta la emisión lanza en cualquier modo.
  assert.deepEqual(ids(sano({ arcaPuntoVenta: null }), stub), ["perfil_fiscal_incompleto"]);
  // Y lo del simulador se dice UNA vez, arriba.
  assert.deepEqual(
    avisosDePlataforma([sano()], stub).map((a) => a.id),
    ["arca_simulado"],
  );
});

// ── ya emitió mal / no llega a emitir ────────────────────────────────────────

test("comprobantes rechazados por ARCA: crítico", () => {
  const fila = evaluarCliente(sano({ rechazadasMes: 2 }), AHORA, REAL);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["facturas_rechazadas"],
  );
  assert.equal(fila.estado, "critico");
  assert.deepEqual(fila.senales[0].resuelve, { quien: "estudio", ruta: "/admin/facturacion" });
});

test("outbox trabado: crítico — el comprobante existe pero no llega a ARCA", () => {
  assert.deepEqual(ids(sano({ outboxTrabados: 4 })), ["outbox_trabado"]);
});

// ── límite del plan (regla comercial, NO la categoría del monotributo) ───────

test("límite del plan alcanzado: crítico, 'cupo_del_plan', y la acción es ampliar el límite", () => {
  const fila = evaluarCliente(sano({ facturasMes: 159, capFacturasMes: 159 }), AHORA, REAL);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["cupo_del_plan"],
  );
  assert.equal(fila.estado, "critico");
  const s = fila.senales[0];
  assert.match(s.detalle, /Llegó al límite de facturas automáticas del plan/);
  assert.match(s.accion, /Ampliar el límite de facturas automáticas del plan/);
  assert.deepEqual(s.resuelve, { quien: "estudio", ruta: "/admin/facturacion/bancos/configuracion" });
});

test("cerca del cupo (80%): atención, y no se duplica con 'cupo alcanzado'", () => {
  const fila = evaluarCliente(sano({ facturasMes: 80, capFacturasMes: 100 }), AHORA, REAL);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["cerca_del_cupo"],
  );
  assert.equal(fila.pctCap, 0.8);
});

test("justo debajo del umbral: sin señal de cupo", () => {
  assert.deepEqual(ids(sano({ facturasMes: 79, capFacturasMes: 100 })), []);
});

test("ninguna señal manda a RECATEGORIZAR: la cantidad de facturas no decide la categoría", () => {
  // La categoría del monotributo depende de los ingresos de 12 meses (y superficie,
  // energía, alquileres) y se revisa por semestre. Decírselo a un contador por 159
  // tickets es la forma de que deje de creerle a la consola.
  const rotoEnTodo = sano({
    arcaPuntoVenta: null,
    credencialCargada: false,
    certVenceAt: null,
    rechazadasMes: 1,
    outboxTrabados: 1,
    facturasMes: 159,
    capFacturasMes: 159,
    pendientesRevision: 3,
    revisionMasViejaAt: enDias(-30),
    ultimaActividadAt: null,
    caja: { pendienteDesde: "2026-08-20" },
  });
  for (const t of [textos(rotoEnTodo), textos(sano({ facturasMes: 130, capFacturasMes: 159 }))]) {
    assert.doesNotMatch(t, /recategoriz/i);
    assert.doesNotMatch(t, /monotributo/i);
  }
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
  const fila = evaluarCliente(sano({ ultimaActividadAt: null }), AHORA, REAL);
  const s = fila.senales.find((x) => x.id === "silencio_de_ingesta");
  assert.ok(s);
  assert.match(s.detalle, /Nunca/);
});

// ── caja sin cerrar (sólo clientes con caja) ─────────────────────────────────

test("caja sin cerrar: 0 días no avisa (hoy todavía no terminó)", () => {
  // AHORA es el 25/08 en hora argentina: lo pendiente desde hoy no es atraso.
  assert.deepEqual(ids(sano({ caja: { pendienteDesde: "2026-08-25" } })), []);
  assert.deepEqual(ids(sano({ caja: { pendienteDesde: null } })), []);
});

test("caja sin cerrar hace 1 día: atención, con el día y el número", () => {
  const fila = evaluarCliente(sano({ caja: { pendienteDesde: "2026-08-24" } }), AHORA, REAL);
  assert.deepEqual(
    fila.senales.map((s) => s.id),
    ["caja_sin_cerrar"],
  );
  const s = fila.senales[0];
  assert.equal(s.severidad, "atencion");
  assert.match(s.detalle, /24\/08\/2026/);
  assert.match(s.detalle, /hace 1 día\./);
  assert.deepEqual(s.resuelve, { quien: "estudio", ruta: "/admin/caja/cierre" });
});

test("caja sin cerrar hace 5 días: el número sale en el detalle", () => {
  const s = evaluarCliente(sano({ caja: { pendienteDesde: "2026-08-20" } }), AHORA, REAL).senales[0];
  assert.equal(s.id, "caja_sin_cerrar");
  assert.match(s.detalle, /hace 5 días/);
});

test("un cliente SIN caja no dispara 'caja sin cerrar' (la cartera nace sin caja)", () => {
  assert.deepEqual(ids(sano({ caja: null })), []);
});

test("el día de la caja se cuenta en hora argentina, no en UTC", () => {
  // 26/08 01:00 UTC = 25/08 22:00 ART: sigue siendo el 25, lo del 24 va 1 día atrasado.
  const s = evaluarCliente(
    sano({ caja: { pendienteDesde: "2026-08-24" } }),
    "2026-08-26T01:00:00.000Z",
    REAL,
  ).senales[0];
  assert.match(s.detalle, /hace 1 día\./);
});

// ── plataforma: una vez arriba, nunca por fila ───────────────────────────────

test("homologación del cliente y emisión apagada NO son señales de fila", () => {
  assert.deepEqual(ids(sano({ arcaHomologacion: true })), []);
  assert.deepEqual(ids(sano(), { emisionHabilitada: false, modoArca: "real" }), []);
});

test("los avisos de plataforma se dicen una vez: apagada + N clientes en prueba (activos)", () => {
  const avisos = avisosDePlataforma(
    [
      sano({ clienteTenantId: "a", arcaHomologacion: true }),
      sano({ clienteTenantId: "b", arcaHomologacion: true }),
      sano({ clienteTenantId: "c", arcaHomologacion: true, estadoCartera: "pausada" }),
      sano({ clienteTenantId: "d" }),
    ],
    { emisionHabilitada: false, modoArca: "real" },
  );
  assert.deepEqual(
    avisos.map((a) => a.id),
    ["emision_apagada", "clientes_en_prueba"],
  );
  assert.match(avisos[1].texto, /^2 clientes están en prueba/);
});

test("con ARCA en homologación para toda la plataforma no se cuenta cliente por cliente", () => {
  const avisos = avisosDePlataforma([sano({ arcaHomologacion: true })], {
    emisionHabilitada: true,
    modoArca: "homologacion",
  });
  assert.deepEqual(
    avisos.map((a) => a.id),
    ["arca_homologacion"],
  );
});

test("titular: con la emisión apagada no dice 'Todos pueden emitir' debajo de un aviso que dice lo contrario", () => {
  const apagada = { emisionHabilitada: false, modoArca: "real" } as const;
  // Todos sanos, pero la plataforma no emite: manda la plataforma.
  const sanos = evaluarCartera([sano({ clienteTenantId: "a" }), sano({ clienteTenantId: "b" })], AHORA, apagada);
  assert.equal(sanos.resumen.sinPoderEmitir, 0);
  const t = titularMonitor(sanos.resumen, sanos.avisos);
  assert.doesNotMatch(t.texto, /Todos pueden emitir/);
  assert.match(t.texto, /apagada/);
  assert.equal(t.tono, "peligro");
  assert.equal(t.nota, null);

  // Apagada y además uno sin punto de venta: la nota dice que ése sigue bloqueado.
  const conBloqueo = evaluarCartera(
    [sano({ clienteTenantId: "a", arcaPuntoVenta: null }), sano({ clienteTenantId: "b" })],
    AHORA,
    apagada,
  );
  assert.match(titularMonitor(conBloqueo.resumen, conBloqueo.avisos).nota ?? "", /^Además, 1 tiene un bloqueo propio/);

  // Encendida: el número de los que no pueden, o "Todos pueden emitir" si no hay ninguno.
  const encendida = evaluarCartera(
    [sano({ clienteTenantId: "a", arcaPuntoVenta: null }), sano({ clienteTenantId: "b", arcaCuit: null })],
    AHORA,
    REAL,
  );
  assert.deepEqual(titularMonitor(encendida.resumen, encendida.avisos), {
    texto: "2 no pueden emitir",
    tono: "peligro",
    nota: null,
  });
  const todoBien = evaluarCartera([sano()], AHORA, REAL);
  assert.deepEqual(titularMonitor(todoBien.resumen, todoBien.avisos), {
    texto: "Todos pueden emitir",
    tono: "neutro",
    nota: null,
  });
});

test("validez fiscal: sólo ARCA real y el cliente fuera de homologación", () => {
  assert.equal(emiteConValidezFiscal(false, "real"), true);
  assert.equal(emiteConValidezFiscal(true, "real"), false);
  assert.equal(emiteConValidezFiscal(false, "homologacion"), false);
  assert.equal(emiteConValidezFiscal(false, "stub"), false);
});

// ── pausados: silencio deliberado ────────────────────────────────────────────

test("un cliente pausado no genera señales aunque esté roto", () => {
  const fila = evaluarCliente(
    sano({
      estadoCartera: "pausada",
      arcaCuit: null,
      credencialCargada: false,
      certVenceAt: null,
      rechazadasMes: 9,
      caja: { pendienteDesde: "2026-08-01" },
    }),
    AHORA,
    REAL,
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
    REAL,
  );
  assert.deepEqual(
    filas.map((f) => f.clienteTenantId),
    ["c-cr", "c-at", "c-ok"],
  );
});

test("con la misma urgencia, el orden es determinístico entre recargas", () => {
  const a = sano({ clienteTenantId: "c-1", alias: "Bar Bruno", arcaCuit: null });
  const b = sano({ clienteTenantId: "c-2", alias: "Almacén Ana", arcaCuit: null });
  const primera = ordenarPorUrgencia([evaluarCliente(a, AHORA, REAL), evaluarCliente(b, AHORA, REAL)]);
  const segunda = ordenarPorUrgencia([evaluarCliente(b, AHORA, REAL), evaluarCliente(a, AHORA, REAL)]);
  assert.deepEqual(
    primera.map((f) => f.clienteTenantId),
    segunda.map((f) => f.clienteTenantId),
  );
});

test("ordenarPorUrgencia es estable aun con el MISMO alias: desempata por id", () => {
  const x = evaluarCliente(sano({ clienteTenantId: "c-b", alias: "Kiosco" }), AHORA, REAL);
  const y = evaluarCliente(sano({ clienteTenantId: "c-a", alias: "Kiosco" }), AHORA, REAL);
  assert.deepEqual(ordenarPorUrgencia([x, y]).map((f) => f.clienteTenantId), ["c-a", "c-b"]);
  assert.deepEqual(ordenarPorUrgencia([y, x]).map((f) => f.clienteTenantId), ["c-a", "c-b"]);
});

test("varias señales suman urgencia: el más roto queda arriba", () => {
  const unaSola = evaluarCliente(sano({ arcaCuit: null }), AHORA, REAL);
  const varias = evaluarCliente(sano({ arcaCuit: null, rechazadasMes: 3 }), AHORA, REAL);
  assert.ok(varias.urgencia > unaSola.urgencia);
});

test("la línea de la bandeja muestra la PEOR señal aunque una de atención vaya antes", () => {
  // cert_por_vencer (atención) se evalúa antes que rechazadas (crítico).
  const fila = evaluarCliente(sano({ certVenceAt: enDias(5), rechazadasMes: 1 }), AHORA, REAL);
  assert.equal(fila.senales[0].id, "cert_por_vencer");
  assert.equal(peorSenal(fila)?.id, "facturas_rechazadas");
  assert.equal(peorSenal(evaluarCliente(sano(), AHORA, REAL)), null);
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
      sano({ clienteTenantId: "c-7", alias: "G", facturasMes: 159 }), // cupo: no puede emitir
    ],
    AHORA,
    REAL,
  );
  assert.deepEqual(resumen, {
    total: 7,
    criticos: 4,
    enAtencion: 1,
    ok: 1,
    pausados: 1,
    sinPoderEmitir: 3,
  });
});

test("cartera vacía: cabecera en cero, sin romper", () => {
  const { filas, resumen, avisos } = evaluarCartera([], AHORA, REAL);
  assert.deepEqual(filas, []);
  assert.equal(resumen.total, 0);
  assert.equal(resumen.sinPoderEmitir, 0);
  assert.deepEqual(avisos, []);
});

// ── robustez ─────────────────────────────────────────────────────────────────

test("una fecha corrupta no rompe la evaluación ni inventa una señal", () => {
  const fila = evaluarCliente(sano({ certVenceAt: "no-es-fecha" }), AHORA, REAL);
  assert.equal(
    fila.senales.some((s) => s.id === "cert_vencido" || s.id === "cert_por_vencer"),
    false,
  );
  assert.deepEqual(ids(sano({ caja: { pendienteDesde: "no-es-dia" } })), []);
});

test("cap en cero no divide por cero ni dispara alerta de cupo", () => {
  const fila = evaluarCliente(sano({ capFacturasMes: 0, facturasMes: 500 }), AHORA, REAL);
  assert.equal(fila.pctCap, 0);
  assert.equal(
    fila.senales.some((s) => s.id === "cupo_del_plan" || s.id === "cerca_del_cupo"),
    false,
  );
});

test("resumirMonitor sobre filas ya evaluadas es consistente con evaluarCartera", () => {
  const hechos = [sano({ clienteTenantId: "c-1", alias: "A", arcaCuit: null }), sano()];
  const directo = resumirMonitor(hechos.map((h) => evaluarCliente(h, AHORA, REAL)));
  assert.deepEqual(directo, evaluarCartera(hechos, AHORA, REAL).resumen);
});

// ── alta con punto de venta: corta el rojo de raíz ───────────────────────────

test("el alta que trae el punto de venta deja al cliente sin el rojo de 'no puede emitir'", () => {
  const v = validarAltaCliente({ nombre: "Kiosco", cuit: "20-11111111-2", email: "a@b.co", puntoVenta: "3" });
  assert.equal(v.ok, true);
  const pv = (v as { puntoVenta: number | null }).puntoVenta;
  assert.equal(pv, 3);
  assert.deepEqual(ids(sano({ arcaPuntoVenta: pv })), []);
  // Sin punto de venta el alta pasa igual (el formulario viejo no lo manda), y el
  // monitoreo lo marca: ése es el rojo que el alta nueva evita.
  const sinPv = validarAltaCliente({ nombre: "Kiosco", cuit: "20-11111111-2", email: "a@b.co" });
  assert.equal((sinPv as { puntoVenta: number | null }).puntoVenta, null);
  assert.deepEqual(ids(sano({ arcaPuntoVenta: null })), ["perfil_fiscal_incompleto"]);
});

test("decidirPuntoVentaAlta: completa el que falta, nunca pisa, y avisa lo que no hizo", () => {
  // Falta y lo informaron → se escribe, sin aviso.
  assert.deepEqual(decidirPuntoVentaAlta(3, null), { escribir: 3, aviso: null });
  // Falta y no lo informaron → no se escribe nada y se avisa que no puede emitir.
  const sinNada = decidirPuntoVentaAlta(null, null);
  assert.equal(sinNada.escribir, null);
  assert.match(sinNada.aviso ?? "", /no puede emitir/);
  assert.match(sinNada.aviso ?? "", /Gestión Studio Grow/);
  // Ya tenía OTRO → no se pisa, y se avisa (antes, en el alta nueva, se descartaba callado).
  const otro = decidirPuntoVentaAlta(7, 3);
  assert.equal(otro.escribir, null);
  assert.match(otro.aviso ?? "", /Ya tenía el punto de venta 3/);
  // Ya tenía el mismo, o no informaron → nada que hacer ni que decir.
  assert.deepEqual(decidirPuntoVentaAlta(3, 3), { escribir: null, aviso: null });
  assert.deepEqual(decidirPuntoVentaAlta(null, 3), { escribir: null, aviso: null });
  // Ningún aviso manda a "volver a darlo de alta": el formulario todavía no lo pide.
  for (const [i, a] of [[null, null], [7, 3]] as const) {
    assert.doesNotMatch(decidirPuntoVentaAlta(i, a).aviso ?? "", /alta/i);
  }
});

test("un punto de venta mal tipeado frena el alta en vez de guardarse redondeado", () => {
  for (const malo of ["0", "3,5", "-2", "123456", "abc"]) {
    const v = validarAltaCliente({ nombre: "Kiosco", cuit: "20111111112", email: "a@b.co", puntoVenta: malo });
    assert.equal(v.ok, false, `"${malo}" no es un punto de venta`);
  }
  const v = validarAltaCliente({ nombre: "Kiosco", cuit: "20111111112", email: "a@b.co", puntoVenta: 99999 });
  assert.equal((v as { puntoVenta: number | null }).puntoVenta, 99999);
});

// ── la pasada única: recolectarCliente con un tx falso ───────────────────────

type Llamada = { modelo: string; op: string; args: { where?: Record<string, unknown> } & Record<string, unknown> };

/**
 * Un `tx` que responde por la FORMA de la consulta y anota cada llamada. Tiene lo que
 * lee la pasada del cliente y lo que lee `lastClosedDayTx` (la frontera de caja).
 */
function txFalso(caja: { movimientos: string[]; corte: string | null; cierre: string | null }) {
  const llamadas: Llamada[] = [];
  const op =
    (modelo: string, nombre: string, responder: (a: Llamada["args"]) => unknown) =>
    async (args: Llamada["args"]) => {
      llamadas.push({ modelo, op: nombre, args });
      return responder(args);
    };
  const movs = caja.movimientos.map((iso) => new Date(iso));
  const tx = {
    invoice: {
      count: op("invoice", "count", (a) => (a.where?.status === "REJECTED" ? 2 : 17)),
      aggregate: op("invoice", "aggregate", () => ({ _sum: { total: { toNumber: () => 12345.5 } } })),
      findFirst: op("invoice", "findFirst", () => ({ createdAt: new Date("2026-08-20T15:00:00.000Z") })),
    },
    movimientoImportado: {
      count: op("movimientoImportado", "count", (a) => (a.where?.estadoPropuesta === "revision" ? 4 : 6)),
      findFirst: op("movimientoImportado", "findFirst", () => ({ createdAt: new Date("2026-08-10T15:00:00.000Z") })),
    },
    importacionBancaria: {
      findFirst: op("importacionBancaria", "findFirst", () => ({
        nombreArchivo: "extracto-agosto.csv",
        createdAt: new Date("2026-08-22T15:00:00.000Z"),
      })),
    },
    outboxEvent: { count: op("outboxEvent", "count", () => 1) },
    tenantFiscalCredential: {
      findUnique: op("tenantFiscalCredential", "findUnique", () => ({ certNotAfter: new Date("2027-01-01T00:00:00.000Z") })),
    },
    cashMovement: {
      findFirst: op("cashMovement", "findFirst", (a) => {
        const w = a.where ?? {};
        if (w.createdBy) return caja.corte ? { createdBy: `corte-inicial:${caja.corte}` } : null; // frontera: corte
        const rango = w.occurredAt as { gte?: Date; lt?: Date } | undefined;
        const dentro = movs
          .filter((d) => (!rango?.gte || d >= rango.gte) && (!rango?.lt || d < rango.lt))
          .sort((x, y) => x.getTime() - y.getTime());
        if (dentro.length === 0) return null;
        const desc = (a.orderBy as { occurredAt?: string } | undefined)?.occurredAt === "desc";
        return { occurredAt: desc ? dentro[dentro.length - 1] : dentro[0] };
      }),
    },
    auditLog: {
      findFirst: op("auditLog", "findFirst", () => (caja.cierre ? { entityId: caja.cierre } : null)),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, llamadas };
}

const FILA: FilaCarteraDb = { id: "cart-1", clienteTenantId: "cli-1", alias: "Kiosco de Marta", estado: "activa" };
const META: MetaCliente = {
  nombre: "Kiosco SRL",
  slug: "kiosco",
  subdomain: "kiosco",
  arcaCuit: "20111111112",
  arcaPuntoVenta: 3,
  arcaHomologacion: false,
  capFacturasMes: null,
};
const ctx = () => ({
  filtros: filtrosFacturacionMes(new Date(AHORA)),
  inicioDeHoy: new Date("2026-08-25T03:00:00.000Z"), // 25/08 00:00 ART
  leerFronteraCaja: lastClosedDayTx,
});

test("recolectarCliente: volumen y hechos en una pasada, con los relojes correctos", async () => {
  const { tx, llamadas } = txFalso({ movimientos: [], corte: null, cierre: null });
  const { resumen, hechos } = await recolectarCliente(tx, FILA, META, ctx());

  // Facturado = sólo AUTHORIZED, por fecha fiscal. El cupo cuenta por createdAt.
  const agg = llamadas.find((l) => l.modelo === "invoice" && l.op === "aggregate")!;
  assert.deepEqual(agg.args.where, { tenantId: "cli-1", status: "AUTHORIZED", fecha: { gte: "20260801", lt: "20260901" } });
  const cupo = llamadas.find((l) => l.modelo === "invoice" && l.op === "count" && !l.args.where?.status)!;
  assert.ok((cupo.args.where as { createdAt?: unknown }).createdAt, "el cupo filtra por createdAt");
  // Los rechazados, con el MISMO reloj del cupo (emisión) y no por fecha del comprobante.
  const rech = llamadas.find((l) => l.modelo === "invoice" && l.op === "count" && l.args.where?.status === "REJECTED")!;
  assert.deepEqual(rech.args.where, { tenantId: "cli-1", status: "REJECTED", createdAt: (cupo.args.where as { createdAt: unknown }).createdAt });

  assert.deepEqual(resumen, {
    facturasMes: 17,
    capFacturasMes: 159, // cap nulo → default del producto, sin releer Tenant
    montoFacturadoMes: 12345.5,
    pendientesRevision: 4,
    listasParaEmitir: 6,
    ultimaImportacion: { nombreArchivo: "extracto-agosto.csv", createdAt: "2026-08-22T15:00:00.000Z" },
  });
  assert.equal(hechos.rechazadasMes, 2);
  assert.equal(hechos.outboxTrabados, 1);
  assert.equal(hechos.credencialCargada, true);
  assert.equal(hechos.certVenceAt, "2027-01-01T00:00:00.000Z");
  assert.equal(hechos.revisionMasViejaAt, "2026-08-10T15:00:00.000Z");
  assert.equal(hechos.ultimaActividadAt, "2026-08-22T15:00:00.000Z"); // la más nueva de las dos
  assert.equal(hechos.caja, null, "sin movimientos de caja = cliente sin caja");

  // Ninguna lectura de la pasada lleva otro tenant ni la tabla Tenant.
  assert.ok(llamadas.every((l) => l.args.where?.tenantId === "cli-1"), JSON.stringify(llamadas));
  assert.ok(!llamadas.some((l) => l.modelo === "tenant"));
});

test("recolectarCliente: la caja se mide desde el día siguiente al cierre, con la frontera leída con ESTE tx", async () => {
  // Corte el 20, último cierre el 21 → pendiente desde el primer movimiento del 22 en adelante.
  const { tx, llamadas } = txFalso({
    movimientos: ["2026-08-21T15:00:00.000Z", "2026-08-22T15:00:00.000Z", "2026-08-25T13:00:00.000Z"],
    corte: "2026-08-20",
    cierre: "2026-08-21",
  });
  const { hechos } = await recolectarCliente(tx, FILA, META, ctx());
  assert.deepEqual(hechos.caja, { pendienteDesde: "2026-08-22" });
  // La frontera se leyó con el tx del cliente (no con el prisma ambiental).
  assert.ok(llamadas.some((l) => l.modelo === "auditLog" && l.args.where?.tenantId === "cli-1"));

  const s = evaluarCliente(hechos, AHORA, REAL).senales.find((x) => x.id === "caja_sin_cerrar");
  assert.ok(s);
  assert.match(s.detalle, /hace 3 días/);
});

test("lastClosedDayTx: un cierre con día imposible (9999-12-31) no congela nada; manda el corte", async () => {
  // La guarda de cordura de la frontera (la misma de lastClosedDay, el camino de cierre de
  // CH): un entityId futuro dejaría el libro sin poder cargar ni borrar nada.
  const { tx, llamadas } = txFalso({ movimientos: [], corte: "2026-08-01", cierre: "9999-12-31" });
  assert.equal(await lastClosedDayTx(tx, "cli-1"), "2026-08-01");
  const cierre = llamadas.find((l) => l.modelo === "auditLog")!;
  assert.deepEqual(cierre.args.where, { tenantId: "cli-1", entity: "CierreDiario", action: "caja.cierre-diario" });
  // Sin corte y con el cierre imposible: nunca cerró (no "cerrado hasta 9999").
  const soloFuturo = txFalso({ movimientos: [], corte: null, cierre: "9999-12-31" });
  assert.equal(await lastClosedDayTx(soloFuturo.tx, "cli-1"), null);
  // Un cierre sano y posterior al corte gana.
  const sanoPosterior = txFalso({ movimientos: [], corte: "2026-08-01", cierre: "2026-08-20" });
  assert.equal(await lastClosedDayTx(sanoPosterior.tx, "cli-1"), "2026-08-20");
});

test("recolectarCliente: caja cerrada hasta ayer y movimientos sólo de hoy → nada pendiente", async () => {
  const { tx } = txFalso({ movimientos: ["2026-08-25T13:00:00.000Z"], corte: null, cierre: "2026-08-24" });
  const { hechos } = await recolectarCliente(tx, FILA, META, ctx());
  assert.deepEqual(hechos.caja, { pendienteDesde: null });
  assert.ok(!ids(hechos).includes("caja_sin_cerrar"));
});

// ── recorrerCartera: los ids salen SOLO de la cartera del estudio ────────────

test("recorrerCartera: la metadata y cada pasada tocan sólo clientes de la cartera de ESTE estudio", async () => {
  const pedidosMeta: string[][] = [];
  const pasadas: string[] = [];
  const carteras: Record<string, FilaCarteraDb[]> = {
    "estudio-A": [
      { ...FILA, id: "a1", clienteTenantId: "cli-A1", alias: "Uno" },
      { ...FILA, id: "a2", clienteTenantId: "cli-huérfano", alias: "Borrado" },
      { ...FILA, id: "a3", clienteTenantId: "cli-A3", alias: "Tres", estado: "pausada" },
    ],
    "estudio-B": [{ ...FILA, id: "b1", clienteTenantId: "cli-B1", alias: "De B" }],
  };
  const ports: RecorridoPorts = {
    async filasDeCartera(estudio) {
      return carteras[estudio] ?? [];
    },
    async metadataClientes(ids) {
      pedidosMeta.push(ids);
      // Existen todos menos el huérfano (incluido el de B, que igual NO se pide).
      return new Map(
        ["cli-A1", "cli-A3", "cli-B1"].filter((id) => ids.includes(id)).map((id) => [id, { ...META, arcaHomologacion: id === "cli-A3" }]),
      );
    },
    async recolectar(fila) {
      pasadas.push(fila.clienteTenantId);
      return {
        resumen: {
          facturasMes: 1,
          capFacturasMes: 159,
          montoFacturadoMes: 1000,
          pendientesRevision: 0,
          listasParaEmitir: 0,
          ultimaImportacion: null,
        },
        hechos: sano({ clienteTenantId: fila.clienteTenantId, alias: fila.alias, estadoCartera: fila.estado }),
      };
    },
  };

  const r = await recorrerCartera(ports, "estudio-A", "real");
  assert.deepEqual(pedidosMeta, [["cli-A1", "cli-huérfano", "cli-A3"]], "UNA lectura, con los ids de la cartera");
  assert.deepEqual(pasadas, ["cli-A1", "cli-A3"], "el huérfano no se recorre; el de otro estudio, jamás");
  assert.deepEqual(r.filas.map((f) => f.clienteTenantId), ["cli-A1", "cli-A3"]);
  assert.deepEqual(r.hechos.map((h) => h.clienteTenantId), ["cli-A1", "cli-A3"]);
  // Validez fiscal por fila: A3 está en homologación → su monto es de PRUEBA.
  assert.deepEqual(r.filas.map((f) => f.validezFiscal), [true, false]);
  assert.equal(r.resumen.montoFiscalMes, 1000);
  assert.equal(r.resumen.montoPruebaMes, 1000);

  // Con ARCA simulado nada tiene validez fiscal, aunque el cliente esté "en producción".
  const stub = await recorrerCartera(ports, "estudio-A", "stub");
  assert.deepEqual(stub.filas.map((f) => f.validezFiscal), [false, false]);
  assert.equal(stub.resumen.montoFiscalMes, 0);
});

test("recorrerCartera: cartera vacía no lee metadata", async () => {
  let leyo = false;
  const r = await recorrerCartera(
    {
      filasDeCartera: async () => [],
      metadataClientes: async () => {
        leyo = true;
        return new Map();
      },
      recolectar: async () => {
        throw new Error("no debería recorrer nada");
      },
    },
    "estudio-A",
    "real",
  );
  assert.equal(leyo, false);
  assert.deepEqual(r.filas, []);
});

// ── FORMA de la puerta (chequeo de forma sólo para "el llamador usa la regla") ─

const RAIZ = join(process.cwd(), "src");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");
const USE_SERVER = /^\s*["']use server["']/;

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const p = join(dir, nombre);
    if (nombre === "generated" || nombre === "node_modules") continue;
    if (statSync(p).isDirectory()) out.push(...archivosTs(p));
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) out.push(p);
  }
  return out;
}

test("cartera-core.ts NO lleva 'use server': recolectarCliente lee con el tenantId que le pasan", () => {
  assert.ok(!USE_SERVER.test(leer("lib/cartera-core.ts")));
});

test("ningún archivo 'use server' publica recolectarCliente ni recorrerCartera (ni re-exporta cartera-core)", () => {
  const publicados = archivosTs(RAIZ).filter((p) => USE_SERVER.test(readFileSync(p, "utf8")));
  assert.ok(publicados.length > 0, "el recorrido tiene que encontrar los archivos 'use server'");
  for (const p of publicados) {
    const src = readFileSync(p, "utf8");
    assert.doesNotMatch(src, /export\s+(async\s+)?function\s+(recolectarCliente|recorrerCartera)\b/, p);
    assert.doesNotMatch(src, /export\s*\{[^}]*\b(recolectarCliente|recorrerCartera)\b[^}]*\}/, p);
    assert.doesNotMatch(src, /export\s*(\*|\{[^}]*\})\s*from\s*["']@\/lib\/cartera-core["']/, p);
  }
});

test("monitorCarteraAction no recibe parámetros y pasa por exigirEstudio antes de recorrer la cartera", () => {
  const src = leer("lib/cartera-actions.ts");
  assert.match(src, /export async function monitorCarteraAction\(\)/);
  const cuerpo = src.slice(src.indexOf("export async function monitorCarteraAction"));
  const gate = cuerpo.indexOf("exigirEstudio()");
  const recorre = cuerpo.indexOf("recorrerCartera(");
  assert.ok(gate > 0 && recorre > gate, "exigirEstudio tiene que ir antes del recorrido");
  // Y el recorrido se hace con el estudio de la sesión, no con algo que venga de afuera.
  assert.match(cuerpo, /recorrerCartera\(\s*portsDelRecorrido\(ctx\),\s*gate\.estudioTenantId,/);
});
