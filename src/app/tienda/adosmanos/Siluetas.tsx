// ============================================================================
// LAS SILUETAS — ilustraciones honestas por FORMA, mientras no haya fotos reales.
// ============================================================================
//
// No hay una sola foto de producto de A Dos Manos (public/tenants/adosmanos no tenía nada al 29/10). En vez
// de fotos de stock o un degradé con el nombre, cada producto se dibuja por su forma: la pala redonda,
// lágrima o diamante (de su ficha, palas.ts), la zapatilla de perfil, el tubo de pelotas, el paletero…
// Siempre rotuladas como «Ilustración» (la tarjeta y la ficha lo dicen) y con `aria-hidden`: el texto
// real está al lado. Cada una pesa ~1 KB y no baja nada de la red.
//
// Sin «use client»: son SVG puros, sirven en el servidor y en el cliente. El agujerado de la pala es un
// <pattern> definido UNA vez en la página (`DefsSiluetas`).

import type { Silueta as TipoSilueta } from "./catalogo";
import type { Forma } from "./palas";

const CABEZA: Record<Forma, string> = {
  // Redonda: la más ancha abajo, casi un círculo. Lágrima: lo ancho a media altura. Diamante: hombros
  // altos y la punta arriba, se angosta en línea recta hacia el cuello.
  redonda: "M50 6C80 6 97 32 97 68C97 102 80 124 59 130H41C20 124 3 102 3 68C3 32 20 6 50 6Z",
  lagrima: "M50 4C77 4 94 22 94 52C94 86 76 112 58 130H42C24 112 6 86 6 52C6 22 23 4 50 4Z",
  diamante: "M50 2C60 2 76 10 88 24C95 32 97 42 94 52L59 130H41L6 52C3 42 5 32 12 24C24 10 40 2 50 2Z",
};

/** El patrón de agujeros de la cara y el corte del corazón: una sola vez por página. */
export function DefsSiluetas() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <pattern id="am-agujeros" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="1.25" fill="#f3f2ec" fillOpacity=".22" />
        </pattern>
        {(Object.keys(CABEZA) as Forma[]).map((f) => (
          <clipPath key={f} id={`am-clip-${f}`}>
            <path d={CABEZA[f]} />
          </clipPath>
        ))}
      </defs>
    </svg>
  );
}

export function Pala({ forma, marca, className }: { forma: Forma; marca?: string | null; className?: string }) {
  const d = CABEZA[forma];
  return (
    <svg viewBox="0 0 100 190" className={`am-sil am-sil-pala ${className ?? ""}`} aria-hidden="true" focusable="false">
      <path d={d} className="am-sil-cuerpo" />
      <path d={d} fill="url(#am-agujeros)" />
      <path d={d} fill="none" className="am-sil-canto" strokeWidth="2.4" />
      <rect x="0" y="44" width="100" height="14" className="am-sil-franja" clipPath={`url(#am-clip-${forma})`} />
      {marca && (
        <text x="50" y="54.4" textAnchor="middle" className="am-sil-marca">
          {marca.toUpperCase()}
        </text>
      )}
      <ellipse cx="50" cy="114" rx="6.5" ry="9" className="am-sil-hueco" />
      <rect x="42.5" y="128" width="15" height="56" rx="5" className="am-sil-grip" />
      <path d="M43 140l14-4M43 150l14-4M43 160l14-4M43 170l14-4" className="am-sil-vendas" strokeWidth="1.2" fill="none" />
      <rect x="40" y="180" width="20" height="7" rx="3" className="am-sil-cuerpo" />
    </svg>
  );
}

