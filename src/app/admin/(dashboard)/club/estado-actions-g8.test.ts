// G8 EN LA ACCIÓN DEL SERVIDOR, SIN BASE — CERT-B4 vuelta 4, F5 (ataque B3 del certificador).
//
// Se llama a `guardarFotoDelClub` TAL CUAL (el módulo "use server" que usa la pantalla), con la sesión de un usuario
// de RECEPCIÓN del ERP, como lo haría un pedido armado a mano desde la tablet (sin pasar por la pantalla). Lo único que
// se reemplaza es lo que pide una base o un pedido de Next: la guardia (`requireAppAccion`), el negocio
// (`getCurrentTenantId`) y el repositorio de la foto (en memoria, con la misma versión optimista). Así el test corre
// en cualquier máquina; la misma acción contra Postgres real con RLS está en src/lib/club/estado-postgres.test.ts.
//
// El ataque: recepción guarda la foto con `config.caja.largoPinFirma = 2` (y precios, seña, fondo y alias tocados) y
// después firma un retiro con su PIN de 2. Con la red, lo que mueve plata o permisos queda como en la base.
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { comprimir } from "@/lib/club/foto";
import * as M from "@/lib/club/motor.mjs";
import type { RespuestaGuardarFoto } from "./estado-actions";

const HOY = "2026-10-17";
const NEGOCIO = "negocio-bp";

type Rol = "OWNER" | "RECEPTION";
const sesion: { rol: Rol } = { rol: "RECEPTION" };
let base: { texto: string; version: number } | null = null;

// Los dobles: sólo para los imports de estado-actions.ts (el resto del árbol carga los módulos reales).
const DOBLES: Record<string, unknown> = {
  "@/lib/require-app": {
    requireAppAccion: async () => ({ id: sesion.rol === "OWNER" ? "user-duenia" : "user-recepcion", role: sesion.rol }),
    AppNoDisponibleError: class extends Error {},
  },
  "@/lib/tenant": { getCurrentTenantId: async () => NEGOCIO },
  "@/lib/club/estado-repo": {
    MENSAJE_CAMBIO_MIENTRAS_MIRABAS: "Otra pantalla guardó mientras mirabas.",
    leerVigente: async (tenantId: string) => (tenantId === NEGOCIO && base ? { ...base, guardado: null, actualizada: new Date(0) } : null),
    leerMetaVigente: async () => (base ? { version: base.version } : null),
    guardar: async (tenantId: string, texto: string, version: number) => {
      assert.equal(tenantId, NEGOCIO);
      const actual = base?.version ?? 0;
      if (version !== actual) return { ok: false, motivo: "CAMBIO_MIENTRAS_MIRABAS", version: actual };
      base = { texto, version: actual + 1 };
      return { ok: true, version: base.version };
    },
    restaurar: async () => {
      throw new Error("no se usa en este test");
    },
  },
};
const conCarga = Module as unknown as { _load: (pedido: string, padre: { filename?: string } | null, ...resto: unknown[]) => unknown };
const cargarOriginal = conCarga._load;
conCarga._load = function (this: unknown, pedido: string, padre: { filename?: string } | null, ...resto: unknown[]) {
  if (padre?.filename && /[\\/]club[\\/]estado-actions\.ts$/.test(padre.filename) && Object.hasOwn(DOBLES, pedido)) return DOBLES[pedido];
  return cargarOriginal.call(this, pedido, padre, ...resto);
};

async function guardarComo(rol: Rol, estado: M.EstadoClub, version: number): Promise<RespuestaGuardarFoto> {
  sesion.rol = rol;
  const { guardarFotoDelClub } = await import("./estado-actions");
  const fd = new FormData();
  fd.set("foto", await comprimir(JSON.stringify({ v: M.VERSION_ESTADO, estado, secuencia: M.secuenciaIds(), guardado: 1 })), "foto.json.gz");
  fd.set("version", String(version));
  return guardarFotoDelClub(fd);
}

const estadoDeLaBase = () => {
  const h = M.hidratarEstado(JSON.parse(base!.texto));
  assert.ok(h.ok, "la foto guardada se puede leer");
  return h.estado;
};

test("F5: recepción llama a guardarFotoDelClub con la firma de caja en 2 (y precios, seña, fondo y alias): el servidor guarda lo suyo pero no eso, y su PIN de 2 no firma", async () => {
  // La dueña deja el club con la firma en 4.
  const club = M.generarDemo(HOY, 19 * 60);
  club.config.caja = { largoPinFirma: 4, pedirNombreJugador: false };
  assert.deepEqual(await guardarComo("OWNER", club, 0), { ok: true, version: 1 });

  // Recepción manda la foto entera con lo delicado tocado, directo a la acción.
  const ataque = structuredClone(club);
  ataque.config.caja = { largoPinFirma: 2, pedirNombreJugador: true };
  ataque.config.tarifas[0].precioHora = 1;
  ataque.config.politica.senaPct = 0;
  ataque.config.bloqueoMin = 60;
  ataque.config.cobro = { alias: "alias.de.recepcion" };
  ataque.caja.fondo = 999999;
  ataque.clientes[0].nombre = "Ana Editada"; // lo que recepción sí puede cambiar
  const avisos: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => void avisos.push(a);
  let r: RespuestaGuardarFoto;
  try {
    r = await guardarComo("RECEPTION", ataque, 1);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(r, { ok: true, version: 2 }, "el guardado de recepción entra (es su jornada)");
  assert.equal(avisos.length, 1, "queda el evento de seguridad en los logs");

  const guardado = estadoDeLaBase();
  assert.equal(M.largoFirmaCaja(guardado), 4, "la firma de caja sigue en 4");
  assert.deepEqual(guardado.config.caja, club.config.caja);
  assert.deepEqual(guardado.config.tarifas, club.config.tarifas);
  assert.equal(guardado.config.politica.senaPct, club.config.politica.senaPct);
  assert.equal(guardado.config.bloqueoMin, club.config.bloqueoMin);
  assert.deepEqual(guardado.config.cobro, club.config.cobro);
  assert.equal(guardado.caja.fondo, club.caja.fondo);
  assert.equal(guardado.clientes[0].nombre, "Ana Editada", "lo demás de recepción se guarda");
  const retiro = M.retiroCajaFuerte(guardado, { monto: 1000, usuarioId: "u-lu", pin: "33" }, { fecha: HOY, min: 19 * 60 + 15 });
  assert.equal(retiro.ok, false, "recepción con su PIN de 2 no firma el retiro");
  assert.equal((retiro as { pinCorto?: boolean }).pinCorto, true, "lo frena el largo de la firma, no otra cosa");
});

test("F5: la dueña del ERP sí cambia la firma de caja por la misma acción (la red es sólo para quien no es dueño)", async () => {
  const club = estadoDeLaBase();
  club.config.caja = { ...(club.config.caja ?? {}), largoPinFirma: 2 };
  const version = base!.version;
  assert.deepEqual(await guardarComo("OWNER", club, version), { ok: true, version: version + 1 });
  assert.equal(M.largoFirmaCaja(estadoDeLaBase()), 2);
});
