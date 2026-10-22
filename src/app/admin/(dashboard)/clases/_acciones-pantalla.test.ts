// Las piezas de cliente de la Tanda 3A renderizadas de verdad (React en el servidor, con esbuild):
// el orden de los botones de una clase (M-065), Agendar arrancando sin alumno (M-053/M-056), «No
// vino» con el default marcado (M-068), «Cobré» con los tres medios (M-060) y «Cancelar» que no
// cancela hasta elegir el motivo (M-061). El motor (lib/padel/acciones) y Next van con piezas
// falsas: acá se mira la pantalla, no la base. Sin esbuild, se saltea con el motivo.

import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));

const ENTRADA = `
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccionesClase } from "@/app/admin/(dashboard)/clases/_acciones";
import AgendarHoja from "@/app/admin/(dashboard)/clases/agendar/AgendarHoja";
import { HojaNoVino } from "@/app/admin/(dashboard)/clases/_hojas/HojaNoVino";
import { HojaCobrar } from "@/app/admin/(dashboard)/clases/_hojas/HojaCobrar";
import { HojaCancelar } from "@/app/admin/(dashboard)/clases/_hojas/HojaCancelar";
const piezas = { AccionesClase, AgendarHoja, HojaNoVino, HojaCobrar, HojaCancelar };
globalThis.__render = (nombre, props) => renderToStaticMarkup(h(piezas[nombre], props));
`;

const FALSOS: Record<string, string> = {
  "@/lib/padel/acciones": `
    const ok = async () => ({ ok: true, wa: null, enviado: false, avisoId: null, libres: [], alternativas: [], avisos: [], fallidas: [] });
    export const agendarProxima = ok, cerrarPasada = ok, confirmarTodos = ok, devolverComprobante = ok, devolverSaldo = ok,
      mandarLinkAlAlumno = ok, moverClase = ok, moverPago = ok, recordarVarios = ok, recordatorio = ok, regenerarLink = ok,
      cobrar = ok, cancelarConMotivo = ok, alternativasPara = ok, horasLibres = ok, moverHorario = ok, editarClase = ok,
      suspenderDia = ok, bloquearRango = ok, agendarClase = ok, quitarBloqueo = ok;`,
  "next/navigation": `export const useRouter = () => ({ refresh() {}, push() {}, back() {} }); export const usePathname = () => "/admin/clases";`,
  "next/link": `import { createElement } from "react"; export default function Link({ href, children, ...p }) { return createElement("a", { href, ...p }, children); }`,
};

type Render = (nombre: string, props: Record<string, unknown>) => string;
let render: Render | null = null;
let motivo = "";

const qas = (html: string) => [...html.matchAll(/data-qa="([^"]+)"/g)].map((m) => m[1]);
const futura = (h: number) => new Date(Date.now() + h * 3_600_000);

