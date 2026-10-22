import { getPaginaDeClientes } from "@/lib/actions";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { roleHasCapability } from "@/lib/capabilities";
import { PageHeader } from "@/components/ui";
import type { SessionUser } from "@/lib/session";
import { contextoCrm, cargarCompradoresSinFicha } from "@/lib/crm/cargas.server";
import {
  bordesDelMes,
  contarNuevas,
  desdeHistorial,
  evaluarFichas,
  leerFichasConActividad,
  leerPrimerasVisitas,
} from "@/lib/crm/lecturas";
import { enInicioPorApps } from "../inicio/piloto";
import ClientsList from "./ClientsList";
import EnlacesClientes, { atajosDeClientes } from "./EnlacesClientes";
import NuevaFicha from "./NuevaFicha";
import { vacioDeClientes } from "./vacio";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import ClientesRenglon from "./ClientesRenglon";
import { leerParametrosLista, paginaDeClientes, type FilaCliente } from "./lista-core";
import { deudasDelNegocio } from "@/lib/clientes/deudas.server";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import PielPropia from "../armazon/PielPropia";
import BotonBuscar from "../armazon/BotonBuscar";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApp("clientes");
  // «Diseño nuevo» (Renglón): UNA sola lista, la del piloto, en tabla densa y paginada en el
  // servidor. Apagado, todo sigue como hoy (CH → la lista de siempre; piloto → ClientesPiloto).
  const [nuevo, sp] = await Promise.all([disenoNuevo(), searchParams]);
  // El piloto («Trabaja por apps») usa la MISMA lista con situación que el diseño nuevo: una sola
  // implementación, paginada en el servidor (antes mandaba todas las fichas al navegador).
  if (nuevo || (await enInicioPorApps())) return <ClientesTabla user={user} sp={sp} />;
  // Cada ficha dice sus turnos o sus compras, según cómo cuenta la actividad el negocio (CRM).
  const { rubro } = await contextoCrm();
  // REINGENIERÍA CH, TANDA 2 (§3.6): un negocio que da turnos (CH) ve la MISMA lista del diseño nuevo,
  // con las vistas para escribirles (Frecuentes · Hace mucho · Cumplen · Deben) y su WhatsApp, con
  // piel propia (regla de independencia del interruptor, §0.2). Un mostrador sigue con la de siempre.
  if (rubro === "servicios") return <ClientesTabla user={user} sp={sp} pielPropia />;
  // El resto (sin "Trabaja por apps") sigue viendo la lista de siempre, con las mismas tarjetas; la
  // búsqueda y la página se resuelven en la base (50 por página).
  const p = leerParametrosLista(sp);
  const [pagina, negocio] = await Promise.all([getPaginaDeClientes({ q: p.q, pagina: p.pagina, rubro }), getNegocioApps(user.role)]);
  // Sin clientes, el siguiente paso es dar el primer turno: sólo si puede abrir la agenda y darlo.
  const vacio = vacioDeClientes({
    puedeDarTurno: appPermitida(appPorId("agenda"), negocio) && roleHasCapability(user.role, "agenda:manage"),
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-strong mb-1">Clientes</h1>
      <p className="text-muted mb-6">
        {pagina.total.toLocaleString("es-AR")} {pagina.total === 1 ? "cliente registrado" : "clientes registrados"}.
      </p>

      <ClientsList pagina={pagina} q={p.q} vacio={vacio} />
    </main>
  );
}

