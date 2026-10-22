// Los textos de WhatsApp (M-084): datos de ejemplo para la vista previa y los chips para insertar
// variables. PURO.

import { armarMensaje } from "@/lib/padel/core";

/** Los chips «Nombre · Día · Hora · Precio · Alias · Link»: lo que más se usa. */
export const VARIABLES: readonly { clave: string; rotulo: string }[] = [
  { clave: "nombre", rotulo: "Nombre" },
  { clave: "dia", rotulo: "Día" },
  { clave: "hora", rotulo: "Hora" },
  { clave: "precio", rotulo: "Precio" },
  { clave: "alias", rotulo: "Alias" },
  { clave: "link", rotulo: "Link" },
];

/** Un alumno y una clase inventados, con el alias y el nombre del profe de verdad. */
export function datosDeEjemplo(p: { alias: string; profe: string; origen: string }): Record<string, string> {
  return {
    nombre: "Juan",
    dia: "jueves 23/10",
    hora: "18:00",
    precio: "$ 25.000",
    alias: p.alias || "tu.alias",
    link: `${p.origen}/alumno/…`,
    turnero: `${p.origen}/clases`,
    profe: p.profe,
    diaAnterior: "miércoles 22/10",
    horaAnterior: "19:00",
    motivo: "lluvia",
    detalle: "jue 16/10 18:00 ($ 25.000), mar 21/10 19:00 ($ 25.000)",
    total: "$ 50.000",
  };
}

export const vistaPrevia = (texto: string, datos: Record<string, string>): string => armarMensaje(texto, datos);

/** Mete `{clave}` donde está el cursor (o al final) y devuelve el texto y dónde queda el cursor. */
export function insertarVariable(texto: string, clave: string, inicio: number | null, fin: number | null): { texto: string; cursor: number } {
  const a = inicio ?? texto.length;
  const b = fin ?? a;
  const trozo = `{${clave}}`;
  const antes = texto.slice(0, a);
  const sep = antes && !/\s$/.test(antes) ? " " : "";
  const nuevo = `${antes}${sep}${trozo}${texto.slice(b)}`;
  return { texto: nuevo, cursor: a + sep.length + trozo.length };
}
