// Lo que expone `cobro-sin-conexion.ts` para la tarjeta del protocolo (2E): sólo LEE; no cambia
// ninguna regla del cobro (esas las fija cobro-sin-conexion.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VENCE_LA_DUDA_MS,
  claveDelAlmacen,
  estadoDeLaSenal,
  guardarCobroSinConfirmar,
  hayCobroSinConfirmar,
  hayConexion,
  suscribirseALaSenal,
  type AlmacenDeSesion,
} from "../cobro-sin-conexion";

function almacen(): AlmacenDeSesion & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

test("hayCobroSinConfirmar: la duda de este negocio (propia, de otra persona o ilegible) cuenta; la vencida y la de otro negocio no", () => {
  const a = almacen();
  const ahora = Date.parse("2026-10-24T14:00:00.000Z");
  assert.equal(hayCobroSinConfirmar(a, "tnt_a", ahora), false);
  assert.equal(hayCobroSinConfirmar(null, "tnt_a", ahora), false);
  const desde = new Date(ahora - 60_000).toISOString();
  assert.ok(
    guardarCobroSinConfirmar(a, "tnt_a", {
      v: 3,
      clave: "k1",
      firma: "f",
      total: 1000,
      desde,
      usuario: "usr_1",
      cargado: {
        esPedido: false,
        lineas: [],
        manuales: [],
        paid: true,
        medio: "EFECTIVO",
        aCuenta: false,
        conCliente: false,
        telefono: "",
        nombre: "",
        fichaEncontrada: false,
        descuento: { abierto: false, tipo: "porcentaje", texto: "", cupon: null, cuponTexto: "" },
        entrega: { tipo: "PICKUP", horario: "", direccion: "", nota: "" },
      },
    }),
  );
  assert.equal(hayCobroSinConfirmar(a, "tnt_a", ahora), true);
  assert.equal(hayCobroSinConfirmar(a, "tnt_b", ahora), false, "por negocio");
  assert.deepEqual(estadoDeLaSenal(false, a, "tnt_a", ahora), { sinSenal: true, cobroSinConfirmar: true });
  a.datos.set(claveDelAlmacen("tnt_a"), "{roto");
  assert.equal(hayCobroSinConfirmar(a, "tnt_a", ahora), true, "la ilegible no se calla");
  a.datos.set(claveDelAlmacen("tnt_a"), JSON.stringify({ v: 3, usuario: "x", desde: new Date(ahora - VENCE_LA_DUDA_MS - 1).toISOString() }));
  assert.equal(hayCobroSinConfirmar(a, "tnt_a", ahora), false, "la vencida no cuenta");
});

test("sin navegador: hay conexión (no se inventa un corte) y la suscripción no hace nada", () => {
  assert.equal(hayConexion(), true);
  const desuscribir = suscribirseALaSenal(() => assert.fail("no hay ventana que avise"));
  desuscribir();
  assert.deepEqual(estadoDeLaSenal(true, null, "tnt_a"), { sinSenal: false, cobroSinConfirmar: false });
});
