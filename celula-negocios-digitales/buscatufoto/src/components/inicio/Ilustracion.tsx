import s from "./inicio.module.css";

/**
 * Ilustración propia (SVG, sin fotos de stock): una galería de miniaturas con marca de agua; con el
 * dorsal 1043 escrito, se resaltan las tres fotos donde aparece y el resto se apaga.
 * Colores por tokens: se ve bien en tema oscuro y claro.
 */
const ANCHO = 116;
const ALTO = 86;
const COLS = [24, 150, 276];
const FILAS = [84, 180, 276];
const DORSALES = ["73", "1043", "4471", "2210", "1043", "318", "507", "2860", "1043"];

export function Ilustracion() {
  return (
    <svg
      className={s.ilustracion}
      viewBox="0 0 416 408"
      role="img"
      aria-labelledby="il-como-titulo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="il-como-titulo">
        Galería de un álbum con marca de agua: al escribir el dorsal 1043 se resaltan las tres fotos donde aparece.
      </title>
      <defs>
        <clipPath id="btf-il-mini">
          <rect x="0" y="0" width={ANCHO} height={ALTO} rx="7" />
        </clipPath>
        <pattern id="btf-il-marca" patternUnits="userSpaceOnUse" width="64" height="20" patternTransform="rotate(-24)">
          <text x="0" y="13" className={s.ilMarca}>
            buscatufoto
          </text>
        </pattern>
      </defs>

      {/* buscador de dorsal */}
      <rect x="24" y="24" width="368" height="42" rx="10" className={s.ilCampo} />
      <circle cx="45" cy="44" r="6.5" className={s.ilTrazo} strokeWidth="1.7" />
      <path d="M50 49l5 5" className={s.ilTrazo} strokeWidth="1.7" strokeLinecap="round" />
      <text x="66" y="49.5" className={s.ilTexto}>
        Dorsal
      </text>
      <text x="116" y="50.5" className={s.ilNumero}>
        1043
      </text>
      <rect x="157" y="36" width="1.5" height="18" className={s.ilCursor} />
      <text x="376" y="49.5" textAnchor="end" className={s.ilTexto}>
        3 de 9 fotos
      </text>

      {/* miniaturas */}
      {DORSALES.map((dorsal, i) => {
        const x = COLS[i % 3];
        const y = FILAS[Math.floor(i / 3)];
        const es = dorsal === "1043";
        const px = 30 + ((i * 23) % 56);
        return (
          <g key={i} transform={`translate(${x} ${y})`} className={es ? undefined : s.ilApagada}>
            <g clipPath="url(#btf-il-mini)">
              <rect width={ANCHO} height={ALTO} className={s.ilFoto} />
              <rect width={ANCHO} height="60" className={s.ilCielo} />
              <rect y="60" width={ANCHO} height="26" className={s.ilSuelo} />
              <path
                d={`M${px - 3} 54l-6 20M${px + 3} 54l7 18`}
                className={s.ilPierna}
                strokeWidth="4.5"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx={px} cy="25" r="6" className={s.ilPersona} />
              <rect x={px - 7.5} y="32" width="15" height="24" rx="5" className={s.ilPersona} />
              <rect x={px - 6} y="38" width="12" height="9" rx="1.5" className={s.ilDorsal} />
              <text x={px} y="44.8" textAnchor="middle" className={s.ilDorsalTexto}>
                {dorsal}
              </text>
              <rect width={ANCHO} height={ALTO} fill="url(#btf-il-marca)" />
            </g>
            {es ? (
              <>
                <rect x="1" y="1" width={ANCHO - 2} height={ALTO - 2} rx="7" className={s.ilBorde} />
                <rect x="72" y="7" width="38" height="16" rx="8" className={s.ilChip} />
                <text x="91" y="18" textAnchor="middle" className={s.ilChipTexto}>
                  1043
                </text>
              </>
            ) : null}
          </g>
        );
      })}

      {/* pie */}
      <text x="24" y="389" className={s.ilPie}>
        Vistas previas con marca de agua
      </text>
      <rect x="318" y="372" width="74" height="26" rx="8" className={s.ilBoton} />
      <text x="355" y="389" textAnchor="middle" className={s.ilBotonTexto}>
        Agregar 3
      </text>
    </svg>
  );
}
