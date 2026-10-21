// ============================================================================
// G8 EN EL SERVIDOR — lo delicado de la foto del club (usuarios y PIN) sólo lo cambia un dueño del ERP.
// ============================================================================
//
// En el «modo foto» `guardarFotoDelClub` recibe el estado ENTERO. Si guarda alguien que no es OWNER del ERP (la
// tablet de recepción), el servidor CONSERVA los usuarios de la foto vigente: altas, bajas, roles y PIN quedan como
// estaban. Lo único que pasa es el PIN propio de un usuario de recepción que lo cambió (sabiendo el actual, en
// «Cambiar mi PIN»): mismo usuario, mismo rol, PIN válido para su rol. El PIN de un dueño, nunca desde recepción.
//
// La pantalla ya no ofrece lo delicado fuera del puesto del dueño (config-usuarios.tsx, TableroDelDuenio.tsx): esto
// es la red de abajo, para que un guardado de recepción no pueda pisar ni borrar PIN aunque la pantalla falle.
//
// PURO: texto de la foto vigente + texto que llega → texto a guardar. Si alguno no se puede leer, no se toca nada
// (el repositorio rechaza lo ilegible por su lado).
//
// — Elaborado por GSG

import { pinValidoPara } from "./motor.mjs";

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
  const quedan = antes.map((u) => {
    const n = porId.get(u.id);
    const pinPropio =
      n && u.rol !== "duenio" && n.rol === u.rol && typeof n.pin === "string" && n.pin !== u.pin && pinValidoPara(String(u.rol), n.pin);
    return pinPropio ? { ...u, pin: n.pin } : u;
  });
  if (JSON.stringify(quedan) === JSON.stringify(ahora)) return { texto: textoNuevo, corregido: false };
  (nuevo as { estado: { usuarios: unknown } }).estado.usuarios = quedan;
  return { texto: JSON.stringify(nuevo), corregido: true };
}
