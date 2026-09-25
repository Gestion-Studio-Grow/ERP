import type { Metadata } from "next";
import { Suspense } from "react";
import { getSesionOperador, requireOperator } from "@/lib/operator-session";
import { operatorLogout } from "@/lib/operator-actions";
import { cockpitNavEnabled } from "@/lib/cockpit/flag";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import AdminThemeScript from "@/app/admin/AdminThemeScript";
import CabeceraConsola, { CapsulaConsola } from "./CabeceraConsola";

// Consola GSG: título propio (no "CH Estética…" heredado) y sin indexar.
// `generator` es el sello GSG invisible en el <head> (verificable en el HTML,
// ADR-043/estandar-marca-gsg.md) — el crédito visible va discreto al pie.
export const metadata: Metadata = {
  title: "Consola GSG",
  generator: "Gestión Studio Grow",
  robots: { index: false, follow: false },
};

// Armazón de la consola. Guardia dura (requireOperator) además del portón del proxy; cada página
// repite la suya (el layout no se vuelve a ejecutar al navegar del lado del cliente).
//
// DISEÑO NUEVO SIEMPRE: la consola la usa sólo GSG, así que la piel «Renglón» va prendida sin
// interruptor (no hay negocio de quien leerlo). Sin color de negocio: el acento cae al carbónico de
// GSG (el respaldo de la piel). El tema es el de la persona (claro u oscuro, AdminThemeScript +
// el interruptor de su menú): la consola ya no es una «sala de control» oscura fija.
//
// La misma anatomía que el panel: cabecera de dos renglones en la PC, barra arriba y cápsula abajo
// en el celular (CabeceraConsola.tsx). Palabras de mostrador: «Negocios», no «Tenants».
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  const sesion = await getSesionOperador();
  const conTablero = cockpitNavEnabled();

  const salir = (
    <form action={operatorLogout}>
      <button type="submit" data-parte="opcion">
        Salir de la consola
      </button>
    </form>
  );

  return (
    <div data-skin="fable" data-diseno={PIEL_RENGLON} data-theme="light" suppressHydrationWarning className="min-h-screen">
      {/* Corrige el tema antes del primer paint (lo elegido a mano, o el del sistema). */}
      <AdminThemeScript nuevo />
      <ConDiseno nuevo>
        <div data-ui="armazon">
          <Suspense fallback={null}>
            <CabeceraConsola
              operador={sesion?.nombre ?? "GSG"}
              esDuenio={sesion?.esDuenio ?? false}
              conTablero={conTablero}
              salir={salir}
            />
          </Suspense>
          <div id="contenido" tabIndex={-1} data-parte="contenido">
            {/* La página: ancho completo hasta 1400 px, márgenes de 16/24 px (la piel). Cada pantalla
                de la consola pone sólo su contenido. */}
            <main data-ui="pagina" className="mx-auto w-full">
              {children}
            </main>
            {/* Sello de GSG, discreto: ADR-043/estandar-marca-gsg.md. */}
            <p className="mx-auto max-w-[87.5rem] px-4 pb-6 text-xs text-muted lg:px-6">Hecho por Gestión Studio Grow</p>
          </div>
          <Suspense fallback={null}>
            <CapsulaConsola conTablero={conTablero} />
          </Suspense>
        </div>
      </ConDiseno>
    </div>
  );
}
