// Un texto legal de «Pedí Local» (términos, privacidad, arrepentimiento): título, vigencia y
// secciones, legible en el celular. El contenido sale puro de src/lib/delivery-local/legales.ts.

import Link from "next/link";
import type { ReactNode } from "react";
import type { ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import type { DocumentoDeTexto } from "@/lib/delivery-local/legales";
import PieLocal from "./PieLocal";
import s from "./local.module.css";

export default function DocumentoLegal({
  cfg,
  doc,
  children,
}: {
  cfg: ConfigDeliveryLocal;
  doc: DocumentoDeTexto;
  /** Lo que va arriba del texto (el botón de arrepentimiento). */
  children?: ReactNode;
}) {
  return (
    <div className={`${s.raiz} ${s.raizSinBarra}`}>
      <main className={s.legal}>
        <Link href="/tienda" className={s.volver}>
          ← Volver a la carta de {cfg.nombre}
        </Link>
        <h1>{doc.titulo}</h1>
        <p className={s.vigencia}>{doc.vigencia}</p>
        {children}
        {doc.secciones.map((sec) => (
          <section key={sec.titulo}>
            <h2>{sec.titulo}</h2>
            {sec.parrafos.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </main>
      <PieLocal cfg={cfg} />
    </div>
  );
}
