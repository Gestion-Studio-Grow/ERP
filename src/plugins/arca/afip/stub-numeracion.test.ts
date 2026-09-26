// QA 26/09, bloqueante 3: el modo prueba (stub) contestaba siempre «número 1, CAE STUB00000001»
// porque cada pedido arma un stub nuevo sin memoria. Con lo que el negocio ya tiene autorizado
// (`ultimoEmitido`), sigue la numeración como ARCA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { StubAfipClient } from "./stub";
import { crearAfipClient } from "./factory";
import { comprobanteDePrueba } from "./prueba";

test("un stub nuevo sigue la numeración guardada del negocio (no vuelve al 1)", async () => {
  const guardado = new Map<string, number>([["2:11", 7]]);
  const ultimoEmitido = async (pv: number, tipo: number) => guardado.get(`${pv}:${tipo}`) ?? 0;
  const stub = new StubAfipClient({ cuit: 20111111112, homologacion: true }, undefined, ultimoEmitido);
  assert.equal(await stub.ultimoAutorizado(2, 11), 7);
  const r = await stub.solicitarCae(comprobanteDePrueba({ puntoVenta: 2 }));
  assert.equal(r.numero, 8);
  assert.equal(r.cae, "STUB00000008");
  // Otro punto de venta arranca de lo suyo.
  assert.equal(await stub.ultimoAutorizado(3, 11), 0);
});

test("la fábrica le pasa al stub lo guardado; sin eso, el stub cuenta sólo en memoria", async () => {
  const conGuardado = crearAfipClient({ cuit: 20111111112, homologacion: true }, { env: {}, ultimoEmitido: async () => 41 });
  assert.equal((await conGuardado.solicitarCae(comprobanteDePrueba({ puntoVenta: 1 }))).numero, 42);
  const soloMemoria = crearAfipClient({ cuit: 20111111112, homologacion: true }, { env: {} });
  assert.equal((await soloMemoria.solicitarCae(comprobanteDePrueba({ puntoVenta: 1 }))).numero, 1);
});
