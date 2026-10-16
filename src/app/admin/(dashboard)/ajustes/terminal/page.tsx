import { requireApp } from "@/lib/require-app";
import { getNegocioApps } from "@/apps/contexto.server";
import { appPermitida } from "@/apps/visibles";
import { appPorId, type AppId } from "@/apps/registro";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { PageContainer, PageHeader } from "@/components/ui";
import type { PantallaDeInicio } from "@/lib/terminal/perfil-core";
import PerfilTerminal, { type OpcionDePantalla } from "./PerfilTerminal";

export const dynamic = "force-dynamic";

// Las pantallas con las que puede arrancar un equipo, cada una con la app que la abre.
const PANTALLAS: { ruta: PantallaDeInicio; app: AppId }[] = [
  { ruta: "/admin", app: "inicio" },
  { ruta: "/admin/vender", app: "vender" },
  { ruta: "/admin/caja-rapida", app: "caja-rapida" },
  { ruta: "/admin/turnos", app: "agenda" },
];

// ESTE EQUIPO — el perfil de terminal (plan T-1/T-6): cómo trabaja esta PC, tablet o celular. Se
// guarda en el navegador, por negocio y por persona (src/lib/terminal/perfil-core.ts): no toca la
// base ni decide plata. La guardia es la de la app (`requireApp("terminal")`): rol, módulo
// `terminal` (moduloDuro: CH no la ve ni por URL) y rubro, la misma regla que el menú.
export default async function TerminalPage() {
  const user = await requireApp("terminal");
  const [slug, negocio] = await Promise.all([getCurrentTenantSlug(), getNegocioApps(user.role)]);
  // Sólo se ofrecen como pantalla de inicio las que esta persona puede abrir en este negocio: el
  // perfil elige entre puertas abiertas, nunca abre una.
  const pantallas: OpcionDePantalla[] = PANTALLAS.flatMap(({ ruta, app }) => {
    const a = appPorId(app);
    return ruta === "/admin" || appPermitida(a, negocio) ? [{ ruta, nombre: a.nombre }] : [];
  });
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Este equipo"
        description="Cómo trabaja esta computadora, tablet o celular: el ticket, el lector y los avisos. Vale sólo acá y sólo para vos."
      />
      {/* Sin slug (no debería pasar con sesión) el negocio se distingue por su id: la clave nunca queda "de todos". */}
      <PerfilTerminal tenantSlug={slug ?? user.tenantId} userId={user.id} pantallas={pantallas} />
    </PageContainer>
  );
}
