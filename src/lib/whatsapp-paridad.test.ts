// PARIDAD DEL WHATSAPP (T3): el mismo número, cargado como sea, abre el mismo chat en la vidriera, en el aviso del pedido
// y en las confirmaciones de las tiendas. Antes cada una lo leía a su manera: «11-6677-8890» era EE. UU. en una de ellas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { jsonLdDeMagra } from "@/app/tienda/magra/magra-ld";
import { chatConElNumeroDelLocal, resolveMagraLocal } from "@/tenants/magra-content";
import { buildWhatsAppHref, sanitizePhone, whatsappCanonico } from "./whatsapp-cta";

const CARGADOS = ["11-6677-8890", "1166778890", "011 15-6677-8890", "+54 11 6677-8890", "+54 9 11 6677-8890", "5491166778890"];
const CHAT = "https://wa.me/5491166778890";
const fuente = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");
const base = { addressLine: null, city: null, hoursLabel: null, instagram: null, email: null };

for (const cargado of CARGADOS) {
  test(`«${cargado}» abre el mismo chat en todos lados`, () => {
    // El aviso del pedido (order-actions.ts, chatDelPedido) y la vidriera nueva (TiendaNueva): el canónico.
    const delPedido = buildWhatsAppHref(whatsappCanonico(cargado), "Hola");
    assert.equal(delPedido, `${CHAT}?text=Hola`);
    // MAGRA: su local y el chat que le arma al pedido.
    const local = resolveMagraLocal({ ...base, whatsapp: cargado });
    assert.equal(buildWhatsAppHref(local.whatsapp, "Hola"), delPedido);
    assert.equal(chatConElNumeroDelLocal(delPedido, local.whatsapp), delPedido);
    // Las confirmaciones de Shine y A Dos Manos (tienda/gracias).
    assert.equal(`https://wa.me/${sanitizePhone(cargado)}`, CHAT);
  });
}

test("el aviso del pedido y las vidrieras leen el número con el canónico", () => {
  assert.match(fuente("src/lib/order-actions.ts"), /const numero = whatsappCanonico\(bs\?\.whatsapp\)/);
  assert.match(fuente("src/app/tienda/vidriera/TiendaNueva.tsx"), /whatsappCanonico\(e\.branding\?\.whatsapp\)/);
});

test("el «+» del canónico no se duplica en lo que se publica", () => {
  assert.match(fuente("src/app/inmobiliaria/page.tsx"), /telephone: `\+\$\{negocio\.whatsapp\.replace\(\/\^\\\+\/, ""\)\}`/);
  const local = resolveMagraLocal({ ...base, whatsapp: "11-6677-8890" });
  assert.equal(`+${local.whatsapp}`, "+5491166778890");
  const [tienda] = jsonLdDeMagra("https://magra.gsgapp.com.ar", [], { ...base, whatsapp: "11-6677-8890" } as never);
  assert.equal(tienda.telephone, "+5491166778890");
  assert.equal(whatsappCanonico(whatsappCanonico("11-6677-8890")), "+5491166778890", "se puede volver a leer");
});

test("un número de relleno no se publica", () => {
  assert.equal(whatsappCanonico("+54 9 11 0000 0000"), "");
  assert.equal(resolveMagraLocal({ ...base, whatsapp: "+54 9 11 0000 0000" }).whatsapp, "");
});
