// La factura en el mostrador: consumidor final por defecto, el umbral sale de la tabla de vigencias
// (no se inventa), el texto no manda a cargar el CUIT donde no hay campo (MG-018), y el tilde
// «Facturar al cobrar» no se deja tildar con un CUIT que no cierra (MG-016).
import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoFacturarAlCobrar, motivoSinFactura, textoDelReceptor } from "./factura-del-mostrador";
import { UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, vigenteEn } from "@/lib/fiscal/vigencias";
import { leerDocumento } from "@/lib/clientes/buscar-para-venta-core";

const umbral = vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, "2026-10-20")?.valor ?? null;

test("la factura sale a consumidor final y el umbral de identificación es el de la tabla vigente", () => {
  assert.equal(umbral, 10_000_000, "RG ARCA 5700/2025 (src/lib/fiscal/vigencias.ts)");
  for (const conDocumento of [false, true]) {
    const t = textoDelReceptor(umbral, "cliente", { conDocumento });
    assert.match(t, /^Sale a consumidor final\./);
    assert.match(t, /la factura a su nombre, o la venta llega a \$\s?10\.000\.000/);
    // Ni «A» ni «B»: la letra depende de la condición del emisor (un monotributista hace C).
    assert.doesNotMatch(t, /factura [AB]\b/);
  }
  // Sin umbral conocido no se inventa uno.
  assert.doesNotMatch(textoDelReceptor(null), /llega a/);
  assert.doesNotMatch(textoDelReceptor(null, "cliente", { conDocumento: true }), /llega a/);
});

test("con el bloque de siempre (sin campo de CUIT) el texto no manda a cargarlo en «Cliente»", () => {
  const t = textoDelReceptor(umbral);
  assert.doesNotMatch(t, /CUIT o DNI en «Cliente»/, "el bloque de siempre no tiene ese campo");
  assert.match(t, /buscá su ficha por teléfono en «Cliente» antes de cobrar/);
  assert.match(t, /se carga en su ficha, en «Datos para facturar»/);
  // En CH, con la palabra de la casa.
  assert.match(textoDelReceptor(umbral, "clienta"), /Si la clienta pide .* en «Clienta» antes de cobrar/);
});

test("con el bloque nuevo (ClienteDeLaVenta) el CUIT se carga en «Cliente» antes de cobrar", () => {
  assert.match(textoDelReceptor(umbral, "cliente", { conDocumento: true }), /CUIT o DNI en «Cliente» antes de cobrar/);
  assert.match(textoDelReceptor(umbral, "clienta", { conDocumento: true }), /CUIT o DNI en «Clienta» antes de cobrar/);
});

test("sin «Facturar»: el porqué depende de si falta el permiso o la facturación del negocio", () => {
  assert.equal(motivoSinFactura({ puedeFacturar: true, rolFactura: true }), null);
  assert.match(motivoSinFactura({ puedeFacturar: false, rolFactura: false }) ?? "", /la hace el dueño, desde Ventas del día/);
  assert.match(motivoSinFactura({ puedeFacturar: false, rolFactura: true }) ?? "", /todavía no factura desde el sistema/);
});

test("MG-018: el Mostrador con el CUIT cargado lee que la factura la hace el dueño y el CUIT ya quedó", () => {
  const conCuit = motivoSinFactura({
    puedeFacturar: false,
    rolFactura: false,
    conDocumento: true,
    documento: { estado: "valido", enFicha: true, nombre: "CUIT" },
  });
  assert.equal(conCuit, "La factura la hace el dueño desde Ventas del día; el CUIT ya quedó en la venta.");
  // Sin CUIT todavía, y con el campo a la vista: se lo manda a ESTE bloque, que lo tiene.
  assert.match(
    motivoSinFactura({ puedeFacturar: false, rolFactura: false, conDocumento: true, documento: { estado: "vacio" } }) ?? "",
    /cargá el CUIT acá para que salga a su nombre/,
  );
  // Con el bloque de siempre, no se lo manda a ningún campo.
  assert.doesNotMatch(motivoSinFactura({ puedeFacturar: false, rolFactura: false }) ?? "", /cargá/);
});

test("MG-016: con un CUIT que no cierra no se deja tildar «Facturar al cobrar»", () => {
  const mal = leerDocumento("27123456789"); // el verificador de 27-12345678 es 0, no 9
  assert.equal(mal.estado, "invalido");
  const e = estadoFacturarAlCobrar({
    puedeFacturar: true,
    rolFactura: true,
    documento: mal.estado === "invalido" ? mal : { estado: "vacio" },
  });
  assert.equal(e.habilitado, false);
  assert.match(e.motivo ?? "", /^Ese CUIT no cierra: revisá el último número/);
});

test("«Facturar al cobrar»: sin documento sale a consumidor final; con CUIT, una vez guardado en la ficha", () => {
  const dueno = { puedeFacturar: true, rolFactura: true };
  const vacio = estadoFacturarAlCobrar({ ...dueno, documento: { estado: "vacio" } });
  assert.equal(vacio.habilitado, true);
  assert.match(vacio.motivo ?? "", /consumidor final/);

  const sinGuardar = estadoFacturarAlCobrar({ ...dueno, documento: { estado: "valido", enFicha: false } });
  assert.equal(sinGuardar.habilitado, false);
  assert.match(sinGuardar.motivo ?? "", /Guardá los datos para facturar/);

  assert.deepEqual(estadoFacturarAlCobrar({ ...dueno, documento: { estado: "valido", enFicha: true } }), { habilitado: true, motivo: null });

  // El Mostrador no tilda: la factura la hace el dueño (MG-018).
  const mostrador = estadoFacturarAlCobrar({ puedeFacturar: false, rolFactura: false, documento: { estado: "valido", enFicha: true } });
  assert.equal(mostrador.habilitado, false);
  assert.match(mostrador.motivo ?? "", /el CUIT ya quedó en la venta/);
});
