// El mes del estudio (mes-core.ts): qué le queda pendiente a la contadora y en qué orden.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FilaCartera } from "@/lib/cartera-core";
import type { FilaMonitor, Senal } from "@/lib/monitor-core";
import { AVISO_PLAZO_ARCA, EXTRACTO_SIN_DIRECCION, extractoDelMes, pendientesDelCliente, pendientesDelMes } from "./mes-core";

const INICIO_SEPT = new Date("2026-09-01T03:00:00.000Z"); // 00:00 del 1/9 en Buenos Aires

function fila(p: Partial<FilaCartera> & { clienteTenantId: string; alias: string }): FilaCartera {
  return {
    carteraId: `c-${p.clienteTenantId}`,
    nombre: p.alias,
    slug: p.clienteTenantId,
    cuit: "20111111112",
    estado: "activa",
    pctCap: 0,
    arcaConfigurado: true,
    arcaHomologacion: false,
    validezFiscal: true,
    subdomain: "algo",
    facturasMes: 0,
    capFacturasMes: 300,
    montoFacturadoMes: 0,
    pendientesRevision: 0,
    listasParaEmitir: 0,
    ultimaImportacion: { nombreArchivo: "sept.csv", createdAt: "2026-09-05T15:00:00.000Z" },
    cierreMes: { mes: "2026-08", congelado: true, congeladoEl: "2026-09-02T12:00:00.000Z", paquete: null },
    ...p,
  };
}

const sinCuit: Senal = {
  id: "perfil_fiscal_incompleto",
  severidad: "critico",
  titulo: "No puede emitir",
  detalle: "No tiene CUIT cargado.",
  accion: "Pedíselo a Gestión Studio Grow.",
  resuelve: { quien: "gsg" },
};
const certPorVencer: Senal = {
  id: "cert_por_vencer",
  severidad: "atencion",
  titulo: "El certificado vence pronto",
  detalle: "Vence el 20/09/2026.",
  accion: "Pedí el certificado nuevo.",
  resuelve: { quien: "gsg" },
};
const monitor = (id: string, senales: Senal[]): FilaMonitor => ({
  clienteTenantId: id,
  alias: id,
  estado: senales.some((s) => s.severidad === "critico") ? "critico" : senales.length ? "atencion" : "ok",
  senales,
  urgencia: 0,
  pctCap: 0,
});

test("cliente al día este mes: no le falta nada", () => {
  assert.deepEqual(pendientesDelCliente(fila({ clienteTenantId: "a", alias: "A" }), monitor("a", []), INICIO_SEPT, true), []);
});

test("sin CUIT no puede facturar, y va primero que el cierre abierto y el extracto que falta", () => {
  const f = fila({
    clienteTenantId: "a",
    alias: "A",
    ultimaImportacion: null,
    pendientesRevision: 2,
    cierreMes: { mes: "2026-08", congelado: false, congeladoEl: null, paquete: null },
  });
  const p = pendientesDelCliente(f, monitor("a", [sinCuit, certPorVencer]), INICIO_SEPT, true);
  assert.deepEqual(p.map((x) => x.grupo), ["no_emite", "vence", "cierre", "extracto", "revisar"]);
  assert.equal(p[0].quien, "gsg", "el CUIT lo corrige Soporte GSG");
  assert.match(p[2].detalle, /agosto sigue abierto/);
  assert.match(p[4].detalle, /2 ventas esperan/);
});

test("un extracto cargado el mes pasado cuenta como que falta el de este mes", () => {
  const f = fila({ clienteTenantId: "a", alias: "A", ultimaImportacion: { nombreArchivo: "agosto.csv", createdAt: "2026-08-31T20:00:00.000Z" } });
  const e = extractoDelMes(f, INICIO_SEPT, true);
  assert.equal(e.cargado, false);
  assert.match(e.detalle, /agosto\.csv, de un mes anterior/);
  assert.equal(e.quien, "estudio");
  // 1/9 a las 00:30 de Buenos Aires ya es septiembre.
  assert.equal(extractoDelMes({ ultimaImportacion: { nombreArchivo: "x", createdAt: "2026-09-01T03:30:00.000Z" } }, INICIO_SEPT, true).cargado, true);
});

test("sin dirección propia el extracto no se puede subir: la acción es pedírsela a Soporte GSG", () => {
  const e = extractoDelMes(fila({ clienteTenantId: "a", alias: "A", ultimaImportacion: null }), INICIO_SEPT, false);
  assert.equal(e.quien, "gsg");
  assert.match(e.detalle, /Todavía no tiene su dirección propia/);
  assert.match(e.accion, /Pedile a Soporte GSG/);
});

