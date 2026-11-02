// CH no tiene Ventas del día (UAT venta de productos, F.2): ningún texto de su mostrador puede mandar
// ahí. Los demás rubros siguen leyendo lo mismo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sinVentasDelDia } from "@/lib/palabras-del-negocio";
import { vocabularioDelNegocio } from "@/lib/vocabulario-negocio";
import { getRetailRubro } from "@/blueprints/retail/rubros";
import { validarLineaAMano } from "@/lib/venta-reglas";
import { motivoSinFactura } from "./factura-del-mostrador";
import {
  avisoAntesDeEmpezarDeNuevo,
  avisoDeCambioDespuesDelCorte,
  avisoDeDudaDeOtraPersona,
  avisoDeDudaIlegible,
  rechazoDelServidor,
} from "./cobro-sin-conexion";

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("la factura en CH: la hace la dueña, sin mandar a una pantalla que no tiene", () => {
  const texto = motivoSinFactura({ puedeFacturar: false, rolFactura: false });
  assert.match(texto ?? "", /Ventas del día/, "los demás rubros siguen igual");
  assert.equal(sinVentasDelDia(texto ?? ""), "La factura de esta venta la hace la dueña.");
  assert.doesNotMatch(fuente("./MostradorDeVenta.tsx"), /sinFactura: motivoSinFactura/);
});

test("ningún aviso del cobro nombra Ventas del día en CH", () => {
  const manual = validarLineaAMano({ nombre: "Vela", importe: "100", motivo: "" });
  const textos = [
    avisoAntesDeEmpezarDeNuevo(),
    avisoDeCambioDespuesDelCorte("$ 100").comoSeguir,
    avisoDeDudaDeOtraPersona("2026-11-01T10:00:00Z").comoSeguir,
    avisoDeDudaIlegible(null).comoSeguir,
    rechazoDelServidor("No.", false, true).comoSeguir,
    manual.ok ? "" : manual.error,
  ];
  for (const t of textos) {
    assert.match(t, /Ventas del día/, t);
    assert.doesNotMatch(sinVentasDelDia(t), /Ventas del día/, t);
  }
  assert.match(sinVentasDelDia(avisoAntesDeEmpezarDeNuevo()), /fijate en Vender, en «Cerrados» si la venta se grabó/);
});

test("el mostrador pasa por ese filtro, y su enlace no lleva a Ventas del día", () => {
  const nucleo = fuente("./nucleo-de-venta.tsx");
  for (const lugar of [
    "enEsteNegocio(aviso.comoSeguir)",
    "enEsteNegocio(aviso.titulo)",
    "enEsteNegocio(avisoAntesDeEmpezarDeNuevo(isOrder))",
    "enEsteNegocio(avisoDeDudaIlegible(dudaIlegible.desde).comoSeguir)",
    "enEsteNegocio(avisoDeDudaDeOtraPersona(dudaAjena).comoSeguir)",
    "enEsteNegocio(v.error)",
  ]) {
    assert.ok(nucleo.includes(lugar), lugar);
  }
  assert.match(nucleo, /sinVentasDelDia \? "\/admin\/pedidos\?estado=cerrados" : "\/admin\/ventas"/);
});

test("el código de la dueña: un negocio sin rubro de mostrador no la nombra; un comercio, sí", () => {
  assert.equal(vocabularioDelNegocio(null).conVentasDelDia, false);
  assert.equal(vocabularioDelNegocio(getRetailRubro("carniceria")).conVentasDelDia, true);
  for (const f of ["../pedidos/AnularDelPedido.tsx", "../pedidos/AnularPedidoForm.tsx", "../pedidos/TableroPedidos.tsx"]) {
    assert.match(fuente(f), /conVentasDelDia \? "Ventas del día o Pedidos" : "esta pantalla"/, f);
  }
});
