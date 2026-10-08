"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { Aviso, Girador } from "@/components/ui";
import { useDatos } from "@/lib/hooks";
import { obtenerRepo } from "@/lib/repo";
import type { Fotografo, TipoEvento } from "@/lib/tipos";
import s from "./panel.module.css";

/* ---------- Fotógrafo logueado ---------- */

export const ContextoFotografo = createContext<Fotografo | null>(null);

/** Fotógrafo con sesión. Sólo se usa dentro del panel, que no renderiza sus páginas sin sesión. */
export function useFotografo(): Fotografo {
  const f = useContext(ContextoFotografo);
  if (!f) throw new Error("useFotografo se usa sólo dentro del panel con sesión.");
  return f;
}

/** Álbumes del fotógrafo, refrescados solos. */
export function useAlbumes(fotografoId: string) {
  return useDatos(() => obtenerRepo().albumesDe(fotografoId), [fotografoId], ["albumes"]);
}

const sinSuscripcion = () => () => {};

/** window.location.origin sin desfasar la hidratación (vacío en el servidor). */
export function useOrigen(): string {
  return useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => "");
}

/* ---------- Textos ---------- */

export const EVENTOS: Record<TipoEvento, string> = {
  carrera: "Carrera",
  torneo: "Torneo",
  fiesta: "Fiesta",
  otro: "Otro",
};

/**
 * "3.500" / "$ 3500" / "12.000.000" → entero. El punto sólo vale como separador de miles (grupos de 3):
 * "1.5", "7,5" o "2.50" → NaN, así un decimal nunca se lee multiplicado (lo agarra la validación).
 */
export function aEntero(texto: string): number {
  const t = texto.trim().replace(/[$\s]/g, "");
  if (!t || !/^-?(\d{1,3}(\.\d{3})+|\d+)$/.test(t)) return NaN;
  return Number(t.replace(/\./g, ""));
}

export function aTexto(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

/* ---------- Piezas visuales ---------- */

export function Encabezado({
  titulo,
  bajada,
  acciones,
  rotulo,
}: {
  titulo: ReactNode;
  bajada?: ReactNode;
  acciones?: ReactNode;
  rotulo?: ReactNode;
}) {
  return (
    <div className={s.encabezado}>
      <div className={s.encabezadoTexto}>
        {rotulo ? <p className="rotulo">{rotulo}</p> : null}
        <h1 className={s.titulo}>{titulo}</h1>
        {bajada ? <p className={s.bajada}>{bajada}</p> : null}
      </div>
      {acciones ? <div className={s.acciones}>{acciones}</div> : null}
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className={s.cargando}>
      <Girador etiqueta={texto} />
      <span>{texto}</span>
    </div>
  );
}

export function ErrorCarga({ error }: { error: string }) {
  return <Aviso tono="error">No pudimos leer los datos de este navegador: {error}</Aviso>;
}

/** Cifra destacada (ventas, comisión, almacenamiento…). */
export function Cifra({ etiqueta, valor, nota }: { etiqueta: ReactNode; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className={s.cifra}>
      <span className={s.cifraEtiqueta}>{etiqueta}</span>
      <span className={`mono ${s.cifraValor}`}>{valor}</span>
      {nota ? <span className={s.cifraNota}>{nota}</span> : null}
    </div>
  );
}

export function Seccion({ titulo, bajada, children, acciones }: { titulo: ReactNode; bajada?: ReactNode; children: ReactNode; acciones?: ReactNode }) {
  return (
    <section className={s.seccion}>
      <div className={s.seccionCabeza}>
        <div>
          <h2 className={s.seccionTitulo}>{titulo}</h2>
          {bajada ? <p className={s.seccionBajada}>{bajada}</p> : null}
        </div>
        {acciones ? <div className={s.acciones}>{acciones}</div> : null}
      </div>
      {children}
    </section>
  );
}
