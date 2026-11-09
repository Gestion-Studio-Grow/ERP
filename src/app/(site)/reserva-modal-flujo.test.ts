// EL MODAL DE RESERVA DE VERDAD, sobre jsdom: React y la lógica real; sólo las llamadas al servidor son simuladas.
// El caso que manda: una reserva nunca sale en un día distinto del marcado (H1, certificación de T1 sobre 9c230b5a).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, before, test } from "node:test";

const raiz = process.cwd();
const requerir = createRequire(join(raiz, "package.json"));
const { JSDOM } = requerir("jsdom");
const esbuild = requerir("esbuild");

const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { url: "http://x.test/" });
const g = globalThis as unknown as Record<string, unknown> & { __nuevo: boolean };
for (const k of ["window", "document", "HTMLElement", "Element", "Node", "MouseEvent", "Event", "KeyboardEvent", "sessionStorage", "getComputedStyle", "HTMLInputElement"]) {
  Object.defineProperty(g, k, { value: k === "window" ? dom.window : dom.window[k], configurable: true, writable: true });
}
Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;
console.error = () => {};

// Compila el modal real con las llamadas al servidor reemplazadas.
const STUBS: Record<string, string> = {
  "@/lib/actions": `
    export function getAvailableSlots(pro, svc, day) { return globalThis.__llamada(pro, svc, [day]).then((m) => m[day] ?? []); }
    export function getAvailableSlotsRange(pro, svc, days) { return globalThis.__llamada(pro, svc, days); }
    export async function createBookingFromModal(a) { return globalThis.__crear(a); }`,
  "@/lib/coupon-actions": `export async function checkCoupon() { return { ok: false, reason: "x" }; }`,
  "@/components/whatsapp-cta": `export function useWhatsAppCta() { return { requestWhatsApp() {} }; }`,
  "@/lib/diseno/DisenoProvider": `export function useDiseno() { return globalThis.__nuevo === true; }`,
};
const carpeta = join(raiz, "node_modules", ".cache", "reserva-modal-flujo");
mkdirSync(carpeta, { recursive: true });
const salida = join(carpeta, "modal.cjs");
/* eslint-disable @typescript-eslint/no-explicit-any */
let Modal: any, React: any, createRoot: any, act: any;
before(async () => {
  await esbuild.build({
  stdin: {
    contents: `export { default as Modal } from "./BookingModal"; export * as React from "react"; export { createRoot } from "react-dom/client";`,
    resolveDir: join(raiz, "src/app/(site)/_ch"),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: salida,
  // React afuera del paquete: adentro, su `act` no encuentra `timers` y usa MessageChannel, que deja viva la prueba.
  external: ["react", "react/*", "react-dom", "react-dom/*"],
  jsx: "automatic",
  logLevel: "error",
  tsconfig: join(raiz, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "servidor-simulado",
      setup(b: { onResolve: (o: { filter: RegExp }, f: (a: { path: string }) => { path: string; namespace: string }) => void; onLoad: (o: { filter: RegExp; namespace: string }, f: (a: { path: string }) => { contents: string | undefined; loader: "js" }) => void }) {
        b.onResolve({ filter: /^@\/(lib\/actions|lib\/coupon-actions|components\/whatsapp-cta|lib\/diseno\/DisenoProvider)$/ }, (a: { path: string }) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a: { path: string }) => ({ contents: STUBS[a.path], loader: "js" }));
      },
    },
  ],
  });
  await esbuild.stop(); // Si no, su proceso deja viva la prueba.
  ({ Modal, React, createRoot } = requerir(salida));
  ({ act } = React);
});

const LUN = "2026-11-02";
const MAR = "2026-11-03";
const servicio = (id: string, name: string) => ({ id, name, durationMin: 60, price: 1000, residentPrice: null, depositAmount: null });
const datos = {
  groups: [{ id: "g", name: "Cat", services: [servicio("X", "SrvX"), servicio("Z", "SrvZ"), servicio("U", "SrvU")] }],
  professionals: [
    { id: "A", name: "Ana", serviceIds: ["X"] },
    { id: "B", name: "Bea", serviceIds: ["X", "Z"] },
    { id: "C", name: "Cora", serviceIds: ["Z", "U"] },
  ],
  days: [
    { value: LUN, label: "lun 2" },
    { value: MAR, label: "mar 3" },
  ],
  whatsapp: "x",
};
// Cada día tiene una hora distinta: la lista delata de qué día es. 12 UTC = 09:00 del negocio; 13 UTC = 10:00.
const HORA: Record<string, string> = { [LUN]: `${LUN}T12:00:00.000Z`, [MAR]: `${MAR}T13:00:00.000Z` };

