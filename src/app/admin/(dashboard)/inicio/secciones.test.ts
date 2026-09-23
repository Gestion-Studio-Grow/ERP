// El Inicio por apps armado con el registro REAL y la decisión REAL de quién ve qué
// (`appsVisibles`): qué espacios ve cada rol en un negocio del piloto, cómo se llama el
// primero según el rubro, qué sube a "Para atender hoy" y adónde lleva escribir "fact".

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import type { Role } from "@/lib/capabilities";
import { appsVisibles, buscarApps, resolverContextoApps, type NegocioApps } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { NO_SE_PUDO } from "@/apps/kpis/nucleo.server";
import { listaDeNombres, paraAtenderHoy, seccionesDelInicio } from "./secciones";

/** MAGRA en el piloto, con el módulo de stock asignado (el operador lo asigna antes de prenderlo). */
const MODULOS_MAGRA = ["pos", "catalog", "clients", "reports", "arca", "inventario"];

function magra(role: Role): NegocioApps {
  const contexto = resolverContextoApps(
    { id: "t-magra", slug: "magra", blueprintId: "carniceria", modules: MODULOS_MAGRA },
    { registroGlobal: false, appsInicio: "magra,shinevelas,adosmanos" },
    catalogo(),
  );
  assert.equal(contexto?.origen, "piloto");
  return { role, contexto, modulosAsignados: MODULOS_MAGRA, perfil: null, esMostrador: true, carniceriaLista: false };
}

const nombres = (n: NegocioApps) => seccionesDelInicio(appsVisibles(n), { esMostrador: n.esMostrador }).map((s) => s.nombre);

test("OWNER de MAGRA ve Mostrador, Caja, Clientes, Catálogo y precios, Stock y compras, Finanzas y Administración", () => {
  assert.deepEqual(nombres(magra("OWNER")), [
    "Mostrador",
    "Caja",
    "Clientes",
    "Catálogo y precios",
    "Stock y compras",
    "Finanzas",
    "Administración",
  ]);
});

test("RECEPTION de MAGRA ve Mostrador, Caja, Clientes y Stock y compras (el encargado cuenta y mira movimientos)", () => {
  assert.deepEqual(nombres(magra("RECEPTION")), ["Mostrador", "Caja", "Clientes", "Stock y compras"]);
});

test("PROFESSIONAL no tiene Inicio de apps (su casa es la agenda)", () => {
  assert.deepEqual(nombres(magra("PROFESSIONAL")), []);
});

test("en un negocio de servicios el primer espacio se llama Recepción", () => {
  const servicios: NegocioApps = {
    role: "OWNER",
    contexto: null,
    modulosAsignados: [],
    perfil: null,
    esMostrador: false,
    carniceriaLista: false,
  };
  const secciones = nombres(servicios);
  assert.equal(secciones[0], "Recepción");
  assert.ok(!secciones.includes("Mostrador"));
});

test("los espacios que no van en el Inicio nunca son sección (el propio Inicio no es un botón)", () => {
  const secciones = seccionesDelInicio(appsVisibles(magra("OWNER")), { esMostrador: true });
  assert.ok(secciones.every((s) => s.id !== "plataforma" && s.id !== "contador"));
  assert.ok(secciones.every((s) => s.apps.every((a) => a.espacio === s.id)));
  assert.ok(!secciones.flatMap((s) => s.apps).some((a) => a.id === "inicio"));
});

test("escribir 'fact' y Enter abre Facturación (la primera coincidencia)", () => {
  const [primera] = buscarApps(appsVisibles(magra("OWNER")), "fact");
  assert.equal(primera?.id, "facturacion");
  assert.equal(primera?.ruta, "/admin/facturacion");
  // Recepción no la ve, así que el buscador no la trae ni tecleándola.
  assert.deepEqual(buscarApps(appsVisibles(magra("RECEPTION")), "fact"), []);
});

test("'Para atender hoy' junta sólo lo que está en alerta, y avisa lo que no se pudo revisar", () => {
  const pedidos = appPorId("pedidos");
  const cierre = appPorId("cierre-del-dia");
  const caja = appPorId("caja-del-dia");
  const stock = appPorId("inventario");
  const r = paraAtenderHoy([
    { app: pedidos, resultado: { estado: "ok", valor: "3", detalle: "abiertos", alerta: { valor: "1", texto: "entregado sin cobrar" } } },
    { app: caja, resultado: { estado: "ok", valor: "Abierta" } },
    { app: cierre, resultado: { estado: "error", motivo: NO_SE_PUDO } },
    { app: stock, resultado: null },
  ]);
  assert.deepEqual(
    r.alertas.map((a) => [a.app.id, a.alerta.valor, a.alerta.texto]),
    [["pedidos", "1", "entregado sin cobrar"]],
  );
  assert.deepEqual(r.sinRevisar.map((a) => a.id), ["cierre-del-dia"]);
});

test("listaDeNombres arma la frase del aviso", () => {
  const a = appPorId("pedidos");
  const b = appPorId("inventario");
  const c = appPorId("caja-del-dia");
  assert.equal(listaDeNombres([a]), "Pedidos para preparar");
  assert.equal(listaDeNombres([a, b]), "Pedidos para preparar y Stock");
  assert.equal(listaDeNombres([a, b, c]), "Pedidos para preparar, Stock y Caja del día");
});
