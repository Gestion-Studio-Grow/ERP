// Reglas puras del configurador de Soporte GSG: se EJECUTAN las funciones que deciden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { modulosDelPlan } from "@/planes/catalogo";
import {
  EMAIL_DEL_CLIENTE_ES_DEL_ESTUDIO,
  mensajeParaLaContadora,
  modulosDelAlta,
  sugerirPlan,
  validarConfiguracion,
} from "./configurador-reglas";

const BASE = {
  razonSocial: "Tienda Alma SRL",
  cuit: "30-71888999-1",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  puntoVenta: "3",
  rubro: "mostrador",
  plan: "comerciante",
  email: "ana@tiendaalma.test",
  whatsapp: "11 5555 0101",
};

test("un CUIT con el dígito verificador mal se rechaza con el motivo, sin sugerir el dígito", () => {
  const r = validarConfiguracion({ ...BASE, cuit: "30-71888999-2" });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /CUIT/);
});

test("un formulario completo de comercio Responsable inscripto se acepta y normaliza", () => {
  const r = validarConfiguracion(BASE);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.config.cuit, "30718889991");
  assert.equal(r.config.puntoVenta, 3);
  assert.equal(r.config.whatsapp, "1155550101");
  assert.deepEqual(r.config.contadora, { tipo: "ya-tiene" });
  assert.equal(r.config.autorizaVinculo, false);
});

test("consumidor final no es una condición válida para quien factura", () => {
  assert.equal(validarConfiguracion({ ...BASE, condicionIva: "CONSUMIDOR_FINAL" }).ok, false);
});

test("sin punto de venta el cliente no emite: se rechaza", () => {
  assert.equal(validarConfiguracion({ ...BASE, puntoVenta: "" }).ok, false);
  assert.equal(validarConfiguracion({ ...BASE, puntoVenta: "100000" }).ok, false);
});

test("el email de la persona nueva del estudio no puede ser el del dueño", () => {
  const r = validarConfiguracion({ ...BASE, accesoContadora: "nueva", contadoraNombre: "Martina", contadoraEmail: BASE.email });
  assert.deepEqual(r, { ok: false, error: EMAIL_DEL_CLIENTE_ES_DEL_ESTUDIO });
});

test("el plan del estudio no se le da a un cliente", () => {
  assert.equal(validarConfiguracion({ ...BASE, plan: "estudio" }).ok, false);
});

test("sugerencia de plan: chico → Facturación, varios locales → PyME, comercio monotributo sin fiado → Micro", () => {
  assert.equal(sugerirPlan("chico", { condicionIva: "MONOTRIBUTO" }).plan, "facturacion");
  assert.equal(sugerirPlan("varios-locales", { condicionIva: "MONOTRIBUTO" }).plan, "pyme");
  assert.equal(sugerirPlan("comercio", { condicionIva: "MONOTRIBUTO", personas: 2 }).plan, "micro");
});

test("comercio Responsable inscripto, que fía o con 3 personas → Comerciante, con el porqué", () => {
  assert.match(sugerirPlan("comercio", { condicionIva: "RESPONSABLE_INSCRIPTO" }).porque, /Libro IVA/);
  assert.match(sugerirPlan("comercio", { condicionIva: "MONOTRIBUTO", fia: true }).porque, /fía/);
  assert.equal(sugerirPlan("comercio", { condicionIva: "MONOTRIBUTO", personas: 3 }).plan, "comerciante");
});

test("los módulos del alta son exactamente los del plan y el rubro (catalogo.ts)", () => {
  for (const plan of ["facturacion", "micro", "comerciante", "pyme"] as const) {
    for (const rubro of ["servicios", "mostrador", "carniceria"] as const) {
      assert.deepEqual(modulosDelAlta(plan, rubro), [...modulosDelPlan(plan, rubro).modulos]);
    }
  }
});

