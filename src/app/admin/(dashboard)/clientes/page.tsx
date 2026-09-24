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
import EnlacesClientes from "./EnlacesClientes";
import NuevaFicha from "./NuevaFicha";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const user = await requireApp("clientes");
  // CH (sin "Trabaja por apps") sigue viendo exactamente la lista de siempre. La lista con
  // segmentos y la ficha única llegan cuando GSG le prende el interruptor al negocio.
  if (await enInicioPorApps()) return <ClientesPiloto user={user} />;

  const clients = await getClients();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-strong mb-1">Clientes</h1>
      <p className="text-muted mb-6">{clients.length} {clients.length === 1 ? "cliente registrado" : "clientes registrados"}.</p>

      <ClientsList clients={clients} />
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
