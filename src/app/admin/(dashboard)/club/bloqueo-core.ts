// ============================================================================
// EL BLOQUEO DEL CLUB — quién entra con su PIN, cuántos intentos le quedan y cuándo se vuelve a bloquear. PURO.
// ============================================================================
//
// Paridad con el club vanilla (public/previews/breakpoint/club/app.mjs: `bloqueo`, `desbloquear`, `guardarIntentos`,
// `revisarInactividad`), que es lo que el club usa hoy:
//   · En la jornada real nadie opera hasta poner su PIN (4 dígitos los dueños, 2 recepción: `largoPin` del motor). Se bloquea tras `config.bloqueoMin` minutos sin
//     uso (0 = sólo al apagar la pantalla), si la pantalla estuvo apagada o en otra app 30 s o más, a mano y al recargar.
//   · El PIN se prueba CONTRA UNA PERSONA (`verificarPin`): la que estaba, o la que se elige de la lista. Así cada
//     intento acierta 1 de 10.000 con un dueño (1 de 100 con recepción), no «cualquiera de los N usuarios» como con
//     `usuarioPorPin`.
//   · 5 PIN mal → espera; cada tanda espera más: 30 s, 2 min y después 10 min siempre. Un PIN bueno vuelve todo a cero.
//     En la jornada real queda guardado en el equipo por negocio (`gsg-club:<negocio>:intentos-bloqueo:v1`, el
//     `bp-intentos` del vanilla), así que recargar no lo borra. Borrar lo guardado tampoco destraba ESTA pestaña.
//   · Lo que no tiene el largo del rol de esa persona no se llega a evaluar: no gasta un intento (y nunca vale: el motor
//     lo rechaza igual). A un dueño se le acepta también el viejo de 2 (`pinAceptadoPara`): los PIN del piloto.
//   · Dueño con el PIN viejo de 2 (`pinDesactualizado`): el PIN es bueno, pero antes de operar elige uno de 4 — es un
//     paso de la pantalla bloqueada (`entrarConPinNuevo`), como `pedirPinNuevo` del vanilla. No toca nada de lo cargado.
// El reloj se inyecta (`ahoraMs`) en todo: los tests no esperan.

import { cambiarMiPin, largoPin, pinAceptadoPara, pinDesactualizado, pinFacil, pinValidoPara, textoLargoPin, usuario as usuarioDe, verificarPin } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Rol, Usuario } from "@/lib/club/motor.mjs";
import type { Almacen, AlmacenamientoLocal, Desenlace } from "./almacen";

export const INTENTOS_DEL_BLOQUEO = 5;
/** La espera de cada tanda de 5 PIN mal: 30 s, 2 min y, de la tercera en adelante, 10 min. */
export const ESPERAS_DEL_BLOQUEO_MS: readonly number[] = [30_000, 120_000, 600_000];
/** Pantalla apagada o en otra app por 30 s o más: al volver, se pide el PIN. */
export const OCULTA_MAX_MS = 30_000;
/** Cada cuánto se mira si pasó el tiempo sin uso (como el vanilla). */
export const REVISAR_INACTIVIDAD_MS = 15_000;

export interface IntentosDelBloqueo {
  /** PIN mal seguidos en esta tanda (0–5). */
  fallos: number;
  /** Hasta cuándo hay que esperar (ms); 0 = no hay espera. */
  esperaHasta: number;
  /** Cuántas tandas de 5 mal van sin un PIN bueno (decide cuánto se espera). */
  tandas: number;
}

export const SIN_INTENTOS_DEL_BLOQUEO: IntentosDelBloqueo = Object.freeze({ fallos: 0, esperaHasta: 0, tandas: 0 });

/** Cuántos segundos faltan para poder probar (0 = ya se puede). */
export function segundosDeEspera(i: IntentosDelBloqueo, ahoraMs: number): number {
  return i.esperaHasta > ahoraMs ? Math.ceil((i.esperaHasta - ahoraMs) / 1000) : 0;
}

/** Si la espera ya pasó, la tanda arranca de cero (las tandas siguen contando hasta un PIN bueno). */
export function intentosVigentes(i: IntentosDelBloqueo, ahoraMs: number): IntentosDelBloqueo {
  if (i.fallos >= INTENTOS_DEL_BLOQUEO && i.esperaHasta <= ahoraMs) return { fallos: 0, esperaHasta: 0, tandas: i.tandas };
  return i;
}

