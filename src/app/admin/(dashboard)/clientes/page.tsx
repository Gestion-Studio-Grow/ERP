import { getClients } from "@/lib/actions";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { roleHasCapability } from "@/lib/capabilities";
import { EmptyState, PageHeader } from "@/components/ui";
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
import ClientesLista, { type FilaCliente } from "./ClientesLista";
import EnlacesClientes, { atajosDeClientes } from "./EnlacesClientes";
import NuevaFicha from "./NuevaFicha";
import { vacioDeClientes } from "./vacio";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import ClientesRenglon from "./ClientesRenglon";
import { leerParametrosLista, paginaDeClientes } from "./lista-core";

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
  if (nuevo) return <ClientesTabla user={user} sp={sp} />;
  // CH (sin "Trabaja por apps") sigue viendo exactamente la lista de siempre. La lista con
  // segmentos y la ficha única llegan cuando GSG le prende el interruptor al negocio.
  if (await enInicioPorApps()) return <ClientesPiloto user={user} />;

  const [clients, negocio] = await Promise.all([getClients(), getNegocioApps(user.role)]);
  // Sin clientes, el siguiente paso es dar el primer turno: sólo si puede abrir la agenda y darlo.
  const vacio = vacioDeClientes({
    puedeDarTurno: appPermitida(appPorId("agenda"), negocio) && roleHasCapability(user.role, "agenda:manage"),
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-strong mb-1">Clientes</h1>
      <p className="text-muted mb-6">{clients.length} {clients.length === 1 ? "cliente registrado" : "clientes registrados"}.</p>

      <ClientsList clients={clients} vacio={vacio} />
    </main>
  );
}

// ── Inicio por apps: la lista con la situación de cada cliente ────────────────
//
// El segmento y la última visita salen del motor comercial (src/lib/crm), con las MISMAS
// lecturas que "Por recuperar" y la bandeja; "nuevos este mes", con la misma lectura que el
// número de Clientes en el Inicio (`leerPrimerasVisitas`).
async function ClientesPiloto({ user }: { user: SessionUser }) {
  const c = await contextoCrm();
  const puedeCrear = roleHasCapability(user.role, "clients:manage");
  const [fichas, primeras, sinFicha] = await Promise.all([
    leerFichasConActividad(prisma, c.tenantId, { desde: desdeHistorial(c.ahora), rubro: c.rubro }),
    leerPrimerasVisitas(prisma, c.tenantId, c.rubro),
    // En un mostrador la ficha no nace sola (la venta no la crea): se ofrece crearla a quien
    // ya compró dejando su teléfono.
    c.rubro === "mostrador" && puedeCrear ? cargarCompradoresSinFicha() : Promise.resolve([]),
  ]);
  const base = evaluarFichas(fichas, c.rubro, c.hoy, c.ahora);
  const nuevas = contarNuevas(primeras, bordesDelMes(c.hoy));
  const filas: FilaCliente[] = base.map(({ persona, ev }) => ({
    id: persona.id,
    nombre: persona.nombre,
    telefono: persona.telefono,
    segmento: ev.segmento,
    diasSinVenir: ev.diasSinVenir,
    proximoTurno: persona.proximoTurno ? persona.proximoTurno.startsAt.toISOString() : null,
    visitas: ev.cantidadVisitas,
  }));
  const visita = c.rubro === "servicios" ? "visita" : "compra";

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Clientes"
        description={`${filas.length} ${filas.length === 1 ? "ficha" : "fichas"} · ${nuevas} ${nuevas === 1 ? "cliente nuevo" : "clientes nuevos"} este mes (primera ${visita} de su historia).`}
      />
      <EnlacesClientes role={user.role} actual="clientes" />
      {puedeCrear && <NuevaFicha sinFicha={sinFicha.map((x) => ({ ...x, ultimo: x.ultimo.toISOString() }))} />}
      <p className="mb-4 text-sm text-muted">
        La situación sale de cada cuánto viene cada cliente: en riesgo es entre 1,5 y 3 veces su ciclo sin volver, y
        &ldquo;no volvió&rdquo;, más de 3. Se mira el último año y medio.
      </p>
      {filas.length === 0 ? (
        <EmptyState
          title="Todavía no hay fichas"
          description={
            c.rubro === "servicios"
              ? "Las fichas se crean solas cuando alguien reserva un turno. También podés cargar una con “Nueva ficha”."
              : "Cargá la primera con “Nueva ficha”: los pedidos que esa persona ya hizo con su teléfono quedan en su historial."
          }
        />
      ) : (
        <ClientesLista filas={filas} visitaSingular={visita} />
      )}
    </main>
  );
}

// ── Diseño nuevo: la misma lista del piloto (mismas lecturas del motor comercial), en tabla ────
//
// Las filas se arman IGUAL que en ClientesPiloto (mismas consultas, mismo `evaluarFichas`); lo
// único nuevo es que la búsqueda, la situación, el orden y la página se resuelven acá, en el
// servidor (lista-core.ts), y al navegador viaja sólo la página que se mira.
async function ClientesTabla({ user, sp }: { user: SessionUser; sp: Record<string, string | string[] | undefined> }) {
  const c = await contextoCrm();
  const puedeCrear = roleHasCapability(user.role, "clients:manage");
  const [fichas, primeras, sinFicha, negocio, atajos] = await Promise.all([
    leerFichasConActividad(prisma, c.tenantId, { desde: desdeHistorial(c.ahora), rubro: c.rubro }),
    leerPrimerasVisitas(prisma, c.tenantId, c.rubro),
    c.rubro === "mostrador" && puedeCrear ? cargarCompradoresSinFicha() : Promise.resolve([]),
    // Cacheado por pedido (lo leyó el layout): sólo decide si va la columna de turnos.
    getNegocioApps(user.role),
    atajosDeClientes(user.role),
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
  }));
  const p = leerParametrosLista(sp);
  const pagina = paginaDeClientes(todas, p);
  const visita = c.rubro === "servicios" ? "visita" : "compra";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* En el celular, arriba sólo va la lista: los atajos, «Nueva ficha» y «Compraron sin ficha»
          pasan al «⋯» de la barra de la lista (ClientesRenglon). En la PC siguen a la vista. */}
      <PageHeader
        title="Clientes"
        description={`${todas.length} ${todas.length === 1 ? "ficha" : "fichas"} · ${nuevas} ${nuevas === 1 ? "nuevo" : "nuevos"} este mes`}
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
        conTurnos={appPermitida(appPorId("agenda"), negocio)}
      />
    </main>
  );
}
