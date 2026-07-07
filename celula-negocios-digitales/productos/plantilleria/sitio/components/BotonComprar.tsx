"use client";

// CTA de compra. Abre el checkout hosteado de Lemon Squeezy (overlay).
// En producción, con el script de LS cargado, data-lemonsqueezy-button abre el overlay.
// Acá redirige a la checkoutUrl como fallback simple y autocontenido.

interface Props {
  checkoutUrl: string;
  label?: string;
  block?: boolean;
}

export default function BotonComprar({ checkoutUrl, label = "Comprar ahora", block }: Props) {
  const esPlaceholder = checkoutUrl.includes("PLACEHOLDER");

  return (
    <a
      href={checkoutUrl}
      className={`btn btn-primario ${block ? "btn-block" : ""}`}
      // atributo que usa el overlay de Lemon Squeezy cuando su script está presente
      data-lemonsqueezy-button=""
      onClick={(e) => {
        if (esPlaceholder) {
          e.preventDefault();
          alert(
            "Checkout de demostración.\n\nEn producción esto abre el pago de Lemon Squeezy (USD, tarjeta) " +
              "y entrega el archivo por email. Reemplazá la checkoutUrl PLACEHOLDER en data/catalogo.ts."
          );
        }
      }}
    >
      {label} <span aria-hidden>→</span>
    </a>
  );
}
