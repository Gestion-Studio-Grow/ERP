// Aparición al entrar en pantalla — AHORA SIN JAVASCRIPT.
//
// Antes: "use client" + IntersectionObserver + estado de React por cada bloque.
// Con veinte bloques revelables en la página eso eran veinte observers, veinte
// pedazos de estado y veinte renders extra, todo para un fundido.
//
// Ahora lo hace el navegador con `animation-timeline: view()` (ver globals.css,
// clase `.ch-aparece`): corre en el hilo del compositor, no manda una sola línea
// de JavaScript al cliente y respeta `prefers-reduced-motion` por CSS.
//
// MEJORA PROGRESIVA de verdad: el estado por defecto es el VISIBLE. Un navegador
// que no entienda `animation-timeline` ignora la regla y muestra el contenido
// como si nada — al revés que la versión con JavaScript, donde si el observer no
// llegaba a correr, el bloque se quedaba invisible para siempre.
//
// Server component: ya no cruza al bundle del cliente.
export default function Reveal({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className ? `ch-aparece ${className}` : "ch-aparece"} style={style}>
      {children}
    </div>
  );
}
