import { test } from "node:test";
import assert from "node:assert/strict";
import {
  busquedaDeLinks,
  cantidadDelFiltro,
  leerFiltrosLinks,
  paginasDeLinks,
  totalesLinksVacios,
  urlDeLinks,
} from "./links-core";

test("la lista de links lee búsqueda, estado y página de la URL; lo que no entiende lo ignora", () => {
  assert.deepEqual(leerFiltrosLinks({}), { q: "", estado: null, pagina: 1 });
  assert.deepEqual(leerFiltrosLinks({ q: "  seña  ", estado: "pagado", pagina: "3" }), { q: "seña", estado: "pagado", pagina: 3 });
  assert.deepEqual(leerFiltrosLinks({ estado: "vencido", pagina: "-2" }), { q: "", estado: null, pagina: 1 });
  assert.equal(leerFiltrosLinks({ q: "x".repeat(200) }).q.length, 80);
});

test("la URL de la lista queda en la pestaña de links y cambiar el filtro vuelve a la página 1", () => {
  const f = { q: "seña", estado: "pendiente" as const, pagina: 4 };
  assert.equal(urlDeLinks(f), "/admin/facturacion?vista=cobrar-con-link&q=se%C3%B1a&estado=pendiente&pagina=4");
  assert.equal(urlDeLinks(f, { estado: "pagado" }), "/admin/facturacion?vista=cobrar-con-link&q=se%C3%B1a&estado=pagado");
  assert.equal(urlDeLinks(f, { pagina: 5 }), "/admin/facturacion?vista=cobrar-con-link&q=se%C3%B1a&estado=pendiente&pagina=5");
  assert.equal(urlDeLinks({ q: "", estado: null, pagina: 1 }), "/admin/facturacion?vista=cobrar-con-link");
});

test("buscar un número encuentra el pedido; buscar plata escrita como acá encuentra el importe exacto", () => {
  assert.deepEqual(busquedaDeLinks(""), { texto: null, pedido: null, importe: null });
  assert.deepEqual(busquedaDeLinks("#1234"), { texto: "#1234", pedido: 1234, importe: null });
  assert.deepEqual(busquedaDeLinks("1234"), { texto: "1234", pedido: 1234, importe: 1234 });
  assert.deepEqual(busquedaDeLinks("12.500,50"), { texto: "12.500,50", pedido: null, importe: 12500.5 });
  assert.deepEqual(busquedaDeLinks("$ 800"), { texto: "$ 800", pedido: null, importe: 800 });
  assert.deepEqual(busquedaDeLinks("Seña de Marta"), { texto: "Seña de Marta", pedido: null, importe: null });
});

test("las páginas salen de la cantidad del estado elegido, no del total", () => {
  const t = totalesLinksVacios();
  t.cantidad = 120;
  t.porEstado.pagado = { cantidad: 30, importe: 1000 };
  t.porEstado.pendiente = { cantidad: 90, importe: 5000 };
  assert.equal(cantidadDelFiltro(t, null), 120);
  assert.equal(cantidadDelFiltro(t, "pagado"), 30);
  assert.equal(paginasDeLinks(cantidadDelFiltro(t, null)), 3);
  assert.equal(paginasDeLinks(cantidadDelFiltro(t, "anulado")), 1);
});
