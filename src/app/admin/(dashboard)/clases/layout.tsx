import { badgePendientes } from "@/lib/padel/datos.server";
import { BarraInferior } from "./_barra-inferior";
import { ColaAvisos } from "./_aviso";

// Sello GSG del backoffice (estándar de marca): metadata + crédito discreto al pie. El negocio
// conserva su nombre visible; esto es la firma de calidad detrás.
export const metadata = { generator: "Gestión Studio Grow" };

// El armazón de las pantallas del profe (matias-DISENO.md §2.1 · M-046):
// - `data-density="lite"`: se usa con una mano, caminando entre canchas (globals.css:147).
// - La barra de abajo (5 lugares) y su alto, `--alto-barra-inferior`, para todo este subárbol:
//   la cola de avisos y lo que se pegue abajo se apoya ENCIMA. Botones h-16 + 1 px de borde + la
//   zona segura del celular. El contenido deja ese mismo aire al final del scroll.
// - Si el negocio «trabaja por apps», el shell ya pinta su barra de espacios
//   (layout.tsx:280-291 del dashboard): acá gana la del módulo y la del shell se esconde en
//   /admin/clases/* (provisional a confirmar por QA en el tenant real, §2.1).
// - En `prefers-reduced-motion`, nada de transiciones adentro del módulo (M-051).
// La guardia de cada pantalla sigue en su página (requireApp), nunca acá: los layouts no se
// re-renderizan al navegar. El globito de pendientes se refresca con cada router.refresh() de las
// acciones; si la lectura falla, la barra sale sin número (nunca rompe la pantalla).
export default async function ClasesLayout({ children }: { children: React.ReactNode }) {
  const pendientes = await badgePendientes().catch(() => 0);
  return (
    <div
      data-density="lite"
      className="[--alto-barra-inferior:calc(4rem_+_1px_+_env(safe-area-inset-bottom))] pb-[var(--alto-barra-inferior)] motion-reduce:[&_*]:transition-none"
    >
      <style href="padel-clases-barra" precedence="default">{`body:has([data-barra-clases]) nav[aria-label="Espacios"]{display:none}`}</style>
      {/* TODO(M-034): pasar `marcarAvisado` (acción de la Tanda 2A, lib/padel/acciones*.ts) al integrar. */}
      <ColaAvisos>
        {children}
        <p className="pb-6 pt-2 text-center text-xs text-muted">Con tecnología de Gestión Studio Grow</p>
      </ColaAvisos>
      <BarraInferior pendientes={pendientes} />
    </div>
  );
}