type Pendiente = { dias: string[]; soltar: () => void };
let cola: Pendiente[] = [];
let sinHora = new Set<string>();
let creadas: { startsAtIso: string; professionalId: string; serviceId: string }[] = [];
let respuesta: unknown;
g.__llamada = (_pro: string, _svc: string, dias: string[]) =>
  new Promise((ok) => {
    cola.push({ dias, soltar: () => ok(Object.fromEntries(dias.map((d) => [d, sinHora.has(HORA[d]) ? [] : [HORA[d]]]))) });
  });
// Si hay freno, la confirmación queda en curso hasta soltarlo.
let freno: Promise<void> | null = null;
g.__crear = async (a: (typeof creadas)[number]) => {
  creadas.push(a);
  await freno;
  return respuesta;
};

let raizReact: { render: (e: unknown) => void; unmount: () => void } | null = null;
async function abrir(nuevo: boolean) {
  if (raizReact) await act(async () => raizReact!.unmount());
  dom.window.document.body.innerHTML = '<div id="r"></div>';
  g.__nuevo = nuevo;
  cola = [];
  sinHora = new Set();
  creadas = [];
  freno = null;
  respuesta = { ok: true, id: "abcdef123456", startsAt: HORA[MAR] };
  dom.window.sessionStorage.clear();
  raizReact = createRoot(dom.window.document.getElementById("r"));
  await act(async () => raizReact!.render(React.createElement(Modal, { data: datos, onClose() {} })));
}
const botones = () => [...dom.window.document.querySelectorAll("button")] as HTMLButtonElement[];
async function clic(texto: string | RegExp) {
  const b = botones().find((x) => (typeof texto === "string" ? x.textContent!.trim().startsWith(texto) : texto.test(x.textContent!.trim())));
  assert.ok(b, `no está el botón ${texto}: ${dom.window.document.body.textContent}`);
  await act(async () => void b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
}
// Suelta sólo la búsqueda de ese día, para armar respuestas fuera de orden.
async function soltarDia(dia: string) {
  const i = cola.findIndex((p) => p.dias.length === 1 && p.dias[0] === dia);
  assert.ok(i >= 0, `no hay búsqueda en curso de ${dia}`);
  const [p] = cola.splice(i, 1);
  await act(async () => {
    p.soltar();
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function soltarTodo() {
  while (cola.length) {
    const p = cola.shift()!;
    await act(async () => {
      p.soltar();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
const marcado = (re: RegExp) => botones().filter((b) => re.test(b.textContent!.trim()) && b.getAttribute("aria-pressed") === "true").map((b) => b.textContent!.trim());
const diaMarcado = () => marcado(/^(lun|mar)/);
const horas = () => botones().filter((b) => /^\d\d:\d\d/.test(b.textContent!.trim())).map((b) => b.textContent!.trim().slice(0, 5));
const profesionales = () => botones().filter((b) => /^(Ana|Bea)$/.test(b.textContent!.trim())).map((b) => b.textContent!.trim());
const avisos = () => [...dom.window.document.querySelectorAll('[role="alert"]')].map((e) => (e as HTMLElement).textContent);
const paso = () => /Paso (\d) de 5/.exec(dom.window.document.body.textContent!)?.[1];

async function escribir(etiqueta: string, valor: string) {
  const label = [...dom.window.document.querySelectorAll("label")].find((l) => (l as HTMLElement).textContent!.startsWith(etiqueta)) as HTMLLabelElement;
  const input = dom.window.document.getElementById(label.htmlFor) as HTMLInputElement;
  const fijar = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    fijar.call(input, valor);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
// El reloj del modal: un toque en «Confirmar» pegado a la llegada al paso 4 no cuenta (doble toque).
const ahoraReal = Date.now;
let salto = 0;
Date.now = () => ahoraReal() + salto;
const pasarVentanaDobleToque = () => void (salto += 1000);
async function cargarDatos() {
  await escribir("Nombre", "QA");
  await escribir("Teléfono", "11 2345 6789");
}
async function confirmarDatos() {
  await cargarDatos();
  pasarVentanaDobleToque();
  await clic("Confirmar");
}

after(async () => {
  if (raizReact) await act(async () => raizReact!.unmount());
  dom.window.close();
});

for (const nuevo of [true, false]) {
  const modo = nuevo ? "prendido" : "apagado";

  test(`${modo}: tocar otro día mientras llega la búsqueda no cambia el día de la reserva (H1)`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await soltarTodo();
    assert.deepEqual(diaMarcado(), ["lun 2"]);
    await clic("Volver");
    await clic("Volver");
    await clic("SrvZ"); // Ana no lo hace
    assert.deepEqual(profesionales(), ["Bea"], "Ana no sigue en la lista");
    await clic("Volver");
    await clic("SrvX");
    await clic("Ana"); // Misma combinación del principio; la búsqueda queda en curso.
    assert.ok(cola.length > 0, "la búsqueda sigue en curso");
    await clic(/^mar 3/);
    await soltarTodo();
    assert.deepEqual(diaMarcado(), ["mar 3"]);
    assert.deepEqual(horas(), ["10:00"], "la lista es la de mar 3");
    await clic("10:00");
    await clic("Continuar");
    await confirmarDatos();
    assert.equal(creadas.length, 1);
    assert.equal(creadas[0].startsAtIso, HORA[MAR], "la reserva sale el día marcado");
  });

  test(`${modo}: la respuesta tardía de otro día no pisa los horarios del día marcado (H2)`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana"); // La búsqueda de todo el rango queda en curso: cada día tocado sale a buscar lo suyo.
    await clic(/^lun 2/);
    await clic(/^mar 3/);
    await soltarDia(MAR);
    await soltarDia(LUN); // Llega última la del día anterior.
    assert.deepEqual(diaMarcado(), ["mar 3"]);
    assert.deepEqual(horas(), ["10:00"], "sigue la lista de mar 3");
    await soltarTodo();
    await clic("10:00");
    await clic("Continuar");
    await confirmarDatos();
    assert.equal(creadas[0].startsAtIso, HORA[MAR], "la reserva sale el día marcado");
  });

  test(`${modo}: tampoco la pisa si el día marcado salió de lo ya traído (H2)`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await clic(/^lun 2/); // Esta búsqueda queda en curso…
    const rango = cola.findIndex((p) => p.dias.length > 1);
    const [r] = cola.splice(rango, 1);
    await act(async () => {
      r.soltar();
      await new Promise((ok) => setTimeout(ok, 0));
    });
    await clic(/^mar 3/); // …y este día ya está traído: no sale a buscar.
    await soltarDia(LUN);
    assert.deepEqual(diaMarcado(), ["mar 3"]);
    assert.deepEqual(horas(), ["10:00"], "sigue la lista de mar 3");
  });

  test(`${modo}: Volver no hace nada mientras se confirma: no hay rebote de paso (H3)`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await soltarTodo();
    await clic("09:00");
    await clic("Continuar");
    let soltar = () => {};
    freno = new Promise((ok) => (soltar = ok));
    await confirmarDatos();
    assert.equal(botones().find((b) => b.textContent!.trim() === "Volver")!.disabled, true, "Volver apagado");
    await clic("Volver");
    assert.equal(paso(), "4", "sigue en el paso 4 mientras se confirma");
    await act(async () => {
      soltar();
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.equal(paso(), "5");
    assert.equal(creadas.length, 1);
  });

  test(`${modo}: dos toques seguidos en Confirmar crean una sola reserva`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await soltarTodo();
    await clic("09:00");
    await clic("Continuar");
    await cargarDatos();
    pasarVentanaDobleToque();
    const confirmar = botones().find((b) => b.textContent!.trim() === "Confirmar")!;
    await act(async () => {
      // Los dos en el mismo turno: el botón todavía no llegó a apagarse.
      confirmar.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      confirmar.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(creadas.length, 1);
    assert.equal(paso(), "5");
  });

  test(`${modo}: doble toque en Continuar con los datos ya cargados no confirma solo`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await soltarTodo();
    await clic("09:00");
    await clic("Continuar");
    await cargarDatos();
    await clic("Volver");
    await clic("Continuar");
    await clic("Confirmar"); // El segundo toque cae en el mismo botón, que ya dice «Confirmar».
    assert.equal(creadas.length, 0, "no se reservó sin mirar el paso 4");
    assert.equal(paso(), "4");
    pasarVentanaDobleToque();
    await clic("Confirmar");
    assert.equal(creadas.length, 1, "un toque aparte sí confirma");
    assert.equal(paso(), "5");
  });

  test(`${modo}: cambiar de servicio borra día y hora y salta al primer día con lugar`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Bea");
    await soltarTodo();
    await clic(/^mar 3/);
    await soltarTodo();
    await clic("10:00");
    await clic("Volver");
    await clic("Volver");
    await clic("SrvZ");
    assert.deepEqual(marcado(/^Bea$/), ["Bea"], "Bea hace el servicio nuevo: sigue elegida");
    await clic("Continuar");
    await soltarTodo();
    assert.deepEqual(diaMarcado(), ["lun 2"], "salta al primer día con lugar");
    assert.deepEqual(horas(), ["09:00"]);
    assert.deepEqual(marcado(/^\d\d:\d\d/), [], "sin hora elegida");
  });

  test(`${modo}: una profesional que no hace el servicio nuevo no deja avanzar`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await soltarTodo();
    await clic("Volver");
    await clic("Volver");
    await clic("SrvZ");
    await clic("Continuar");
    assert.equal(paso(), "2");
    assert.deepEqual(avisos(), nuevo ? ["Falta elegir la profesional."] : []);
  });
}

test("prendido: un rechazo no relee: queda en el paso 4 con el motivo, y al volver manda el día marcado (H1)", async () => {
  await abrir(true);
  await clic("SrvX");
  await clic("Ana");
  await soltarTodo();
  await clic("09:00");
  await clic("Continuar");
  respuesta = { ok: false, error: "Ese horario ya no está disponible." };
  sinHora.add(HORA[LUN]); // Aunque la hora ya no exista, no se vuelve a buscar ni se salta de paso solo.
  await confirmarDatos();
  assert.equal(cola.length, 0, "tras el rechazo no hay relectura");
  await soltarTodo();
  assert.equal(paso(), "4");
  assert.deepEqual(avisos(), ["Ese horario ya no está disponible."]);
  await clic("Volver");
  assert.deepEqual(diaMarcado(), ["lun 2"]);
  await clic(/^mar 3/);
  assert.deepEqual(diaMarcado(), ["mar 3"]);
  assert.deepEqual(horas(), ["10:00"], "la lista es la del día marcado");
  await clic("10:00");
  await clic("Continuar");
  respuesta = { ok: true, id: "abcdef123456", startsAt: HORA[MAR] };
  pasarVentanaDobleToque();
  await clic("Confirmar");
  assert.equal(creadas.at(-1)!.startsAtIso, HORA[MAR], "la reserva sale el día marcado");
});

test("prendido: rechazo con motivo en el pie; al volver el motivo se va", async () => {
  await abrir(true);
  await clic("SrvX");
  await clic("Ana");
  await soltarTodo();
  await clic("09:00");
  await clic("Continuar");
  respuesta = { ok: false, error: "No pudimos confirmar." };
  await confirmarDatos();
  await soltarTodo();
  assert.equal(paso(), "4");
  assert.deepEqual(avisos(), ["No pudimos confirmar."]);
  await clic("Volver");
  assert.deepEqual(avisos(), []);
});

for (const nuevo of [true, false]) {
  const modo = nuevo ? "prendido" : "apagado";

  test(`${modo}: la hora rechazada sale de la lista sin releer, también al volver a ese día`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await soltarTodo();
    await clic("09:00");
    await clic("Continuar");
    respuesta = { ok: false, error: "Ese horario ya no está disponible." };
    await confirmarDatos();
    await clic("Volver");
    assert.equal(paso(), "3");
    assert.deepEqual(horas(), [], "la hora rechazada no se ofrece");
    assert.deepEqual(marcado(/^\d\d:\d\d/), [], "no queda elegida");
    await clic(/^mar 3/);
    assert.deepEqual(horas(), ["10:00"]);
    await clic(/^lun 2/); // Vuelve por lo ya traído.
    assert.deepEqual(horas(), [], "tampoco reaparece por lo ya traído");
    assert.equal(cola.length, 0, "no se releyó nada");
    assert.equal(creadas.length, 1);
  });

  test(`${modo}: tras un rechazo, reintentar desde el paso 4 sigue mandando la misma hora`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Ana");
    await soltarTodo();
    await clic("09:00");
    await clic("Continuar");
    respuesta = { ok: false, error: "Ese cupón ya no vale." };
    await confirmarDatos();
    respuesta = { ok: true, id: "abcdef123456", startsAt: HORA[LUN] };
    await clic("Confirmar");
    assert.equal(paso(), "5");
    assert.deepEqual(creadas.map((c) => c.startsAtIso), [HORA[LUN], HORA[LUN]]);
  });

  test(`${modo}: con otro servicio o profesional, la hora rechazada vuelve a la lista`, async () => {
    await abrir(nuevo);
    await clic("SrvX");
    await clic("Bea");
    await soltarTodo();
    await clic("09:00");
    await clic("Continuar");
    respuesta = { ok: false, error: "Ese horario ya no está disponible." };
    await confirmarDatos();
    await clic("Volver");
    await clic("Volver");
    await clic("Volver");
    await clic("SrvZ");
    await clic("Bea");
    await soltarTodo();
    assert.deepEqual(horas(), ["09:00"]);
  });
}

for (const [modo, nuevo] of [["apagado", false], ["prendido", true]] as const) {
  test(`${modo}: el paso 5 da el link a «Tu turno» y promete sólo lo que dice la regla (U1, U2)`, async () => {
    const reservar = async (horasParaCambiar: number | null, plazoVencido = false) => {
      await abrir(nuevo);
      respuesta = { ok: true, id: "abcdef123456", startsAt: HORA[MAR], horasParaCambiar, plazoVencido };
      await clic("SrvX");
      await clic("Ana");
      await soltarTodo();
      await clic("09:00");
      await clic("Continuar");
      await cargarDatos();
      pasarVentanaDobleToque();
      await clic("Confirmar");
      assert.equal(paso(), "5");
      const cuerpo = dom.window.document.body.textContent ?? "";
      const link = dom.window.document.querySelector('a[href="/reserva/turno/abcdef123456"]');
      assert.equal(link?.textContent, "Ver mi turno", "lo que se promete tiene su camino");
      assert.doesNotMatch(cuerpo, /24 hs/);
      return cuerpo;
    };
    const conRegla = await reservar(24);
    assert.match(conRegla, /desde «Tu turno» hasta 24 h antes/);
    const sinRegla = await reservar(null);
    assert.match(sinRegla, /cancelar o reprogramar desde «Tu turno»\./);
    assert.doesNotMatch(sinRegla, /\d+ h antes/, "sin regla cargada no hay plazo que prometer");
    // Reservó con menos de 24 h: ese plazo ya pasó y no se le promete (R7).
    const vencido = await reservar(24, true);
    assert.doesNotMatch(vencido, /hasta 24 h antes/);
    assert.match(vencido, /Faltan menos de 24 h para tu turno: ya no se puede cambiar online\./);
  });
}

for (const [modo, nuevo] of [["apagado", false], ["prendido", true]] as const) {
  test(`${modo}: si una sola profesional hace el servicio, viene elegida y se sigue sin tocarla`, async () => {
    await abrir(nuevo);
    await clic("SrvU");
    assert.equal(paso(), "2");
    await clic("Continuar");
    assert.equal(paso(), "3", "no pide elegir nada");
    assert.deepEqual(avisos(), []);
  });
  test(`${modo}: con dos que lo hacen, sigue sin venir ninguna elegida`, async () => {
    await abrir(nuevo);
    await clic("SrvZ");
    await clic("Continuar");
    assert.equal(paso(), "2");
  });
}
