"use client";

// Error de la tienda (ronda 2, P0-3): antes ninguna tienda tenía `error.tsx` y una caída mostraba la pantalla genérica.
import ErrorDeLaVidriera from "@/components/vidriera/ErrorDeLaVidriera";

export default function ErrorDeLaTienda({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorDeLaVidriera reset={reset} que="la tienda" inicio="/tienda" />;
}
