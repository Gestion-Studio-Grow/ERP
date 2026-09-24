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
//   3. una sección por espacio (Mostrador —o Recepción—, Caja, Clientes, Catálogo y precios,
//      Stock y compras, Finanzas, Administración) con las apps que esta persona ve.
//
// La grilla se pinta al instante: sale del registro (dato puro) y de la misma decisión que
// arma la barra (`appsVisibles`). Cada número llega después por su lado (NumeroKpi).
//
// La guardia es dashboard:read y no `requireApp("inicio")`: sin esa capability (PROFESSIONAL)
// la persona va a la casa de su rol, su agenda, como hoy. `requireApp` la mandaría a
// "App no disponible", que para ella sería un callejón.

import { Suspense } from "react";
import { requireCapability } from "@/lib/authz";
import { getNegocioApps } from "@/apps/contexto.server";
import { appsVisibles } from "@/apps/visibles";
import { llevaNumero } from "@/apps/kpis/index.server";
import { EmptyState, PageContainer, PageHeader } from "@/components/ui";
import BuscadorApps from "./BuscadorApps";
import ParaAtenderHoy, { ParaAtenderHoyCargando } from "./ParaAtenderHoy";
import Tile from "./Tile";
import { seccionesDelInicio } from "./secciones";

export default async function InicioApps() {
  const user = await requireCapability("dashboard:read");
  const negocio = await getNegocioApps(user.role);
  const visibles = appsVisibles(negocio);
  const secciones = seccionesDelInicio(visibles, { esMostrador: negocio.esMostrador });
  const conNumero = visibles.filter((app) => llevaNumero(app, user.role));

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
                  <Tile app={app} role={user.role} conNumero={llevaNumero(app, user.role)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </PageContainer>
  );
}
