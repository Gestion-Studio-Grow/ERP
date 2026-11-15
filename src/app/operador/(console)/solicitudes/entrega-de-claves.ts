// Configurador · entrega de las claves provisorias por mail (GSG-SEG-014, orden del dueño del 10/11).
//
// El núcleo (`configurarSolicitud`, configurador.server.ts) crea el negocio y las personas en UNA
// transacción y devuelve sus provisorias. Esta pieza, que corre en la action DESPUÉS del commit, las
// manda por mail a cada titular y las SACA del resultado: al navegador de la consola sólo llega a
// dónde fue cada una, enmascarado, o por qué no salió. PURO: el envío se inyecta (el test le pasa un
// doble que acierta o falla).
//
// Por qué después del commit y no adentro: el alta crea el negocio entero (saga de provisión, varios
// negocios con su RLS) y no puede quedar abierta esperando la red. Si un mail falla, la persona quedó
// creada con cambio obligatorio y una clave que nadie tiene; la pantalla dice cómo mandarle otra.

import type { ResultadoConfigurador, UsuarioEntregado } from "./configurador.server";

export interface UsuarioInformado {
  quien: UsuarioEntregado["quien"];
  nombre: string;
  email: string;
  /** A dónde salió la provisoria («c***@dominio.com»). `null`: no hubo clave nueva (ya tenía usuario). */
  enviadaA: string | null;
  /** El mail no salió: texto para el operador con cómo recuperarlo. */
  noEnviada?: string;
}

export type ResultadoConfiguradorConsola =
  | (Omit<Extract<ResultadoConfigurador, { ok: true }>, "usuarios"> & { usuarios: UsuarioInformado[] })
  | { ok: false; error: string };

export type EntregarClave = (d: {
  /** Negocio donde vive la persona (el del cliente o el estudio): su nombre y su auditoría. */
  tenantId: string;
  destino: { email: string; nombre: string };
  clave: string;
  origen: string;
}) => Promise<{ enviada: true; enviadaA: string } | { enviada: false; enviadaA: string; motivo: string }>;

export function textoDeRecupero(quien: UsuarioEntregado["quien"], motivo: string, enviadaA: string): string {
  const como =
    quien === "cliente"
      ? "Mandásela de nuevo desde la ficha del negocio: «Resetear y mandar por mail»."
      : "Que la dueña del estudio le genere una desde su panel (Personas), o reintentá el acceso desde la ficha del estudio.";
  return `El mail con la contraseña provisoria a ${enviadaA} no salió (${motivo}). ${como}`;
}

/** Manda cada provisoria a su titular y devuelve el resultado SIN ninguna clave. */
export async function entregarClavesDelConfigurador(
  r: ResultadoConfigurador,
  entregar: EntregarClave,
): Promise<ResultadoConfiguradorConsola> {
  if (!r.ok) return r;
  const usuarios: UsuarioInformado[] = [];
  for (const u of r.usuarios) {
    const base = { quien: u.quien, nombre: u.nombre, email: u.email };
    if (u.clave === null) {
      usuarios.push({ ...base, enviadaA: null });
      continue;
    }
    const e = await entregar({
      tenantId: u.quien === "cliente" ? r.clienteTenantId : r.estudio.id,
      destino: { email: u.email, nombre: u.nombre },
      clave: u.clave,
      origen: u.quien === "cliente" ? "configurador-cliente" : "configurador-contadora",
    });
    usuarios.push(
      e.enviada
        ? { ...base, enviadaA: e.enviadaA }
        : { ...base, enviadaA: null, noEnviada: textoDeRecupero(u.quien, e.motivo, e.enviadaA) },
    );
  }
  return { ...r, usuarios };
}
