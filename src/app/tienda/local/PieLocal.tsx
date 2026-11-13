// El pie de «Pedí Local»: los textos legales a un toque, quién vende y, si el local todavía no
// confirmó sus datos, una línea discreta que lo dice. Sin sello GSG: la tienda es del cliente y la
// marca GSG no va acá (el crédito del Gate de Excelencia va en el backoffice). Server component.

import Link from "next/link";
import type { ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import s from "./local.module.css";

export default function PieLocal({ cfg }: { cfg: ConfigDeliveryLocal }) {
  return (
    <footer className={s.pie}>
      <div className={s.ancho}>
        <nav aria-label="Textos legales" className={s.pieEnlaces}>
          <Link href="/tienda/terminos">Términos y condiciones</Link>
          <Link href="/tienda/privacidad">Privacidad</Link>
          <Link href="/tienda/arrepentimiento">Botón de arrepentimiento</Link>
        </nav>
        <p className={s.pieSello}>
          {cfg.nombre} vende, prepara y entrega tu pedido.
        </p>
        {cfg.provisional && <p className={s.pieSello}>Datos del local provisionales a confirmar.</p>}
      </div>
    </footer>
  );
}
