import { IconoBuscar } from "@/components/ui";
import s from "./inicio.module.css";

/**
 * Un pedacito de la interfaz de cada función, dibujado en CSS (decorativo, aria-hidden).
 * Reemplaza al típico "ícono en círculo": muestra el objeto real con el que se trabaja.
 */
export function Muestra({ id }: { id: string }) {
  return (
    <div className={s.muestra} aria-hidden>
      {contenido(id)}
    </div>
  );
}

function contenido(id: string) {
  switch (id) {
    case "marca-agua":
      return (
        <>
          <div className={s.mFoto}>
            <div className={s.mFotoMarca}>
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i}>buscatufoto · buscatufoto · buscatufoto</span>
              ))}
            </div>
          </div>
          <span className={s.mNota}>Vista previa marcada, hasta 1280 px</span>
        </>
      );
    case "numero":
      return (
        <div className={s.mBuscador}>
          <IconoBuscar />
          <span className="mono">1043</span>
          <span className={s.mCursor} />
        </div>
      );
    case "paquetes":
      return (
        <div className={s.mFilas}>
          <div className={s.mFila}>
            <span>Paquete</span>
            <span className="mono">5 fotos</span>
          </div>
          <div className={s.mFila}>
            <span>Llevando 3 o más</span>
            <span className="mono">−10 %</span>
          </div>
        </div>
      );
    case "cupones":
      return (
        <div className={s.mCupon}>
          <span className="mono">LLEGADA10</span>
          <span>10 % · con tope · 50 usos</span>
        </div>
      );
    case "colaboradores":
      return (
        <div className={s.mPersonas}>
          <span className={s.mPersona}>MA</span>
          <span className={s.mPersona}>JP</span>
          <span className={s.mPersona}>+1</span>
        </div>
      );
    case "historias":
      return (
        <>
          <div className={s.mHistoria}>
            <i />
            <i />
            <i />
          </div>
          <span className={s.mNota}>Vertical 9:16 con el enlace del álbum</span>
        </>
      );
    default:
      return null;
  }
}
