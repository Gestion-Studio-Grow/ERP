import s from "./sitio.module.css";

/**
 * Foto en blanco y negro fija detrás de TODA la página (pista de atletismo vacía, propia, generada por
 * scripts/generar-muestras.py), con degradé desde la izquierda. Es decorativa: alt vacío.
 */
export function Fondo() {
  return (
    <div className={s.fondo} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen local fija; next/image no aporta acá */}
      <img src="/fondo/pista.webp" alt="" width={2400} height={1500} decoding="async" fetchPriority="low" />
    </div>
  );
}
