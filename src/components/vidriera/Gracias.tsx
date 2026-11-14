// LA CONFIRMACIÓN DE UN PEDIDO (ronda 2, P0-3): «gracias» con la marca de la tienda, sin emoji, con el número del
// pedido, cómo sigue y el canal REAL del negocio (WhatsApp o Instagram sólo si existen). La marca pone colores, letra
// y radio; el sistema pone la escala, el orden y la accesibilidad. Server component: el único JavaScript que viaja es
// `OlvidarBolsa` (vacía la bolsa guardada si este pedido salió por «Enviar pedido»).
import type { CSSProperties, ReactNode } from "react";
import { OlvidarBolsa } from "@/app/tienda/vidriera/OlvidarBolsa";

export type PielDeGracias = {
  fondo: string;
  hoja: string;
  tinta: string;
  tenue: string;
  linea: string;
  acento: string;
  sobreAcento: string;
  letraTitulo: string;
  letraCuerpo: string;
  radio: number;
  /** Clases de next/font de la marca (las variables que nombran las dos letras). */
  claseDeFuentes?: string;
};

export type CanalDeGracias = { href: string; texto: string } | null;

export default function Gracias({
  piel,
  marca,
  pedido,
  titulo,
  bajada,
  pasos,
  canal,
  volver,
  tenantKey,
  extra,
}: {
  piel: PielDeGracias;
  marca: string;
  pedido: string | null;
  titulo: string;
  bajada: string;
  pasos: readonly string[];
  canal: CanalDeGracias;
  volver: { href: string; texto: string };
  tenantKey: string;
  extra?: ReactNode;
}) {
  const v = {
    "--g-fondo": piel.fondo,
    "--g-hoja": piel.hoja,
    "--g-tinta": piel.tinta,
    "--g-tenue": piel.tenue,
    "--g-linea": piel.linea,
    "--g-acento": piel.acento,
    "--g-sobre": piel.sobreAcento,
    "--g-titulo": piel.letraTitulo,
    "--g-cuerpo": piel.letraCuerpo,
    "--g-radio": `${piel.radio}px`,
  } as CSSProperties;
  return (
    <main className={`gsg-gracias ${piel.claseDeFuentes ?? ""}`} style={v} data-marca={marca}>
      <style>{CSS_GRACIAS}</style>
      {pedido && <OlvidarBolsa tenantKey={tenantKey} />}
      <div className="gsg-g-hoja">
        <p className="gsg-g-marca">{marca}</p>
        <h1 className="gsg-g-titulo">{titulo}</h1>
        {pedido && (
          <p className="gsg-g-numero">
            Pedido <strong>N.º {pedido}</strong>
          </p>
        )}
        <p className="gsg-g-bajada">{bajada}</p>
        {pasos.length > 0 && (
          <ol className="gsg-g-pasos">
            {pasos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        )}
        {extra}
        <div className="gsg-g-acciones">
          {canal && (
            <a className="gsg-g-boton gsg-g-solido" href={canal.href} target="_blank" rel="noopener noreferrer">
              {canal.texto}
            </a>
          )}
          <a className={`gsg-g-boton ${canal ? "gsg-g-linea" : "gsg-g-solido"}`} href={volver.href}>
            {volver.texto}
          </a>
        </div>
      </div>
    </main>
  );
}

const CSS_GRACIAS = `.gsg-gracias{min-height:100dvh;display:grid;place-items:center;padding:clamp(24px,6vw,64px) clamp(20px,5vw,48px);background:var(--g-fondo);color:var(--g-tinta);font-family:var(--g-cuerpo);font-size:clamp(1.0625rem,1rem + .3vw,1.1875rem);line-height:1.55}
.gsg-g-hoja{width:100%;max-width:34rem;background:var(--g-hoja);border:1px solid var(--g-linea);border-radius:var(--g-radio);padding:clamp(28px,5vw,48px)}
.gsg-g-marca{margin:0 0 20px;font-size:.8125rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--g-tenue)}
.gsg-g-titulo{margin:0;font-family:var(--g-titulo);font-weight:500;font-size:clamp(2.25rem,1.5rem + 3.5vw,3.5rem);line-height:1;letter-spacing:-.015em;text-wrap:balance}
.gsg-g-numero{margin:16px 0 0;font-variant-numeric:tabular-nums;color:var(--g-tenue)}
.gsg-g-numero strong{color:var(--g-tinta);font-weight:600}
.gsg-g-bajada{margin:16px 0 0;text-wrap:pretty}
.gsg-g-pasos{margin:24px 0 0;padding:0;list-style:none;counter-reset:p;display:grid;gap:12px}
.gsg-g-pasos li{counter-increment:p;display:grid;grid-template-columns:32px 1fr;gap:12px;align-items:start;font-size:.9375rem;line-height:1.45}
.gsg-g-pasos li::before{content:counter(p);width:32px;height:32px;border-radius:999px;display:grid;place-items:center;border:1px solid var(--g-linea);font-weight:600;font-variant-numeric:tabular-nums;color:var(--g-acento)}
.gsg-g-nota{margin:8px 0 0;font-size:.9375rem;color:var(--g-tenue)}
.gsg-gracias form .gsg-g-boton{width:100%;margin-top:24px;border:0;cursor:pointer;font-family:inherit}
.gsg-g-acciones{margin-top:32px;display:flex;flex-wrap:wrap;gap:12px}
.gsg-g-boton{flex:1 1 200px;min-height:56px;display:inline-flex;align-items:center;justify-content:center;padding:0 22px;border-radius:min(var(--g-radio),999px);font-weight:600;text-decoration:none;font-size:1rem;letter-spacing:.02em}
.gsg-g-solido{background:var(--g-acento);color:var(--g-sobre)}
.gsg-g-linea{border:1px solid var(--g-linea);color:var(--g-tinta)}
.gsg-g-boton:focus-visible{outline:3px solid var(--g-acento);outline-offset:2px}`;
