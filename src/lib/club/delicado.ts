// ============================================================================
// G8 EN EL SERVIDOR — lo delicado de la foto del club (usuarios, PIN, reglas que mueven plata o permisos) sólo lo
// cambia un dueño del ERP.
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
// Lo mismo con «Reglas y precios» y «Avisos» (CERT-B4 vuelta 4, F5): lo que mueve plata o permisos queda como en la
// foto vigente (`CONFIG_DELICADA`). Ejemplo del ataque que cierra: recepción manda `config.caja.largoPinFirma = 2` y
// después firma un retiro con su PIN de 2 (D-16 apagado para siempre).
//
// La pantalla ya no ofrece lo delicado fuera del puesto del dueño (config-usuarios.tsx, TableroDelDuenio.tsx,
// config-reglas.tsx): esto es la red de abajo, para que un guardado de recepción no pueda pisar ni borrar PIN ni
// cambiar precios o la firma de caja aunque la pantalla falle.
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

/**
 * Lo de la foto que mueve plata o permisos y sólo cambia un dueño (`[objeto del estado, clave]`). Todo sale de
 * «Reglas y precios» o «Avisos» (configuracion-core.ts, `ejecutar` → `reglas` / `avisos`, que el motor ya reserva a
 * un dueño con `configura`); recepción no tiene ningún camino legítimo que los cambie.
 */
export const CONFIG_DELICADA: readonly (readonly ["config" | "caja", string])[] = [
  ["config", "caja"], // largoPinFirma (D-16: quién firma cierres, retiros y egresos) y pedirNombreJugador (B4-C4/C5)
  ["config", "tarifas"], // el precio por hora de cada tarifa
  ["config", "politica"], // seña, cancelación sin perderla, faltas para pedirla, tolerancia, cuándo se abre la cancha
  ["config", "bloqueoMin"], // a los cuántos minutos se bloquea la pantalla (quién queda operando)
  ["config", "cobro"], // el alias donde los clientes pagan la seña
  ["config", "contactos"], // a qué celular van los avisos y las aprobaciones del dueño
  ["caja", "fondo"], // el cambio del cajón: el efectivo esperado de cada cierre
];

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Deja en `nuevo` lo de `CONFIG_DELICADA` como en `vigente`. Devuelve si cambió algo. */
function conservarConfigDelicada(vigente: unknown, nuevo: unknown): boolean {
  const ev = (vigente as { estado?: unknown } | null)?.estado;
  const en = (nuevo as { estado?: unknown } | null)?.estado;
  if (!esObjeto(ev) || !esObjeto(en)) return false;
  let cambio = false;
  for (const [objeto, clave] of CONFIG_DELICADA) {
    const dondeAntes = esObjeto(ev[objeto]) ? (ev[objeto] as Record<string, unknown>) : {};
    const valorAntes = dondeAntes[clave];
    const dondeAhora = en[objeto];
    if (esObjeto(dondeAhora) && JSON.stringify(dondeAhora[clave]) === JSON.stringify(valorAntes)) continue;
    // Si el objeto no vino (una foto rota), se arma para que no queden los valores de fábrica en lugar de los del club.
    const destino: Record<string, unknown> = esObjeto(dondeAhora) ? dondeAhora : (en[objeto] = {});
    if (valorAntes === undefined) delete destino[clave];
    else destino[clave] = structuredClone(valorAntes);
    cambio = true;
  }
  return cambio;
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
  const configCorregida = conservarConfigDelicada(vigente, nuevo);
  const antes = usuariosDe(vigente);
  const ahora = usuariosDe(nuevo);
  if (!antes || !ahora) return configCorregida ? { texto: JSON.stringify(nuevo), corregido: true } : { texto: textoNuevo, corregido: false };
  const porId = new Map(ahora.map((u) => [u.id, u]));
  // Con PIN con hash, la sal del club también es delicada: cambiarla invalidaría todos los PIN.
  const salAntes = (vigente as { estado?: { salPin?: unknown } }).estado?.salPin;
  const salAhora = (nuevo as { estado?: { salPin?: unknown } }).estado?.salPin;
  // Una sal es texto en hex (la arma el motor, `salDelClub`): otra cosa no se acepta ni para estrenarla.
  const salValida = (x: unknown) => typeof x === "string" && /^[0-9a-f]{16,128}$/.test(x);
  const misma = salAntes === undefined ? salAhora === undefined || salValida(salAhora) : salAntes === salAhora;
  const pinNuevoValido = (rol: string, n: UsuarioCrudo) =>
    typeof n.pin === "string" && (esPinConHash(n.pin) ? misma && Number(n.pinLargo) === largoPin(rol) : pinValidoPara(rol, n.pin));
  const mismoPinConHash = (u: UsuarioCrudo, n: UsuarioCrudo) =>
    typeof u.pin === "string" && u.pin.trim() !== "" && !esPinConHash(u.pin) && typeof n.pin === "string" && esPinConHash(n.pin) &&
    salValida(salAhora) && misma && Number(n.pinLargo) === u.pin.trim().length && hashPin(u.pin, salAhora as string) === n.pin;
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
  if (usuariosIguales && misma) return configCorregida ? { texto: JSON.stringify(nuevo), corregido: true } : { texto: textoNuevo, corregido: false };
  const e = (nuevo as { estado: { usuarios: unknown; salPin?: unknown } }).estado;
  e.usuarios = quedan;
  if (salAntes !== undefined) e.salPin = salAntes;
  else if (!salValida(salAhora)) delete e.salPin; // una sal que no es válida no se estrena (ningún PIN quedó con ella)
  return { texto: JSON.stringify(nuevo), corregido: true };
}
