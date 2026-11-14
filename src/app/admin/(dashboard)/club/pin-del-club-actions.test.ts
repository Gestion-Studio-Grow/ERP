// GSG-SEG-019: `cambiarMiPinDelClub` TAL CUAL (el módulo "use server"), sin base: se reemplazan la guardia, el negocio,
// el repositorio de la foto (en memoria, con la versión optimista) y la auditoría (se anota lo que se registraría).
// Lo que se prueba es el envoltorio: negocio de la sesión, foto vigente, guardado con actor y auditoría SIN el PIN.
// La regla (PIN actual, dueño, PIN nuevo) está en src/lib/club/cambiar-pin.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import * as M from "@/lib/club/motor.mjs";

const HOY = "2026-10-17";
const NEGOCIO = "negocio-bp";
const sesion: { rol: "OWNER" | "RECEPTION" } = { rol: "RECEPTION" };
let base: { texto: string; version: number } | null = null;
const auditoria: { actor: string; action: string; entity: string; entityId?: string | null; changes?: unknown }[] = [];
const actores: string[] = [];
const tope = { espera: 0, esperaTrasFallo: 0, llamadas: [] as { ambito: string; usuarioId: string | null; ok: boolean; limpia: string | null }[] };

const DOBLES: Record<string, unknown> = {
  "@/lib/require-app": {
    requireAppAccion: async () => ({ id: sesion.rol === "OWNER" ? "user-duenia" : "user-recepcion", role: sesion.rol }),
    AppNoDisponibleError: class extends Error {},
  },
  "@/lib/tenant": { getCurrentTenantId: async () => NEGOCIO },
  "@/lib/audit-core": { audit: async (e: (typeof auditoria)[number]) => void auditoria.push(e) },
  "@/lib/club/estado-repo": {
    leerVigente: async (tenantId: string) => (tenantId === NEGOCIO && base ? { ...base, guardado: null, actualizada: new Date(0) } : null),
    guardar: async (tenantId: string, texto: string, version: number, actor: string) => {
      assert.equal(tenantId, NEGOCIO);
      const actual = base?.version ?? 0;
      if (version !== actual) return { ok: false, motivo: "CAMBIO_MIENTRAS_MIRABAS", version: actual };
      actores.push(actor);
      base = { texto, version: actual + 1 };
      return { ok: true, version: base.version, podadas: 0 };
    },
  },
  // SEG-020: el tope sin base (contra Postgres: src/lib/club/firma-del-duenio-postgres.test.ts).
  // SEG-024: el doble anota con qué ámbito y persona se llamó, y puede contestar «esperá» o abrir la espera tras el fallo.
  "@/lib/club/tope-pin-servidor": {
    ambitoDelPinDeDuenio: (rol: string) => (rol === "OWNER" ? "pin-owner" : "pin"),
    conTopeDePin: async (_tenantId: string, ambito: string, verificar: () => { ok: boolean; limpia?: string | null }, opciones: { usuarioId?: string | null } = {}) => {
      if (tope.espera) return { espera: true, esperaS: tope.espera };
      const resultado = await verificar();
      tope.llamadas.push({ ambito, usuarioId: opciones.usuarioId ?? null, ok: resultado.ok, limpia: resultado.limpia ?? null });
      return { espera: false, resultado, esperaS: resultado.ok ? 0 : tope.esperaTrasFallo };
    },
  },
};
const conCarga = Module as unknown as { _load: (pedido: string, padre: { filename?: string } | null, ...resto: unknown[]) => unknown };
const cargarOriginal = conCarga._load;
conCarga._load = function (this: unknown, pedido: string, padre: { filename?: string } | null, ...resto: unknown[]) {
  if (padre?.filename && /[\\/]club[\\/]pin-del-club-actions\.ts$/.test(padre.filename) && Object.hasOwn(DOBLES, pedido)) return DOBLES[pedido];
  return cargarOriginal.call(this, pedido, padre, ...resto);
};

function arrancar() {
  const e = M.generarDemo(HOY, 19 * 60);
  M.pasarPinesAHash(e);
  base = { texto: JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds(), guardado: 1 }), version: 4 };
  auditoria.length = 0;
  actores.length = 0;
  tope.espera = 0;
  tope.esperaTrasFallo = 0;
  tope.llamadas.length = 0;
  const lu = e.usuarios.find((u) => u.rol === "recepcion")!;
  return { e, lu, pin: M.pinDeEjemplo(lu) };
}
const estado = () => (JSON.parse(base!.texto) as { estado: M.EstadoClub }).estado;