describe("Tanda 3A en pantalla", () => {
  before(async () => {
    try {
      const esbuild = await import("esbuild");
      const r = await esbuild.build({
        stdin: { contents: ENTRADA, loader: "tsx", resolveDir: RAIZ },
        bundle: true,
        write: false,
        platform: "node",
        format: "iife",
        jsx: "automatic",
        tsconfig: join(RAIZ, "tsconfig.json"),
        define: { "process.env.NODE_ENV": '"production"' },
        loader: { ".css": "empty" },
        logLevel: "silent",
        plugins: [
          {
            name: "falsos",
            setup(b) {
              b.onResolve({ filter: /^(@\/lib\/padel\/acciones|next\/navigation|next\/link)$/ }, (a) => ({ path: a.path, namespace: "falso" }));
              b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({ contents: FALSOS[a.path], loader: "js", resolveDir: RAIZ }));
            },
          },
        ],
      });
      new Function("require", r.outputFiles[0].text)(createRequire(import.meta.url));
      render = (globalThis as unknown as { __render: Render }).__render;
    } catch (e) {
      motivo = `sin esbuild o no compila: ${(e as Error).message.slice(0, 300)}`;
    }
  });

  const base = { comprobante: null, precio: 25000, nombre: "Juan Pérez", telefono: "1155551234", tipo: "INDIVIDUAL", personas: 1 };

  test("M-065: una confirmada sin pagar: Dada · No vino · Cobré · Mover · Cancelar · Editar · Agendar la próxima", (t) => {
    if (!render) return t.skip(motivo);
    const html = render("AccionesClase", { c: { ...base, id: "c1", estado: "CONFIRMADA", pagoEstado: "PENDIENTE", empiezaEn: futura(2), terminaEn: futura(3) } });
    assert.deepEqual(qas(html), ["dada", "ausente", "cobre", "mover", "cancelar", "editar", "agendar-proxima"]);
  });

  test("M-065: un pedido: Confirmar · No puedo · Mover · Editar (sin Cancelar suelto ni Cobré)", (t) => {
    if (!render) return t.skip(motivo);
    const html = render("AccionesClase", { c: { ...base, id: "c2", estado: "PEDIDA", pagoEstado: "PENDIENTE", empiezaEn: futura(20), terminaEn: futura(21) }, conProxima: false });
    assert.deepEqual(qas(html), ["confirmar", "rechazar", "mover", "editar"]);
  });

  test("M-065: la misma clase con los campos de antes (la Bandeja) muestra los mismos botones en el mismo orden", (t) => {
    if (!render) return t.skip(motivo);
    const html = render("AccionesClase", { c: { id: "c3", estado: "CONFIRMADA", pagoEstado: "PENDIENTE", nombre: "Ana", comprobante: null, precio: 25000 }, conProxima: false });
    assert.deepEqual(qas(html), ["dada", "ausente", "cobre", "mover", "cancelar", "editar"]);
  });

  test("una dada pagada sólo se edita; una pasada sin cerrar no se mueve ni se cancela", (t) => {
    if (!render) return t.skip(motivo);
    assert.deepEqual(qas(render("AccionesClase", { c: { ...base, id: "c4", estado: "DADA", pagoEstado: "PAGADO" }, conProxima: false })), ["editar"]);
    const pasada = render("AccionesClase", { c: { ...base, id: "c5", estado: "CONFIRMADA", pagoEstado: "PENDIENTE", empiezaEn: futura(-26), terminaEn: futura(-25) }, conProxima: false });
    assert.deepEqual(qas(pasada), ["dada", "ausente", "cobre", "editar"]);
  });

  test("M-053/M-056: Agendar arranca sin alumno; con el hueco tocado ya trae día y hora y sólo falta el alumno", (t) => {
    if (!render) return t.skip(motivo);
    const hoy = new Date().toISOString().slice(0, 10);
    const props = {
      hoy,
      frecuentes: [{ id: "a1", nombre: "Juan Pérez", telefono: "1155551234" }],
      todos: [{ id: "a1", nombre: "Juan Pérez", telefono: "1155551234" }, { id: "a2", nombre: "Lucía Gómez", telefono: "1155550000" }],
      precios: { precioIndividual: 25000, precioGrupal: 12000 },
      inicial: { fecha: hoy, hora: null, libres: [], alumnoId: null },
    };
    const vacia = render("AgendarHoja", props);
    assert.match(vacia, /<button[^>]*disabled=""[^>]*data-qa="agendar-y-avisar"[^>]*>Elegí el alumno<\/button>/);
    assert.doesNotMatch(vacia, /aria-pressed="true"[^>]*>Juan</, "ningún alumno elegido de entrada");
    const iso = new Date(Date.now() + 5 * 3_600_000);
    iso.setUTCMinutes(0, 0, 0);
    const conHueco = render("AgendarHoja", { ...props, inicial: { ...props.inicial, hora: iso.toISOString(), libres: [iso.toISOString()] } });
    assert.match(conHueco, /data-qa="resumen-agendar"[^>]*>Hoy · \d\d:00 · \$ 25\.000</);
    assert.match(conHueco, />Elegí el alumno<\/button>/);
    assert.match(conHueco, new RegExp(`aria-pressed="true"[^>]*data-hora="${iso.toISOString()}"`), "la hora del hueco viene elegida");
    const conAlumno = render("AgendarHoja", { ...props, inicial: { ...props.inicial, hora: iso.toISOString(), libres: [iso.toISOString()], alumnoId: "a1" } });
    assert.match(conAlumno, /<button[^>]*data-qa="agendar-y-avisar"[^>]*>Agendar y avisar<\/button>/);
    assert.doesNotMatch(conAlumno, /disabled=""[^>]*data-qa="agendar-y-avisar"/);
  });

  test("M-068: «No vino» trae marcado el default de Ajustes", (t) => {
    if (!render) return t.skip(motivo);
    const c = { ...base, id: "c6", estado: "CONFIRMADA", pagoEstado: "PENDIENTE" };
    const noSeCobra = render("HojaNoVino", { c, onCerrar() {}, seCobraPorDefecto: false });
    assert.match(noSeCobra, /data-qa="no-vino-no-se-cobra" data-default="true"/);
    assert.doesNotMatch(noSeCobra, /data-qa="no-vino-se-cobra" data-default/);
    const seCobra = render("HojaNoVino", { c, onCerrar() {}, seCobraPorDefecto: true });
    assert.match(seCobra, /data-qa="no-vino-se-cobra" data-default="true"/);
  });

  test("M-060: «Cobré» muestra Efectivo · Transferencia · Mercado Pago", (t) => {
    if (!render) return t.skip(motivo);
    const html = render("HojaCobrar", { c: { ...base, id: "c7", estado: "CONFIRMADA", pagoEstado: "PENDIENTE" }, onCerrar() {} });
    assert.deepEqual(qas(html).filter((q) => q.startsWith("cobrar-")), ["cobrar-EFECTIVO", "cobrar-TRANSFERENCIA", "cobrar-MERCADO_PAGO"]);
  });

  test("M-061: «Cancelar» abre con los motivos y no cancela hasta elegir uno", (t) => {
    if (!render) return t.skip(motivo);
    const html = render("HojaCancelar", { c: { ...base, id: "c8", estado: "CONFIRMADA", pagoEstado: "PAGADO", empiezaEn: futura(5) }, onCerrar() {} });
    for (const m of ["Lluvia", "Me enfermé", "Club cerrado", "El alumno avisó", "Otro"]) assert.match(html, new RegExp(`>${m}<`));
    assert.match(html, /<button[^>]*disabled=""[^>]*data-qa="cancelar-y-avisar"[^>]*>Elegí el motivo<\/button>/);
    assert.match(html, /data-qa="queda-a-favor"/, "pagada: avisa que queda a favor");
  });
});