/** Anota un PIN malo: el quinto de la tanda traba (30 s, 2 min, 10 min…). Pura. */
export function anotarFallo(previo: IntentosDelBloqueo, ahoraMs: number): IntentosDelBloqueo {
  const i = intentosVigentes(previo, ahoraMs);
  const fallos = i.fallos + 1;
  if (fallos < INTENTOS_DEL_BLOQUEO) return { ...i, fallos };
  const tandas = i.tandas + 1;
  const espera = ESPERAS_DEL_BLOQUEO_MS[Math.min(tandas, ESPERAS_DEL_BLOQUEO_MS.length) - 1];
  return { fallos, esperaHasta: ahoraMs + espera, tandas };
}

/** «esperá 30 segundos» · «esperá 2 minutos». Se arma UNA vez por espera (el lector no lo re-anuncia cada segundo). */
export function textoDeEspera(segundos: number): string {
  if (segundos <= 0) return "";
  return segundos <= 60 ? `Demasiados PIN equivocados: esperá ${segundos} segundos.` : `Demasiados PIN equivocados: esperá ${Math.ceil(segundos / 60)} minutos.`;
}

/** La cuenta regresiva que se VE (no se anuncia): «0:30», «1:54», «9:59». */
export function relojDeEspera(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Lo que pasó al probar un PIN. */
export type PruebaDePin =
  | { tipo: "espera"; segundos: number; mensaje: string }
  | { tipo: "incompleto"; mensaje: string }
  | { tipo: "malo"; intentos: IntentosDelBloqueo; mensaje: string }
  | {
      tipo: "bueno";
      usuario: Usuario;
      pin: string;
      intentos: IntentosDelBloqueo;
      /** Entró con un PIN del largo viejo (dueño del piloto con 2): antes de operar elige uno nuevo. */
      pinViejo: boolean;
    };

/**
 * ¿Tiene la forma de un PIN de ese rol? El largo del rol (dueño 4, recepción 2) o, para un dueño, el viejo de 2. Lo
 * demás no se evalúa (ni gasta un intento).
 */
export function pinCompleto(pin: string, rol: Rol | null | undefined): boolean {
  return pinAceptadoPara(rol, pin);
}

/** «Poné los 4 números de tu PIN.» (dueño) · «Poné los 2 números de tu PIN.» (recepción). */
export function textoPinIncompleto(rol: Rol | null | undefined): string {
  return `Poné los ${largoPin(rol)} números de tu PIN.`;
}

/** El rol con el que se mide el PIN de esa persona. Si no existe, el de dueño: acepta 2 y 4, así cuenta como malo. */
export function rolDelPin(estado: EstadoClub, usuarioId: string | null): Rol {
  return (usuarioId ? usuarioDe(estado, usuarioId)?.rol : null) ?? "duenio";
}

/**
 * Prueba el PIN de UNA persona con el tope de intentos. Trabado → no se evalúa. Incompleto (vacío, 1 número, letras)
 * → no se evalúa ni cuenta. Malo (PIN equivocado, usuario inactivo o sin PIN) → cuenta. Bueno → todo a cero. Pura.
 */
export function probarPin(estado: EstadoClub, usuarioId: string | null, pin: string, previo: IntentosDelBloqueo, ahoraMs: number): PruebaDePin {
  const i = intentosVigentes(previo, ahoraMs);
  const espera = segundosDeEspera(i, ahoraMs);
  if (espera > 0) return { tipo: "espera", segundos: espera, mensaje: textoDeEspera(espera) };
  if (!usuarioId) return { tipo: "incompleto", mensaje: "Elegí quién entra." };
  const limpio = String(pin ?? "").trim();
  const rol = rolDelPin(estado, usuarioId);
  if (!pinCompleto(limpio, rol)) return { tipo: "incompleto", mensaje: textoPinIncompleto(rol) };
  const r = verificarPin(estado, usuarioId, limpio);
  if (r.ok) return { tipo: "bueno", usuario: r.usuario, pin: limpio, intentos: SIN_INTENTOS_DEL_BLOQUEO, pinViejo: pinDesactualizado(estado, r.usuario.id) };
  const intentos = anotarFallo(i, ahoraMs);
  const s = segundosDeEspera(intentos, ahoraMs);
  // El motivo del motor dice si el usuario no tiene acceso o PIN; nunca muestra un PIN.
  const mensaje = s > 0 ? textoDeEspera(s) : `${r.motivo.replace(/\.$/, "")} (${intentos.fallos} de ${INTENTOS_DEL_BLOQUEO}).`;
  return { tipo: "malo", intentos, mensaje };
}

// ───────────── dónde viven los intentos ─────────────

/**
 * La clave de los intentos del bloqueo en este equipo: la del NEGOCIO, de la misma familia que la jornada
 * (`gsg-club:<negocio>:…`). Sin negocio (la recepción todavía no se lo pasa a la pieza) cae a una clave del equipo
 * (`gsg-club:*:…`; «*» no es un negocio posible): más estricta, nunca más floja.
 */
export function claveDeIntentosDelBloqueo(negocio?: string | null): string {
  const n = negocio?.trim();
  return `gsg-club:${n || "*"}:intentos-bloqueo:v1`;
}

export interface GuardaDelBloqueo {
  leer(): IntentosDelBloqueo;
  guardar(i: IntentosDelBloqueo): void;
}

function deTexto(crudo: string | null): IntentosDelBloqueo | null {
  if (!crudo) return null;
  try {
    const x = JSON.parse(crudo) as Partial<IntentosDelBloqueo>;
    const fallos = Number(x?.fallos);
    const esperaHasta = Number(x?.esperaHasta);
    const tandas = Number(x?.tandas ?? 0);
    if (![fallos, esperaHasta, tandas].every(Number.isFinite)) return null;
    return { fallos: Math.min(INTENTOS_DEL_BLOQUEO, Math.max(0, Math.floor(fallos))), esperaHasta: Math.max(0, esperaHasta), tandas: Math.max(0, Math.floor(tandas)) };
  } catch {
    return null;
  }
}

/**
 * Los intentos en este equipo (localStorage con `clave`), o sólo en memoria (`clave` null: la demo; o sin
 * almacenamiento: incógnito, sin lugar). Nunca tira. Al leer, gana lo MÁS trabado entre lo guardado y lo de esta
 * pestaña: borrar lo guardado (o que otra pestaña escriba menos) no destraba. Un PIN bueno (`SIN_INTENTOS…`) sí limpia.
 */
export function guardaDelBloqueo(almacenamiento: AlmacenamientoLocal | null, clave: string | null): GuardaDelBloqueo {
  let enMemoria: IntentosDelBloqueo = SIN_INTENTOS_DEL_BLOQUEO;
  return {
    leer() {
      if (almacenamiento && clave) {
        try {
          const g = deTexto(almacenamiento.getItem(clave));
          if (g) {
            enMemoria = {
              fallos: g.tandas === enMemoria.tandas ? Math.max(g.fallos, enMemoria.fallos) : g.tandas > enMemoria.tandas ? g.fallos : enMemoria.fallos,
              esperaHasta: Math.max(g.esperaHasta, enMemoria.esperaHasta),
              tandas: Math.max(g.tandas, enMemoria.tandas),
            };
          }
        } catch {
          // sin acceso al almacenamiento: lo de memoria
        }
      }
      return enMemoria;
    },
    guardar(i) {
      enMemoria = i;
      if (!almacenamiento || !clave) return;
      try {
        if (i.fallos === 0 && i.esperaHasta === 0 && i.tandas === 0) almacenamiento.removeItem(clave);
        else almacenamiento.setItem(clave, JSON.stringify(i));
      } catch {
        // sin lugar: queda en memoria
      }
    },
  };
}

// ───────────── cuándo se bloquea ─────────────

/** ¿Pasaron `bloqueoMin` minutos sin uso? (0 = nunca por tiempo: sólo al apagar la pantalla). */
export function vencioLaInactividad(ultimoUsoMs: number, ahoraMs: number, bloqueoMin: number): boolean {
  const min = Number(bloqueoMin);
  return Number.isFinite(min) && min > 0 && ahoraMs - ultimoUsoMs >= min * 60_000;
}

/** ¿La pantalla estuvo apagada (o en otra app) lo suficiente para pedir el PIN al volver? */
export function vuelveDeLaPantallaApagada(ocultaDesdeMs: number | null, ahoraMs: number): boolean {
  return ocultaDesdeMs !== null && ahoraMs - ocultaDesdeMs >= OCULTA_MAX_MS;
}

export type MotivoDelBloqueo = "recarga" | "inactividad" | "pantalla" | "manual" | "cambio";

/** La línea de abajo del título, en criollo. */
export function textoDelMotivo(motivo: MotivoDelBloqueo, bloqueoMin: number): string {
  switch (motivo) {
    case "inactividad":
      return `Pasaron ${bloqueoMin} minutos sin uso.`;
    case "pantalla":
      return "La pantalla se apagó o se cambió de app.";
    case "manual":
      return "Se bloqueó a mano.";
    case "cambio":
      return "Elegí quién entra y poné su PIN.";
    default:
      return "Se volvió a abrir el sistema: poné tu PIN.";
  }
}

/** Quién puede entrar: activos y con PIN armado (sin PIN no hay cómo). Sin PINs: sólo id, nombre y rol. */
export interface QuienEntra {
  id: string;
  nombre: string;
  rol: Usuario["rol"];
}

export function quienesPuedenEntrar(estado: EstadoClub): QuienEntra[] {
  return estado.usuarios.filter((u) => u.activo !== false && !!u.pin).map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }));
}

