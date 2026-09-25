// Estilos propios de la demo de Rendí. Van inyectados acá (no en globals.css, que es de toda la
// app) y con prefijo `rendi-`, igual que el recorrido de /demo. Todo color sale de los tokens
// del skin Fable (claro/oscuro); las únicas excepciones son el bisel del teléfono, el visor de
// la cámara y el papel del ticket, que se ven igual en los dos temas porque son objetos físicos.

const CSS = `
/* ── Teléfono: marco en escritorio; en el celular la app ocupa la pantalla ── */
.rendi-telefono { width: 100%; }
.rendi-telefono__pantalla { background: var(--surface); }
.rendi-telefono__barra { display: none; }
.rendi-telefono__acciones { position: sticky; bottom: 0; z-index: 5; }
@media (min-width: 640px) {
  .rendi-telefono {
    width: 390px; padding: 11px; border-radius: 54px; background: #0b0b0d;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07), 0 34px 80px -24px rgb(0 0 0 / 0.5);
  }
  .rendi-telefono__pantalla {
    height: min(812px, calc(100dvh - 190px)); min-height: 600px; border-radius: 43px;
    overflow: hidden; display: flex; flex-direction: column;
  }
  .rendi-telefono__barra {
    display: flex; align-items: center; justify-content: space-between;
    height: 44px; padding: 0 26px 0 30px; flex-shrink: 0;
    font-size: 13px; font-weight: 600; color: var(--text-strong);
  }
  .rendi-telefono__scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .rendi-telefono__acciones { position: static; }
}
.rendi-isla { width: 96px; height: 28px; border-radius: 999px; background: #0b0b0d; }
/* En el celular, con el recorrido guiado abierto, la barra de acciones fluye con el contenido:
   pegada abajo quedaría detrás de la tarjeta del recorrido (y el botón señalado, tapado). */
@media (max-width: 639px) {
  [data-recorrido-abierto] .rendi-telefono__acciones { position: static; }
}

/* ── Papel del ticket: claro con tinta oscura en los dos temas (es una foto de papel) ── */
.rendi-papel { background: #fffdf7; color: #1d1d1f; }
[data-theme="dark"] .rendi-papel { background: #efece4; }
.rendi-ticket-sombra { filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.08)) drop-shadow(0 10px 18px rgb(0 0 0 / 0.16)); }
/* Borde inferior cortado en zigzag, como un ticket arrancado. */
.rendi-corte {
  -webkit-mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%;
  mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%;
}
.rendi-mini-qr { background: conic-gradient(#1d1d1f 25%, transparent 0 50%, #1d1d1f 0 75%, transparent 0) 0 0 / 4px 4px; }

/* ── Visor de la cámara ── */
.rendi-visor { background: radial-gradient(120% 90% at 50% 0%, #2a2d33, #121316); }
.rendi-esquinas {
  position: absolute; inset: 10px; pointer-events: none; --c: rgb(255 255 255 / 0.92); --l: 26px; --g: 3px;
  background:
    linear-gradient(var(--c), var(--c)) top left / var(--l) var(--g) no-repeat,
    linear-gradient(var(--c), var(--c)) top left / var(--g) var(--l) no-repeat,
    linear-gradient(var(--c), var(--c)) top right / var(--l) var(--g) no-repeat,
    linear-gradient(var(--c), var(--c)) top right / var(--g) var(--l) no-repeat,
    linear-gradient(var(--c), var(--c)) bottom left / var(--l) var(--g) no-repeat,
    linear-gradient(var(--c), var(--c)) bottom left / var(--g) var(--l) no-repeat,
    linear-gradient(var(--c), var(--c)) bottom right / var(--l) var(--g) no-repeat,
    linear-gradient(var(--c), var(--c)) bottom right / var(--g) var(--l) no-repeat;
}
.rendi-escaneo { position: relative; overflow: hidden; }
.rendi-escaneo::after {
  content: ""; position: absolute; inset-inline: 0; top: -35%; height: 35%; pointer-events: none;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--accent) 45%, transparent), transparent);
  animation: rendi-escanear 0.9s ease-out 1 forwards;
}
@keyframes rendi-escanear { to { top: 110%; } }
.rendi-obturador {
  width: 68px; height: 68px; border-radius: 999px; background: #fff;
  box-shadow: 0 0 0 4px var(--surface), 0 0 0 7px var(--line-strong);
  transition: transform 0.12s ease;
}
.rendi-obturador:active { transform: scale(0.94); }

/* ── Aparición suave de la lectura ── */
.rendi-aparece { animation: rendi-aparecer 0.35s ease both; }
.rendi-aparece-2 { animation: rendi-aparecer 0.35s ease 0.25s both; }
.rendi-aparece-3 { animation: rendi-aparecer 0.35s ease 0.5s both; }
@keyframes rendi-aparecer { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ── Recorrido guiado: el elemento señalado ── */
.rendi-destacado {
  outline: 3px solid var(--accent) !important; outline-offset: 4px; border-radius: 12px;
  animation: rendi-latido 1.8s ease-in-out infinite;
}
@keyframes rendi-latido {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent); }
  50% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent) 0%, transparent); }
}

/* ── Confirmación de "Reiniciar demo" (popover nativo) ── */
.rendi-popover::backdrop { background: rgb(0 0 0 / 0.38); }

/* Quien pidió menos movimiento no ve animaciones: el estado final es el mismo. */
@media (prefers-reduced-motion: reduce) {
  .rendi-escaneo::after { display: none; }
  .rendi-aparece, .rendi-aparece-2, .rendi-aparece-3, .rendi-destacado { animation: none !important; }
  .rendi-obturador { transition: none; }
}
`;

export default function EstilosRendi() {
  return <style>{CSS}</style>;
}
