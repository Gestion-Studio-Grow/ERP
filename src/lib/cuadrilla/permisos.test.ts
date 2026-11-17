// Tabla de permisos de la consola de la cuadrilla (GSG-MIA-062, criterio 4: nivel 0 sin atajo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { puede, esNivel0, type Actor, type ExcepcionCtx, type Operacion } from "./permisos";

const A = "negocio-a";
const B = "negocio-b";
const operador: Actor = { tipo: "operador", nombre: "duenio" };
const supA: Actor = { tipo: "supervisor", tenantId: A, userId: "u-sup-a", nombre: "Sup A" };
const supB: Actor = { tipo: "supervisor", tenantId: B, userId: "u-sup-b", nombre: "Sup B" };
const agenteA: Actor = { tipo: "agente", tenantId: A, userId: "u-ag-a", agenteId: "ag-a", nombre: "Agente A" };

const ex = (o: Partial<ExcepcionCtx> = {}): ExcepcionCtx => ({
  tenantId: A,
  agenteId: "ag-a",
  tipo: "APROBACION",
  categoria: "OTRA",
  estado: "PENDIENTE",
  creadaPorUserId: "u-ag-a",
  ...o,
});
const plata = ex({ categoria: "PLATA" });
const envio = ex({ categoria: "ENVIO_TERCEROS" });

