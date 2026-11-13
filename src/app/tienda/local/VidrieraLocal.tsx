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
import type { ConfigEnvios } from "@/lib/envios/modelo";
import type { ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import { pielDelLocal } from "@/lib/delivery-local/marca";
import { rechazoPorHorario, resumenDelHorario, textoDelEstado } from "@/lib/delivery-local/horario";
import { buildWhatsAppHref, numeroWhatsApp } from "@/lib/whatsapp-cta";
import type { ProductoDeLaCarta } from "./carta";
import BarraDelLocal from "./BarraDelLocal";
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
  ahora,
}: {
  cfg: ConfigDeliveryLocal;
  /** El negocio: separa «Mi cuenta» del dispositivo por local. */
  slug: string;
  productos: ProductoDeLaCarta[];
  branding: Branding;
  entrega: ConfigEnvios | null;
  hoy: string | null;
  /** El momento del pedido de la página (la página es dinámica): decide «Abierto · cierra 20:00». */
  ahora: Date;
}) {
  const numero = numeroWhatsApp(branding?.whatsapp);
  const consulta = numero ? buildWhatsAppHref(numero, `Hola ${cfg.nombre}, tengo una consulta sobre un pedido.`) : null;
  const piel = pielDelLocal(cfg.marca);
  // El horario que se muestra es el MISMO que controla el alta (config.ts → horario.ts): por eso
  // manda sobre el rótulo de horario de la marca, que podría decir otra cosa.
  const estado = textoDelEstado(cfg.horario, ahora);
  const cerrado = rechazoPorHorario(cfg, ahora);
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
              <li className={`${s.dato} ${cerrado ? "" : s.datoAcento}`}>{estado}</li>
              <li className={s.dato}>{resumenDelHorario(cfg.horario)}</li>
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
          cerrado={cerrado}
        />
      </main>
      <PieLocal cfg={cfg} />
    </div>
  );
}
