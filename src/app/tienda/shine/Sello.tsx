// Sello oficial del manual (pág. 15): el slogan en círculo alrededor de un destello. Gira lento.
export default function Sello() {
  return (
    <svg className="sh-sello" viewBox="0 0 100 100" width={112} height={112} aria-hidden="true" focusable="false">
      <defs>
        <path id="sh-sello-c" d="M50,50 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0" fill="none" />
      </defs>
      <circle cx="50" cy="50" r="49" className="sh-sello-disco" />
      <text className="sh-sello-txt">
        <textPath href="#sh-sello-c">QUE TU LUZ NUNCA SE APAGUE · QUE TU LUZ NUNCA SE APAGUE ·</textPath>
      </text>
      <path className="sh-sello-estrella" d="M50 35 L53.4 46.6 L65 50 L53.4 53.4 L50 65 L46.6 53.4 L35 50 L46.6 46.6 Z" />
    </svg>
  );
}