/** El primer nombre, para «Hola, Majo.» y «PIN de Majo». */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

// ───────────── el pedido de bloqueo (lo usan la pieza y el botón de la cinta) ─────────────

/** Lo mínimo del almacén para bloquear: no hace falta el resto (los tests usan uno de mentira). */
export interface AlmacenQueSeBloquea {
  modo(): "demo" | "real";
  operador(): { usuario: Usuario } | null;
  cambiarOperador(usuario: Usuario | null): void;
}

interface UltimoBloqueo {
  motivo: MotivoDelBloqueo;
  /** Quién estaba (para «Tu PIN para seguir»); null = nadie (recarga): se elige de la lista. */
  usuarioId: string | null;
}

const bloqueos = new WeakMap<object, UltimoBloqueo>();

/**
 * Bloquea el club: anota por qué y quién estaba, y deja sin operador (`cambiarOperador(null)`: apaga «Deshacer»). La
 * pieza del bloqueo lo ve por `suscribirOperador` y tapa todo. En la demo no hace nada (opera el usuario de ejemplo).
 * Devuelve si bloqueó.
 */
export function bloquearElClub(almacen: AlmacenQueSeBloquea, motivo: MotivoDelBloqueo): boolean {
  if (almacen.modo() !== "real") return false;
  const op = almacen.operador();
  if (!op) return false;
  bloqueos.set(almacen, { motivo, usuarioId: op.usuario.id });
  almacen.cambiarOperador(null);
  return true;
}