test("el mensaje para la contadora nunca lleva la contraseña del dueño y sin dirección no inventa un link", () => {
  const m = mensajeParaLaContadora({ cliente: "Tienda Alma SRL", cuit: "30718889991", puntoVenta: 3, direccionCartera: null, acceso: null });
  assert.match(m, /30-71888999-1/);
  assert.match(m, /punto de venta 3/);
  assert.doesNotMatch(m, /https?:\/\//);
  assert.doesNotMatch(m, /Contraseña/);
});

// ── Posibles duplicados sin CUIT (bloqueante de QA 26/09) ──
import { leerDecisionDuplicado, nombresParecidos, posiblesDuplicados, validarConfiguracion as validar } from "./configurador-reglas";

const sinCuit = [
  { id: "kiosco", nombre: "QA Kiosco Lab", slug: "qa-kiosco-lab", subdominio: null },
  { id: "shine", nombre: "Shine Velas", slug: "shinevelas", subdominio: "shinevelas" },
  { id: "adm", nombre: "A Dos Manos", slug: "adosmanos", subdominio: "adosmanos" },
  { id: "tito", nombre: "Don Tito", slug: "don-tito", subdominio: null },
  { id: "otro", nombre: "Ferretería La Tuerca", slug: "la-tuerca", subdominio: null },
];

test("el mismo nombre (con o sin tipo societario, tildes o mayúsculas) es un posible duplicado", () => {
  assert.equal(nombresParecidos("QA Kiosco Lab", "qa kiosco lab"), true);
  assert.equal(nombresParecidos("Shine Velas S.R.L.", "Shine Velas"), true);
  assert.equal(nombresParecidos("A DOS MANOS PÁDEL", "adosmanos"), true);
  assert.equal(nombresParecidos("Almacén Mayorista Don Tito SRL", "Don Tito"), true);
  assert.equal(nombresParecidos("Ferretería El Tornillo SRL", "Ferretería La Tuerca"), false, "una palabra en común no alcanza");
  assert.equal(nombresParecidos("Paula Ríos Fonoaudiología", "Grupo Andino SA"), false);
});

test("posiblesDuplicados: el Kiosco, Shine y A Dos Manos aparecen; lo que no se parece, no", () => {
  const ids = (nombre: string, alias = "") =>
    posiblesDuplicados({ nombre, alias, slugSugerido: nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-") }, sinCuit).map((x) => x.id);
  assert.deepEqual(ids("QA Kiosco Lab"), ["kiosco"]);
  assert.deepEqual(ids("Shine Velas SRL"), ["shine"]);
  assert.deepEqual(ids("Palas y más", "A Dos Manos"), ["adm"], "también por el alias del pedido");
  assert.deepEqual(ids("Grupo Andino SA"), []);
});

test("posiblesDuplicados: la dirección que le tocaría ya es de otro negocio", () => {
  const r = posiblesDuplicados({ nombre: "Tuerca y Tornillo", slugSugerido: "la-tuerca" }, sinCuit);
  assert.deepEqual(r.map((x) => x.id), ["otro"]);
  assert.match(r[0]!.motivo, /dirección «la-tuerca»/);
});

test("la decisión ante los parecidos se lee del formulario: sin decidir, «otro» o «es:<id>»", () => {
  assert.deepEqual(leerDecisionDuplicado(""), { tipo: "sin-decidir" });
  assert.deepEqual(leerDecisionDuplicado("otro"), { tipo: "otro" });
  assert.deepEqual(leerDecisionDuplicado("es:abc_123"), { tipo: "es", tenantId: "abc_123" });
  assert.deepEqual(leerDecisionDuplicado("es:'; drop"), { tipo: "sin-decidir" });
  const v = validar({ razonSocial: "X SA", cuit: "20111111112", condicionIva: "MONOTRIBUTO", puntoVenta: "1", rubro: "mostrador", plan: "micro", email: "x@y.test", duplicado: "otro" });
  assert.ok(v.ok && v.config.duplicado.tipo === "otro");
});
