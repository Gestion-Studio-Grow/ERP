// ============================================================================
// /operador/lab/seidorito — Seidorito en el laboratorio de GSG (uso INTERNO).
// ============================================================================
//
// Banco de prueba del personaje animado con boca sincronizada, traído del proyecto
// sap-activate-copiloto (docs/lab/seidorito/README.md). Vive en la consola del operador a propósito:
// Seidorito lleva identidad Seidor, así que NO va a la vidriera de ningún negocio ni a una URL
// pública. Sacarlo de acá con esa marca es decisión del dueño.
//
// Guardia: el layout de la consola ya exige sesión de operador (y el portón del proxy cubre
// /operador/*). Se repite acá porque página y layout se resuelven en paralelo. No toca la base.

import type { Metadata } from "next";
import { requireOperator } from "@/lib/operator-session";
import { Rotulo } from "@/components/ui";
import { Seidorito } from "@/components/personaje/Seidorito";
import { SeidoritoPlayer } from "@/components/personaje/SeidoritoPlayer";
import { BOCAS, type Boca } from "@/components/personaje/lipsync";

export const metadata: Metadata = { title: "Seidorito · Lab", robots: { index: false, follow: false } };

const NOMBRE_BOCA: Record<Boca, string> = {
  A: "Cerrada (P, B, M)",
  B: "Apenas abierta",
  C: "Abierta (E)",
  D: "Bien abierta (A)",
  E: "Redonda (O)",
  F: "Fruncida (U)",
  G: "Dientes (F, V)",
  H: "Lengua (L)",
  X: "Reposo",
};

const GUION = [
  { texto: "¡Hola! Soy Seidorito. Vengo a mostrarte cómo un personaje puede explicar algo sin que grabemos un video.", saluda: true },
  { texto: "Mi boca cambia de dibujo según lo que digo: hay nueve formas, y el reproductor elige cuál va en cada momento." },
  { texto: "Si me pasás un audio grabado con su archivo de Rhubarb, la boca va clavada con la voz. Si no, uso la voz del navegador." },
  { texto: "Y si no hay sonido, igual te dejo el texto a la vista y la boca se mueve al ritmo de la lectura. Listo, ¡eso es todo!" },
];

export default async function LabSeidorito() {
  await requireOperator();

  return (
    <div className="space-y-8">
      <header>
        <Rotulo>Lab · uso interno</Rotulo>
        <h1 className="mt-1 text-2xl font-bold text-strong">Seidorito</h1>
        <p className="mt-2 max-w-prose text-[14px] text-body">
          Personaje animado con la boca sincronizada a la voz. Sirve para tutoriales y bienvenidas sin
          filmar nada. Lleva la marca de Seidor: se queda en la consola y no se muestra a ningún negocio
          hasta que lo decida el dueño.
        </p>
      </header>

      <section aria-labelledby="sdt-player" className="max-w-xl">
        <h2 id="sdt-player" className="mb-3 text-[15px] font-semibold text-strong">
          El reproductor
        </h2>
        <SeidoritoPlayer titulo="Cómo funciona Seidorito" escenas={GUION} />
      </section>

      <section aria-labelledby="sdt-bocas">
        <h2 id="sdt-bocas" className="mb-3 text-[15px] font-semibold text-strong">
          Las nueve bocas (formas de Rhubarb Lip Sync)
        </h2>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {BOCAS.map((b) => (
            <li key={b} className="border border-line bg-surface-raised p-2 text-center">
              <Seidorito boca={b} saluda={false} className="mx-auto h-24 w-auto" />
              <p className="mt-1 text-[12px] font-semibold text-strong">{b}</p>
              <p className="text-[11px] text-muted">{NOMBRE_BOCA[b]}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
