// ============================================================================
// INICIO POR APPS — lo que pide atención hoy y todas las apps de la persona.
// ============================================================================
//
// Reemplaza, en los negocios con "Trabaja por apps" prendido (src/cambios/interruptores.ts), a
// los tres inicios armados a mano (InicioComerciante, InicioVertical y el de mostrador de
// page.tsx). CH y todo negocio con el interruptor apagado siguen con el suyo, idéntico.
//
// De arriba abajo:
//   1. el buscador ("¿Qué querés hacer?", dos letras y Enter);
//   2. "Para atender hoy": sólo lo que está en alerta;
//   3. "Mis apps": las que la persona fijó con el alfiler (hasta 8, src/lib/apps-fijadas.ts);
//   4. una sección por espacio (Mostrador —o Recepción—, Caja, Clientes, Catálogo y precios,
//      Stock y compras, Finanzas, Administración) con las apps que esta persona ve.
//
// Los números se piden a la base en ORDEN de pantalla (primero los de Mis apps, después los
// espacios de arriba abajo): la fila de números (src/apps/kpis, una por instancia, como el pool)
// los atiende en orden de llegada de a tantos como conexiones hay, y así lo de arriba llega primero.
//
// La grilla se pinta al instante: sale del registro (dato puro) y de la misma decisión que
// arma la barra (`appsVisibles`). Cada número llega después por su lado (NumeroKpi).
//
// La guardia es dashboard:read y no `requireApp("inicio")`: sin esa capability (PROFESSIONAL)
// la persona va a la casa de su rol, su agenda, como hoy. `requireApp` la mandaría a
// "App no disponible", que para ella sería un callejón.

import { Suspense } from "react";
import { cookies } from "next/headers";
import { requireCapability } from "@/lib/authz";
import { COOKIE_FIJADAS, fijadasVisibles, leerFijadas } from "@/lib/apps-fijadas";
import { getNegocioApps } from "@/apps/contexto.server";
import { appsVisibles } from "@/apps/visibles";
import { llevaNumero } from "@/apps/kpis/index.server";
import { EmptyState, PageContainer, PageHeader } from "@/components/ui";
import BuscadorApps from "./BuscadorApps";
import ParaAtenderHoy, { ParaAtenderHoyCargando } from "./ParaAtenderHoy";
import Tile from "./Tile";
import { enOrdenDePantalla, seccionesDelInicio } from "./secciones";

export default async function InicioApps() {
  const user = await requireCapability("dashboard:read");
  const negocio = await getNegocioApps(user.role);
  const visibles = appsVisibles(negocio);
  const secciones = seccionesDelInicio(visibles, { esMostrador: negocio.esMostrador });
  // Mis apps: la cookie de ESTA persona, cruzada con lo que ve hoy (una id que ya no ve, o
  // inventada, no aparece). El alfiler de cada tile dice si está fijada.
  const misApps = fijadasVisibles(leerFijadas((await cookies()).get(COOKIE_FIJADAS)?.value, user.id), visibles);
  const fijadas = new Set(misApps.map((a) => a.id));
  const conNumero = enOrdenDePantalla(misApps, secciones, visibles).filter((app) => llevaNumero(app, user.role));

  return (
    <PageContainer>
      <PageHeader
        title="Inicio"
        description="Lo que pide atención hoy y todas tus apps."
        actions={
          <div className="w-full sm:w-80">
            <BuscadorApps apps={visibles} modo="desplegable" />
          </div>
        }
      />

      {conNumero.length > 0 && (
        <Suspense fallback={<ParaAtenderHoyCargando />}>
          <ParaAtenderHoy apps={conNumero} role={user.role} />
        </Suspense>
      )}

      {misApps.length > 0 ? (
        <section aria-labelledby="mis-apps" className="mb-xl">
          <h2 id="mis-apps" className="mb-sm text-lg font-semibold tracking-tight text-strong">
            Mis apps
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {misApps.map((app) => (
              <li key={app.id}>
                <Tile app={app} role={user.role} conNumero={llevaNumero(app, user.role)} fijada />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        secciones.length > 0 && (
          // Sin fijadas, una línea que dice cómo tenerlas (no un recuadro vacío que ocupe lugar).
          <p className="mb-xl flex items-center gap-2 text-sm text-muted">
            <svg className="h-4 w-4 shrink-0 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" />
              <path d="M12 14v6" />
            </svg>
            Tocá el alfiler de una app para tenerla acá arriba, en Mis apps.
          </p>
        )
      )}

      {secciones.length === 0 ? (
        <EmptyState
          title="Todavía no tenés apps para usar"
          description="Pedile a la dueña o al dueño del negocio que te habilite las que necesitás para trabajar."
        />
      ) : (
        secciones.map((seccion) => (
          <section key={seccion.id} aria-labelledby={`espacio-${seccion.id}`} className="mb-xl">
            <h2 id={`espacio-${seccion.id}`} className="mb-sm text-lg font-semibold tracking-tight text-strong">
              {seccion.nombre}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {seccion.apps.map((app) => (
                <li key={app.id}>
                  <Tile app={app} role={user.role} conNumero={llevaNumero(app, user.role)} fijada={fijadas.has(app.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </PageContainer>
  );
}
