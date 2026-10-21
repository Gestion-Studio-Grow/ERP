// ============================================================================
// G8 EN EL SERVIDOR — lo delicado de la foto del club (usuarios y PIN) sólo lo cambia un dueño del ERP.
// ============================================================================
//
// En el «modo foto» `guardarFotoDelClub` recibe el estado ENTERO. Si guarda alguien que no es OWNER del ERP (la
// tablet de recepción), el servidor CONSERVA los usuarios de la foto vigente: altas, bajas, roles y PIN quedan como
// estaban. Lo único que pasa es el PIN propio de un usuario de recepción que lo cambió (sabiendo el actual, en
// «Cambiar mi PIN»): mismo usuario, mismo rol, PIN válido para su rol (con hash, del largo del rol y con la MISMA sal).
// El PIN de un dueño, nunca desde recepción. La sal del club (`salPin`) tampoco cambia desde otro puesto.
// Sí pasa el MISMO PIN guardado con hash (la jornada de recepción que abre una foto de antes del 21/10 los pasa a
// hash): se comprueba que el hash nuevo sea el del PIN en claro de la base con la sal de la foto.
//
// La pantalla ya no ofrece lo delicado fuera del puesto del dueño (config-usuarios.tsx, TableroDelDuenio.tsx): esto
// es la red de abajo, para que un guardado de recepción no pueda pisar ni borrar PIN aunque la pantalla falle.
//
// PURO: texto de la foto vigente + texto que llega → texto a guardar. Si alguno no se puede leer, no se toca nada
// (el repositorio rechaza lo ilegible por su lado).
//
// — Elaborado por GSG

import { esPinConHash, hashPin, largoPin, pinValidoPara } from "./motor.mjs";

interface UsuarioCrudo {
  id?: unknown;
  rol?: unknown;
  pin?: unknown;
  [k: string]: unknown;
}

function usuariosDe(sobre: unknown): UsuarioCrudo[] | null {
  const u = (sobre as { estado?: { usuarios?: unknown } } | null)?.estado?.usuarios;
  return Array.isArray(u) ? (u as UsuarioCrudo[]) : null;
}

/** El texto a guardar cuando guarda alguien que no es dueño del ERP, y si hubo que corregir algo. */
export function conservarLoDelicado(textoVigente: string, textoNuevo: string): { texto: string; corregido: boolean } {
  let vigente: unknown;
  let nuevo: unknown;
  try {
    vigente = JSON.parse(textoVigente);
    nuevo = JSON.parse(textoNuevo);
  } catch {
    return { texto: textoNuevo, corregido: false };
  }
  const antes = usuariosDe(vigente);
  const ahora = usuariosDe(nuevo);
  if (!antes || !ahora) return { texto: textoNuevo, corregido: false };
  const porId = new Map(ahora.map((u) => [u.id, u]));
  // Con PIN con hash, la sal del club también es delicada: cambiarla invalidaría todos los PIN.
  const salAntes = (vigente as { estado?: { salPin?: unknown } }).estado?.salPin;
  const salAhora = (nuevo as { estado?: { salPin?: unknown } }).estado?.salPin;
  const misma = salAntes === undefined || salAntes === salAhora;
  const pinNuevoValido = (rol: string, n: UsuarioCrudo) =>
    typeof n.pin === "string" && (esPinConHash(n.pin) ? misma && Number(n.pinLargo) === largoPin(rol) : pinValidoPara(rol, n.pin));
  const mismoPinConHash = (u: UsuarioCrudo, n: UsuarioCrudo) =>
    typeof u.pin === "string" && u.pin !== "" && !esPinConHash(u.pin) && typeof n.pin === "string" && esPinConHash(n.pin) &&
    typeof salAhora === "string" && salAhora !== "" && misma && Number(n.pinLargo) === u.pin.length && hashPin(u.pin, salAhora) === n.pin;
  const quedan = antes.map((u) => {
    const n = porId.get(u.id);
    if (n && n.rol === u.rol && mismoPinConHash(u, n)) return { ...u, pin: n.pin, pinLargo: n.pinLargo };
    const pinPropio = n && u.rol !== "duenio" && n.rol === u.rol && n.pin !== u.pin && pinNuevoValido(String(u.rol), n);
    if (!pinPropio) return u;
    const c: UsuarioCrudo = { ...u, pin: n.pin };
    if (esPinConHash(n.pin)) c.pinLargo = n.pinLargo;
    else delete c.pinLargo;
    return c;
  });
  const usuariosIguales = JSON.stringify(quedan) === JSON.stringify(ahora);
  if (usuariosIguales && misma) return { texto: textoNuevo, corregido: false };
  const e = (nuevo as { estado: { usuarios: unknown; salPin?: unknown } }).estado;
  e.usuarios = quedan;
  if (salAntes !== undefined) e.salPin = salAntes;
  return { texto: JSON.stringify(nuevo), corregido: true };
}
