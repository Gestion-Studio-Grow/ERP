// FACTOQUE · «No encontramos esa pantalla» dentro de la app (/facturita/app/**). Lo pinta Next cuando
// una pantalla llama a notFound() y, con [...resto]/page.tsx, cuando la dirección no existe: así la
// persona sigue con la barra de la app y una salida, en vez del 404 genérico del sitio (PLAT-005).
// Piel de Factoque, en criollo claro; botones de 56 px (≥ 44).

import Link from "next/link";
import { PIEL_FACTURITA } from "../piel";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../estilos";

export default function NoEncontradaFactoque() {
  return (
    <div className="fx" style={{ minHeight: "auto", background: "transparent" }}>
      <style dangerouslySetInnerHTML={{ __html: PIEL_FACTURITA }} />
      <section className="fx-caja fx-caja--alta" style={{ paddingBlock: "48px" }}>
        <p className="fx-ante">Error 404</p>
        <h1 className="fx-h3">No encontramos esa pantalla</h1>
        <p className="fx-bajada">
          La dirección no existe o cambió. Desde el panel podés emitir una factura o ver las que ya hiciste.
        </p>
        <div className="fx-acciones">
          <Link href="/facturita/app" className={BOTON_PRINCIPAL}>
            Volver al panel
          </Link>
          <Link href="/facturita/app/facturas" className={BOTON_SECUNDARIO}>
            Ver mis facturas
          </Link>
        </div>
      </section>
    </div>
  );
}
