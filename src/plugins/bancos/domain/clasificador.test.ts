// Tests del clasificador bancario: créditos facturables vs comisiones,
// impuestos (SIRCREB, ley 25413), transferencias propias, reversos, préstamos
// y débitos genéricos; config por tenant y aprendizaje de correcciones.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { MovimientoBancario } from "../core-contract";
import {
  AprendizajeBancoEnMemoria,
  ClasificadorBancarioPorReglas,
  registrarCorreccionBanco,
} from "./clasificador";

let seq = 0;
function mov(over: Partial<MovimientoBancario> = {}): MovimientoBancario {
  return {
    id: `mov-${++seq}`,
    fecha: "20260705",
    monto: 1500,
    descripcion: "Transferencia recibida",
    origen: "banco",
    ...over,
  };
}

const clasificador = new ClasificadorBancarioPorReglas();

test("crédito acreditado es venta facturable", async () => {
  const r = await clasificador.clasificar(mov(), "t-1");
  assert.equal(r.clasificacion, "FACTURABLE");
  assert.equal(r.reglaId, "credito-venta");
});

test("débito genérico (egreso) no se factura", async () => {
  const r = await clasificador.clasificar(mov({ monto: -2000, descripcion: "Pago a proveedor" }), "t-1");
  assert.equal(r.clasificacion, "NO_FACTURABLE");
  assert.equal(r.reglaId, "debito-egreso");
});

test("comisiones e impuestos bancarios se marcan con su motivo específico", async () => {
  const casos = [
    "Comisión mantenimiento de cuenta",
    "IVA 21% s/comisión",
    "IMP. DEB. LEY 25413",
    "SIRCREB Ingresos Brutos",
    "Percepción IIBB",
  ];
  for (const descripcion of casos) {
    const r = await clasificador.clasificar(mov({ monto: -500, descripcion }), "t-1");
    assert.equal(r.clasificacion, "NO_FACTURABLE", descripcion);
    assert.equal(r.reglaId, "comision-impuesto", descripcion);
  }
});

test("un crédito cuya leyenda menciona IVA NO cae en comisión-impuesto", async () => {
  const r = await clasificador.clasificar(mov({ monto: 5000, descripcion: "Venta con IVA incluido" }), "t-1");
  assert.equal(r.clasificacion, "FACTURABLE");
});

test("transferencia entre cuentas propias no es venta", async () => {
  const r = await clasificador.clasificar(
    mov({ monto: 300000, descripcion: "Transferencia entre cuentas propias" }),
    "t-1",
  );
  assert.equal(r.clasificacion, "NO_FACTURABLE");
  assert.equal(r.reglaId, "transferencia-propia");
});

test("CUIT propio en la contraparte (config) no es venta", async () => {
  const conConfig = new ClasificadorBancarioPorReglas({
    config: { cuitsPropios: ["20-11111111-1"] },
  });
  const r = await conConfig.clasificar(
    mov({ monto: 100000, contraparte: "COMERCIO EJEMPLO SRL CUIT 20-11111111-1" }),
    "t-1",
  );
  assert.equal(r.clasificacion, "NO_FACTURABLE");
  assert.equal(r.reglaId, "cuenta-propia");
});

test("contraasientos, reversos y devoluciones no son venta (aunque sean crédito)", async () => {
  for (const descripcion of ["Contraasiento débito", "Reverso de transferencia", "Devolución de compra"]) {
    const r = await clasificador.clasificar(mov({ monto: 900, descripcion }), "t-1");
    assert.equal(r.clasificacion, "NO_FACTURABLE", descripcion);
    assert.equal(r.reglaId, "contraasiento-reverso", descripcion);
  }
});

test("préstamos y plazos fijos acreditados no son venta", async () => {
  for (const descripcion of ["Préstamo personal acreditado", "Acreditación de plazo fijo"]) {
    const r = await clasificador.clasificar(mov({ monto: 500000, descripcion }), "t-1");
    assert.equal(r.clasificacion, "NO_FACTURABLE", descripcion);
    assert.equal(r.reglaId, "prestamo-plazo-fijo", descripcion);
  }
});

test("movimiento sin monto no se factura", async () => {
  const r = await clasificador.clasificar(mov({ monto: 0 }), "t-1");
  assert.equal(r.clasificacion, "NO_FACTURABLE");
});

test("reglas extra del tenant se evalúan antes que las default", async () => {
  const conExtra = new ClasificadorBancarioPorReglas({
    config: {
      reglasExtra: [
        {
          id: "alquiler-cobrado",
          descripcion: "El alquiler cobrado no se factura por acá.",
          cuando: (m) => m.descripcion.toLowerCase().includes("alquiler"),
          clasificacion: "NO_FACTURABLE",
        },
      ],
    },
  });
  const r = await conExtra.clasificar(mov({ monto: 200000, descripcion: "Alquiler local julio" }), "t-1");
  assert.equal(r.reglaId, "alquiler-cobrado");
});

test("aprendizaje: una corrección se recuerda y pisa a las reglas", async () => {
  const aprendizaje = new AprendizajeBancoEnMemoria();
  const conAprendizaje = new ClasificadorBancarioPorReglas({ aprendizaje });

  const patron = mov({ monto: 3000, descripcion: "ACRED. HABERES SUELDO" });
  const antes = await conAprendizaje.clasificar(patron, "t-1");
  assert.equal(antes.clasificacion, "FACTURABLE"); // crédito genérico

  // El usuario lo marca "no facturable" → se aprende por descripción.
  await registrarCorreccionBanco(aprendizaje, patron, "NO_FACTURABLE");
  const despues = await conAprendizaje.clasificar(
    mov({ monto: 3100, descripcion: "acred. haberes sueldo" }),
    "t-1",
  );
  assert.equal(despues.clasificacion, "NO_FACTURABLE");
  assert.equal(despues.aprendido, true);
});

test("aprendizaje por contraparte tiene prioridad", async () => {
  const aprendizaje = new AprendizajeBancoEnMemoria();
  const conAprendizaje = new ClasificadorBancarioPorReglas({ aprendizaje });

  const patron = mov({ contraparte: "CUIT 27-22222222-2", descripcion: "Transferencia recibida" });
  await registrarCorreccionBanco(aprendizaje, patron, "NO_FACTURABLE");

  const r = await conAprendizaje.clasificar(
    mov({ contraparte: "CUIT 27-22222222-2", descripcion: "Otra transferencia" }),
    "t-1",
  );
  assert.equal(r.clasificacion, "NO_FACTURABLE");
  assert.equal(r.aprendido, true);
});