type Caso = [string, Actor | null, Operacion, Parameters<typeof puede>[2], boolean];
const CASOS: Caso[] = [
  // enviar_a_terceros: nadie, nunca.
  ["operador no envía a terceros", operador, "enviar_a_terceros", {}, false],
  ["supervisor no envía a terceros", supA, "enviar_a_terceros", {}, false],
  ["agente no envía a terceros", agenteA, "enviar_a_terceros", {}, false],
  // Sin sesión: nada.
  ["sin sesión no ve la consola", null, "ver_consola", {}, false],
  // Ver la consola.
  ["operador ve la consola", operador, "ver_consola", {}, true],
  ["supervisor ve la de su negocio", supA, "ver_consola", { tenantId: A }, true],
  ["supervisor NO ve la de otro negocio", supA, "ver_consola", { tenantId: B }, false],
  ["agente NO ve la consola de supervisión", agenteA, "ver_consola", { tenantId: A }, false],
  // Aprobar una (no nivel 0).
  ["supervisor aprueba una común de su negocio", supA, "aprobar", { excepcion: ex() }, true],
  ["supervisor de B NO aprueba la de A", supB, "aprobar", { excepcion: ex() }, false],
  ["operador aprueba una común", operador, "aprobar", { excepcion: ex() }, true],
  ["agente NO aprueba", agenteA, "aprobar", { excepcion: ex(), contenidoVisto: true }, false],
  ["agente NO rechaza", agenteA, "rechazar", { excepcion: ex() }, false],
  ["no se decide lo ya decidido", supA, "aprobar", { excepcion: ex({ estado: "APROBADA" }) }, false],
  ["no se aprueba lo que levantó uno mismo", supA, "aprobar", { excepcion: ex({ creadaPorUserId: "u-sup-a" }) }, false],
  ["un frenado no se 'aprueba', se resuelve", supA, "aprobar", { excepcion: ex({ tipo: "FRENADO" }) }, false],
  ["un frenado se resuelve", supA, "resolver", { excepcion: ex({ tipo: "FRENADO" }) }, true],
  // Nivel 0: de a una, viendo el contenido.
  ["plata sin ver el contenido: NO", supA, "aprobar", { excepcion: plata }, false],
  ["plata viendo el contenido: sí", supA, "aprobar", { excepcion: plata, contenidoVisto: true }, true],
  ["envío a terceros sin ver: NO (ni el operador)", operador, "aprobar", { excepcion: envio, contenidoVisto: false }, false],
  ["envío a terceros viendo: sí (operador)", operador, "aprobar", { excepcion: envio, contenidoVisto: true }, true],
  ["plata de otro negocio viendo: NO", supB, "aprobar", { excepcion: plata, contenidoVisto: true }, false],
  // Lote.
  ["aprobar en lote comunes: sí", supA, "aprobar_lote", { lote: [ex(), ex()] }, true],
  ["aprobar en lote con plata: NO", supA, "aprobar_lote", { lote: [ex(), plata] }, false],
  ["aprobar en lote con envío: NO (operador)", operador, "aprobar_lote", { lote: [envio] }, false],
  ["aprobar en lote con una de otro negocio: NO", supA, "aprobar_lote", { lote: [ex(), ex({ tenantId: B })] }, false],
  ["rechazar en lote con plata: sí (rechazar no ejecuta nada)", supA, "rechazar_lote", { lote: [plata, envio] }, true],
  ["lote vacío: NO", supA, "rechazar_lote", { lote: [] }, false],
  ["agente NO decide en lote", agenteA, "rechazar_lote", { lote: [ex()] }, false],
  // Pausar, reasignar.
  ["supervisor pausa en su negocio", supA, "pausar", { tenantId: A }, true],
  ["supervisor NO pausa en otro", supA, "pausar", { tenantId: B }, false],
  ["agente NO pausa", agenteA, "pausar", { tenantId: A }, false],
  ["operador reasigna en cualquiera", operador, "reasignar", { tenantId: B }, true],
  // Hablar.
  ["agente habla en su hilo", agenteA, "hablar", { tenantId: A, hiloAgenteId: "ag-a" }, true],
  ["agente NO habla en el hilo de otro agente", agenteA, "hablar", { tenantId: A, hiloAgenteId: "ag-otro" }, false],
  ["supervisor habla en un hilo de su negocio", supA, "hablar", { tenantId: A, hiloAgenteId: "ag-a" }, true],
  ["supervisor NO habla en otro negocio", supA, "hablar", { tenantId: B, hiloAgenteId: "ag-b" }, false],
  // Levantar excepciones: sólo un agente, en su negocio.
  ["agente levanta en su negocio", agenteA, "levantar_excepcion", { tenantId: A }, true],
  ["agente NO levanta en otro", agenteA, "levantar_excepcion", { tenantId: B }, false],
  ["supervisor NO levanta", supA, "levantar_excepcion", { tenantId: A }, false],
  // Pedidos (criterio 8): pide una persona; cierra el agente que lo recibió, una vez.
  ["supervisor pide en su negocio", supA, "pedir", { tenantId: A }, true],
  ["supervisor NO pide en otro negocio", supA, "pedir", { tenantId: B }, false],
  ["operador pide en cualquiera", operador, "pedir", { tenantId: B }, true],
  ["agente NO hace pedidos", agenteA, "pedir", { tenantId: A }, false],
  ["agente cierra su pedido abierto", agenteA, "cerrar_pedido", { pedido: { tenantId: A, agenteId: "ag-a", estado: "ABIERTO" } }, true],
  ["agente NO cierra el pedido de otro agente", agenteA, "cerrar_pedido", { pedido: { tenantId: A, agenteId: "ag-otro", estado: "ABIERTO" } }, false],
  ["agente NO cierra un pedido ya cerrado", agenteA, "cerrar_pedido", { pedido: { tenantId: A, agenteId: "ag-a", estado: "NEGADO" } }, false],
  ["agente NO cierra un pedido de otro negocio", agenteA, "cerrar_pedido", { pedido: { tenantId: B, agenteId: "ag-a", estado: "ABIERTO" } }, false],
  ["supervisor NO cierra pedidos (los cierra el agente)", supA, "cerrar_pedido", { pedido: { tenantId: A, agenteId: "ag-a", estado: "ABIERTO" } }, false],
];

for (const [nombre, actor, op, ctx, esperado] of CASOS) {
  test(`permisos · ${nombre}`, () => {
    const r = puede(actor, op, ctx);
    assert.equal(r.ok, esperado, r.ok ? "dio sí" : `dio no: ${r.motivo}`);
    if (!r.ok) assert.ok(r.motivo.length > 10, "el rechazo trae el motivo en criollo");
  });
}

test("nivel 0 = plata y envíos a terceros", () => {
  assert.equal(esNivel0("PLATA"), true);
  assert.equal(esNivel0("ENVIO_TERCEROS"), true);
  assert.equal(esNivel0("OTRA"), false);
});
