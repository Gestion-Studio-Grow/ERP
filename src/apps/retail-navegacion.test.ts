// UAT retail 07-08/11 (Magra, A Dos Manos, Shine): navegación y vocabulario de un comercio, y CH igual.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@/lib/capabilities";
import { menuDeModoSimple, RUTAS_DEL_MODO_SIMPLE } from "@/lib/admin-nav-items";
import { alcanzaParaBuscar, leerBusqueda } from "@/lib/buscador/registros-core";
import { mensajeWhatsAppDelPedido } from "@/app/tienda/reglas-tienda";
import { rubroVendePorPeso } from "@/blueprints/retail/rubros";
import { tablaDePermisos } from "@/app/admin/(dashboard)/usuarios/permisos-core";
import { appPorId } from "./registro";
import {
  appsVisibles,
  capacidadConApp,
  conVenderEnLaBarra,
  explicarNoDisponible,
  motivoNoDisponible,
  proyectarMenuDeHoy,
  type NegocioApps,
} from "./visibles";

const COMERCIO = ["pos", "catalog", "clients", "stock", "reports"];

function comercio(role: Role, over: Partial<NegocioApps> = {}): NegocioApps {
  return {
    role,
    contexto: { origen: "producto", modulos: new Set(COMERCIO) },
    modulosAsignados: COMERCIO,
    perfil: null,
    esMostrador: true,
    carniceriaLista: false,
    vendePorPeso: false,
    ...over,
  };
}
const ch = (role: Role): NegocioApps => ({ role, contexto: null, modulosAsignados: [], perfil: null, esMostrador: false, carniceriaLista: false });
const barra = (n: NegocioApps) => {
  const v = appsVisibles(n);
  return conVenderEnLaBarra(proyectarMenuDeHoy(v), v);
};

test("comercio: Vender delante de Pedidos y Ventas del día detrás, en la barra", () => {
  const hrefs = barra(comercio("OWNER")).map((i) => i.href);
  const p = hrefs.indexOf("/admin/pedidos");
  assert.ok(p > 0);
  assert.equal(hrefs[p - 1], "/admin/vender");
  assert.equal(hrefs[p + 1], "/admin/ventas");
});

test("CH (beauty-spa, sin asignación): la barra no cambia", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as Role[]) {
    const v = appsVisibles(ch(role));
    assert.deepEqual(conVenderEnLaBarra(proyectarMenuDeHoy(v), v), proyectarMenuDeHoy(v));
  }
});

test("modo simple: un comercio deja Pedidos y Vender; CH, Hoy, Agenda, Clientes y Caja", () => {
  const simple = menuDeModoSimple(barra(comercio("RECEPTION"))).map((i) => i.href);
  assert.deepEqual(simple, ["/admin", "/admin/pedidos", "/admin/vender", "/admin/caja", "/admin/clientes"]);
  const deCH = menuDeModoSimple(proyectarMenuDeHoy(appsVisibles(ch("RECEPTION")))).map((i) => i.href);
  assert.ok(deCH.every((h) => (RUTAS_DEL_MODO_SIMPLE as readonly string[]).includes(h)));
  assert.ok(deCH.includes("/admin/turnos"));
});

test("Balanza y lector: sólo en un rubro que vende por peso", () => {
  assert.equal(rubroVendePorPeso("padel"), false);
  assert.equal(rubroVendePorPeso("velas"), false);
  assert.equal(rubroVendePorPeso("carniceria"), true);
  assert.equal(rubroVendePorPeso(null), true);
  assert.ok(!appsVisibles(comercio("OWNER")).some((a) => a.id === "balanza"));
  assert.equal(motivoNoDisponible(appPorId("balanza"), comercio("OWNER")), "rubro");
  assert.match(explicarNoDisponible(appPorId("balanza"), "rubro", comercio("OWNER")).porque, /por peso/);
});

test("Usuarios: un «Sí» sólo si ese rol abre la pantalla en este negocio", () => {
  const n = comercio("OWNER");
  // Fuera del piloto, el Mostrador no abre Stock/Recibir: la tabla no se lo promete.
  assert.equal(capacidadConApp("stock:receive", "RECEPTION", n), false);
  // Capacidad sin app propia (contacto): no se juzga.
  assert.equal(capacidadConApp("clients:contact", "RECEPTION", n), true);
  const t = tablaDePermisos(true, (r, c) => capacidadConApp(c, r, n));
  const i = t.roles.findIndex((r) => r.valor === "RECEPTION");
  const fila = t.filas.find((f) => f.capacidad === "stock:receive");
  if (fila) assert.equal(fila.celdas[i].puede, false);
  // Sin el negocio, la tabla habla del rol como siempre.
  assert.equal(tablaDePermisos(true).filas.find((f) => f.capacidad === "stock:receive")!.celdas[i].puede, true);
});

test("buscador: «3» sin # es el pedido 3; una letra sola no busca", () => {
  assert.equal(alcanzaParaBuscar("3"), true);
  assert.equal(alcanzaParaBuscar("a"), false);
  const b = leerBusqueda("3");
  assert.ok(b.ok && b.codigo === 3);
});

test("WhatsApp del pedido: lleva la nota con el talle", () => {
  const texto = mensajeWhatsAppDelPedido({
    negocio: "A Dos Manos",
    code: 4,
    cliente: "Ana",
    lineas: [{ productId: "p", name: "Zapatillas Asics", saleUnit: "UNIT", quantity: 1, lineTotal: 100 }],
    descuento: 0,
    total: 100,
    fulfillment: "PICKUP",
    address: null,
    nota: "Talles: Zapatillas Asics, talle 40 (x1).",
  });
  assert.match(texto, /talle 40/);
});

test("Profesional en un comercio: sabe por qué y a quién pedírselo", () => {
  const e = explicarNoDisponible(appPorId("agenda"), "rubro", comercio("PROFESSIONAL"));
  assert.match(e.porque, /no tiene agenda/);
  assert.match(e.aQuien, /Mostrador/);
});
