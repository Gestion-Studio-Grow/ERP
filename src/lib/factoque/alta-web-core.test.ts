// Alta web de Factoque — la parte pura: formulario, slug, sellos de un solo uso, límites y textos.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPO_TRAMPA,
  REGLAS_DEL_ALTA,
  RESPUESTA_DEL_PEDIDO,
  VENCE_CLAVE_MS,
  VENCE_CONFIRMACION_MS,
  abrir,
  abrirClave,
  abrirConfirmacion,
  cayoEnLaTrampa,
  crearLimites,
  huellaDelHash,
  mailDeConfirmacion,
  mailSinAlta,
  mismaHuella,
  sellar,
  selloDeClave,
  selloDeConfirmacion,
  slugParaElAlta,
  validarPedido,
  type PedidoDeAlta,
} from "./alta-web-core";

const SECRETO = "secreto-de-prueba";
const BIEN: PedidoDeAlta = {
  nombre: "  Kiosco   Don Pepe ",
  cuit: "20-12345678-6",
  condicion: "monotributo",
  puntoVenta: "3",
  email: " Pepe@Ficticio.TEST ",
  trampa: "",
};

test("validarPedido: normaliza y traduce la condición al formato del emisor", () => {
  const v = validarPedido(BIEN);
  assert.ok(v.ok);
  assert.deepEqual(v.alta, {
    nombre: "Kiosco Don Pepe",
    cuit: "20123456786",
    condicionIva: "MONOTRIBUTO",
    puntoVenta: 3,
    email: "pepe@ficticio.test",
  });
  const ri = validarPedido({ ...BIEN, condicion: "responsable_inscripto" });
  assert.ok(ri.ok && ri.alta.condicionIva === "RESPONSABLE_INSCRIPTO");
});

test("validarPedido: junta todos los errores (CUIT con dígito verificador incluido)", () => {
  const v = validarPedido({ nombre: "", cuit: "20123456787", condicion: "otra", puntoVenta: "0", email: "sin-arroba", trampa: "" });
  assert.ok(!v.ok && "errores" in v);
  assert.deepEqual(Object.keys(v.errores).sort(), ["condicion", "cuit", "email", "nombre", "puntoVenta"]);
  assert.match(v.errores.cuit!, /no cierra/);
});

test("trampa: cualquier cosa en el campo invisible es un robot", () => {
  assert.equal(CAMPO_TRAMPA, "sitio_web");
  assert.equal(cayoEnLaTrampa(""), false);
  assert.equal(cayoEnLaTrampa("  "), false);
  assert.equal(cayoEnLaTrampa("http://spam"), true);
});

test("slugParaElAlta: nombre en minúsculas + 4 al azar; nunca un slug inválido", () => {
  assert.equal(slugParaElAlta("Kiosco Don Pepé", "ab12"), "kiosco-don-pepe-ab12");
  assert.equal(slugParaElAlta("¡¡¡", "zz99"), "negocio-zz99");
  const largo = slugParaElAlta("x".repeat(200), "c0de");
  assert.ok(largo.length <= 45 && largo.endsWith("-c0de"));
  assert.equal(slugParaElAlta("Almacén", "A$"), "almacen-a000");
});

test("sello de confirmación: ida y vuelta, vence a las 24 h, no se puede tocar", () => {
  const v = validarPedido(BIEN);
  assert.ok(v.ok);
  const s = selloDeConfirmacion(v.alta, 1_000, SECRETO);
  assert.ok(!s.includes("20123456786") && !s.includes("ficticio"), "el CUIT y el mail no quedan a la vista");
  assert.deepEqual(abrirConfirmacion(s, 1_000 + VENCE_CONFIRMACION_MS - 1, SECRETO), v.alta);
  assert.equal(abrirConfirmacion(s, 1_000 + VENCE_CONFIRMACION_MS, SECRETO), null, "vencido");
  assert.equal(abrirConfirmacion(s, 1_000, "otro-secreto"), null, "otro secreto");
  // Un carácter cambiado en el medio rompe la etiqueta.
  const medio = Math.floor(s.length / 2);
  const tocado = s.slice(0, medio) + (s[medio] === "A" ? "B" : "A") + s.slice(medio + 1);
  assert.equal(abrirConfirmacion(tocado, 1_000, SECRETO), null, "tocado");
  assert.equal(abrirConfirmacion("basura", 1_000, SECRETO), null);
  assert.equal(abrirConfirmacion("", 1_000, SECRETO), null);
});

test("sello de confirmación: datos sellados que no validan (forjados con el secreto) no sirven", () => {
  const malo = sellar({ nombre: "X", cuit: "20123456787", condicionIva: "MONOTRIBUTO", puntoVenta: 3, email: "a@b.co", vence: 9e15 }, SECRETO, "factoque-alta-confirmar:v1");
  assert.equal(abrirConfirmacion(malo, 0, SECRETO), null);
});

test("los propósitos no se cruzan: un sello de confirmar no abre como clave y viceversa", () => {
  const v = validarPedido(BIEN);
  assert.ok(v.ok);
  const conf = selloDeConfirmacion(v.alta, 0, SECRETO);
  const clave = selloDeClave({ usuario: "u1", negocio: "t1", passwordHash: "scrypt$a$b" }, 0, SECRETO);
  assert.equal(abrirClave(conf, 0, SECRETO), null);
  assert.equal(abrirConfirmacion(clave, 0, SECRETO), null);
  assert.equal(abrir(clave, SECRETO, "factoque-alta-confirmar:v1"), null);
});

