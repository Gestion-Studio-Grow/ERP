import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCIONES_SIN_TEXTO, buscarComandos, resaltar, type Comando } from "./comandos-core";
import type { GrupoDeRegistros } from "@/lib/buscador/registros-core";

const C = (id: string, grupo: Comando["grupo"], nombre: string, extra: Partial<Comando> = {}): Comando => ({ id, grupo, nombre, href: `/admin/${id}`, ...extra });

const COMANDOS: Comando[] = [
  C("vender", "acciones", "Vender", { alias: ["cobrar", "ticket"] }),
  C("cerrar-dia", "acciones", "Cerrar el día", { alias: ["arqueo"] }),
  C("merma", "acciones", "Cargar una merma", { segunda: "Mermas" }),
  C("a1", "acciones", "Abrir la caja"),
  C("a2", "acciones", "Contar un producto"),
  C("a3", "acciones", "Recibir mercadería"),
  C("a4", "acciones", "Aumentar precios"),
  C("caja", "apps", "Caja del día", { segunda: "Caja" }),
  C("catalogo", "apps", "Catálogo", { segunda: "Catálogo y precios" }),
  C("facturacion", "apps", "Facturación", { alias: ["afip", "arca"] }),
];

test("sin texto: las primeras acciones y todas las apps, en ese orden", () => {
  const r = buscarComandos(COMANDOS, "");
  assert.deepEqual(r.grupos.map((g) => g.nombre), ["Acciones", "Apps"]);
  assert.equal(r.grupos[0].items.length, ACCIONES_SIN_TEXTO);
  assert.equal(r.grupos[1].items.length, 3);
  assert.equal(r.plano[0].id, "vender");
});

test("con texto: acciones primero, después apps; «ca» trae Cargar una merma y Caja/Catálogo", () => {
  const r = buscarComandos(COMANDOS, "ca");
  assert.deepEqual(r.grupos.map((g) => g.grupo), ["acciones", "apps"]);
  assert.equal(r.grupos[0].items[0].id, "merma");
  // Con dos letras, Facturación (la contiene en el medio) ya no entra: ver la poda más abajo.
  assert.deepEqual(r.grupos[1].items.map((c) => c.id), ["caja", "catalogo"]);
  assert.deepEqual(buscarComandos(COMANDOS, "tur").plano.map((c) => c.id), ["facturacion"]);
  // Por palabra de búsqueda: «arqueo» encuentra Cerrar el día; «afip», Facturación.
  assert.deepEqual(buscarComandos(COMANDOS, "arqueo").plano.map((c) => c.id), ["cerrar-dia"]);
  assert.deepEqual(buscarComandos(COMANDOS, "AFIP").plano.map((c) => c.id), ["facturacion"]);
  // Nada: sin grupos (la paleta dice qué pasa).
  assert.deepEqual(buscarComandos(COMANDOS, "zzz").grupos, []);
});

test("resaltar marca lo tipeado sin tildes ni mayúsculas, en las posiciones del nombre", () => {
  assert.deepEqual(resaltar("Catálogo", "cata"), { antes: "", coincide: "Catá", despues: "logo" });
  assert.deepEqual(resaltar("Cerrar el día", "DIA"), { antes: "Cerrar el ", coincide: "día", despues: "" });
  assert.equal(resaltar("Facturación", "afip"), null);
  assert.equal(resaltar("Caja", ""), null);
});

test("la paleta poda lo flojo: una palabra de búsqueda cuenta si EMPIEZA con lo tipeado; con dos letras, el nombre también", () => {
  const cs: Comando[] = [
    C("pedido", "acciones", "Tomar un pedido", { alias: ["encargo", "envío"] }),
    C("cierre", "acciones", "Cerrar el día", { alias: ["arqueo", "cerrar la caja"] }),
    C("recibir", "acciones", "Recibir mercadería"),
    C("caja", "apps", "Caja del día"),
  ];
  // «ca»: «en-ca-rgo» y «mer-ca-dería» no; «cerrar la caja» sí (una palabra empieza con «ca»).
  assert.deepEqual(buscarComandos(cs, "ca").plano.map((c) => c.id), ["cierre", "caja"]);
  // Con tres letras, lo contenido en el nombre vuelve a valer («cad» → mercadería).
  assert.deepEqual(buscarComandos(cs, "cad").plano.map((c) => c.id), ["recibir"]);
  // Una palabra de búsqueda a medio escribir sigue encontrando («enc» → encargo).
  assert.deepEqual(buscarComandos(cs, "enc").plano.map((c) => c.id), ["pedido"]);
});

// ── La capa REGISTROS (R6-F2): llega ya filtrada y ordenada del servidor ──

const REGISTROS: GrupoDeRegistros[] = [
  { grupo: "clientes", nombre: "Clientes", items: [{ id: "cliente-1", grupo: "clientes", nombre: "Carla Díaz", segunda: "11 5555-2271", href: "/admin/clientes/1" }] },
  { grupo: "pedidos", nombre: "Pedidos", items: [{ id: "pedido-9", grupo: "pedidos", nombre: "Pedido #12", segunda: "Abierto", href: "/admin/pedidos?pedido=9" }] },
];

test("registros: van después de acciones y apps, tal como llegan (no se vuelven a filtrar), con su ícono", () => {
  // «ca» encuentra Carla por el nombre, pero «2271» la encontró el servidor por el teléfono: no se descarta.
  const r = buscarComandos(COMANDOS, "ca", REGISTROS);
  assert.deepEqual(r.grupos.map((g) => g.grupo), ["acciones", "apps", "clientes", "pedidos"]);
  assert.deepEqual(r.grupos.map((g) => g.nombre).slice(2), ["Clientes", "Pedidos"]);
  assert.deepEqual(r.plano.slice(-2).map((c) => c.id), ["cliente-1", "pedido-9"]);
  assert.deepEqual(r.plano.slice(-2).map((c) => c.icono), ["clientes", "pedidos"]);
  const porTelefono = buscarComandos(COMANDOS, "2271", REGISTROS.slice(0, 1));
  assert.deepEqual(porTelefono.plano.map((c) => c.id), ["cliente-1"]);
});

test("registros: sin texto no se muestran (la paleta vacía es la de siempre)", () => {
  assert.deepEqual(buscarComandos(COMANDOS, "  ", REGISTROS).grupos.map((g) => g.grupo), ["acciones", "apps"]);
});
