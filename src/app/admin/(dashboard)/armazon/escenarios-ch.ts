// Los armazones que se comparan contra HEAD en armazon-ch.test.ts: CH (sin «Trabaja por apps») con
// sus tres roles y la barra agrupada, y un negocio del piloto con la piel vieja. PURO: sólo arma los
// props con el registro real (lo mismo que calcula el layout).
import { catalogo } from "@/modules/catalog";
import { appsVisibles, proyectarMenuDeHoy, resolverContextoApps, type NegocioApps } from "@/apps/visibles";
import type { Role } from "@/lib/capabilities";

function negocio(role: Role, piloto: boolean): NegocioApps {
  const magra = { id: "t-magra", slug: "magra", blueprintId: "carniceria", modules: ["pos", "catalog", "clients", "reports", "arca", "inventario"] };
  return {
    role,
    contexto: piloto ? resolverContextoApps(magra, { registroGlobal: false, enInicioPorApps: true }, catalogo()) : null,
    modulosAsignados: piloto ? magra.modules : [],
    perfil: null,
    esMostrador: piloto,
    carniceriaLista: false,
  };
}

export interface EscenarioDeArmazon {
  id: string;
  ruta: string;
  props: {
    role: Role;
    userName: string;
    brandName: string;
    monogram: string;
    menu: ReturnType<typeof proyectarMenuDeHoy>;
    apps: ReturnType<typeof appsVisibles>;
    modoApps: boolean;
    esMostrador: boolean;
    navGrouping: boolean;
    activeProfile: null;
    showPublicSite: boolean;
  };
}

export function escenarios(): EscenarioDeArmazon[] {
  const ch = (role: Role, ruta: string, navGrouping = false): EscenarioDeArmazon => {
    const visibles = appsVisibles(negocio(role, false));
    return {
      id: `ch-${role.toLowerCase()}${navGrouping ? "-agrupado" : ""}`,
      ruta,
      props: { role, userName: "Cecilia Herrera", brandName: "CH Estética", monogram: "CH", menu: proyectarMenuDeHoy(visibles), apps: [], modoApps: false, esMostrador: false, navGrouping, activeProfile: null, showPublicSite: true },
    };
  };
  const visiblesMagra = appsVisibles(negocio("OWNER", true));
  return [
    ch("OWNER", "/admin/turnos"),
    ch("RECEPTION", "/admin"),
    ch("PROFESSIONAL", "/admin/turnos"),
    ch("OWNER", "/admin/caja", true),
    {
      id: "piloto-magra-owner",
      ruta: "/admin/pedidos",
      props: { role: "OWNER", userName: "Martín Aguirre", brandName: "MAGRA", monogram: "M", menu: proyectarMenuDeHoy(visiblesMagra), apps: visiblesMagra, modoApps: true, esMostrador: true, navGrouping: false, activeProfile: null, showPublicSite: true },
    },
  ];
}
