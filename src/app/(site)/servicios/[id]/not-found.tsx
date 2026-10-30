// «Ese tratamiento no está en la carta» — el 404 de la ficha de un tratamiento (QA 29/10: un id que no existe
// mostraba el 404 de Next en inglés, sin camino de vuelta en el cuerpo).
//
// Sólo con el «Diseño nuevo» de CH prendido: con la piel de CH (la sirve PielCH desde el layout) y un link a la
// carta. Apagado (o cualquier otro negocio) la ruta no existe y se ve el 404 de Next de siempre, el mismo módulo
// que usa la raíz (src/app/not-found.tsx): ahí no cambia nada.

import Link from "next/link";
import NotFoundDeNext from "next/dist/client/components/builtin/not-found";
import { chConDisenoNuevo } from "../../_ch/diseno-ch.server";

export default async function TratamientoNoEncontrado() {
  if (!(await chConDisenoNuevo().catch(() => false))) return <NotFoundDeNext />;
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
            Ver la carta
          </Link>
          <Link href="/">Volver al inicio</Link>
        </div>
      </section>
    </div>
  );
}
