// El armazón nuevo sin DOM: la tecla del rubro, dónde aterriza cada rol, dónde estoy y el título.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accionDelRubro, dondeEstoy, espacioPedido, hrefDelEspacio, iniciales, puestoDe, tituloDePantalla, type EspacioDeNav } from "./armazon-core";

const VENDER = { id: "vender", ruta: "/admin/vender" as const, icono: "vender" as const };
const AGENDA = { id: "agenda", ruta: "/admin/turnos" as const, icono: "agenda" as const };

test("la tecla del rubro: Vender en un mostrador, Dar un turno en una estética, nada si rebotaría", () => {
  assert.deepEqual(accionDelRubro([VENDER], true, "RECEPTION"), { ruta: "/admin/vender", icono: "vender", palabra: "Vender", atajo: "F1" });
  assert.equal(accionDelRubro([], true, "OWNER"), null);
  assert.deepEqual(accionDelRubro([AGENDA], false, "OWNER")?.palabra, "Dar un turno");
  assert.match(accionDelRubro([AGENDA], false, "RECEPTION")!.ruta, /^\/admin\/turnos\/lista\?nuevo=1/);
  // El profesional ve su agenda pero no da turnos.
  assert.equal(accionDelRubro([AGENDA], false, "PROFESSIONAL"), null);
});

test("cada rol aterriza en su trabajo: la cajera en Vender, la recepción en la Agenda, el dueño en el Inicio", () => {
  assert.equal(puestoDe("RECEPTION", true, [VENDER]), "/admin/vender");
  assert.equal(puestoDe("RECEPTION", false, [AGENDA]), "/admin/turnos");
  assert.equal(puestoDe("OWNER", true, [VENDER]), null);
  // Sin la app de su puesto, su casa es el Inicio (nunca un rebote).
  assert.equal(puestoDe("RECEPTION", true, []), null);
});

const ESPACIOS: EspacioDeNav[] = [
  {
    id: "mostrador",
    nombre: "Mostrador",
    rotulo: "Mostrador",
    icono: "vender",
    apps: [
      { id: "vender", nombre: "Vender", ruta: "/admin/vender", icono: "vender" },
      { id: "pedidos", nombre: "Pedidos para preparar", ruta: "/admin/pedidos", icono: "pedidos" },
    ],
  },
  { id: "caja", nombre: "Caja", rotulo: "Caja", icono: "caja", apps: [{ id: "caja-del-dia", nombre: "Caja del día", ruta: "/admin/caja", icono: "caja" }, { id: "cierre-del-dia", nombre: "Cierre del día", ruta: "/admin/caja/cierre", icono: "cierre" }] },
  { id: "numeros", nombre: "Números del negocio", rotulo: "Números", icono: "reportes", apps: [{ id: "reportes", nombre: "Reportes", ruta: "/admin/reportes", icono: "reportes" }] },
];

test("dónde estoy: la app de ruta más larga que cubre la pantalla, con su espacio", () => {
  assert.equal(dondeEstoy("/admin/caja/cierre", ESPACIOS)?.app.id, "cierre-del-dia");
  assert.equal(dondeEstoy("/admin/caja/cierre/", ESPACIOS)?.espacio.id, "caja");
  assert.equal(dondeEstoy("/admin/pedidos/ord_12?x=1", ESPACIOS)?.app.nombre, "Pedidos para preparar");
  assert.equal(dondeEstoy("/admin/cajas", ESPACIOS), null, "por segmento, no por prefijo de texto");
  assert.equal(dondeEstoy("/admin", ESPACIOS), null);
});

test("el título del celular es la app (nunca «Panel»); en el Inicio, «Inicio»; en la página del espacio, el espacio", () => {
  assert.equal(tituloDePantalla("/admin/vender", null, ESPACIOS, "MAGRA"), "Vender");
  assert.equal(tituloDePantalla("/admin", null, ESPACIOS, "MAGRA"), "Inicio");
  assert.equal(tituloDePantalla("/admin", "caja", ESPACIOS, "MAGRA"), "Caja");
  assert.equal(tituloDePantalla("/admin", "inventado", ESPACIOS, "MAGRA"), "Inicio");
  assert.equal(tituloDePantalla("/admin/algo-interno", null, ESPACIOS, "MAGRA"), "MAGRA");
  assert.equal(espacioPedido("/admin/caja", "caja", ESPACIOS), null, "sólo en el Inicio");
});

test("un espacio de una sola app es un acceso directo; el resto abre su página", () => {
  assert.equal(hrefDelEspacio(ESPACIOS[2]), "/admin/reportes");
  assert.equal(hrefDelEspacio(ESPACIOS[1]), "/admin?espacio=caja");
  assert.equal(iniciales("Martín Aguirre"), "MA");
  assert.equal(iniciales("Cecilia"), "CE");
  assert.equal(iniciales("  "), "·");
});
