// LA CAJA POR TURNOS CONTRA POSTGRES (Tanda B4) — con el rol de la app (app_rls, sin BYPASSRLS) y RLS encendido.
//
// Los turnos de caja viven en la foto del club (sin migraciones). Lo que se prueba acá es que esa plata llega entera a
// la base y no se duplica ni se cruza de negocio:
//   · doble envío: dos guardados de la MISMA foto con el turno firmado, a la vez y sobre la misma versión → uno entra
//     y el otro choca (versión optimista); en la base queda UN turno, con su diferencia y su firma;
//   · re-aplicar el mismo cierre (doble toque) sobre lo leído no firma dos veces;
//   · dos negocios: el turno de A no aparece en la foto de B ni al revés.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import * as M from "./motor.mjs";
import type { EstadoClub } from "./motor.mjs";
import { comprimir, descomprimir } from "./foto";

const laBase = baseEfimeraDelArchivo();
const HOY = "2026-10-17";

/** Un club real con un dueño (PIN de 4) y recepción (PIN de 2), un turno de caja contado por Caro y firmado. */
function clubConTurno(nombre: string, faltan: number): EstadoClub {
  const e = M.crearClubReal(HOY);
  e.config.nombre = nombre;
  e.caja.fondo = 10000;
  e.usuarios[0].pin = "1234";
  e.usuarios.push({ id: "u-caro", nombre: "Caro", rol: "recepcion", pin: "44", activo: true } as EstadoClub["usuarios"][number]);
  const precio = e.productos.find((p) => p.precio > 0 && p.stock == null)!;
  assert.ok(M.ventaMostrador(e, [{ productoId: precio.id, cant: 1 }], "efectivo", { fecha: HOY, min: 13 * 60 }).ok);
  const t = M.turnoDeCajaAbierto(e, HOY);
  const c = M.contarTurnoCaja(e, { contado: { efectivo: t.esperado.efectivo - faltan }, usuarioId: "u-caro" }, { fecha: HOY, min: 14 * 60 });
  assert.ok(c.ok);
  const f = M.cerrarTurnoCaja(e, { turnoId: c.turno.id, motivo: faltan ? "vuelto" : "", usuarioId: "u-caro", firmaId: e.usuarios[0].id, pin: "1234" }, { fecha: HOY, min: 14 * 60 + 1 });
  assert.ok(f.ok, !f.ok ? f.motivo : "");
  return e;
}

const texto = (e: EstadoClub) => JSON.stringify(M.serializarEstado(e));
async function formFoto(t: string, version: number) {
  const fd = new FormData();
  fd.set("foto", await comprimir(t), "foto.json.gz");
  fd.set("version", String(version));
  return fd;
}

test("B4 · doble envío del turno firmado: entra uno, el otro choca; dos negocios no se cruzan los turnos", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.updateMany({ where: { id: { in: [base.a.id, base.b.id] } }, data: { modules: ["club", "clients", "pos"] } });
  const { leerFotoDelClub, guardarFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const recA = { negocio: base.a, usuario: base.a.recepcion };
  const recB = { negocio: base.b, usuario: base.b.recepcion };

  const a = clubConTurno("Club A", 500);
  // Doble envío A LA VEZ, sobre la misma versión (0): uno entra y el otro choca.
  const [g1, g2] = await Promise.all([
    ejecutarAccion(recA, async () => guardarFotoDelClub(await formFoto(texto(a), 0))),
    ejecutarAccion(recA, async () => guardarFotoDelClub(await formFoto(texto(a), 0))),
  ]);
  const valores = [g1, g2].map((g) => (g.tipo === "respuesta" ? g.valor : null));
  assert.equal(valores.filter((v) => v?.ok).length, 1, JSON.stringify(valores));
  assert.equal(valores.filter((v) => v && !v.ok && v.motivo === "conflicto").length, 1, JSON.stringify(valores));

  const leerTurnos = async (quien: typeof recA) => {
    const l = await ejecutarAccion(quien, () => leerFotoDelClub());
    assert.ok(l.tipo === "respuesta" && l.valor.ok && l.valor.foto);
    const foto = JSON.parse(await descomprimir(l.valor.foto!.gzip)) as { estado: EstadoClub };
    return { estado: foto.estado, version: l.valor.foto!.version };
  };
  const enA = await leerTurnos(recA);
  assert.equal(enA.estado.caja.turnos?.length, 1, "un solo turno en la base");
  assert.equal(enA.estado.caja.turnos![0].diferencia, -500);
  assert.equal(enA.estado.caja.turnos![0].firma, "Roberto Ronco");

  // Doble toque sobre lo leído: la segunda firma no hace nada, y guardar eso no agrega un turno.
  const h = M.hidratarEstado({ v: M.VERSION_ESTADO, estado: enA.estado, secuencia: 0 });
  assert.ok(h.ok);
  const otra = M.cerrarTurnoCaja(h.estado, { turnoId: h.estado.caja.turnos![0].id, motivo: "x", usuarioId: "u-caro", firmaId: h.estado.usuarios[0].id, pin: "1234" }, { fecha: HOY, min: 15 * 60 });
  assert.equal(otra.ok, false);
  const g3 = await ejecutarAccion(recA, async () => guardarFotoDelClub(await formFoto(texto(h.estado), enA.version)));
  assert.ok(g3.tipo === "respuesta" && g3.valor.ok, JSON.stringify(g3));
  assert.equal((await leerTurnos(recA)).estado.caja.turnos?.length, 1);

  // B: su propio club, su propio turno (cuadra). Ninguno ve el del otro.
  const b = clubConTurno("Club B", 0);
  const gB = await ejecutarAccion(recB, async () => guardarFotoDelClub(await formFoto(texto(b), 0)));
  assert.ok(gB.tipo === "respuesta" && gB.valor.ok, JSON.stringify(gB));
  const enB = await leerTurnos(recB);
  assert.equal(enB.estado.config.nombre, "Club B");
  assert.deepEqual(enB.estado.caja.turnos?.map((x) => x.diferencia), [0]);
  const deNuevoA = await leerTurnos(recA);
  assert.equal(deNuevoA.estado.config.nombre, "Club A");
  assert.deepEqual(deNuevoA.estado.caja.turnos?.map((x) => x.diferencia), [-500]);
});
