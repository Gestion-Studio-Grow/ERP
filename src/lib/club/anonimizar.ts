// ============================================================================
// ANONIMIZAR UN RESPALDO DEL CLUB — para usar un respaldo real como fixture sin un solo dato de una persona.
// ============================================================================
//
// Lo que cambia (y siempre igual dentro del mismo respaldo: la misma persona queda con el mismo alias):
//   · nombres de clientes («Cliente 001»), de usuarios («Dueño 1», «Recepción 1»), de proveedores («Proveedor 1») y
//     de quien jugó sin ficha («Jugador 001»), en su campo y DENTRO de cualquier texto (conceptos de caja, el
//     registro, notas, «a cargo de», quién aprobó…): se reemplaza el nombre completo y cada palabra del nombre;
//   · los ids de los usuarios (suelen llevar el nombre: «u-rober») y su PIN (dos dígitos de ejemplo: 11, 22, 33…);
//   · teléfonos, mails, CUIT, CBU/CVU, alias de cobro, referencias de comprobantes.
// Lo que NO cambia: montos, fechas, horarios, ids de turnos/cuentas/clientes/productos, productos y reglas. La caja
// del respaldo anonimizado da lo mismo al centavo (lo prueba anonimizar.test.ts).
//
// Al final se revisa el resultado entero: si queda algún nombre o teléfono original, `residuos` lo dice (el script
// falla). Puro: no lee ni escribe archivos.
//
// — Elaborado por GSG

import type { Sobre } from "./foto";

export interface InformeDeAnonimizado {
  personas: number;
  usuarios: number;
  contactos: number;
  /** Datos originales que quedaron en el resultado (debería estar vacío). */
  residuos: string[];
}

const CLAVES_DE_CONTACTO = new Set(["tel", "telefono", "celular", "whatsapp", "email", "mail", "cuit", "cuil", "dni", "cbu", "cvu", "alias", "instagram", "direccion", "ref"]);