/** Le da a `u` un PIN válido (no de ejemplo ni fácil) y deja la foto con eso; devuelve el PIN. */
function conPinValido(e: M.EstadoClub, u: M.Usuario, candidatos: readonly string[]): string {
  for (const p of candidatos) if (M.cambiarMiPin(e, { usuarioId: u.id, pin: M.pinDeEjemplo(u) }, p).ok) {
    base = { texto: JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds(), guardado: 1 }), version: 4 };
    return p;
  }
  throw new Error("sin PIN válido");
}
const DE_2 = Array.from({ length: 90 }, (_, i) => String(i + 10));

test("SEG-019 acción: recepción cambia su PIN sabiendo el actual → se guarda con su actor y queda auditado sin el PIN", async () => {
  const { lu, pin } = arrancar();
  sesion.rol = "RECEPTION";
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  const r = await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: pin, pinNuevo: "73" });
  assert.deepEqual(r, { ok: true, version: 5 });
  assert.deepEqual(actores, ["user:user-recepcion"]);
  assert.ok(M.pinCoincide(estado(), estado().usuarios.find((u) => u.id === lu.id)!, "73"));
  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0].action, "club_cambiar_pin:ok");
  assert.equal(auditoria[0].entityId, lu.id);
  assert.equal(auditoria[0].actor, "user:user-recepcion");
  assert.ok(!JSON.stringify(auditoria).includes("73") && !JSON.stringify(auditoria).includes(`"${pin}"`), "la auditoría no lleva PIN");
});

test("SEG-019 acción: con un PIN actual mal no se guarda nada y queda el rechazo auditado (sin PIN)", async () => {
  const { e, pin } = arrancar();
  const otra = e.usuarios.filter((u) => u.rol === "recepcion")[1];
  sesion.rol = "RECEPTION";
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  const antes = base!.texto;
  const r = await cambiarMiPinDelClub({ usuarioId: otra.id, pinActual: pin, pinNuevo: "73" });
  assert.equal(r.ok, false);
  assert.equal(base!.texto, antes);
  assert.equal(base!.version, 4);
  assert.equal(auditoria[0].action, "club_cambiar_pin:rechazo");
  assert.deepEqual(auditoria[0].changes, { resultado: "rechazo", codigo: "pin-actual", rolErp: "RECEPTION" });
  // Datos que no son texto: rechazo sin tocar la base.
  assert.equal((await cambiarMiPinDelClub({ usuarioId: { no: 1 }, pinActual: 1, pinNuevo: null })).ok, false);
  assert.equal(base!.version, 4);
});

test("SEG-019 acción: el PIN de un dueño del club, desde recepción no; desde un OWNER del ERP sí", async () => {
  const { e } = arrancar();
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  sesion.rol = "RECEPTION";
  assert.equal((await cambiarMiPinDelClub({ usuarioId: d.id, pinActual: M.pinDeEjemplo(d), pinNuevo: "8642" })).ok, false);
  sesion.rol = "OWNER";
  assert.deepEqual(await cambiarMiPinDelClub({ usuarioId: d.id, pinActual: M.pinDeEjemplo(d), pinNuevo: "8642" }), { ok: true, version: 5 });
});

