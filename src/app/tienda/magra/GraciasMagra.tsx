// La confirmación del pedido con la marca de MAGRA: carbón, crema y oro, Bebas para el número.
// Componente de servidor: el número llega por la URL (validado en la página) y no se lee el pedido
// (la página es pública y el número es correlativo). Los pasos son los mismos que dice la vidriera
// nueva para MAGRA (vidriera/GraciasNueva.tsx); el WhatsApp, sólo si el local cargó uno de verdad.

import Link from "next/link";
import { MAGRA } from "@/tenants/magra-content";
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";
import { CSS_BASE } from "./estilos";
import { magraFuentes } from "./fuentes";

const CSS_GRACIAS = `
.magra .mg-gr{min-height:100svh;display:grid;place-items:center;padding:48px var(--gut)}
.magra .mg-gr-caja{width:min(760px,100%);display:flex;flex-direction:column;gap:28px}
.magra .mg-gr-marca{text-decoration:none;display:inline-flex;min-height:48px;align-items:center}
.magra .mg-gr h1{margin:0;font:400 clamp(64px,13vw,150px)/.86 var(--f-d);text-transform:uppercase;clip-path:inset(-20% -5% -20% -5%);animation:mg-gr-linea .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes mg-gr-linea{from{clip-path:inset(-20% -5% 100% -5%);transform:translateY(.14em)}}
.magra .mg-gr-num{display:flex;flex-direction:column;gap:8px;padding:20px 0;border-block:1px solid var(--filete)}
.magra .mg-gr-num strong{font:400 clamp(56px,9vw,96px)/1 var(--f-d);font-variant-numeric:tabular-nums;color:var(--oro);font-weight:400}
.magra .mg-gr ol{list-style:none;margin:0;padding:0;display:grid;gap:18px;counter-reset:paso}
.magra .mg-gr li{display:grid;grid-template-columns:48px 1fr;gap:4px 16px;counter-increment:paso}
.magra .mg-gr li::before{content:counter(paso);grid-row:1/3;display:grid;place-items:center;width:48px;height:48px;border:1px solid var(--oro);border-radius:999px;font:400 26px/1 var(--f-d);color:var(--oro)}
.magra .mg-gr li b{font:700 17px/1.3 var(--f-c)}
.magra .mg-gr li span{font-size:16px;color:var(--acero)}
.magra .mg-gr-acc{display:flex;flex-wrap:wrap;gap:12px}
@media (prefers-reduced-motion:reduce){.magra .mg-gr h1{animation:none}}
.magra :focus-visible{outline:2px solid var(--oro);outline-offset:3px}
`;

export default function GraciasMagra({
  pedido,
  whatsapp,
  pago,
}: {
  /** El número que vino en la dirección, sólo si son dígitos. */
  pedido: string | null;
  /** Sólo dígitos y ya validado (resolveMagraLocal); "" sin WhatsApp de verdad. */
  whatsapp: string;
  pago: string;
}) {
  const pasos: { t: string; d: string }[] = [
    { t: "Lo recibimos", d: pedido ? `Tu pedido #${pedido} ya está en el local.` : "Tu pedido ya está en el local." },
    { t: "Te lo confirmamos", d: "Te escribimos al WhatsApp que dejaste para confirmar el pedido y el horario." },
    { t: "Lo pesamos y envasamos", d: "Cada corte se pesa al envasar: el total se ajusta al peso real y te avisamos el final." },
    { t: "Te llega o lo retirás", d: pago },
  ];
  const chat = whatsapp ? buildWhatsAppHref(whatsapp, pedido ? `¡Hola MAGRA! Te escribo por mi pedido #${pedido}.` : "¡Hola MAGRA!") : null;
  return (
    <div className={magraFuentes}>
      <style>{CSS_BASE + CSS_GRACIAS}</style>
      <div className="magra">
        <main className="mg-gr">
          <div className="mg-gr-caja">
            <Link href="/tienda" className="mg-gr-marca" aria-label="Volver a la tienda de MAGRA">
              <span className="mg-logo">
                {MAGRA.brandLead}
                <b>{MAGRA.brandAccent}</b>
                {MAGRA.brandTail}
              </span>
            </Link>
            {/* Copy nuevo, en la voz de la marca: provisional a confirmar con el dueño. */}
            <h1>¡Pedido recibido!</h1>
            {pedido && (
              <p className="mg-gr-num">
                <span className="mg-eyebrow">Tu pedido</span>
                <strong>#{pedido}</strong>
              </p>
            )}
            <ol>
              {pasos.map((p) => (
                <li key={p.t}>
                  <b>{p.t}</b>
                  <span>{p.d}</span>
                </li>
              ))}
            </ol>
            <div className="mg-gr-acc">
              <Link href="/tienda" className="mg-btn mg-btn-oro">
                Volver a la tienda
              </Link>
              {chat && (
                <a href={chat} target="_blank" rel="noopener noreferrer" className="mg-btn mg-btn-wa">
                  Escribinos por WhatsApp
                </a>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
