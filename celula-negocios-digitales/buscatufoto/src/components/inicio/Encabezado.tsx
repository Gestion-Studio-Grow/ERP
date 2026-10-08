import type { ReactNode } from "react";
import s from "./paginas.module.css";

/** Encabezado de las páginas de contenido: rótulo, h1 y bajada. */
export function Encabezado({
  rotulo,
  titulo,
  bajada,
  extra,
}: {
  rotulo: string;
  titulo: ReactNode;
  bajada?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <header className={s.encabezado}>
      <p className="rotulo">{rotulo}</p>
      <h1 className="titulo-xl">{titulo}</h1>
      {bajada ? <p className="bajada">{bajada}</p> : null}
      {extra ? <div className={s.encabezadoExtra}>{extra}</div> : null}
    </header>
  );
}