// UAT-005/006: recepción cambia su PIN desde la solapa «Mi PIN». Lo que importa es el servidor: con el login de
// recepción del ERP, el pedido sólo puede cambiar el PIN de quien lo sabe, y nada más de la foto.
test("UAT-006 acción: recepción cambia SU PIN y en la foto cambia sólo eso (más la línea del registro), aunque el pedido traiga de más", async () => {
  const { e, lu, pin } = arrancar();
  sesion.rol = "RECEPTION";
  const antes = JSON.parse(base!.texto) as { estado: M.EstadoClub };
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  // Campos de más (un rol, otra lista de usuarios): la acción sólo lee usuarioId, pinActual y pinNuevo.
  const pedido = { usuarioId: lu.id, pinActual: pin, pinNuevo: "73", rol: "duenio", usuarios: [], esDuenioDelErp: true } as unknown as Parameters<typeof cambiarMiPinDelClub>[0];
  assert.deepEqual(await cambiarMiPinDelClub(pedido), { ok: true, version: 5 });
  const despues = JSON.parse(base!.texto) as { estado: M.EstadoClub };
  const sinPinNiLog = (x: { estado: M.EstadoClub }) => ({
    ...x,
    estado: { ...x.estado, log: [], usuarios: x.estado.usuarios.map((u) => (u.id === lu.id ? { ...u, pin: "" } : u)) },
  });
  assert.deepEqual(sinPinNiLog(despues), sinPinNiLog(antes), "fuera de su PIN y el registro, la foto queda igual");
  assert.equal(despues.estado.log.length, antes.estado.log.length + 1);
  const yo = despues.estado.usuarios.find((u) => u.id === lu.id)!;
  assert.equal(yo.rol, "recepcion", "sigue siendo recepción");
  assert.equal(despues.estado.usuarios.length, e.usuarios.length);
  // Los PIN de los demás, intactos.
  for (const u of antes.estado.usuarios.filter((x) => x.id !== lu.id)) assert.equal(despues.estado.usuarios.find((x) => x.id === u.id)!.pin, u.pin);
});

test("UAT-006 acción: desde recepción no se cambia el PIN de otra persona de recepción con un PIN ajeno, ni el de un dueño con el suyo", async () => {
  const { e, lu, pin } = arrancar();
  sesion.rol = "RECEPTION";
  const otra = e.usuarios.find((u) => u.rol === "recepcion" && u.id !== lu.id)!;
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  const antes = base!.texto;
  // Con su propio PIN, apuntando a otra persona.
  assert.equal((await cambiarMiPinDelClub({ usuarioId: otra.id, pinActual: pin, pinNuevo: "73" })).ok, false);
  // Con el PIN bueno de un dueño: igual no (el de un dueño sólo desde el puesto del dueño).
  const r = await cambiarMiPinDelClub({ usuarioId: d.id, pinActual: M.pinDeEjemplo(d), pinNuevo: "8642" });
  assert.deepEqual(r, { ok: false, error: "El PIN de un dueño se cambia desde el puesto del dueño." });
  // Un usuario que no existe.
  assert.equal((await cambiarMiPinDelClub({ usuarioId: "u-nadie", pinActual: pin, pinNuevo: "73" })).ok, false);
  assert.equal(base!.texto, antes);
  assert.equal(base!.version, 4);
  assert.deepEqual(actores, []);
});

test("acción: si falta algo, dice QUÉ falta (y no toca la base)", async () => {
  const { lu, pin } = arrancar();
  sesion.rol = "RECEPTION";
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  const quien = await cambiarMiPinDelClub({ usuarioId: null, pinActual: pin, pinNuevo: "73" });
  const actual = await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: undefined, pinNuevo: "73" });
  const nuevo = await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: pin, pinNuevo: 73 });
  assert.match(!quien.ok ? quien.error : "", /entrá con tu PIN/);
  assert.match(!actual.ok ? actual.error : "", /PIN actual/);
  assert.match(!nuevo.ok ? nuevo.error : "", /PIN nuevo/);
  assert.equal(base!.version, 4);
});

// SEG-024: el tope de quien no es dueño, por persona, y el carril del dueño según la sesión del ERP.
test("SEG-024 acción: recepción cuenta en el tope «equipo» de ESA persona; fallan un PIN actual mal y un PIN nuevo en uso", async () => {
  const { e, lu, pin } = arrancar();
  sesion.rol = "RECEPTION";
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  const otra = e.usuarios.filter((u) => u.rol === "recepcion")[1];
  assert.equal((await cambiarMiPinDelClub({ usuarioId: otra.id, pinActual: pin, pinNuevo: "73" })).ok, false);
  assert.equal((await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: pin, pinNuevo: pin })).ok, false, "PIN nuevo igual: rechazo");
  const deOtra = conPinValido(e, otra, DE_2.filter((p) => p !== "73"));
  const enUso = await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: pin, pinNuevo: deOtra });
  assert.ok(!enUso.ok && /ya lo usa otra persona/.test(enUso.error));
  assert.deepEqual(await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: pin, pinNuevo: "73" }), { ok: true, version: 5 });
  // «En uso» delata el PIN de otra persona: es un fallo. En el equipo ningún acierto limpia (la regla del motor para
  // recepción), así un cambio bien hecho no reabre la puerta a seguir probando.
  assert.deepEqual(tope.llamadas, [
    { ambito: "equipo", usuarioId: otra.id, ok: false, limpia: null },
    { ambito: "equipo", usuarioId: lu.id, ok: true, limpia: null },
    { ambito: "equipo", usuarioId: lu.id, ok: false, limpia: null },
    { ambito: "equipo", usuarioId: lu.id, ok: true, limpia: null },
  ]);
});