/** Palabras de un titular que no son de una persona («Clase 4ta — Profe X», «Grupo de X (nuevo)»): no se tocan sueltas. */
const GENERICAS = new Set(["mostrador", "tienda", "clase", "partido", "abierto", "abierta", "grupo", "nuevo", "nueva", "profe", "torneo", "turno", "cancha", "del", "los", "las", "con", "sin", "para", "mesa", "fijo", "amigos", "equipo"]);

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const LETRA = "\\p{L}";
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function anonimizarSobre(original: Sobre): { sobre: Sobre; informe: InformeDeAnonimizado } {
  const e = original.estado as unknown as Record<string, unknown>;
  const lista = (k: string) => (Array.isArray(e[k]) ? (e[k] as Record<string, unknown>[]) : []);
  const texto = (x: unknown) => (typeof x === "string" ? x.trim() : "");

  // ── alias de personas, en orden de aparición ──
  const alias = new Map<string, string>();
  const poner = (nombre: unknown, a: string) => {
    const n = texto(nombre);
    if (n && !alias.has(n)) alias.set(n, a);
  };
  lista("clientes").forEach((c, i) => poner(c.nombre, `Cliente ${String(i + 1).padStart(3, "0")}`));
  const usuarios = lista("usuarios");
  let duenios = 0;
  let recepcion = 0;
  const idsUsuarios = new Map<string, string>();
  usuarios.forEach((u, i) => {
    poner(u.nombre, u.rol === "duenio" ? `Dueño ${++duenios}` : `Recepción ${++recepcion}`);
    if (typeof u.id === "string") idsUsuarios.set(u.id, `u-${i + 1}`);
  });
  lista("proveedores").forEach((p, i) => poner(p.nombre, `Proveedor ${i + 1}`));
  let jugador = 0;
  const sinFicha = (n: unknown) => {
    const t = texto(n);
    // «Mostrador» y «Tienda T-XXXX · <nombre>» los arma el motor (el nombre del pedido se anonimiza aparte).
    if (!t || t === "Mostrador" || t.startsWith("Tienda ")) return;
    if (!alias.has(t)) alias.set(t, `Jugador ${String(++jugador).padStart(3, "0")}`);
  };
  for (const r of lista("reservas")) {
    sinFicha(r.titular);
    for (const j of Array.isArray(r.jugadores) ? (r.jugadores as Record<string, unknown>[]) : []) sinFicha(j?.nombre);
  }
  for (const k of ["cuentas", "espera", "fijos"]) for (const x of lista(k)) sinFicha(x.titular);
  for (const p of lista("pedidos")) sinFicha(p.nombre);

  // ── el reemplazo dentro de los textos: nombres completos primero, después cada palabra del nombre ──
  const palabras = new Map<string, string>();
  for (const [nombre, a] of alias) {
    for (const p of nombre.split(/\s+/)) {
      const limpia = p.replace(/[^\p{L}'-]/gu, "");
      const clave = limpia.toLowerCase();
      if (limpia.length >= 3 && !GENERICAS.has(clave) && !palabras.has(clave)) palabras.set(clave, a);
    }
  }
  // UNA sola pasada (nombres completos y palabras en la misma expresión, lo más largo primero): lo ya reemplazado no
  // se vuelve a tocar («Dueño Uno» → «Dueño 1», y no «Dueño 1 1»).
  const porMinuscula = new Map<string, string>([...palabras, ...[...alias].map(([k, v]) => [k.toLowerCase(), v] as [string, string])]);
  const buscados = [...porMinuscula.keys()].sort((a, b) => b.length - a.length);
  const reNombres = buscados.length ? new RegExp(`(?<!${LETRA})(${buscados.map(escapar).join("|")})(?!${LETRA})`, "giu") : null;
  const enTexto = (s: string): string => (reNombres ? s.replace(reNombres, (m) => porMinuscula.get(m.toLowerCase()) ?? m) : s);

  // ── contactos: el mismo dato da el mismo reemplazo ──
  const contactos = new Map<string, string>();
  const contacto = (clave: string, valor: string): string => {
    if (!valor.trim()) return valor;
    const k = `${clave}|${valor}`;
    if (!contactos.has(k)) {
      const n = contactos.size + 1;
      const falso =
        clave === "email" || clave === "mail" ? `persona${n}@ejemplo.invalid`
        : clave === "alias" ? `alias.ejemplo.${n}`
        : clave === "ref" ? `REF-${String(n).padStart(4, "0")}`
        : clave === "cuit" || clave === "cuil" ? `20-${String(n).padStart(8, "0")}-0`
        : clave === "direccion" || clave === "instagram" ? `${clave} de ejemplo ${n}`
        : `5490000${String(n).padStart(6, "0")}`; // teléfonos, dni, cbu/cvu: dígitos de ejemplo (característica 0000: no existe)
      contactos.set(k, falso);
    }
    return contactos.get(k)!;
  };

  const recorrer = (x: Json, clave: string | null): Json => {
    if (typeof x === "string") {
      if (clave && CLAVES_DE_CONTACTO.has(clave.toLowerCase())) return contacto(clave.toLowerCase(), x);
      if (idsUsuarios.has(x)) return idsUsuarios.get(x)!;
      return enTexto(x);
    }
    if (Array.isArray(x)) return x.map((y) => recorrer(y, clave));
    if (x && typeof x === "object") {
      const out: { [k: string]: Json } = {};
      for (const [k, v] of Object.entries(x)) out[k] = recorrer(v, k);
      return out;
    }
    return x;
  };

  const estado = recorrer(original.estado as unknown as Json, null) as unknown as Record<string, unknown>;
  // PIN de ejemplo por usuario (dos dígitos, distintos): 11, 22, 33… Nunca el real.
  (estado.usuarios as Record<string, unknown>[]).forEach((u, i) => {
    if (typeof u.pin === "string" && u.pin) {
      u.pin = String((11 * (i + 1)) % 100).padStart(2, "0");
    }
  });
  const sobre: Sobre = { v: original.v, estado: estado as unknown as Sobre["estado"], secuencia: original.secuencia };
  if (original.usuario !== undefined) sobre.usuario = idsUsuarios.get(original.usuario) ?? "u-1";
  if (original.guardado !== undefined) sobre.guardado = original.guardado;

  // ── revisión: ¿quedó algo original? ──
  const salida = JSON.stringify(sobre).toLowerCase();
  const residuos: string[] = [];
  for (const nombre of alias.keys()) if (salida.includes(nombre.toLowerCase()) && !esAlias(nombre)) residuos.push(`nombre «${nombre}»`);
  for (const k of contactos.keys()) {
    const valor = k.slice(k.indexOf("|") + 1);
    if (valor.length >= 6 && !esContactoDeEjemplo(valor) && salida.includes(valor.toLowerCase())) residuos.push(`contacto «${valor}»`);
  }
  for (const [id, nuevo] of idsUsuarios) if (id !== nuevo && salida.includes(`"${id.toLowerCase()}"`)) residuos.push(`usuario «${id}»`);

  return { sobre, informe: { personas: alias.size, usuarios: idsUsuarios.size, contactos: contactos.size, residuos } };
}

/** ¿Es ya un alias del anonimizador? (anonimizar dos veces no marca residuos). */
function esAlias(s: string): boolean {
  return /^(Cliente \d{3}|Jugador \d{3}|Dueño \d+|Recepción \d+|Proveedor \d+)$/.test(s);
}

/** ¿Es ya un contacto de ejemplo del anonimizador? */
function esContactoDeEjemplo(s: string): boolean {
  return /^(5490000\d{6}|alias\.ejemplo\.\d+|REF-\d{4}|persona\d+@ejemplo\.invalid|20-\d{8}-0|.* de ejemplo \d+)$/.test(s);
}
