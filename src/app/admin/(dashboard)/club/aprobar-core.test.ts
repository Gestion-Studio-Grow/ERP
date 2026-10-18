// El aprobador del dueño contra el motor REAL sobre la demo: el link lleva SÓLO lo del vanilla (`datosAprobacion`) y
// se lee validado; el aviso va al celular de cada dueño con el link del ERP; el PIN se prueba con el tope del bloqueo
// (5 mal → espera); el código que sale es el que la compu del club acepta (`aprobarPorCodigo`), sólo para ESE monto.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import {
  PREFIJO_DEL_PEDIDO,
  RUTA_DEL_APROBADOR,
  avisosAlDuenio,
  duenosQueAprueban,
  enlaceDelCodigo,
  leerPedidoDelLink,
  linkDelAprobador,
  pinesDeEjemplo,
  probarAprobacion,
  situacionDelPedido,
  textoDelPedido,
} from "./aprobar-core";
import { SIN_INTENTOS_DEL_BLOQUEO } from "./bloqueo-core";
import { ejecutarClientes } from "./clientes-core";
import { ejecutarConfiguracion } from "./configuracion-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const ORIGEN = "https://breakpoint.ejemplo.com";
const demo = (): { e: EstadoClub; recep: Auth; duenio: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, recep: operadorDeLaDemo(e, "RECEPTION")!.auth, duenio: operadorDeLaDemo(e, "OWNER")!.auth };
};

/** Un pedido nuevo de cuenta corriente hecho por recepción (cliente sin cuenta ni pedido). */
function conPedido() {
  const d = demo();
  const sin = d.e.clientes.find((c) => !c.cc.habilitada && !d.e.novedades.some((n) => n.clienteId === c.id))!;
  const r = ejecutarClientes(d.e, { tipo: "pedirCC", clienteId: sin.id, limite: "40.000", nota: "" }, AHORA, d.recep);
  assert.equal(r.ok, true, r.mensaje);
  const n = d.e.novedades.find((x) => x.clienteId === sin.id && x.estado === "pendiente")!;
  return { ...d, cliente: sin, novedad: n, datos: M.datosAprobacion(d.e, n.id)! };
}

test("el link: la ruta del ERP con el fragmento #aprobar&… y SÓLO los 7 datos del vanilla (nada de PIN, celular ni deuda)", () => {
  const { e, datos, cliente } = conPedido();
  const link = linkDelAprobador(`${ORIGEN}/`, datos);
  assert.ok(link.startsWith(`${ORIGEN}${RUTA_DEL_APROBADOR}${PREFIJO_DEL_PEDIDO}`), link);
  const fragmento = link.slice(link.indexOf("#"));
  const claves = [...new URLSearchParams(fragmento.slice(PREFIJO_DEL_PEDIDO.length)).keys()];
  assert.deepEqual(claves, ["id", "c", "n", "m", "t", "p", "f"]);
  const valores = [...new URLSearchParams(fragmento.slice(PREFIJO_DEL_PEDIDO.length)).values()];
  for (const u of e.usuarios) if (u.pin) assert.ok(!valores.includes(u.pin), `el PIN de ${u.nombre} no viaja`);
  assert.ok(!fragmento.includes(cliente.tel.replace(/\D/g, "")), "sin el teléfono del cliente");
  assert.ok(!link.split("#")[0].includes("?"), "nada en la query: todo va en el fragmento (no llega al servidor)");
  // Ida y vuelta: lo que se lee es lo que salió.
  assert.deepEqual(leerPedidoDelLink(fragmento), datos);
  assert.equal(textoDelPedido(datos), `${datos.p} pide cuenta corriente para ${cliente.nombre} hasta $ 40.000 · 17/10`);
});

