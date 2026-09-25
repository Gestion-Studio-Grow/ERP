// Los diez espacios de la navegación (diseño v3, ARQUITECTURA §5.2) con el registro REAL: ninguna app
// se pierde ni aparece dos veces, cada deuda va al lado de su contraparte, «Facturas e impuestos» es
// exactamente lo argentino y ningún espacio pasa de 8 apps por rubro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRO_APPS } from "./registro";
import { ESPACIOS, ESPACIOS_NAV, MODULOS_AR, espacioNavDeApp, nombreDeEspacioNav, type EspacioNavId } from "./espacios";

const enNav = REGISTRO_APPS.filter((a) => espacioNavDeApp(a) !== null);

test("diez espacios, en el orden de la pantalla, sin apps repetidas entre listas", () => {
  assert.deepEqual(
    ESPACIOS_NAV.map((e) => e.id),
    ["mostrador", "caja", "locales", "clientes", "precios", "stock", "compras", "facturacion", "numeros", "administracion"],
  );
  const listadas = ESPACIOS_NAV.flatMap((e) => e.apps);
  assert.equal(new Set(listadas).size, listadas.length, "una app figura en dos espacios");
});

test("toda app de un estante del Inicio tiene un espacio de la navegación; el Inicio y la consola, ninguno", () => {
  const enInicio = new Set(ESPACIOS.filter((e) => e.enInicio).map((e) => e.id));
  for (const app of REGISTRO_APPS) {
    const nav = espacioNavDeApp(app);
    if (enInicio.has(app.espacio)) assert.ok(nav, `${app.id} no tiene espacio en la navegación`);
    else assert.equal(nav, null, `${app.id} (${app.espacio}) no se navega`);
  }
  // Y toda app registrada figura en la lista de su espacio (el orden no queda librado al registro).
  for (const app of enNav) {
    const nav = espacioNavDeApp(app) as EspacioNavId;
    assert.ok(ESPACIOS_NAV.find((e) => e.id === nav)?.apps.includes(app.id), `${app.id} no está ordenada en ${nav}`);
  }
});

test("cada deuda al lado de su contraparte y el cierre del mes con los del día (A1)", () => {
  const donde = (id: string) => espacioNavDeApp(REGISTRO_APPS.find((a) => a.id === id)!);
  assert.equal(donde("cierre-del-mes"), "caja");
  assert.equal(donde("cuentas-a-cobrar"), "clientes");
  assert.equal(donde("cuentas-a-pagar"), "compras");
  for (const id of ["recibir-mercaderia", "proveedores", "sugerido-de-compra", "devoluciones-a-proveedor"]) assert.equal(donde(id), "compras", id);
  for (const id of ["reportes", "margen", "resultado-del-mes", "flujo-de-fondos", "comisiones"]) assert.equal(donde(id), "numeros", id);
  for (const id of ["inventario", "recuento", "movimientos", "mermas"]) assert.equal(donde(id), "stock", id);
});

test("«Facturas e impuestos» tiene exactamente las apps de los módulos argentinos (A10)", () => {
  const ar = new Set(MODULOS_AR);
  for (const app of enNav) {
    const esAr = app.modulo !== null && app.modulo !== undefined && ar.has(app.modulo);
    assert.equal(espacioNavDeApp(app) === "facturacion", esAr, `${app.id} (${app.modulo ?? "núcleo"})`);
  }
});

test("ningún espacio pasa de 8 apps por rubro con el registro de hoy", () => {
  for (const rubro of ["mostrador", "servicios"] as const) {
    for (const e of ESPACIOS_NAV) {
      const n = enNav.filter(
        (a) => espacioNavDeApp(a) === e.id && (!a.rubro || a.rubro === rubro || (rubro === "mostrador" && a.rubro === "carniceria")),
      ).length;
      assert.ok(n <= 8, `${e.nombre} en ${rubro}: ${n} apps`);
    }
  }
});

test("el primer espacio se llama Recepción en servicios; los nombres no llevan siglas", () => {
  assert.equal(nombreDeEspacioNav("mostrador", { esMostrador: false }), "Recepción");
  assert.equal(nombreDeEspacioNav("mostrador", { esMostrador: true }), "Mostrador");
  for (const e of ESPACIOS_NAV) assert.ok(!/\b(ARCA|IVA|AFIP|ERP)\b/.test(e.nombre), e.nombre);
});
