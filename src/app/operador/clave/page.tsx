import type { Metadata } from "next";
import Link from "next/link";
import { GeneradorDeLinea } from "./GeneradorDeLinea";
import { operadorDuenio } from "@/lib/operator-auth";

// /operador/clave — PÚBLICA a propósito (el proxy la deja pasar, src/proxy.ts). Una persona que
// GSG suma como operador arma acá su línea de OPERADORES: nombre, clave, y el navegador calcula
// "nombre=pbkdf2$sal$hash" con Web Crypto. La clave no viaja a ningún lado: esta página no tiene
// formulario que vaya al servidor ni lee nada de la base. El dueño pega la línea en la variable
// OPERADORES de Vercel (separada por ";" de las otras) y la persona entra con su nombre. El nombre
// del dueño está reservado (se le pasa al generador para rechazarlo con un mensaje claro; el nombre
// no es secreto: el dueño entra con el nombre vacío y su clave).
export const metadata: Metadata = {
  title: "Consola · Armar tu acceso",
  robots: { index: false, follow: false },
};

// Se lee OPERADOR_DUENIO en cada pedido, no en el build.
export const dynamic = "force-dynamic";

export default function ClaveDeOperadorPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-6 py-10">
      <div className="w-full max-w-md space-y-4">
        <div>
          <p className="text-sm text-faint mb-1">Plataforma · Consola de operador</p>
          <h1 className="text-2xl font-semibold mb-1">Armá tu acceso a la consola</h1>
          <p className="text-sm text-muted">
            Elegí tu nombre y una clave larga. Esta pantalla calcula, en tu navegador, una línea que no
            contiene la clave. Pasásela al dueño de GSG: la suma a la configuración y entrás con tu nombre y
            tu clave.
          </p>
        </div>
        <GeneradorDeLinea nombreDelDuenio={operadorDuenio()} />
        <p className="text-xs text-muted">
          <Link href="/operador/login" className="underline hover:text-strong">
            Volver al ingreso
          </Link>
        </p>
      </div>
    </main>
  );
}
