// Antes del arreglo: cada pedido arma un stub nuevo (HEAD) y el tercer parámetro no existe.
import { StubAfipClient } from "./stub-HEAD";
import { comprobanteDePrueba } from "@/plugins/arca/afip/prueba";
for (const intento of [1, 2, 3]) {
  const stub = new (StubAfipClient as any)({ cuit: 20111111112, homologacion: true }, undefined, async () => 7);
  const r = await stub.solicitarCae(comprobanteDePrueba({ puntoVenta: 2 }));
  console.log(`pedido ${intento}: número ${r.numero}, CAE ${r.cae} (con 7 ya autorizadas, se esperaba ${7 + 1})`);
}
