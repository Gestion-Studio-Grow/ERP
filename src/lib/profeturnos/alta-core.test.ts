import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS,
  altaAbierta,
  cayoEnLaTrampa,
  crearLimites,
  slugLibre,
  slugSugerido,
  urlDelPanel,
  validarAlta,
  type FormularioDelAlta,
} from "./alta-core";
import { DIAS_PRUEBA, PRECIO_MENSUAL, PRECIO_PROVISIONAL, precioEnPesos } from "./planes";

const bueno: FormularioDelAlta = {
  nombre: "  Juan   Pérez ",
  negocio: "Clases de Pádel Juan",
  email: "Juan@Ejemplo.COM",
  whatsapp: "+54 9 11 2345-6789",
  clave: "pelota-2026x",
  terminos: "si",
  trampa: "",
};

test("un formulario bien llenado pasa, limpio y normalizado", () => {
  const v = validarAlta(bueno);
  assert.ok(v.ok);
  assert.deepEqual(v.datos, {
    nombre: "Juan Pérez",
    negocio: "Clases de Pádel Juan",
    email: "juan@ejemplo.com",
    whatsapp: "1123456789",
    clave: "pelota-2026x",
  });
});

test("todo vacío: un error por campo, todos juntos", () => {
  const v = validarAlta({ nombre: "", negocio: "", email: "", whatsapp: "", clave: "", terminos: "", trampa: "" });
  assert.equal(v.ok, false);
  assert.deepEqual(Object.keys(!v.ok ? v.errores : {}).sort(), [...CAMPOS].sort());
});

test("WhatsApp AR: con 0 y 15 se acepta; corto, con letras o fijo sin área, no", () => {
  assert.ok(validarAlta({ ...bueno, whatsapp: "011 15 2345-6789" }).ok);
  assert.ok(validarAlta({ ...bueno, whatsapp: "351 555 1234" }).ok);
  for (const w of ["2345-6789", "11 2345 678a", "abc", "+1 555 123 4567 89"]) {
    const v = validarAlta({ ...bueno, whatsapp: w });
    assert.ok(!v.ok && v.errores.whatsapp, `rechaza ${w}`);
  }
});

test("la clave: al menos 10, con letras y números; los términos, tildados", () => {
  const corta = validarAlta({ ...bueno, clave: "abc12345" });
  assert.ok(!corta.ok && /10/.test(corta.errores.clave ?? ""));
  const soloLetras = validarAlta({ ...bueno, clave: "solamenteletras" });
  assert.ok(!soloLetras.ok && soloLetras.errores.clave);
  const sinTerminos = validarAlta({ ...bueno, terminos: "" });
  assert.ok(!sinTerminos.ok && sinTerminos.errores.terminos && Object.keys(sinTerminos.errores).length === 1);
  assert.ok(validarAlta({ ...bueno, terminos: "on" }).ok);
});

test("el campo trampa: cualquier cosa escrita es un robot", () => {
  assert.equal(cayoEnLaTrampa(""), false);
  assert.equal(cayoEnLaTrampa("   "), false);
  assert.equal(cayoEnLaTrampa(undefined), false);
  assert.equal(cayoEnLaTrampa("http://spam.test"), true);
});

test("slug sugerido: sin acentos, en minúsculas, nunca vacío ni reservado", () => {
  assert.equal(slugSugerido("Clases de Pádel Ñandú"), "clases-de-padel-nandu");
  assert.equal(slugSugerido("  ¡¡Juan!!  "), "juan");
  assert.equal(slugSugerido("JP"), "profe-jp");
  assert.equal(slugSugerido("!!!"), "profe");
  assert.equal(slugSugerido("Admin"), "admin-profe");
  const largo = slugSugerido("Escuela de pádel de alto rendimiento del barrio norte de la ciudad");
  assert.ok(largo.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(largo), largo);
});

test("slug libre: el sugerido, o con sufijo si colisiona", () => {
  assert.equal(slugLibre("juan", []), "juan");
  assert.equal(slugLibre("juan", ["juan"]), "juan-2");
  assert.equal(slugLibre("juan", ["JUAN", "juan-2", "juan-3"]), "juan-4");
  assert.equal(slugLibre("juan", ["juan", "juan-2"], 2), null);
});

test("la dirección del panel y el flag", () => {
  assert.equal(urlDelPanel("juan", "gsgapp.com.ar"), "https://juan.gsgapp.com.ar/admin");
  assert.equal(urlDelPanel("juan", "https://gsgapp.com.ar/"), "https://juan.gsgapp.com.ar/admin");
  assert.equal(altaAbierta({}), false);
  assert.equal(altaAbierta({ PROFETURNOS_ALTA_ABIERTA: "true" }), false);
  assert.equal(altaAbierta({ PROFETURNOS_ALTA_ABIERTA: "1" }), true);
});

test("límites: 20 por hora por IP, cuenta cada pedido y libera con la ventana", () => {
  let ahora = 0;
  const l = crearLimites(undefined, () => ahora);
  for (let i = 0; i < 20; i++) assert.ok(l.pasa([`alta-ip:1.2.3.4`]));
  assert.equal(l.pasa([`alta-ip:1.2.3.4`]), false);
  assert.ok(l.pasa([`alta-ip:5.6.7.8`]));
  ahora += 60 * 60 * 1000;
  assert.ok(l.pasa([`alta-ip:1.2.3.4`]));
  assert.throws(() => l.pasa(["otra:x"]));
});

test("planes: precio y prueba confirmados, y el precio en pesos", () => {
  assert.equal(DIAS_PRUEBA, 14);
  assert.equal(PRECIO_MENSUAL, 12900);
  assert.equal(PRECIO_PROVISIONAL, false);
  assert.equal(precioEnPesos(), "$ 12.900");
});