test("leer el link: lo roto, incompleto o raro no se acepta; los textos se limpian", () => {
  const { datos } = conPedido();
  const armar = (cambios: Record<string, string>) => `${PREFIJO_DEL_PEDIDO}${new URLSearchParams({ ...datos, m: String(datos.m), ...cambios }).toString()}`;
  assert.equal(leerPedidoDelLink(""), null);
  assert.equal(leerPedidoDelLink("#otra-cosa"), null);
  assert.equal(leerPedidoDelLink(armar({ m: "0" })), null, "monto cero");
  assert.equal(leerPedidoDelLink(armar({ m: "-5" })), null);
  assert.equal(leerPedidoDelLink(armar({ m: "12.5" })), null, "monto con decimales");
  assert.equal(leerPedidoDelLink(armar({ m: "abc" })), null);
  assert.equal(leerPedidoDelLink(armar({ t: "regalo" })), null, "tipo que no existe");
  assert.equal(leerPedidoDelLink(armar({ id: "../../x" })), null, "id raro");
  assert.equal(leerPedidoDelLink(armar({ c: "" })), null);
  assert.equal(leerPedidoDelLink(armar({ f: "ayer" })), null);
  assert.equal(leerPedidoDelLink(armar({ n: "" })), null);
  const largo = leerPedidoDelLink(armar({ n: `Juan\nPérez${"x".repeat(200)}` }))!;
  assert.equal(largo.n.length, 80);
  assert.ok(!largo.n.includes("\n"));
  assert.equal(leerPedidoDelLink(armar({ f: "" }))!.f, "", "sin fecha también sirve (el código usa la fecha vacía)");
});

test("avisar al dueño: un botón por dueño, al celular de Configuración y con el link del ERP; en la demo, sin número", () => {
  const { e, duenio, novedad, datos } = conPedido();
  const enDemo = avisosAlDuenio(e, novedad.id, ORIGEN, "demo");
  assert.deepEqual(enDemo.map((a) => a.nombre), e.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false).map((u) => u.nombre));
  for (const a of enDemo) {
    assert.match(a.enlace.href, /^https:\/\/wa\.me\/\?text=/, "en la demo, para elegir el chat");
    assert.ok(a.enlace.texto.startsWith(`Hola ${a.nombre}, soy ${datos.p} del club.`), a.enlace.texto);
    assert.ok(a.enlace.texto.endsWith(linkDelAprobador(ORIGEN, datos)), "lleva el link al aprobador del ERP");
  }
  const rober = e.usuarios.find((u) => u.rol === "duenio" && u.activo !== false)!;
  const r = ejecutarConfiguracion(e, { tipo: "avisos", celulares: { [rober.id]: "11 2345-6789" }, club: "11 5555-0000", alias: "" }, AHORA, duenio);
  assert.equal(r.ok, true, r.mensaje);
  const enReal = avisosAlDuenio(e, novedad.id, ORIGEN, "real");
  const suyo = enReal.find((a) => a.duenioId === rober.id)!;
  assert.equal(suyo.enlace.directo, true);
  assert.match(suyo.enlace.href, /^https:\/\/wa\.me\/5491123456789\?text=/, "al celular del dueño, en formato argentino");
  const otro = enReal.find((a) => a.duenioId !== rober.id);
  if (otro) assert.equal(otro.enlace.directo, false, "sin celular cargado, para elegir el chat");
  assert.deepEqual(avisosAlDuenio(e, "no-existe", ORIGEN, "real"), []);
});

