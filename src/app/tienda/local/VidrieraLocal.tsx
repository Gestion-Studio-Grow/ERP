// ============================================================================
// PEDÍ LOCAL — la vidriera de pedidos y delivery PROPIO de un comercio del barrio, sin comisión.
// ============================================================================
//
// La sirve /tienda (page.tsx) para los negocios con configuración en src/lib/delivery-local/config.ts
// (hoy, Bitácora Café en Monte Grande; nombre del producto PROVISIONAL A CONFIRMAR). Los demás
// negocios no pasan por acá. Marca GSG (DESIGN.md): el nombre del local va en TEXTO, sin su logo,
// porque no hay autorización registrada para usar su marca (norma «Preset de cliente»).
//
// Server component: la cabecera y el pie no tienen estado; la carta y el pedido (CartaYPedido)
// comparten la bolsa en el cliente. Los datos son los mismos que lee la vidriera de siempre
// (`getStorefront`, Envíos del negocio y el día de hoy): sin consultas nuevas.

import type { ConfigEnvios } from "@/lib/envios/modelo";
import type { ConfigDeliveryLocal } from "@/lib/delivery-local/config";
import { buildWhatsAppHref, numeroWhatsApp } from "@/lib/whatsapp-cta";
import type { ProductoDeLaCarta } from "./carta";
import CartaYPedido from "./CartaYPedido";
import PieLocal from "./PieLocal";
import s from "./local.module.css";

type Branding = { whatsapp: string | null; addressLine: string | null; hoursLabel: string | null } | null;

export default function VidrieraLocal({
  cfg,
  productos,
  branding,
  entrega,
  hoy,
}: {
  cfg: ConfigDeliveryLocal;
  productos: ProductoDeLaCarta[];
  branding: Branding;
  entrega: ConfigEnvios | null;
  hoy: string | null;
}) {
  const numero = numeroWhatsApp(branding?.whatsapp);
  const consulta = numero ? buildWhatsAppHref(numero, `Hola ${cfg.nombre}, tengo una consulta sobre un pedido.`) : null;
  return (
    <div className={s.raiz}>
      <a href="#carta" className={s.salto}>
        Ir a la carta
      </a>
      <header className={s.cabecera}>
        <div className={s.ancho}>
          <p className={s.cabeceraRotulo}>Pedidos online · {cfg.localidad}</p>
          <h1 className={s.titulo}>{cfg.nombre}</h1>
          <p className={s.bajada}>{cfg.bajada}</p>
          <ul className={s.datos} aria-label="Datos del local">
            <li className={`${s.dato} ${s.datoAcento}`}>Delivery propio, sin comisión de apps</li>
            <li className={s.dato}>{branding?.hoursLabel ?? cfg.horario}</li>
            {cfg.radioKm !== null && <li className={s.dato}>Reparte hasta {String(cfg.radioKm).replace(".", ",")} km</li>}
          </ul>
          {consulta && (
            <a className={s.enlaceWa} href={consulta} target="_blank" rel="noopener noreferrer">
              Consultanos por WhatsApp
            </a>
          )}
        </div>
      </header>
      <main>
        <CartaYPedido
          cfg={cfg}
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