test("sello de clave: atado al hash vigente, vence a las 2 h", () => {
  const s = selloDeClave({ usuario: "u1", negocio: "t1", passwordHash: "scrypt$a$b" }, 0, SECRETO);
  const a = abrirClave(s, VENCE_CLAVE_MS - 1, SECRETO);
  assert.ok(a);
  assert.equal(a.usuario, "u1");
  assert.equal(a.negocio, "t1");
  assert.ok(mismaHuella(a.huella, huellaDelHash("scrypt$a$b")));
  assert.ok(!mismaHuella(a.huella, huellaDelHash("scrypt$a$c")), "con otro hash, otra huella");
  assert.equal(abrirClave(s, VENCE_CLAVE_MS, SECRETO), null);
  assert.ok(!mismaHuella("abc", "abcd"));
});

test("límites: cuentan cada pedido, frenan por cualquiera de las claves y se liberan con la ventana", () => {
  let ahora = 0;
  const l = crearLimites(REGLAS_DEL_ALTA, () => ahora);
  for (let i = 0; i < 3; i++) assert.ok(l.pasa([`alta-ip:1.1.1.${i}`, "alta-mail:a@b.co", `alta-cuit:${i}`]));
  assert.equal(l.pasa(["alta-ip:9.9.9.9", "alta-mail:a@b.co", "alta-cuit:x"]), false, "el mail ya pidió 3");
  // Frenado no cuenta: la IP nueva sigue con su cupo entero.
  for (let i = 0; i < 20; i++) assert.ok(l.pasa(["alta-ip:9.9.9.9", `alta-mail:${i}@b.co`, `alta-cuit:y${i}`]));
  assert.equal(l.pasa(["alta-ip:9.9.9.9", "alta-mail:z@b.co", "alta-cuit:z"]), false, "la IP ya pidió 20");
  ahora += 60 * 60 * 1000;
  assert.ok(l.pasa(["alta-ip:9.9.9.9", "alta-mail:a@b.co", "alta-cuit:x"]), "pasada la hora, vuelve a pasar");
  assert.throws(() => l.pasa(["otra:1"]), /sin regla/);
});

test("textos: la respuesta no dice nada de lo que existe; los mails no llevan clave", () => {
  assert.doesNotMatch(RESPUESTA_DEL_PEDIDO, /ya (existe|tiene|está)/i);
  const m = mailDeConfirmacion({ nombre: "Kiosco", enlace: "https://x/y?t=abc" });
  assert.match(m.cuerpo, /https:\/\/x\/y\?t=abc/);
  assert.match(m.cuerpo, /una sola vez/);
  const s = mailSinAlta();
  assert.doesNotMatch(s.cuerpo, /ya (existe|tiene)/i);
  assert.doesNotMatch(m.cuerpo + s.cuerpo, /contraseña:/i);
});

test("situacionDelCuit: libre, reclamable, propio, bloqueado y vencido", async () => {
  const { situacionDelCuit, VENCE_ALTA_SIN_VERIFICAR_MS, mailDeReclamo } = await import("./alta-web-core");
  const ahora = Date.UTC(2026, 10, 8);
  const t = (o: Partial<import("./alta-web-core").TenedorDelCuit>) => ({
    tenantId: "t",
    subdomain: "s",
    creado: new Date(ahora - 1000),
    verificado: false,
    web: true,
    titulares: [{ id: "u", email: "otro@x.co", lastLoginAt: null }],
    ...o,
  });
  assert.equal(situacionDelCuit([], ahora, "a@x.co").tipo, "libre");
  assert.equal(situacionDelCuit([t({})], ahora, "a@x.co").tipo, "reclamable");
  assert.equal(situacionDelCuit([t({ titulares: [{ id: "u", email: "a@x.co", lastLoginAt: null }] })], ahora, "a@x.co").tipo, "propio");
  assert.equal(situacionDelCuit([t({}), t({ verificado: true })], ahora, "a@x.co").tipo, "bloqueado");
  assert.equal(situacionDelCuit([t({ web: false, creado: new Date(0) })], ahora, "a@x.co").tipo, "bloqueado", "de GSG: nunca vence");
  const vencida = t({ creado: new Date(ahora - VENCE_ALTA_SIN_VERIFICAR_MS) });
  assert.equal(situacionDelCuit([vencida], ahora, "a@x.co").tipo, "libre");
  assert.equal(situacionDelCuit([{ ...vencida, titulares: [{ id: "u", email: "a@x.co", lastLoginAt: null }] }], ahora, "a@x.co").tipo, "libre", "la propia vencida no se retoma");
  assert.equal(situacionDelCuit([t({ verificado: true, creado: new Date(0) })], ahora, "a@x.co").tipo, "bloqueado", "verificada: nunca vence");
  assert.equal(VENCE_ALTA_SIN_VERIFICAR_MS, 15 * 24 * 60 * 60 * 1000);
  const m = mailDeReclamo({ nombre: "K", enlace: "https://x/c?t=1" });
  assert.match(m.cuerpo, /reclamarlo/);
  assert.match(m.cuerpo, /https:\/\/x\/c\?t=1/);
});
