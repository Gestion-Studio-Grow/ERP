// «Cerrar lo pendiente» mientras llega: la MISMA anatomía que la bandeja (título, línea de estado,
// filtros, un bloque por día con renglones de una línea), así nada salta al llegar. Con la piel
// propia (data-diseno) como la pantalla, para que el esqueleto ya tenga su papel y sus rayas.

import { Esqueleto, PageContainer } from "@/components/ui";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";

const RENGLONES = ["r1", "r2", "r3", "r4"];
const DIAS = ["d1", "d2"];

export default function Cargando() {
  return (
    <ConDiseno nuevo precargarLetra={false}>
      <div data-diseno={PIEL_RENGLON} className="min-h-full bg-surface">
        <PageContainer>
          <span className="sr-only" role="status">
            Cargando los turnos sin cerrar…
          </span>
          <header className="mb-5" aria-hidden>
            <Esqueleto className="h-7 w-64" />
            <Esqueleto className="mt-3 h-4 w-96 max-w-full" />
            <div className="mt-4 flex flex-wrap gap-3">
              <Esqueleto className="h-11 w-48" />
              <Esqueleto className="h-11 w-64" />
            </div>
          </header>
          <div className="space-y-7" aria-hidden>
            {DIAS.map((d) => (
              <section key={d}>
                <div className="border-b border-line-strong pb-2">
                  <Esqueleto className="h-4 w-44" />
                </div>
                {RENGLONES.map((r) => (
                  <div key={r} className="flex min-h-13 items-center gap-4 border-b border-line py-2">
                    <Esqueleto className="h-4 w-14" />
                    <span className="min-w-0 flex-1">
                      <Esqueleto className="h-4 w-40" />
                      <Esqueleto className="mt-1.5 h-3 w-64 max-w-full" />
                    </span>
                    <Esqueleto className="h-4 w-16" />
                    <Esqueleto className="h-9 w-24 max-sm:hidden" />
                  </div>
                ))}
              </section>
            ))}
          </div>
        </PageContainer>
      </div>
    </ConDiseno>
  );
}
