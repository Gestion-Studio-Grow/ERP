// ============================================================================
// DESPUÉS DE PEDIR — el número del pedido y cómo sigue, con la marca del negocio.
// ============================================================================
//
// Lo que se sabe acá es el número que devolvió el alta (`?pedido=`): no se lee el pedido (esta página
// es pública y el número es correlativo; leerlo sin otra prueba sería mostrarle pedidos ajenos a
// cualquiera que cambie el número). Por eso no hay "estado en vivo": hay el número, lo único que ya
// pasó (lo recibimos) y los pasos que siguen, dichos como pasos y no como estados. El seguimiento
// en vivo necesita una lectura del servidor con el teléfono del cliente como prueba: está anotado.

import Image from "next/image";
import Link from "next/link";
import s from "./vidriera.module.css";
import { MAGRA } from "@/tenants/magra-content";
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";
import type { MarcaId } from "./marcas";
import { IconoWhatsApp } from "./Iconos";
import { OlvidarBolsa } from "./OlvidarBolsa";

export default function GraciasNueva({
  marca,
  nombre,
  pedido,
  whatsapp,
  pago,
  tenantKey,
}: {
  tenantKey: string;
  marca: MarcaId;
  nombre: string;
  /** El número que vino en la dirección, sólo si son dígitos. */
  pedido: string | null;
  /** Sólo dígitos; "" sin WhatsApp publicado. */
  whatsapp: string;
  pago: string;
}) {
  const pasos: { t: string; d: string }[] = [
    { t: "Lo recibimos", d: pedido ? `Tu pedido #${pedido} ya está en el local.` : "Tu pedido ya está en el local." },
    {
      t: "Te lo confirmamos",
      d:
        marca === "magra"
          ? "Te escribimos al WhatsApp que dejaste para confirmar el pedido y el horario."
          : marca === "adosmanos"
            ? "Te escribimos al WhatsApp que dejaste: stock, talle, medio de pago y envío."
            : "Te escribimos al WhatsApp que dejaste para confirmarlo.",
    },
    {
      t: marca === "magra" ? "Lo pesamos y envasamos" : "Lo preparamos",
      d:
        marca === "magra"
          ? "Cada corte se pesa al envasar: el total se ajusta al peso real y te avisamos el final."
          : "Separamos lo que pediste.",
    },
    { t: "Te llega o lo retirás", d: pago },
  ];
  return (
    <div className={s.v} data-marca={marca}>
      {pedido && <OlvidarBolsa tenantKey={tenantKey} />}
      <header className={s.cab}>
        <div className={s.cabIn}>
          <Link href="/tienda" className={s.logo} aria-label={`Volver a la tienda de ${nombre}`}>
            {marca === "magra" ? (
              <span className={s.logoMarca}>
                {MAGRA.brandLead}
                <b>{MAGRA.brandAccent}</b>
                {MAGRA.brandTail}
              </span>
            ) : marca === "shinevelas" ? (
              <Image src="/tenants/shinevelas/brand/logo.png" alt="Shine" width={128} height={40} className={s.logoImg} />
            ) : (
              <span className={s.logoMarca}>{marca === "adosmanos" ? "A Dos Manos" : nombre}</span>
            )}
          </Link>
          <Link href="/tienda" className={`${s.btn} ${s.btnSec} ${s.cabVolver}`}>
            Volver a la tienda
          </Link>
        </div>
      </header>
      <main className={`${s.env} ${s.seguimiento}`}>
        {pedido ? (
          <>
            <span className={s.kicker}>Pedido recibido</span>
            <h1 className={`${s.titulo} ${s.segNum}`}>Pedido #{pedido}</h1>
            <p className={s.segLede}>Guardá este número: con él te atendemos más rápido.</p>
            <h2 className={s.kicker}>Cómo sigue</h2>
            <ol className={s.camino}>
              {pasos.map((p, i) => (
                <li key={p.t} data-hecho={i === 0 || undefined}>
                  <span className={s.caminoMarca} aria-hidden>
                    {i === 0 ? "●" : "○"}
                  </span>
                  <span>
                    <b>{p.t}</b>
                    {i === 0 && <span className={s.srOnly}> (hecho)</span>}
                    <span className={s.caminoTxt}>{p.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <span className={s.kicker}>Pedido</span>
            <h1 className={`${s.titulo} ${s.segNum}`}>No encontramos el número</h1>
            <p className={s.segLede}>
              Este enlace no trae el número de pedido. Si ya pediste, te escribimos al WhatsApp que dejaste; si no, volvé a la
              tienda.
            </p>
          </>
        )}
        <div className={s.segAcc}>
          {whatsapp && (
            <a
              className={`${s.btn} ${s.btnWa}`}
              href={buildWhatsAppHref(
                whatsapp,
                pedido ? `¡Hola ${nombre}! Te escribo por mi pedido #${pedido} de la tienda.` : `¡Hola ${nombre}!`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconoWhatsApp /> {pedido ? `Escribinos por el pedido #${pedido}` : "Escribinos por WhatsApp"}
            </a>
          )}
          <Link href="/tienda" className={`${s.btn} ${s.btnPri}`}>
            Volver a la tienda
          </Link>
        </div>
      </main>
    </div>
  );
}
