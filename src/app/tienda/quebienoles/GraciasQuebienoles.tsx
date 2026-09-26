// La confirmación del pedido con la marca de Qué Bien Olés. Componente de servidor: el número llega por
// la URL (validado en la página) y la bolsa del navegador la olvida `OlvidarBolsa`, igual que en la
// vidriera nueva. El canal para seguir es el que la marca usa de verdad: el mensaje por Instagram (y
// WhatsApp sólo si algún día lo cargan en el panel).

import Link from "next/link";
import { OlvidarBolsa } from "../vidriera/OlvidarBolsa";
import { CSS_BASE } from "./estilos";
import { mensajeDirecto, usuarioDeInstagram } from "./vitrina";

const CSS_GRACIAS = `
.qb-gracias{display:grid;place-items:center;min-height:100vh;padding:48px 20px;text-align:center;overflow:hidden}
.qb-gracias::before{content:"";position:fixed;inset:-20%;pointer-events:none;background:
  radial-gradient(40% 30% at 30% 30%,rgba(216,179,106,.12),transparent 70%),
  radial-gradient(35% 28% at 70% 65%,rgba(226,149,180,.08),transparent 70%),
  radial-gradient(30% 24% at 55% 20%,rgba(111,199,184,.06),transparent 70%);
  animation:qb-niebla 16s ease-in-out infinite alternate}
@keyframes qb-niebla{to{transform:translate3d(4%,-3%,0) scale(1.08)}}
.qb-gracias-caja{position:relative;max-width:620px}
.qb-gracias-sello{width:88px;height:88px;margin:0 auto 22px;color:var(--oro);animation:qb-sello 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes qb-sello{from{opacity:0;transform:scale(.7) rotate(-12deg)}}
.qb-gracias h1{margin:0;font:400 clamp(58px,10vw,104px)/.95 var(--caligrafia);text-wrap:balance;padding:0 .1em;animation:qb-sube 1.2s cubic-bezier(.2,.8,.2,1) .15s both}
/* «Tu pedido» entre dos filetes dorados, como el antetítulo del portal; el número en cifras alineadas. */
.qb-gracias-numero{display:flex;flex-direction:column;align-items:center;margin:30px 0 0;font:500 12px/1 var(--palo);letter-spacing:.34em;text-transform:uppercase;color:var(--hueso-2);animation:qb-sube 1.2s cubic-bezier(.2,.8,.2,1) .3s both}
.qb-gracias-numero::before,.qb-gracias-numero::after{content:"";width:64px;height:1px;background:linear-gradient(90deg,transparent,var(--oro),transparent);margin:0 auto 16px}
.qb-gracias-numero::after{margin:18px auto 0}
.qb-gracias-numero strong{display:block;margin-top:12px;font:400 clamp(44px,7vw,72px)/1 var(--didona);letter-spacing:0;color:var(--hueso);font-variant-numeric:lining-nums tabular-nums}
.qb-gracias-texto{margin:28px auto 0;max-width:46ch;color:var(--hueso-2);font-size:17px;animation:qb-sube 1.2s cubic-bezier(.2,.8,.2,1) .45s both}
.qb-gracias-acciones{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:34px;animation:qb-sube 1.2s cubic-bezier(.2,.8,.2,1) .6s both}
.qb-gracias-nota{margin:18px 0 0;color:var(--hueso-3);font-size:14px}
@keyframes qb-sube{from{opacity:0;transform:translateY(18px);filter:blur(6px)}}
`;

export default function GraciasQuebienoles({
  pedido,
  instagram,
  whatsapp,
  tenantKey,
}: {
  pedido: string | null;
  instagram: string | null;
  whatsapp: string | null;
  tenantKey: string;
}) {
  const usuario = usuarioDeInstagram(instagram);
  return (
    <div className="qb">
      <style>{CSS_BASE + CSS_GRACIAS}</style>
      <OlvidarBolsa tenantKey={tenantKey} />
      <main className="qb-gracias">
        <div className="qb-gracias-caja">
          <svg className="qb-gracias-sello" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M23 17.5 L25.2 10.5 L28.6 14.6 L32 8.5 L35.4 14.6 L38.8 10.5 L41 17.5 Z" fill="currentColor" />
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M32 19.5c-9.6 0-16.5 7.4-16.5 16.6S22.4 52.7 32 52.7s16.5-7.4 16.5-16.6S41.6 19.5 32 19.5Zm0 1.6c-4.6 0-7.2 6.7-7.2 15s2.6 15 7.2 15 7.2-6.7 7.2-15-2.6-15-7.2-15Z"
            />
            <path d="M33.5 50.8c3.4 3.8 7.8 5.6 13.2 5.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <h1 className="qb-oro">¡Qué bien vas a oler!</h1>
          {pedido ? (
            <p className="qb-gracias-numero">
              Tu pedido
              <strong>N.º {pedido}</strong>
            </p>
          ) : (
            <p className="qb-gracias-numero">Recibimos tu pedido</p>
          )}
          <p className="qb-gracias-texto">
            Ya nos llegó. Te escribimos al teléfono que dejaste para coordinar el envío o el punto de encuentro, y te pasamos los
            medios de pago.
          </p>
          <div className="qb-gracias-acciones">
            <a className="qb-boton qb-boton-oro" href={mensajeDirecto(usuario)} target="_blank" rel="noopener noreferrer">
              Escribinos por Instagram
            </a>
            {whatsapp && (
              <a className="qb-boton qb-boton-linea" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                Por WhatsApp
              </a>
            )}
            <Link className="qb-boton qb-boton-linea" href="/tienda">
              Volver a la tienda
            </Link>
          </div>
          {pedido && <p className="qb-gracias-nota">Si nos escribís, pasanos el número de pedido y lo encontramos al toque.</p>}
        </div>
      </main>
    </div>
  );
}
