"use client";

// Lo común de las acciones del profe y sus hojas (Tanda 3A): correr una acción del motor, mostrar
// el error en el lugar (no cambió nada, sigue ahí) y mandar el resultado a la cola de avisos del
// layout (que sobrevive al refresco de la lista). Más la hoja del panel: la `Hoja` del kit que
// sube por encima del teclado del celular (M-069).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn, Hoja, type HojaProps } from "@/components/ui";
import { pesos } from "@/lib/padel/core";
import { useColaAvisos, type ItemAviso } from "../_aviso";
import { primerNombre } from "../_cola";
import { altoTeclado } from "../_agenda-core";

/** Lo que devuelven las acciones de un toque del motor (lib/padel/acciones.ts). */
export type ResultadoUI =
  | { ok: true; wa?: string | null; enviado?: boolean; avisoId?: string | null; cuando?: string; aFavor?: number; linkNuevo?: boolean }
  | { ok: false; error: string };

export const SIN_CONEXION = "No pudimos conectarnos. Fijate la señal y probá de nuevo: no cambió nada.";

/** Lo que dice la cola: «Movida: viernes 24/10 20:00 · $ 25.000 quedan a favor de Juan». */
export function textoResultado(listo: string, r: Extract<ResultadoUI, { ok: true }>, nombre: string): string {
  const partes = [r.cuando ? `${listo}: ${r.cuando}` : listo];
  // Clase pagada que se cancela: la plata no se pierde, queda a favor del alumno.
  if (r.aFavor) partes.push(`${pesos(r.aFavor)} quedan a favor de ${primerNombre(nombre)}`);
  // Primera vez que lo reconocés: su link se renovó y el mensaje ya lleva el nuevo.
  if (r.linkNuevo) partes.push("va con su link nuevo");
  return partes.join(" · ");
}

/**
 * Corre acciones del motor. `correr`: una acción de una clase → su aviso a la cola. `ejecutar`:
 * cualquier cosa (las masivas arman su propia cola); devuelve un texto de error o nada. Si se corta
 * la conexión, el error lo dice y nada se pierde.
 */
export function useAccion(nombre: string) {
  const router = useRouter();
  const { mostrar, encolar } = useColaAvisos();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ejecutar = (fn: () => Promise<string | null | void>) =>
    start(async () => {
      setError(null);
      try {
        const e = await fn();
        if (e) setError(e);
        else router.refresh();
      } catch {
        setError(SIN_CONEXION);
      }
    });

  const correr = (fn: () => Promise<ResultadoUI>, listo: string, alTerminar?: () => void) =>
    ejecutar(async () => {
      const r = await fn();
      if (!r.ok) return r.error;
      alTerminar?.();
      mostrar({ texto: textoResultado(listo, r, nombre), wa: r.wa, enviado: r.enviado, nombre, avisoId: r.avisoId ?? null });
    });

  return { pendiente, error, setError, correr, ejecutar, mostrar, encolar };
}

/** Los avisos de una acción masiva (Confirmar todos, Se suspende, Recordar a los 8) para la cola. */
export function aCola(
  avisos: readonly { wa: string | null; enviado: boolean; avisoId: string | null; claseId: string | null; nombre: string }[],
  texto: (claseId: string | null) => string,
): ItemAviso[] {
  return avisos.map((a) => ({ texto: texto(a.claseId), nombre: a.nombre, wa: a.wa, enviado: a.enviado, avisoId: a.avisoId }));
}

export function ErrorAccion({ texto, className }: { texto: string | null; className?: string }) {
  if (!texto) return null;
  return (
    <p role="alert" className={cn("rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-strong", className)}>
      {texto}
    </p>
  );
}

/** Botón de 48 px a todo el ancho de su celda: se toca con el pulgar sin mirar. */
export const grande = (variant: "solid" | "outline" | "ghost" | "danger" = "solid") =>
  cn(buttonClasses(variant, "lg"), "h-12 w-full justify-center px-3 transition-transform duration-[120ms] active:translate-y-px motion-reduce:transition-none");

/** El chip de elegir (día, hora, motivo): 48 px de alto, hunde 1 px al apretarlo. */
export const chip48 = "min-h-12 shrink-0 px-4 text-base transition-transform duration-[120ms] active:translate-y-px motion-reduce:transition-none sm:min-h-12";

/**
 * M-069: cuánto tapa el teclado del celular. El navegador achica sólo el viewport VISIBLE
 * (visualViewport) y la hoja, pegada abajo, quedaría detrás del teclado. Se publica como
 * `--teclado-hoja` en la raíz mientras la hoja está abierta, y la hoja se sube eso.
 */
function useTecladoDeLaHoja(activa: boolean) {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!activa || !vv) return;
    const raiz = document.documentElement;
    const medir = () => raiz.style.setProperty("--teclado-hoja", `${altoTeclado(window.innerHeight, vv.height, vv.offsetTop)}px`);
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
      raiz.style.removeProperty("--teclado-hoja");
    };
  }, [activa]);
}

/**
 * La hoja del panel: la `Hoja` del kit (diálogo nativo, foco adentro, Escape y arrastre cierran)
 * que se sube por encima del teclado y achica su alto para que el pie (la acción principal) se vea
 * siempre. Se monta abierta: quien la usa la monta sólo cuando hace falta (una lista de 18 clases
 * no carga 100 diálogos).
 */
export function HojaPanel({ className, ...props }: Omit<HojaProps, "abierta">) {
  useTecladoDeLaHoja(true);
  return (
    <Hoja
      abierta
      {...props}
      className={cn("mb-[var(--teclado-hoja,0px)]! [&>div]:max-h-[calc(88dvh-var(--teclado-hoja,0px))]", className)}
    />
  );
}

/** Una línea de rótulo dentro de una hoja («¿Por qué?», «¿Qué día?»). */
export function Rotulo({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="mb-2 mt-4 text-sm font-semibold text-strong first:mt-1">
      {children}
    </p>
  );
}

/** El pie de una hoja: la acción principal a todo el ancho, con aire para la zona segura del celular. */
export function Pie({ children }: { children: React.ReactNode }) {
  return <div className="grid w-full gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{children}</div>;
}