test("SEG-024 acción: un usuario inexistente o inactivo, o un dueño desde recepción, no pasan por el tope (no gastan ni anotan)", async () => {
  const { e, pin } = arrancar();
  const otra = e.usuarios.filter((u) => u.rol === "recepcion")[1];
  otra.activo = false;
  base = { texto: JSON.stringify({ v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds(), guardado: 1 }), version: 4 };
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  sesion.rol = "RECEPTION";
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  for (const usuarioId of ["u-no-existe", otra.id, d.id]) assert.equal((await cambiarMiPinDelClub({ usuarioId, pinActual: pin, pinNuevo: "73" })).ok, false);
  assert.deepEqual(tope.llamadas, []);
});

test("SEG-024 acción: el PIN de un dueño desde un OWNER del ERP va al carril «pin-owner»; el de recepción desde un OWNER, a «equipo»", async () => {
  const { e, lu, pin } = arrancar();
  const d = e.usuarios.find((u) => u.rol === "duenio")!;
  sesion.rol = "OWNER";
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  assert.equal((await cambiarMiPinDelClub({ usuarioId: d.id, pinActual: "0000", pinNuevo: "8642" })).ok, false);
  assert.equal((await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: pin, pinNuevo: "73" })).ok, true);
  assert.deepEqual(tope.llamadas.map((l) => [l.ambito, l.usuarioId]), [["pin-owner", d.id], ["equipo", lu.id]]);
  // El dueño, con su PIN: su acierto limpia sus fallos (SEG-020); «en uso» cuenta como fallo.
  const otro = e.usuarios.find((u) => u.rol === "duenio" && u.id !== d.id);
  assert.ok(otro, "la demo trae dos dueños");
  {
    tope.llamadas.length = 0;
    const deOtro = conPinValido(e, otro!, ["2749", "3816", "5073", "6194", "8357"]);
    const r = await cambiarMiPinDelClub({ usuarioId: d.id, pinActual: M.pinDeEjemplo(d), pinNuevo: deOtro });
    assert.ok(!r.ok && /ya lo usa otra persona/.test(r.error), JSON.stringify(r));
    assert.deepEqual(tope.llamadas, [{ ambito: "pin-owner", usuarioId: d.id, ok: false, limpia: null }]);
  }
});

test("SEG-024 acción: en la espera no se toca la foto y se avisa hasta qué hora; el fallo que abre la espera ya la avisa", async () => {
  const { e, lu, pin } = arrancar();
  sesion.rol = "RECEPTION";
  const { cambiarMiPinDelClub } = await import("./pin-del-club-actions");
  tope.espera = 30;
  const r = await cambiarMiPinDelClub({ usuarioId: lu.id, pinActual: pin, pinNuevo: "73" });
  assert.ok(!r.ok && /^Demasiados intentos: esperá hasta las \d{2}:\d{2}/.test(r.error), JSON.stringify(r));
  assert.equal(base!.version, 4);
  assert.equal(auditoria.at(-1)?.action, "club_cambiar_pin:rechazo");
  assert.deepEqual((auditoria.at(-1)?.changes as { codigo?: string }).codigo, "espera");
  tope.espera = 0;
  tope.esperaTrasFallo = 30;
  const otra = e.usuarios.filter((u) => u.rol === "recepcion")[1];
  const quinto = await cambiarMiPinDelClub({ usuarioId: otra.id, pinActual: pin, pinNuevo: "73" });
  assert.ok(!quinto.ok && /esperá hasta las/.test(quinto.error));
  assert.deepEqual((auditoria.at(-1)?.changes as { codigo?: string }).codigo, "pin-actual", "la auditoría dice qué pasó");
  assert.ok(!JSON.stringify(auditoria).includes(`"${pin}"`));
});