test("los clientes en pausa o de baja no aparecen en el mes", () => {
  const p = fila({ clienteTenantId: "p", alias: "P", estado: "pausada", ultimaImportacion: null });
  assert.deepEqual(pendientesDelCliente(p, monitor("p", [sinCuit]), INICIO_SEPT, true), []);
});

test("el mes de la cartera: grupos en orden de gravedad y, adentro, primero el que más factura", () => {
  const cartera = [
    fila({ clienteTenantId: "chico", alias: "Kiosco", montoFacturadoMes: 100_000, ultimaImportacion: null }),
    fila({ clienteTenantId: "grande", alias: "Distribuidora", montoFacturadoMes: 9_000_000, ultimaImportacion: null }),
    fila({ clienteTenantId: "sin-cuit", alias: "Ferretería", ultimaImportacion: null }),
  ];
  const grupos = pendientesDelMes(cartera, [monitor("sin-cuit", [sinCuit])], "2026-09", INICIO_SEPT, (f) => f.clienteTenantId !== "chico");
  assert.deepEqual(grupos.map((g) => g.id), ["no_emite", "extracto"], "grupos vacíos fuera");
  assert.equal(grupos[1].titulo, "Sin extracto de septiembre");
  assert.deepEqual(grupos[1].pendientes.map((p) => p.alias), ["Distribuidora", "Kiosco", "Ferretería"]);
  assert.equal(grupos[1].pendientes[1].quien, "gsg", "el kiosco no tiene dirección propia");
});

test("cartera vacía: no hay nada pendiente", () => {
  assert.deepEqual(pendientesDelMes([], [], "2026-09", INICIO_SEPT, () => true), []);
});

// ── C4 (refutador): lo que frena la emisión va en «No pueden facturar», y el extracto sin prometer de más ──

const certVencido: Senal = {
  id: "cert_vencido",
  severidad: "critico",
  titulo: "El certificado de ARCA venció",
  detalle: "Venció el 10/09/2026.",
  accion: "Pedí el certificado nuevo.",
  resuelve: { quien: "gsg" },
};
const cupoAgotado: Senal = {
  id: "cupo_del_plan",
  severidad: "critico",
  titulo: "Llegó al límite de facturas automáticas del plan",
  detalle: "159 de 159.",
  accion: "Pedí un plan más grande.",
  resuelve: { quien: "gsg" },
};

test("certificado vencido: no puede facturar, va en «No pueden facturar» y antes que uno que sólo está por vencer aunque facture más", () => {
  const cartera = [
    fila({ clienteTenantId: "x", alias: "X Vencido", montoFacturadoMes: 10_000 }),
    fila({ clienteTenantId: "y", alias: "Y Por vencer", montoFacturadoMes: 9_000_000 }),
  ];
  const grupos = pendientesDelMes(cartera, [monitor("x", [certVencido]), monitor("y", [certPorVencer])], "2026-09", INICIO_SEPT, () => true);
  assert.deepEqual(grupos.map((g) => g.id), ["no_emite", "vence"]);
  assert.equal(grupos[0].titulo, "No pueden facturar");
  assert.deepEqual(grupos[0].pendientes.map((p) => p.alias), ["X Vencido"]);
  assert.deepEqual(grupos[1].pendientes.map((p) => p.alias), ["Y Por vencer"], "el vencido no se repite en «Vence»");
  // En la ficha: el grupo que decide la marca de «atención».
  const ficha = pendientesDelCliente(cartera[0], monitor("x", [certVencido]), INICIO_SEPT, true);
  assert.deepEqual(ficha.map((p) => p.grupo), ["no_emite"]);
});

test("límite del plan agotado: no puede facturar, va en «No pueden facturar»", () => {
  const f = fila({ clienteTenantId: "z", alias: "Z" });
  const p = pendientesDelCliente(f, monitor("z", [cupoAgotado, certPorVencer]), INICIO_SEPT, true);
  assert.deepEqual(p.map((x) => [x.grupo, x.detalle.split(".")[0]]), [
    ["no_emite", "Llegó al límite de facturas automáticas del plan"],
    ["vence", "El certificado vence pronto"],
  ]);
});

test("sin dirección propia: el texto del extracto no promete que las ventas se facturan igual; avisa el plazo de ARCA (5 días bienes, 10 servicios)", () => {
  const e = extractoDelMes(fila({ clienteTenantId: "a", alias: "A", ultimaImportacion: null }), INICIO_SEPT, false);
  for (const texto of [e.accion, EXTRACTO_SIN_DIRECCION, AVISO_PLAZO_ARCA]) {
    assert.doesNotMatch(texto, /se facturan (igual|cuando lo subas|después)/, texto);
    assert.match(texto, /5 días/);
    assert.match(texto, /10 en servicios/);
    assert.match(texto, /no se facturan solas/);
  }
});