test("el PIN con el tope del bloqueo: mal no da código, 5 mal hacen esperar; bien da el código que acepta la compu del club", () => {
  const { e, recep, novedad, datos } = conPedido();
  const [rober] = duenosQueAprueban(e);
  const pinDe = (id: string) => e.usuarios.find((u) => u.id === id)!.pin;
  const pinMalo = pinDe(rober.id) === "99" ? "98" : "99";
  let intentos = SIN_INTENTOS_DEL_BLOQUEO;
  const t0 = 1_000_000;
  const probar = (pin: string, monto = "40.000", duenioId: string | null = rober.id, ahoraMs = t0) =>
    probarAprobacion({ estado: e, pedido: datos, duenioId, pin, monto, intentos, ahoraMs });

  assert.equal(probar("1").tipo, "incompleto", "un número solo no gasta intento");
  assert.equal(probar(pinDe(rober.id), "").tipo, "incompleto", "sin monto no gasta intento");
  assert.equal(probar(pinDe(rober.id), "40.000", null).tipo, "incompleto", "hay que elegir quién aprueba");
  const recepcion = e.usuarios.find((u) => u.rol === "recepcion" && u.pin)!;
  assert.equal(probar(recepcion.pin, "40.000", recepcion.id).tipo, "incompleto", "recepción no aprueba (ni gasta intento)");
  for (let k = 1; k <= 4; k++) {
    const r = probar(pinMalo);
    assert.equal(r.tipo, "malo");
    if (r.tipo === "malo") {
      assert.match(r.mensaje, new RegExp(`\\(${k} de 5\\)`));
      intentos = r.intentos;
    }
  }
  const quinto = probar(pinMalo);
  assert.equal(quinto.tipo, "malo");
  if (quinto.tipo === "malo") intentos = quinto.intentos;
  const trabado = probar(pinDe(rober.id));
  assert.equal(trabado.tipo, "espera", "trabado: ni el PIN bueno se evalúa");
  if (trabado.tipo === "espera") assert.equal(trabado.segundos, 30);

  // Pasada la espera, el PIN bueno da el código y vuelve todo a cero.
  const bien = probar(pinDe(rober.id), "35.000", rober.id, t0 + 31_000);
  assert.equal(bien.tipo, "codigo");
  if (bien.tipo !== "codigo") return;
  assert.equal(bien.aprobo, rober.nombre);
  assert.deepEqual(bien.intentos, SIN_INTENTOS_DEL_BLOQUEO);
  assert.match(bien.codigo, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  // La compu del club: con otro monto no sirve; con el que aprobó el dueño, sí.
  const otroMonto = ejecutarClientes(e, { tipo: "aprobarCodigo", novedadId: novedad.id, codigo: bien.codigo, monto: "40000" }, AHORA, recep);
  assert.equal(otroMonto.ok, false);
  const ok = ejecutarClientes(e, { tipo: "aprobarCodigo", novedadId: novedad.id, codigo: bien.codigo, monto: "35000" }, AHORA, recep);
  assert.equal(ok.ok, true, ok.mensaje);
  assert.match(ok.mensaje, new RegExp(`^Aprobado por ${rober.nombre}: cuenta corriente habilitada hasta \\$ 35\\.000\\.`));
  assert.equal(situacionDelPedido(e, datos), "resuelto");
});

test("sin el estado a mano (jornada real sin la base): el código sale igual y lo verifica la compu del club", () => {
  const { e, recep, novedad, datos } = conPedido();
  assert.equal(situacionDelPedido(null, datos), "desconocido");
  assert.equal(probarAprobacion({ estado: null, pedido: datos, duenioId: null, pin: "x1", monto: "40000", intentos: SIN_INTENTOS_DEL_BLOQUEO, ahoraMs: 0 }).tipo, "incompleto");
  const majo = duenosQueAprueban(e).at(-1)!;
  const r = probarAprobacion({ estado: null, pedido: datos, duenioId: null, pin: e.usuarios.find((u) => u.id === majo.id)!.pin, monto: "40000", intentos: SIN_INTENTOS_DEL_BLOQUEO, ahoraMs: 0 });
  assert.equal(r.tipo, "codigo");
  if (r.tipo !== "codigo") return;
  assert.equal(r.aprobo, null, "no se pudo verificar acá");
  const ok = ejecutarClientes(e, { tipo: "aprobarCodigo", novedadId: novedad.id, codigo: r.codigo, monto: "40000" }, AHORA, recep);
  assert.equal(ok.ok, true, ok.mensaje);
  assert.match(ok.mensaje, new RegExp(`^Aprobado por ${majo.nombre}`));
  // Con un PIN que no es de nadie, el código no sirve en la compu del club.
  const { e: e2, recep: recep2, novedad: n2, datos: d2 } = conPedido();
  const usados = new Set(e2.usuarios.map((u) => u.pin));
  const ajeno = ["90", "91", "92", "93"].find((p) => !usados.has(p))!;
  const r2 = probarAprobacion({ estado: null, pedido: d2, duenioId: null, pin: ajeno, monto: "40000", intentos: SIN_INTENTOS_DEL_BLOQUEO, ahoraMs: 0 });
  assert.equal(r2.tipo, "codigo");
  if (r2.tipo === "codigo") assert.equal(ejecutarClientes(e2, { tipo: "aprobarCodigo", novedadId: n2.id, codigo: r2.codigo, monto: "40000" }, AHORA, recep2).ok, false);
});

test("mandar el código: el texto del motor al WhatsApp del club (en la demo, sin número); los PIN de ejemplo sólo en la demo", () => {
  const { e, duenio, datos } = conPedido();
  const demoLink = enlaceDelCodigo(e, datos, "ABC-DEF", 40000, "demo");
  assert.equal(demoLink.texto, `Aprobado: ${datos.n} $ 40.000. Código ABC-DEF`);
  assert.match(demoLink.href, /^https:\/\/wa\.me\/\?text=/);
  ejecutarConfiguracion(e, { tipo: "avisos", celulares: {}, club: "11 5555-0000", alias: "" }, AHORA, duenio);
  assert.match(enlaceDelCodigo(e, datos, "ABC-DEF", 40000, "real").href, /^https:\/\/wa\.me\/5491155550000\?text=/);
  assert.equal(enlaceDelCodigo(null, datos, "ABC-DEF", 40000, "real").directo, false, "sin estado, para elegir el chat");
  assert.match(pinesDeEjemplo(e, "demo")!, /^\S.* \d{4}( · .* \d{4})*$/, "los dueños de la demo, con su PIN de 4");
  assert.equal(pinesDeEjemplo(e, "real"), null, "en el real, nunca");
});

test("PIN de dueño de 4 en el celular: también acepta el viejo de 2 (y lo avisa); lo demás no gasta un intento", () => {
  const { e, recep, novedad, datos } = conPedido();
  const rober = duenosQueAprueban(e)[0];
  const de = (pin: string, estado: typeof e | null = e) =>
    probarAprobacion({ estado, pedido: datos, duenioId: estado ? rober.id : null, pin, monto: "40000", intentos: SIN_INTENTOS_DEL_BLOQUEO, ahoraMs: 0 });
  for (const pin of ["1", "123", "12345"]) {
    for (const estado of [e, null]) {
      const r = de(pin, estado);
      assert.equal(r.tipo, "incompleto", `«${pin}» ${estado ? "con" : "sin"} estado`);
      if (r.tipo === "incompleto") assert.equal(r.mensaje, "Poné los 4 números de tu PIN.");
    }
  }
  const nuevo = de(e.usuarios.find((u) => u.id === rober.id)!.pin);
  assert.equal(nuevo.tipo === "codigo" && nuevo.pinViejo, false, "con el de 4, sin aviso");
  // Rober todavía con el del piloto (2): el código sale, lo avisa y la compu del club lo acepta.
  e.usuarios.find((u) => u.id === rober.id)!.pin = "11";
  const viejo = de("11");
  assert.equal(viejo.tipo, "codigo");
  if (viejo.tipo !== "codigo") return;
  assert.equal(viejo.pinViejo, true);
  assert.equal(viejo.aprobo, rober.nombre);
  assert.equal(ejecutarClientes(e, { tipo: "aprobarCodigo", novedadId: novedad.id, codigo: viejo.codigo, monto: "40000" }, AHORA, recep).ok, true);
});
