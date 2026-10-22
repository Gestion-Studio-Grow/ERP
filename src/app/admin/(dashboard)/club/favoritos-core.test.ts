// Favoritos del mostrador (Tanda 2A, BP-042): los 8 más vendidos de los últimos 7 días de caja, con fallback a los
// marcados `favorito` y después al catálogo. Contra el motor REAL, con ventas armadas día por día.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { FAVORITOS_A_LA_VISTA, favoritosDelMostrador, ventanaDeFavoritos } from "./favoritos-core";

const HOY = "2026-10-22";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };

/** La demo sin ventas: ni una cuenta, todo con stock de sobra. */
function sinVentas(): EstadoClub {
  M.prefijoIds("");
  const e = M.generarDemo(HOY, AHORA.min);
  e.cuentas = [];
  for (const p of e.productos) if (p.stock != null && !p.alquiler) p.stock = 500;
  return e;
}

/** Vende `cant` de `productoId` en el mostrador `diasAtras` días antes de hoy (a las 19:00, dentro de esa caja). */
function vender(e: EstadoClub, productoId: string, cant: number, diasAtras = 0) {
  const r = M.ventaMostrador(e, [{ productoId, cant }], "efectivo", { fecha: M.sumarDias(HOY, -diasAtras), min: 19 * 60 });
  assert.equal(r.ok, true, JSON.stringify(r));
}

const ids = (e: EstadoClub) => favoritosDelMostrador(e, AHORA).map((f) => f.id);

test("BP-042 · son los 8 más vendidos de los últimos 7 días, en orden de unidades", () => {
  const e = sinVentas();
  // Nueve productos vendidos en la ventana (hoy y hasta 6 días atrás), con cantidades distintas.
  const enLaVentana: [string, number, number][] = [
    ["p2", 30, 0], // agua: 30 hoy
    ["p9", 12, 6], // cerveza: 12 hace 6 días (todavía cuenta)
    ["p3", 9, 2],
    ["k-mila", 8, 1],
    ["p10", 7, 3],
    ["k-empa", 6, 0],
    ["p4", 5, 4],
    ["k-tost", 4, 5],
    ["p1", 2, 0], // el noveno: queda afuera
  ];
  for (const [id, cant, dias] of enLaVentana) vender(e, id, cant, dias);
  // Hace 7 días ya no cuenta: 100 hamburguesas no la meten en la fila.
  vender(e, "k-hamb", 100, 7);
  const fav = favoritosDelMostrador(e, AHORA);
  assert.equal(fav.length, FAVORITOS_A_LA_VISTA);
  assert.deepEqual(fav.map((f) => f.id), ["p2", "p9", "p3", "k-mila", "p10", "k-empa", "p4", "k-tost"]);
  assert.deepEqual(fav.map((f) => f.vendidos), [30, 12, 9, 8, 7, 6, 5, 4]);
  assert.ok(fav.every((f) => f.por === "ventas"));
  assert.equal(fav[0].nombre, "Agua 500 ml");
  assert.equal(fav[0].precio, 2000);
});

test("la ventana es de 7 días de caja: de hoy-6 a hoy (con el corte de las 12)", () => {
  const e = sinVentas();
  assert.deepEqual(ventanaDeFavoritos(e, AHORA), { desde: M.sumarDias(HOY, -6), hasta: HOY });
  // A las 3 de la mañana sigue la caja de ayer: la ventana corre un día.
  const madrugada = ventanaDeFavoritos(e, { fecha: HOY, min: 3 * 60 });
  assert.equal(madrugada.hasta, M.diaDeCaja(e, HOY, 3 * 60));
});

test("fallback: con pocas ventas se completa con los marcados «favorito» y después con el catálogo, sin repetir", () => {
  const e = sinVentas();
  vender(e, "p9", 3);
  (e.productos.find((p) => p.id === "k-pica") as { favorito?: boolean }).favorito = true;
  (e.productos.find((p) => p.id === "p5") as { favorito?: boolean }).favorito = true;
  const fav = favoritosDelMostrador(e, AHORA);
  assert.equal(fav.length, 8);
  assert.deepEqual(fav.slice(0, 3).map((f) => [f.id, f.por]), [["p9", "ventas"], ["p5", "favorito"], ["k-pica", "favorito"]]);
  assert.ok(fav.slice(3).every((f) => f.por === "catalogo"));
  assert.equal(new Set(fav.map((f) => f.id)).size, 8, "ninguno repetido");
  // Sin ventas ni marcados: los primeros 8 del catálogo que se pueden vender (nunca una fila vacía).
  const vacio = sinVentas();
  assert.equal(ids(vacio).length, 8);
});

test("nunca entra lo de alquiler, lo agotado, lo inactivo ni lo que no tiene precio (aunque sea lo más vendido)", () => {
  const e = sinVentas();
  vender(e, "p2", 50);
  vender(e, "p3", 40);
  vender(e, "p4", 30);
  const pala = e.productos.find((p) => p.alquiler)!;
  e.productos.find((p) => p.id === "p2")!.stock = 0; // se agotó el agua
  e.productos.find((p) => p.id === "p3")!.activo = false;
  e.productos.find((p) => p.id === "p4")!.precio = 0;
  e.productos.find((p) => p.id === "p8")!.stock = 0; // la remera, sin stock
  const lista = ids(e);
  for (const fuera of [pala.id, "p2", "p3", "p4", "p8"]) assert.ok(!lista.includes(fuera), `${fuera} no va: ${lista}`);
});

test("empate de unidades: primero el marcado y después el orden del catálogo (la fila no baila)", () => {
  const e = sinVentas();
  vender(e, "p10", 4);
  vender(e, "p9", 4);
  vender(e, "p1", 4);
  assert.deepEqual(ids(e).slice(0, 3), ["p1", "p9", "p10"], "orden del catálogo");
  (e.productos.find((p) => p.id === "p10") as { favorito?: boolean }).favorito = true;
  assert.deepEqual(ids(e).slice(0, 3), ["p10", "p1", "p9"]);
});