export function Zapatilla({ className }: { className?: string }) {
  // De perfil, la punta a la derecha: talón alto con su lengüeta, cordones bajando al empeine, puntera
  // redonda, mediasuela clara y la suela de espiga (la de pádel) abajo.
  return (
    <svg viewBox="0 0 200 110" className={`am-sil am-sil-zapa ${className ?? ""}`} aria-hidden="true" focusable="false">
      <path
        d="M12 84C9 66 9 46 13 34c3-8 10-11 18-9l14 6c6-7 12-11 19-11 18 8 38 17 60 25 24 6 47 10 61 18 8 5 10 13 7 21Z"
        className="am-sil-cuerpo"
      />
      <path d="M34 66c34 4 76 0 118-10" className="am-sil-franja-linea" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M72 30l-5 9M85 35l-5 9M98 40l-5 9M111 45l-5 9" className="am-sil-vendas" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M6 82h190c1 8-4 13-12 13H18C10 95 5 90 6 82Z" className="am-sil-suela" />
      <path d="M14 99h170" className="am-sil-canto" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 88l4 4 4-4M44 88l4 4 4-4M64 88l4 4 4-4M84 88l4 4 4-4M104 88l4 4 4-4M124 88l4 4 4-4M144 88l4 4 4-4M164 88l4 4 4-4" className="am-sil-vendas" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function Tubo() {
  return (
    <svg viewBox="0 0 100 190" className="am-sil am-sil-tubo" aria-hidden="true" focusable="false">
      <rect x="26" y="20" width="48" height="160" rx="12" className="am-sil-cuerpo" />
      <rect x="22" y="10" width="56" height="18" rx="6" className="am-sil-franja" />
      {[56, 100, 144].map((y) => (
        <g key={y}>
          <circle cx="50" cy={y} r="19" className="am-sil-pelota" />
          <path d={`M34 ${y - 8}c8 6 8 10 0 16M66 ${y - 8}c-8 6-8 10 0 16`} className="am-sil-costura" strokeWidth="2" fill="none" />
        </g>
      ))}
    </svg>
  );
}

function Paletero() {
  return (
    <svg viewBox="0 0 160 190" className="am-sil am-sil-bolso" aria-hidden="true" focusable="false">
      <path d="M50 30c0-14 60-14 60 0" className="am-sil-vendas" strokeWidth="6" fill="none" />
      <path d="M20 46c0-12 10-20 24-20h72c14 0 24 8 24 20v118c0 12-10 20-24 20H44c-14 0-24-8-24-20Z" className="am-sil-cuerpo" />
      <path d="M80 54c22 0 34 14 34 36s-14 40-30 50h-8c-16-10-30-28-30-50s12-36 34-36Z" className="am-sil-franja" />
      <path d="M20 160h120" className="am-sil-vendas" strokeWidth="2.4" />
    </svg>
  );
}

function Mochila() {
  return (
    <svg viewBox="0 0 160 190" className="am-sil am-sil-bolso" aria-hidden="true" focusable="false">
      <path d="M62 26c0-12 36-12 36 0" className="am-sil-vendas" strokeWidth="6" fill="none" />
      <path d="M30 60c0-24 20-38 50-38s50 14 50 38v108c0 10-8 16-18 16H48c-10 0-18-6-18-16Z" className="am-sil-cuerpo" />
      <rect x="46" y="112" width="68" height="50" rx="12" className="am-sil-franja" />
      <path d="M46 128h68" className="am-sil-costura" strokeWidth="2" />
    </svg>
  );
}

function Grip() {
  return (
    <svg viewBox="0 0 160 190" className="am-sil am-sil-grip-s" aria-hidden="true" focusable="false">
      <circle cx="80" cy="96" r="54" className="am-sil-cuerpo" />
      <circle cx="80" cy="96" r="36" className="am-sil-franja" />
      <circle cx="80" cy="96" r="16" className="am-sil-hueco" />
      <path d="M134 96c0 30 6 60 16 84" className="am-sil-vendas" strokeWidth="14" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Muniequera() {
  return (
    <svg viewBox="0 0 160 190" className="am-sil am-sil-grip-s" aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="70" rx="56" ry="20" className="am-sil-franja" />
      <path d="M24 70v52c0 11 25 20 56 20s56-9 56-20V70c0 11-25 20-56 20S24 81 24 70Z" className="am-sil-cuerpo" />
      <ellipse cx="80" cy="70" rx="40" ry="12" className="am-sil-hueco" />
    </svg>
  );
}

function Protector() {
  return (
    <svg viewBox="0 0 100 190" className="am-sil am-sil-pala" aria-hidden="true" focusable="false">
      <path d={CABEZA.lagrima} className="am-sil-fantasma" strokeWidth="2" strokeDasharray="5 5" fill="none" />
      <path d="M8 40C14 18 30 4 50 4s36 14 42 36" className="am-sil-franja-linea" strokeWidth="12" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** El dibujo que le toca a un producto. */
export function Silueta({ tipo, marca }: { tipo: TipoSilueta; marca?: string | null }) {
  switch (tipo) {
    case "redonda":
    case "lagrima":
    case "diamante":
      return <Pala forma={tipo} marca={marca} />;
    case "zapatilla":
      return <Zapatilla />;
    case "tubo":
      return <Tubo />;
    case "paletero":
      return <Paletero />;
    case "mochila":
      return <Mochila />;
    case "grip":
      return <Grip />;
    case "muniequera":
      return <Muniequera />;
    default:
      return <Protector />;
  }
}

/** La pelota con su costura: el «marcador» del logotipo y el que señala en el comparador. No es un logo. */
export function Pelota({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`am-pelota ${className ?? ""}`} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="#d9f03a" />
      <path d="M5 6c6 5 6 15 0 20M27 6c-6 5-6 15 0 20" fill="none" stroke="#111418" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Logotipo TIPOGRÁFICO provisional (DISENO.md §3): «A DOS / MANOS» en Archivo ancha y pesada, «PÁDEL»
 * angosta con aire, y la pelota al lado. No es un isotipo inventado ni se presenta como la marca real:
 * el pie dice «Identidad provisional» mientras `MARCA_PROVISIONAL` siga en true.
 */
export function Logotipo({ className }: { className?: string }) {
  return (
    <span className={`am-logo ${className ?? ""}`}>
      <span className="am-logo-nombre">
        <span>A DOS</span>
        <span>
          MANOS
          <Pelota className="am-logo-pelota" />
        </span>
      </span>
      <span className="am-logo-padel">PÁDEL</span>
    </span>
  );
}
