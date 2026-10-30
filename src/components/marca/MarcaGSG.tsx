// La marca de GSG en React: el mismo dibujo que src/lib/gsg/marca-svg.ts (isotipo = el punto «hecho» con una hoja).
// `IsotipoGSG` va en la firma «powered by GSG» del panel; `LogoGSG` en las pantallas que son de GSG y de nadie más
// (la dirección sin negocio). Todo en `currentColor`.

export function IsotipoGSG({ className, tamano = 16 }: { className?: string; tamano?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={tamano} height={tamano} aria-hidden="true" focusable="false" className={className}>
      <circle cx="14" cy="23" r="11" fill="currentColor" />
      <path d="M18.5 9.5C18.5 4.6 22.4 1.2 30 1.2C30 7.4 26.4 10.8 18.5 9.5Z" fill="currentColor" />
    </svg>
  );
}

export function LogoGSG({ alto = 32, className }: { alto?: number; className?: string }) {
  return (
    <svg viewBox="0 0 176 40" width={Math.round((alto * 176) / 40)} height={alto} role="img" aria-label="GSG — Gestión Studio Grow" className={className}>
      <circle cx="14" cy="23" r="11" fill="currentColor" />
      <path d="M18.5 9.5C18.5 4.6 22.4 1.2 30 1.2C30 7.4 26.4 10.8 18.5 9.5Z" fill="currentColor" />
      <text x="44" y="30" fontFamily="var(--font-geist-sans), Geist, system-ui, sans-serif" fontSize="23" fontWeight="650" letterSpacing="-0.7" fill="currentColor">
        GSG
      </text>
    </svg>
  );
}