/** Por qué está bloqueado y quién estaba. Sin pedido anotado (recién abierto), es la recarga y no había nadie. */
export function ultimoBloqueo(almacen: object): UltimoBloqueo {
  return bloqueos.get(almacen) ?? { motivo: "recarga", usuarioId: null };
}

/** Al entrar se olvida el pedido: el próximo bloqueo anota el suyo. */
export function olvidarBloqueo(almacen: object): void {
  bloqueos.delete(almacen);
}

// ───────────── el PIN viejo de un dueño: elegir uno nuevo antes de operar ─────────────

/**
 * Un cambio de PIN pendiente (dueño que entró con el viejo y todavía no eligió el nuevo). El PIN viejo queda SÓLO en
 * memoria hasta guardar el nuevo: nunca se muestra, ni se guarda aparte, ni va al almacén.
 */
export interface CambioDePinPendiente {
  usuarioId: string;
  viejo: string;
}

const cambiosPendientes = new WeakMap<object, CambioDePinPendiente>();

/** Desde «Cambiar de usuario»: el dueño con PIN viejo pasa a la pantalla bloqueada, directo al paso del PIN nuevo. */
export function anotarCambioDePin(almacen: object, cambio: CambioDePinPendiente): void {
  cambiosPendientes.set(almacen, cambio);
}

/** Lo lee la pantalla bloqueada al montarse (sin borrarlo: lo olvida aparte, en un efecto, para el modo estricto). */
export function cambioDePinPendiente(almacen: object): CambioDePinPendiente | null {
  return cambiosPendientes.get(almacen) ?? null;
}