// ── Diseño nuevo: la misma lista del piloto (mismas lecturas del motor comercial), en tabla ────
//
// Las filas se arman IGUAL que en ClientesPiloto (mismas consultas, mismo `evaluarFichas`); lo
// único nuevo es que la búsqueda, la situación, el orden y la página se resuelven acá, en el
// servidor (lista-core.ts), y al navegador viaja sólo la página que se mira.
async function ClientesTabla({
  user,
  sp,
  pielPropia = false,
}: {
  user: SessionUser;
  sp: Record<string, string | string[] | undefined>;
  /** Con «Diseño nuevo» apagado (CH): la pantalla se viste sola con la piel «Renglón». */
  pielPropia?: boolean;
}) {
  const c = await contextoCrm();
  const puedeCrear = roleHasCapability(user.role, "clients:manage");
  // «Deben» sólo donde hay turnos (la deuda es de turnos ya prestados); un mostrador no la lee.
  const conDeudas = c.rubro === "servicios";
  const [fichas, primeras, sinFicha, negocio, atajos, deudas, slug] = await Promise.all([
    leerFichasConActividad(prisma, c.tenantId, { desde: desdeHistorial(c.ahora), rubro: c.rubro }),
    leerPrimerasVisitas(prisma, c.tenantId, c.rubro),
    c.rubro === "mostrador" && puedeCrear ? cargarCompradoresSinFicha() : Promise.resolve([]),
    // Cacheado por pedido (lo leyó el layout): sólo decide si va la columna de turnos.
    getNegocioApps(user.role),
    atajosDeClientes(user.role),
    conDeudas ? deudasDelNegocio(c.tenantId, desdeHistorial(c.ahora)) : Promise.resolve(new Map<string, number>()),
    pielPropia ? getCurrentTenantSlug() : Promise.resolve(null),
  ]);
  const base = evaluarFichas(fichas, c.rubro, c.hoy, c.ahora);
  const nuevas = contarNuevas(primeras, bordesDelMes(c.hoy));
  const todas: FilaCliente[] = base.map(({ persona, ev }) => ({
    id: persona.id,
    nombre: persona.nombre,
    telefono: persona.telefono,
    segmento: ev.segmento,
    diasSinVenir: ev.diasSinVenir,
    proximoTurno: persona.proximoTurno ? persona.proximoTurno.startsAt.toISOString() : null,
    visitas: ev.cantidadVisitas,
    cumple: persona.cumple,
    debe: deudas.get(persona.id) ?? 0,
  }));
  const p = leerParametrosLista(sp);
  const pagina = paginaDeClientes(todas, p, c.hoy);
  const visita = c.rubro === "servicios" ? "visita" : "compra";
  const conTurnos = appPermitida(appPorId("agenda"), negocio);

  const lista = (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* En el celular, arriba sólo va la lista: los atajos, «Nueva ficha» y «Compraron sin ficha»
          pasan al «⋯» de la barra de la lista (ClientesRenglon). En la PC siguen a la vista. */}
      <PageHeader
        title="Clientes"
        description={`${todas.length} ${todas.length === 1 ? "ficha" : "fichas"} · ${nuevas} ${nuevas === 1 ? "nuevo" : "nuevos"} este mes`}
        actions={conTurnos ? <BotonBuscar /> : undefined}
      />
      <EnlacesClientes role={user.role} actual="clientes" className="mb-4 flex flex-wrap gap-2 max-sm:hidden" />
      {puedeCrear && <NuevaFicha compacta sinFicha={sinFicha.map((x) => ({ ...x, ultimo: x.ultimo.toISOString() }))} />}
      <ClientesRenglon
        atajos={atajos.filter((a) => a.id !== "clientes").map(({ etiqueta, href }) => ({ etiqueta, href }))}
        puedeCrear={puedeCrear}
        sinFicha={sinFicha.length}
        filas={pagina.filas}
        coinciden={pagina.coinciden}
        total={todas.length}
        pagina={pagina.pagina}
        paginas={pagina.paginas}
        porSituacion={pagina.porSituacion}
        q={p.q}
        situacion={p.situacion}
        visitaSingular={visita}
        conTurnos={conTurnos}
        vista={p.vista ?? null}
        porVista={pagina.porVista}
        hoy={c.hoy}
      />
    </main>
  );
  if (!pielPropia) return lista;
  return (
    <ConDiseno nuevo precargarLetra={false}>
      <PielPropia pantalla="clientes" letraDelNegocio={esteticaBackoffice(slug) !== null} className="min-h-full bg-surface text-body">
        {lista}
      </PielPropia>
    </ConDiseno>
  );
}
