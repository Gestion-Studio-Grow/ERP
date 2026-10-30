"use client";

// «Sacar turno» de la barra de arriba y de la barra fija del celular: si el cliente ya escribió la patente en la
// chapa del hero, el enlace la lleva (`?patente=`), igual que el botón de la chapa. En el celular el botón de la
// chapa queda debajo de la barra fija y lo natural es tocar la barra: antes llegaba al turno con la chapa vacía
// (QA AGR 29/10, ALTA-3). Sin JS, o sin patente escrita, es el enlace de siempre.
import { useSyncExternalStore } from "react";

let escrita = "";
const oyentes = new Set<() => void>();

/** La chapa avisa lo que hay escrito (ya normalizado: «AB123CD»). */
export function publicarPatente(normalizada: string): void {
  if (normalizada === escrita) return;
  escrita = normalizada;
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
}

/** `/taller/turno`, con la patente escrita si la hay. */
export function rutaDelTurno(normalizada: string): string {
  const p = normalizada.slice(0, 7);
  return p ? `/taller/turno?patente=${encodeURIComponent(p)}` : "/taller/turno";
}

export default function EnlaceTurno({ className, children }: { className: string; children: React.ReactNode }) {
  const patente = useSyncExternalStore(suscribir, () => escrita, () => "");
  return (
    <a href={rutaDelTurno(patente)} className={className}>
      {children}
    </a>
  );
}