/** Se usa una vez: la pantalla ya lo tiene en su estado (o se entró por otro lado). */
export function olvidarCambioDePin(almacen: object): void {
  cambiosPendientes.delete(almacen);
}

/** «Tu PIN de dueño ahora es de 4 números.» (el aviso del paso; recepción, si alguna vez le tocara, su largo). */
export function textoPinNuevoObligatorio(rol: Rol | null | undefined): string {
  return rol === "duenio" ? `Tu PIN de dueño ahora es de ${largoPin(rol)} números. Elegí uno nuevo: lo cargado queda todo igual.` : `Tu PIN ahora es de ${largoPin(rol)} números. Elegí uno nuevo: lo cargado queda todo igual.`;
}

/**
 * Lo que se revisa ANTES de tocar nada (puro): que el viejo siga siendo el PIN de esa persona, el nuevo del largo del
 * rol, los dos iguales y que no se adivine fácil (`pinFacil` del motor: ni los de ejemplo de la demo, ni todos iguales,
 * ni escaleras como 1234). El motor vuelve a controlar todo (y que nadie más lo use).
 */
export function revisarPinNuevo(estado: EstadoClub, cambio: CambioDePinPendiente, nuevo: string, repetido: string): { ok: true; usuario: Usuario; nuevo: string } | { ok: false; mensaje: string } {
  const v = verificarPin(estado, cambio.usuarioId, cambio.viejo);
  if (!v.ok) return { ok: false, mensaje: "Ese PIN ya no sirve: volvé a entrar con tu PIN." };
  const n = String(nuevo ?? "").trim();
  if (!pinValidoPara(v.usuario.rol, n)) return { ok: false, mensaje: textoLargoPin(v.usuario.rol, true) };
  if (n !== String(repetido ?? "").trim()) return { ok: false, mensaje: "Los dos PIN no coinciden: escribilo igual las dos veces." };
  const facil = pinFacil(v.usuario.rol, n);
  if (facil) return { ok: false, mensaje: facil };
  return { ok: true, usuario: v.usuario, nuevo: n };
}

/** Lo mínimo del almacén para el cambio (los tests usan uno de mentira). */
export type AlmacenQueCambiaElPin = Pick<Almacen, "estado" | "operador" | "cambiarOperador" | "ejecutar">;

/**
 * El dueño con PIN viejo elige el nuevo y entra. El almacén no deja operar sin alguien adentro, así que la secuencia es
 * (todo en el mismo tic, sin pintar en el medio):
 *   1. se revisa todo sin tocar nada (`revisarPinNuevo`): si algo está mal, no se toca el operador;
 *   2. entra con el PIN viejo YA verificado (`cambiarOperador`) y en la misma tirada `ejecutar` → `cambiarMiPin` del
 *      motor (que vuelve a verificar el viejo y que el nuevo no lo use nadie), sin «Deshacer»;
 *   3. si el motor dice que no, vuelve a quedar sin operador (la pantalla sigue bloqueada); si sale, queda adentro con
 *      el PIN nuevo (lo próximo que pida PIN, pide el nuevo).
 * Nunca queda operando con el PIN viejo: o termina con el nuevo, o sin nadie. Devuelve el desenlace.
 */
export function entrarConPinNuevo(almacen: AlmacenQueCambiaElPin, cambio: CambioDePinPendiente, nuevo: string, repetido: string): Desenlace {
  const r = revisarPinNuevo(almacen.estado(), cambio, nuevo, repetido);
  if (!r.ok) return r;
  almacen.cambiarOperador(r.usuario, { usuarioId: r.usuario.id, pin: cambio.viejo });
  const d = almacen.ejecutar((estado: EstadoClub, ahora: Ahora, auth) => {
    const c = cambiarMiPin(estado, auth, r.nuevo, ahora);
    return c.ok ? { ok: true, mensaje: "Tu PIN nuevo quedó guardado." } : { ok: false, mensaje: c.motivo };
  });
  const yo = usuarioDe(almacen.estado(), r.usuario.id);
  if (!d.ok || !yo || yo.pin !== r.nuevo) {
    almacen.cambiarOperador(null);
    return d.ok ? { ok: false, mensaje: "No se pudo guardar el PIN nuevo. Probá de nuevo." } : d;
  }
  almacen.cambiarOperador(yo, { usuarioId: yo.id, pin: r.nuevo });
  return d;
}
