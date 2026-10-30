// La confirmación del pedido con la marca (provisional) de A Dos Manos. Componente de servidor: el número
// llega por la URL (validado en la página) y la bolsa guardada en el navegador la olvida `OlvidarBolsa`,
// igual que en las otras vidrieras. Cómo sigue: el local confirma stock, talle, envío y medio de pago
// antes de cobrar. WhatsApp sólo si el negocio lo publicó; si no, sólo el número de pedido.

import Link from "next/link";
import { OlvidarBolsa } from "../vidriera/OlvidarBolsa";
import { CSS_BASE } from "./estilos";
import { CLASES_DE_FUENTES } from "./fuentes";
import { DefsSiluetas, Logotipo, Pala, Zapatilla } from "./Siluetas";
import { MARCA_PROVISIONAL } from "./tokens";

const CSS_GRACIAS = `
.am-gracias{min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:96px var(--gutter) 64px;text-align:center}
.am-gracias-caja{max-width:760px}
.am-gracias-cab{position:fixed;top:0;left:0;right:0;height:72px;display:flex;align-items:center;padding:0 var(--gutter);background:rgba(243,242,236,.92);border-bottom:1px solid var(--linea)}
.am-gracias-cab a{color:inherit;text-decoration:none}
.am-gracias-dupla{display:flex;justify-content:center;align-items:flex-end;gap:18px;height:150px;margin:0 auto 28px}
.am-gracias-dupla .am-sil-pala{height:150px;width:auto;transform:rotate(-8deg)}
.am-gracias-dupla .am-sil-zapa{width:170px;height:auto}
.am-gracias h1{margin:0}
.am-gracias-numero{margin:28px 0 0;font:600 12px/1 var(--cuerpo);letter-spacing:.28em;text-transform:uppercase;color:var(--gris)}
.am-gracias-numero strong{display:block;margin-top:12px;font-family:var(--titular);font-weight:800;font-variation-settings:"wdth" 85;font-size:clamp(56px,8vw,96px);line-height:1;letter-spacing:0;color:var(--cancha)}
.am-gracias-pasos{list-style:none;margin:32px auto 0;padding:0;max-width:52ch;text-align:left;display:grid;gap:12px;counter-reset:paso}
.am-gracias-pasos li{display:grid;grid-template-columns:36px 1fr;gap:12px;align-items:baseline;font-size:clamp(17px,1.25vw,19px);line-height:1.5}
.am-gracias-pasos li::before{counter-increment:paso;content:counter(paso);display:grid;place-items:center;width:32px;height:32px;border-radius:999px;background:var(--pelota);color:var(--carbon);font:800 15px/1 var(--titular)}
.am-gracias-acciones{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:36px}
.am-gracias-prov{margin:40px 0 0;font-size:12px;color:var(--gris)}
@media (prefers-reduced-motion:no-preference){.am-gracias-dupla .am-sil-pala{animation:am-saluda 900ms var(--curva) both}}
@keyframes am-saluda{from{transform:translateY(-24px) rotate(-20deg)}}
`;

export default function GraciasAdosmanos({ pedido, whatsapp, tenantKey }: { pedido: string | null; whatsapp: string | null; tenantKey: string }) {
  return (
    <div className={`adm ${CLASES_DE_FUENTES}`}>
      <style>{CSS_BASE + CSS_GRACIAS}</style>
      <OlvidarBolsa tenantKey={tenantKey} />
      <DefsSiluetas />
      <header className="am-gracias-cab">
        <Link href="/tienda" aria-label="A Dos Manos Pádel · volver a la tienda">
          <Logotipo />
        </Link>
      </header>
      <main className="am-gracias">
        <div className="am-gracias-caja">
          <div className="am-gracias-dupla" aria-hidden="true">
            <Pala forma="lagrima" />
            <Zapatilla />
          </div>
          <h1 className="am-h2">¡Pedido recibido!</h1>
          {pedido ? (
            <p className="am-gracias-numero">
              Tu pedido
              <strong className="am-num">N.º {pedido}</strong>
            </p>
          ) : (
            <p className="am-gracias-numero">Ya nos llegó tu pedido</p>
          )}
          <ol className="am-gracias-pasos">
            <li>Te escribimos al teléfono que dejaste para confirmar stock y, si llevás zapatillas, el talle.</li>
            <li>Arreglamos la entrega: retiro o envío (el envío se cotiza al confirmar).</li>
            <li>Te pasamos el medio de pago. No se cobra nada hasta que confirmamos.</li>
          </ol>
          <div className="am-gracias-acciones">
            {whatsapp && (
              <a
                className="am-btn am-btn-p"
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`¡Hola A Dos Manos! Hice el pedido ${pedido ? `N.º ${pedido}` : ""} en la tienda.`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Escribinos por WhatsApp
              </a>
            )}
            <Link className="am-btn am-btn-b" href="/tienda">
              Volver a la tienda
            </Link>
          </div>
          {pedido && <p className="am-nota">Si nos escribís, pasanos el número de pedido y lo encontramos al toque.</p>}
          {MARCA_PROVISIONAL && <p className="am-gracias-prov">Identidad provisional, a confirmar por el dueño.</p>}
        </div>
      </main>
    </div>
  );
}
