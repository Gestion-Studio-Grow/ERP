// ============================================================================
// PEDÍ LOCAL — la vidriera de pedidos y delivery PROPIO de un comercio del barrio, sin comisión.
// ============================================================================
//
// La sirve /tienda (page.tsx) para los negocios con configuración en src/lib/delivery-local/config.ts
// (hoy, Bitácora Café en Monte Grande; nombre del producto PROVISIONAL A CONFIRMAR). Los demás
// negocios no pasan por acá. Piel: la del local si su config trae `marca` (con autorización
// registrada; src/lib/delivery-local/marca.ts decide qué se puede usar sin romper AA) y, sin
// material, la de GSG con el nombre del local en texto y una portada dibujada.
//
// Vidriera de autor (.claude/skills/vidriera-de-autor): un solo momento protagonista, la taza de la
// portada en capas con un parallax de CSS (scroll-timeline, sin JS; quieta con reduced-motion). El
// titular es el candidato a LCP: no entra desde opacity 0.
//
// Server component: la cabecera y el pie no tienen estado; la carta y el pedido (CartaYPedido)
// comparten la bolsa en el cliente. Los datos son los mismos que lee la vidriera de siempre
// (`getStorefront`, Envíos del negocio y el día de hoy): sin consultas nuevas.

import type { CSSProperties } from "react";
import Link from "next/link";
import type { ConfigEnvios } from "@/lib/envios/modelo";
import type { ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import { pielDelLocal } from "@/lib/delivery-local/marca";
import { buildWhatsAppHref, numeroWhatsApp } from "@/lib/whatsapp-cta";
import type { ProductoDeLaCarta } from "./carta";
import CartaYPedido from "./CartaYPedido";
import { TazaDePortada } from "./Ilustracion";
import PieLocal from "./PieLocal";
import s from "./local.module.css";

type Branding = { whatsapp: string | null; addressLine: string | null; hoursLabel: string | null } | null;

export default function VidrieraLocal({
  cfg,
  slug,
  productos,
  branding,
  entrega,
  hoy,
}: {
  cfg: ConfigDeliveryLocal;
  /** El negocio: separa «Mi cuenta» del dispositivo por local. */
  slug: string;
  productos: ProductoDeLaCarta[];
  branding: Branding;
  entrega: ConfigEnvios | null;
  hoy: string | null;
}) {
  const numero = numeroWhatsApp(branding?.whatsapp);
  const consulta = numero ? buildWhatsAppHref(numero, `Hola ${cfg.nombre}, tengo una consulta sobre un pedido.`) : null;
  const piel = pielDelLocal(cfg.marca);
  return (
    <div className={s.raiz} style={piel.variables as CSSProperties} data-marca={piel.variables["--pl-primario"] ? "" : undefined}>
      <a href="#carta" className={s.salto}>
        Ir a la carta
      </a>
      <BarraDelLocal cfg={cfg} logoUrl={piel.logoUrl} />
      <header className={s.portada}>
        <div className={`${s.ancho} ${s.portadaGrilla}`}>
          <div className={s.portadaTexto}>
            <p className={s.cabeceraRotulo}>Pedidos online · {cfg.localidad}</p>
            <h1 className={s.titulo}>{cfg.nombre}</h1>
            <p className={s.bajada}>{cfg.bajada}</p>
            <ul className={s.datos} aria-label="Datos del local">
              <li className={`${s.dato} ${s.datoAcento}`}>Delivery propio, sin comisión de apps</li>
              <li className={s.dato}>{branding?.hoursLabel ?? cfg.horario}</li>
              {cfg.radioKm !== null && <li className={s.dato}>Reparte hasta {String(cfg.radioKm).replace(".", ",")} km</li>}
            </ul>
            <div className={s.portadaAcciones}>
              <a href="#carta" className={`${s.boton} ${s.botonPrincipal} ${s.botonPortada}`}>
                Ver la carta
              </a>
              {consulta && (
                <a className={s.enlaceWa} href={consulta} target="_blank" rel="noopener noreferrer">
                  Consultanos por WhatsApp
                </a>
              )}
            </div>
          </div>
          <div className={s.portadaArte}>
            {piel.fotoPortada ? (
              // Foto del local (con autorización registrada): caja con proporción fija, CLS 0.
              // eslint-disable-next-line @next/next/no-img-element -- URL de la config del local; sin loader remoto configurado
              <img className={s.portadaFoto} src={piel.fotoPortada} alt={`${cfg.nombre}, el local`} width={640} height={600} fetchPriority="high" />
            ) : (
              <TazaDePortada capas={{ fondo: s.capaFondo, disco: s.capaDisco, taza: s.capaTaza, vapor: s.capaVapor }} />
            )}
          </div>
        </div>
      </header>
      <main>
        <CartaYPedido
          cfg={cfg}
          slug={slug}
          productos={productos}
          hayWhatsApp={Boolean(numero)}
          direccionDelLocal={branding?.addressLine ?? cfg.direccion}
          entrega={entrega}
          hoy={hoy}
        />
      </main>
      <PieLocal cfg={cfg} />
    </div>
  );
}

/** La barra de arriba: la marca del local (logo o monograma) y «Mi cuenta». También la usa /tienda/mi-cuenta. */
export function BarraDelLocal({ cfg, logoUrl, enCuenta = false }: { cfg: ConfigDeliveryLocal; logoUrl: string | null; enCuenta?: boolean }) {
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
