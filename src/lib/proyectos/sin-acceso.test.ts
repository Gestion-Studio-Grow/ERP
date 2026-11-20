// MIA-194 · punto 1 (recorrido MIA-193): quien no puede abrir Cuentas a cobrar, Cuentas a pagar o Flujo dentro del panel de la
// productora vuelve a Inicio CON un aviso que dice qué app y por qué, no con un rebote mudo. Esperados escritos a mano.
import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoSinAcceso, textoSinAcceso } from "./puerta-de-gestion";

test("el destino lleva la app pedida; sin app (o con una rara), Inicio a secas", () => {
  assert.equal(destinoSinAcceso("cuentas-a-cobrar"), "/admin/proyectos/inicio?sin-acceso=cuentas-a-cobrar");
  assert.equal(destinoSinAcceso("flujo-de-fondos"), "/admin/proyectos/inicio?sin-acceso=flujo-de-fondos");
  assert.equal(destinoSinAcceso(null), "/admin/proyectos/inicio");
  assert.equal(destinoSinAcceso("a&b=c"), "/admin/proyectos/inicio?sin-acceso=a%26b%3Dc");
});

test("el texto dice qué app y por qué: rol de Proyectos o app sin prender en el negocio", () => {
  assert.equal(
    textoSinAcceso({ id: "cuentas-a-cobrar", nombre: "Cuentas a cobrar" }, "rol"),
    "No pudiste abrir «Cuentas a cobrar»: se abre con «Cuentas, cashflow y bancos» en tu rol de Proyectos. Pedíselo a Dirección.",
  );
  assert.equal(
    textoSinAcceso({ id: "cuentas-a-pagar", nombre: "Cuentas a pagar" }, "no-prendida"),
    "No pudiste abrir «Cuentas a pagar»: todavía no está prendida en este negocio. Pedile a GSG que la prenda.",
  );
  // Otra app del panel que el rol no abre: no se nombra el permiso de Empresa.
  assert.equal(
    textoSinAcceso({ id: "gestion-diseno", nombre: "Diseño" }, "rol"),
    "No pudiste abrir «Diseño»: tu rol de Proyectos no la abre. Si la necesitás, pedíselo a Dirección.",
  );
  // Una app que no es del registro (link escrito a mano): no se inventa el nombre ni se muestra nada.
  assert.equal(textoSinAcceso(null, "rol"), null);
});
