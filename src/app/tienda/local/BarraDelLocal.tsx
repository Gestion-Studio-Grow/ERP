// La barra de arriba de «Pedí Local»: la marca del local (su logo si la config lo trae, si no un
// monograma con la inicial) y el enlace a «Mi cuenta». La usan la vidriera y /tienda/mi-cuenta.
// Server-safe (sin estado).

import Link from "next/link";
import type { ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import s from "./local.module.css";

/** La barra de arriba: la marca del local (logo o monograma) y «Mi cuenta». También la usa /tienda/mi-cuenta. */
export default function BarraDelLocal({ cfg, logoUrl, enCuenta = false }: { cfg: ConfigDeliveryLocal; logoUrl: string | null; enCuenta?: boolean }) {
  const inicial = cfg.nombre.trim().charAt(0).toUpperCase();
  return (
    <div className={s.barraSup}>
      <div className={`${s.ancho} ${s.barraSupFila}`}>
        <Link href="/tienda" className={s.marcaLocal} aria-label={`${cfg.nombre}, ir a la carta`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL de la config del local; sin loader remoto configurado
            <img className={s.logo} src={logoUrl} alt="" width={120} height={40} />
          ) : (
            <span className={s.monograma} aria-hidden="true">
              {inicial}
            </span>
          )}
          <span className={s.marcaNombre}>{cfg.nombre}</span>
        </Link>
        {enCuenta ? (
          <Link href="/tienda" className={s.enlaceCuenta}>
            Volver a la carta
          </Link>
        ) : (
          <Link href="/tienda/mi-cuenta" className={s.enlaceCuenta}>
            <CirculoPersona />
            Mi cuenta
          </Link>
        )}
      </div>
    </div>
  );
}

function CirculoPersona() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5.5 19c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
    </svg>
  );
}
