// LA BAJA DE UN FIJO CONTRA POSTGRES — Tanda 3C (bp-DISENO §3.10, BP-100…BP-104), con el rol de la app (app_rls,
// sin BYPASSRLS) y RLS encendido.
//
// Una base efímera propia (src/test/base-efimera.ts) con los negocios A y B del arnés. Se corren las acciones REALES
// (estado-actions.ts) con la sesión de sus usuarios. Lo que se prueba es la plata de la baja cuando hay dos envíos:
//   · doble envío del MISMO guardado (doble clic, reintento de red): el segundo choca por versión, no se aplica dos veces;
//   · dos puestos dan de baja el MISMO fijo: el segundo choca, relee, re-aplica su comando y el motor dice que no
//     («ya no está»): la plata del turno pagado vuelve UNA sola vez y la caja no se mueve dos veces;
//   · el negocio B no ve la baja de A ni su fijo, y su club sigue como estaba.
// Sin Postgres local, se saltea con el motivo (la parte de base queda SIN verificar).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { comprimir, descomprimir } from "@/lib/club/foto";
import { operadorDeLaDemo, textoDelEstado } from "./almacen";
import { correrComando, rebasar, type Comando } from "./comandos-core";
import type { AccionBajaFijo } from "./canchas-core";

const laBase = baseEfimeraDelArchivo();
const MODULOS = ["club", "clients", "pos"];
const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.updateMany({ where: { id: { in: [base.a.id, base.b.id] } }, data: { modules: MODULOS } });
  return { base };
}

async function formFoto(texto: string, version: number) {
  const fd = new FormData();
  fd.set("foto", await comprimir(texto), "foto.json.gz");
  fd.set("version", String(version));
  return fd;
}

