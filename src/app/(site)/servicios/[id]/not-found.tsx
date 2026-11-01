// «Ese tratamiento no está en la carta» — el 404 de la ficha de un tratamiento (QA 29/10: un id que no existe
// mostraba el 404 de Next en inglés, sin camino de vuelta en el cuerpo).
//
// Con el «Diseño nuevo» de CH prendido: con la piel de CH (la sirve PielCH desde el layout) y un link a la carta.
// Apagado (o cualquier otro negocio): la hoja en castellano con el nombre de ese negocio y la vuelta a sus servicios.

import Link from "next/link";
import { chConDisenoNuevo } from "../../_ch/diseno-ch.server";
import NoEncontradaDelNegocio from "../../NoEncontradaDelNegocio";

export default async function TratamientoNoEncontrado() {
  if (!(await chConDisenoNuevo().catch(() => false))) {
    return (
      <NoEncontradaDelNegocio
        titulo="No encontramos ese servicio"
        detalle="Puede que el enlace esté mal copiado o que ya no lo ofrezcamos. En la lista están todos los servicios de hoy."
        enlaces={[
          { href: "/servicios", etiqueta: "Volver a los servicios" },
          { href: "/", etiqueta: "Volver al inicio" },
        ]}
      />
    );
  }
  return (
    <div className="chf">
      <section className="chf-env" style={{ paddingBlock: "clamp(56px, 8vw, 120px)" }} aria-labelledby="chf-404-t">
        <p className="chf-kicker">No encontramos esta página</p>
        <h1 id="chf-404-t" className="chf-h2" style={{ marginTop: 16, overflowWrap: "anywhere" }}>
          Ese tratamiento no está en la carta.
        </h1>
        <p className="chf-lede" style={{ marginTop: 20 }}>
          Puede que el enlace esté mal copiado o que ya no lo hagamos. En la carta están todos los tratamientos de hoy, con su precio.
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
