// El cuerpo del 404 del sitio de CH con el diseño nuevo: lo dibujan (site)/not-found.tsx y, para una dirección que no existe,
// src/app/not-found.tsx adentro del layout del sitio.

import Link from "next/link";

export default function NoEncontradaCH() {
  return (
    <div className="chf">
      <section className="chf-env" style={{ paddingBlock: "clamp(56px, 8vw, 120px)" }} aria-labelledby="chf-404-t">
        <p className="chf-kicker">No encontramos esta página</p>
        <h1 id="chf-404-t" className="chf-h2" style={{ marginTop: 16, overflowWrap: "anywhere" }}>
          Esa dirección no existe.
        </h1>
        <p className="chf-lede" style={{ marginTop: 20 }}>
          Puede que el enlace esté mal copiado. En la carta están todos los tratamientos de hoy, con su precio.
        </p>
        <div className="chf-acc">
          <Link href="/servicios" className="chf-btn">
            Volver a la carta
          </Link>
          <Link href="/" className="chf-enlace">
            Volver al inicio
          </Link>
        </div>
      </section>
    </div>
  );
}