/** El club de la demo con los fijos bajados a la grilla y un turno del primer fijo pagado ($ 21.000 en efectivo). */
function clubConFijoPagado(): string {
  M.prefijoIds("");
  const e = M.generarDemo(HOY, AHORA.min);
  M.materializarFijosHasta(e, HOY, 14);
  const f = e.fijos[0];
  const r = e.reservas.filter((x) => x.fijoId === f.id && x.estado === "reservada" && M.minutosHasta(AHORA, x.fecha, x.inicio) > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  assert.ok(r && r.clienteId, "el fijo de la demo tiene un turno por venir con ficha");
  assert.equal(M.registrarPago(e, r.id, { medio: "efectivo", monto: 21000 }, AHORA).ok, true);
  return textoDelEstado(e);
}

let n = 0;
/** Lo que hace el almacén del puesto: arma el comando «bajaDeFijo» con el dueño y lo corre sobre su estado. */
function bajaEnElPuesto(e: EstadoClub, equipo: string, a: AccionBajaFijo): Comando<"bajaDeFijo"> {
  const auth = operadorDeLaDemo(e, "OWNER")!.auth;
  const c: Comando<"bajaDeFijo"> = { id: `cmd-pg-${++n}`, equipo, persona: auth.usuarioId ?? "", versionBase: 1, version: M.VERSION_ESTADO, nombre: "bajaDeFijo", args: [a], ahora: AHORA, auth, azar: 3000 + n, idsDesde: M.secuenciaIds() };
  const d = correrComando(e, c);
  assert.equal(d.ok, true, d.mensaje);
  return c;
}

const estadoDe = (texto: string) => (JSON.parse(texto) as { estado: EstadoClub }).estado;

test("3C · baja de un fijo con doble envío y dos puestos: la plata vuelve UNA vez; el negocio B no ve nada de A", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base } = p;
  const { leerFotoDelClub, guardarFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  const leer = async (quien: typeof duenia) => {
    const l = await ejecutarAccion(quien, () => leerFotoDelClub());
    assert.ok(l.tipo === "respuesta" && l.valor.ok && l.valor.foto, JSON.stringify(l));
    return { version: l.valor.foto!.version, estado: estadoDe(await descomprimir(l.valor.foto!.gzip)) };
  };

  // A arranca con el club del fijo pagado; B, con su club de verdad (sin fijos).
  const inicial = clubConFijoPagado();
  const g0 = await ejecutarAccion(duenia, async () => guardarFotoDelClub(await formFoto(inicial, 0)));
  assert.deepEqual(g0.tipo === "respuesta" && g0.valor, { ok: true, version: 1 });
  const textoB = JSON.stringify({ v: 1, estado: M.crearClubReal(HOY), secuencia: 0 });
  const gb = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, async () => guardarFotoDelClub(await formFoto(textoB, 0)));
  assert.deepEqual(gb.tipo === "respuesta" && gb.valor, { ok: true, version: 1 });

  // La PC y la tablet leyeron la versión 1.
  const pc = await leer(duenia);
  const tablet = await leer(duenia);
  const f = pc.estado.fijos[0];
  const pagado = pc.estado.reservas.find((x) => x.fijoId === f.id && x.pagos.length > 0)!;
  const monedero0 = M.cliente(pc.estado, pagado.clienteId!)!.monedero;
  const movimientos0 = pc.estado.caja.movimientos.length;
  const accion: AccionBajaFijo = { tipo: "baja", fijoId: f.id, desde: HOY };

  // La PC da de baja y guarda. Doble envío del MISMO guardado: el segundo choca por versión (no se aplica dos veces).
  M.prefijoIds("pc-");
  bajaEnElPuesto(pc.estado, "pc", accion);
  const textoPc = textoDelEstado(pc.estado);
  const [e1, e2] = await Promise.all([
    ejecutarAccion(duenia, async () => guardarFotoDelClub(await formFoto(textoPc, 1))),
    ejecutarAccion(duenia, async () => guardarFotoDelClub(await formFoto(textoPc, 1))),
  ]);
  const valores = [e1, e2].map((x) => (x.tipo === "respuesta" ? x.valor : null));
  assert.equal(valores.filter((v) => v?.ok).length, 1, `uno solo entra: ${JSON.stringify(valores)}`);
  assert.equal(valores.filter((v) => v && !v.ok && v.motivo === "conflicto").length, 1, "el otro choca por versión");

  // La tablet también lo dio de baja (sobre la 1) y guarda: choca. Relee, re-aplica su comando: el motor dice que no.
  M.prefijoIds("tb-");
  const deLaTablet = bajaEnElPuesto(tablet.estado, "tablet", accion);
  const choque = await ejecutarAccion(duenia, async () => guardarFotoDelClub(await formFoto(textoDelEstado(tablet.estado), 1)));
  assert.ok(choque.tipo === "respuesta" && !choque.valor.ok && choque.valor.motivo === "conflicto" && choque.valor.version === 2, JSON.stringify(choque));
  const vigente = await leer(duenia);
  assert.equal(vigente.version, 2);
  const r = rebasar(vigente.estado, [deLaTablet], new Set());
  assert.equal(r.rechazados.length, 1, "el de la tablet va a «Para resolver»");
  assert.match(r.rechazados[0].motivo, /ya no está/);
  const g3 = await ejecutarAccion(duenia, async () => guardarFotoDelClub(await formFoto(textoDelEstado(vigente.estado), 2)));
  assert.deepEqual(g3.tipo === "respuesta" && g3.valor, { ok: true, version: 3 });

  const final = await leer(duenia);
  assert.equal(final.estado.fijos.some((x) => x.id === f.id), false, "el fijo salió de la lista");
  assert.equal(M.reserva(final.estado, pagado.id)!.estado, "cancelada");
  assert.equal(M.cliente(final.estado, pagado.clienteId!)!.monedero, monedero0 + 21000, "los $ 21.000 vuelven una sola vez");
  assert.equal(final.estado.caja.movimientos.length, movimientos0, "la caja no se mueve dos veces");

  // B: su club sigue como estaba (versión 1, sin fijos) y no ve el de A.
  const deB = await leer({ negocio: base.b, usuario: base.b.duenia });
  assert.equal(deB.version, 1);
  assert.deepEqual(deB.estado.fijos, []);
  assert.equal(deB.estado.reservas.some((x) => x.id === pagado.id), false);
  M.prefijoIds("");
});
