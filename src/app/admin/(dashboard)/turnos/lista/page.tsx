import { getAppointments, getFichasParaAlta, getProfessionalsWithServices } from "@/lib/actions";
import AppointmentRow from "../AppointmentRow";
import AppointmentsHistoryList from "./AppointmentsHistoryList";
import NewAppointmentForm from "../NewAppointmentForm";
import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { requireApp } from "@/lib/require-app";
import { cargarFaltazosPorFicha } from "@/lib/crm/cargas.server";
import { enInicioPorApps } from "../../inicio/piloto";
import { esCuentaACobrar, estadoCobroTurno } from "@/lib/turnos/cobros";
import { seccionDeLista } from "@/lib/turnos/turno-abierto";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerClienteDelAlta, leerNuevoTurno } from "../pasos";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { agendaPractica } from "@/lib/turnos/practica.server";
import { fechaPropuestaDelAlta, profesionalPropuesta } from "@/lib/turnos/practica";
import AgendaRenglon from "../AgendaRenglon";
import DarTurnoCajon from "../_agenda/DarTurnoCajon";
import { buttonClasses } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { contarSinCerrarDeQuienMira } from "@/lib/turnos/sin-cerrar.server";
import { RUTA_CERRAR_PENDIENTE } from "../../inicio/bandeja-core";
import { diaCorto, textoSinCerrar, ventanaDeLista } from "./lista-core";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import PielPropia from "../../armazon/PielPropia";

export const dynamic = "force-dynamic";

// "Reservado" y no "Pendiente de pago": la seña se cobra al reservar y el estado del turno
// no dice nada de la plata (eso lo dice cobrado/saldo en la fila).
export const statusLabel: Record<string, string> = {
  PENDING: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

// ─────────────────────────────────────────────────────────────────────────────
// PROYECCIÓN DEL PAYLOAD — lo que cruza el borde RSC hacia el navegador.
// ─────────────────────────────────────────────────────────────────────────────
//
// QUÉ PASABA ANTES: esta página le pasaba a `AppointmentRow` y a
// `AppointmentsHistoryList` —los dos son componentes CLIENTE— el objeto ENTERO que
// devuelve `getAppointments()`, con `client`, `professional`, `service`, `box` y
// `payment` completos colgados por el `include` de Prisma. React serializa cada campo
// de cada turno aunque nadie lo lea: `tenantId`, `createdAt`, `updatedAt`,
// `Client.email/notes/birthDate`, `Service.description`, `couponCode`, `isResidentBooking`…
// Medido con los ~1.000 turnos/año que factura CH, el documento pesaba 3,73 MB (2,21 MB
// sólo de payload RSC). Y como la página es `force-dynamic`, no hay caché que lo amortice:
// se paga entero en CADA apertura, y la recepción la abre muchas veces por día. Crece
// lineal con la facturación: el doble de turnos es el doble de MB.
//
// POR QUÉ A MANO Y CAMPO POR CAMPO: la lista de abajo es exactamente el `type Appointment`
// que declara `AppointmentRow` (AppointmentRow.tsx) — ni un campo más. NO usar spread
// (`...a`, `...a.client`): un spread vuelve a arrastrar el objeto entero de Prisma y el
// payload se infla de nuevo sin que nadie lo note hasta que la pantalla se cuelga.
// `proyeccion-payload.test.ts`, al lado de este archivo, monta guardia sobre las dos cosas.
//
// Paginar el historial es OTRA cosa y quedó afuera a propósito: el buscador de
// `AppointmentsHistoryList` filtra en el cliente sobre lo cargado. B8 (reingeniería CH, Tanda 1):
// lo cargado son los últimos 90 días (`ventanaDeLista`) con «Ver más atrás» (?desde=), no 365.
type TurnoDelLoader = Awaited<ReturnType<typeof getAppointments>>[number];

function proyectarTurno(a: TurnoDelLoader) {
  return {
    id: a.id,
    startsAt: a.startsAt,
    status: a.status,
    professionalId: a.professionalId,
    serviceId: a.serviceId,
    priceAtBooking: a.priceAtBooking,
    notes: a.notes,
    client: { name: a.client.name, phone: a.client.phone },
    professional: { name: a.professional.name, cobraEnMostrador: a.professional.cobraEnMostrador },
    service: { name: a.service.name, price: a.service.price, depositAmount: a.service.depositAmount },
    box: { name: a.box.name },
    payment: a.payment
      ? {
          method: a.payment.method,
          comprobanteNro: a.payment.comprobanteNro,
          amount: a.payment.amount,
          status: a.payment.status,
        }
      : null,
    // `collections` ya viene proyectada desde el loader (id/amount/method/note/createdAt,
    // con el `Decimal` convertido a `number` en el borde del repositorio): pasa tal cual.
    collections: a.collections,
  };
}

// El reloj se lee UNA vez por carga, afuera del cuerpo del componente: las tres secciones
// se parten con el mismo "ahora" y un turno no puede caer en dos.
function instanteDeCarga() {
  return new Date();
}

export default async function TurnosListaPage({
  searchParams,
}: {
  searchParams: Promise<{
    nuevo?: string | string[];
    fecha?: string | string[];
    cliente?: string | string[];
    desde?: string | string[];
  }>;
}) {
  // La lista (historial completo + alta manual) es gestión de agenda: solo
  // OWNER/RECEPTION. El PROFESSIONAL cae acá a su calendario propio.
  // La app (módulo y rubro, como la barra) y además gestionar la agenda: la lista es más que
  // el calendario que ve el profesional.
  await requireApp("agenda");
  const user = await requireCapability("agenda:manage");
  // Quién mira. Alimenta la misma regla que aplica el servidor al cobrar, para que la fila no
  // ofrezca un cobro que después se rechaza.
  const viewer = { role: user.role, professionalId: user.professionalId };
  // B2: lo que la fila puede ofrecer, con los MISMOS permisos que pide el servidor. La lista exige
  // `agenda:manage`; cobrar es `agenda:collect` (y por turno, `puedeCobrarEsteTurno` con `viewer`).
  const permisos = { gestionar: true, cobrar: roleHasCapability(user.role, "agenda:collect") };
  // "Dar un turno" desde un estado vacío de la agenda llega con ?nuevo=1&fecha=… (pasos.ts): el
  // alta se abre sola y con el día puesto. Sin eso, la lista es la de siempre.
  const sp = await searchParams;
  const nuevo = leerNuevoTurno(sp, todayInBusinessTz());
  // "Darle un turno" desde la ficha: ?cliente=<id>. El formulario la busca entre las MISMAS
  // fichas que ya recibe (getFichasParaAlta, del negocio); si no está, el alta queda vacía.
  const clienteInicial = leerClienteDelAlta(sp);
  // «Dar un turno» (Tanda 2, §2.3) es un cajón encima del libro del día, no el formulario viejo
  // dentro de la lista. Mismas lecturas que el alta de abajo (profesionales con servicios, fichas del
  // negocio, faltazos del piloto) y la misma acción de alta; no se trae el historial, que el cajón no
  // usa. REGLA DE INDEPENDENCIA DEL INTERRUPTOR (§0.2, decisión del orquestador, como 2-C/2-D/Tanda 1):
  // también con «Diseño nuevo» apagado (CH hoy) — el cajón se viste solo (DarTurnoCajon) y el libro
  // de atrás va con la piel propia (`PielPropia` + `ConDiseno nuevo`). Es un `return` aparte: el
  // formulario viejo (NewAppointmentForm) no se dibuja en esta respuesta, así no hay dos altas. Sin
  // `?nuevo=1`, la lista de siempre con su «+ Nuevo turno» tal cual.
  if (nuevo.abrir) {
    const hoy = todayInBusinessTz();
    const [profesionales, fichasAlta, faltazosAlta, practicaAlta, pielDelPanel, slug] = await Promise.all([
      getProfessionalsWithServices(),
      getFichasParaAlta(),
      enInicioPorApps().then((piloto) => (piloto ? cargarFaltazosPorFicha() : undefined)),
      agendaPractica(),
      disenoNuevo(),
      getCurrentTenantSlug(),
    ]);
    const agenda = (
      <AgendaRenglon
        quien={{ role: user.role, professionalId: user.professionalId }}
        fecha={nuevo.fecha || undefined}
        vista="lista"
        alta={
          <DarTurnoCajon
            profesionales={profesionales}
            fichas={fichasAlta}
            faltazos={faltazosAlta}
            hoy={hoy}
            fechaInicial={nuevo.fecha || (practicaAlta ? fechaPropuestaDelAlta(hoy) : hoy)}
            clienteInicial={clienteInicial || undefined}
            viewer={viewer}
          />
        }
      />
    );
    if (pielDelPanel) return agenda;
    return (
      <ConDiseno nuevo precargarLetra={false}>
        <PielPropia pantalla="agenda" letraDelNegocio={esteticaBackoffice(slug) !== null} className="min-h-full bg-surface text-body">
          {agenda}
        </PielPropia>
      </ConDiseno>
    );
  }
  // B8: 90 días (o lo que pida «Ver más atrás»), no 365. Los pasados sin cerrar se CUENTAN aparte,
  // sin tope de días: uno de hace 4 meses también tiene que aparecer (src/apps/kpis).
  const ventana = ventanaDeLista(sp.desde, todayInBusinessTz());
  const ahora = instanteDeCarga();
  const [appointments, professionals, fichas, faltazos, practica, sinCerrar] = await Promise.all([
    getAppointments(ventana.dias),
    getProfessionalsWithServices(),
    getFichasParaAlta(),
    // Inicio por apps: el aviso de faltazos al dar el turno. CH, fuera del piloto, sin cambios.
    enInicioPorApps().then((piloto) => (piloto ? cargarFaltazosPorFicha() : undefined)),
    agendaPractica(),
    // Mismo recorte que la bandeja: la profesional cuenta sólo los suyos (cert CH Tanda 1).
    contarSinCerrarDeQuienMira(),
  ]);
  // Único punto donde se lee el resultado crudo del loader: de acá para abajo se trabaja
  // siempre con `turnos`, que es lo que el navegador va a recibir.
  const turnos = appointments.map(proyectarTurno);
  // La sección "Reservados" se PARTE en dos (regla pura `seccionDeLista`, con test):
  //   · pasados sin cerrar: Reservados Y Confirmados con la hora ya pasada. Ya no se dibujan acá
  //     como tarjetas: son un renglón «N pasados sin cerrar → [Cerrar lo pendiente]» que lleva a
  //     la bandeja que los cierra en lote (/admin/turnos/cerrar);
  //   · a confirmar: los Reservados que todavía no llegaron.
  // Un turno cae en una sola: nada se repite en el Historial.
  const pending = turnos.filter((a) => seccionDeLista(a, ahora) === "a-confirmar");
  // Cuentas a cobrar DERIVADAS: turnos prestados (COMPLETED) con saldo > 0. No es un estado
  // nuevo del enum (decisión de producto): es precio − Σ cobros, en la fila y acá.
  const aCobrar = turnos.filter((a) => {
    const plata = estadoCobroTurno({
      precio: a.priceAtBooking ?? a.service.price,
      cobros: a.collections,
      pagoLegado: a.payment,
    });
    return esCuentaACobrar({ status: a.status, saldo: plata.saldo });
  });
  const rest = turnos.filter((a) => seccionDeLista(a, ahora) === "historial");

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center gap-4 mb-1">
        <h1 className="text-2xl font-semibold text-strong">Agenda</h1>
      </div>
      <div className="flex gap-4 text-sm mb-6 border-b border-line">
        <Link href="/admin/turnos" className="px-1 pb-2 text-muted hover:text-strong max-sm:inline-flex max-sm:min-h-11 max-sm:items-end">
          Calendario
        </Link>
        <Link href="/admin/turnos/lista" className="px-1 pb-2 border-b-2 border-accent text-strong font-medium max-sm:inline-flex max-sm:min-h-11 max-sm:items-end">
          Lista
        </Link>
      </div>
      <p className="text-muted mb-6">
        La seña se cobra al reservar (o registrala cuando llegue el comprobante por WhatsApp);
        confirmá el turno cuando la clienta confirme, y al completarlo se cobra el resto.
      </p>

      <NewAppointmentForm
        // B1: quién da el turno. Sin esto el alta suponía OWNER y le ofrecía «Cobrar ahora» a la
        // recepción para la profesional que cobra aparte; el servidor lo rechazaba al final.
        viewer={viewer}
        professionals={professionals}
        fichas={fichas}
        faltazos={faltazos}
        abierto={nuevo.abrir}
        // Agenda práctica (T4): sin fecha en la URL propone mañana; con una sola profesional, la elige.
        fechaInicial={nuevo.fecha || (practica ? fechaPropuestaDelAlta(todayInBusinessTz()) : "")}
        clienteInicial={clienteInicial}
        profesionalInicial={practica ? profesionalPropuesta(professionals) : ""}
      />

      {sinCerrar > 0 && (
        <section
          aria-label="Pasados sin cerrar"
          className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3"
        >
          <p className="text-sm text-body">
            <span className="font-medium text-strong">{textoSinCerrar(sinCerrar)}</span>
            <span className="text-muted"> · ya pasó la hora y siguen reservados o confirmados</span>
          </p>
          <Link href={RUTA_CERRAR_PENDIENTE} className={buttonClasses("solid", "sm", "whitespace-nowrap max-sm:min-h-11")}>
            Cerrar lo pendiente
          </Link>
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-medium text-strong mb-3">
          Reservados, a confirmar ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="text-sm text-muted">No hay reservas por confirmar.</p>
        )}
        <div className="space-y-3">
          {pending.map((a) => (
            <AppointmentRow
              key={a.id}
              appointment={a}
              statusLabel={statusLabel}
              viewer={viewer}
              canManage={permisos.gestionar}
              canCollect={permisos.cobrar}
              practica={practica}
              ancla
            />
          ))}
        </div>
      </section>

      {aCobrar.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-medium text-strong mb-3">Saldos a cobrar ({aCobrar.length})</h2>
          <p className="text-sm text-muted mb-3">
            Turnos ya realizados con plata pendiente, desde el {diaCorto(ventana.desde)}.
          </p>
          <div className="space-y-3">
            {aCobrar.map((a) => (
              <AppointmentRow
                key={a.id}
                appointment={a}
                statusLabel={statusLabel}
                viewer={viewer}
                canManage={permisos.gestionar}
                canCollect={permisos.cobrar}
                practica={practica}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium text-strong mb-1">Historial</h2>
        <p className="text-sm text-muted mb-3">Desde el {diaCorto(ventana.desde)} y lo que viene.</p>
        <AppointmentsHistoryList
          appointments={rest}
          statusLabel={statusLabel}
          practica={practica}
          viewer={viewer}
          permisos={permisos}
        />
        {ventana.masAtras && (
          <Link
            href={`/admin/turnos/lista?desde=${ventana.masAtras}`}
            className={buttonClasses("outline", "sm", "mt-4 max-sm:min-h-11")}
          >
            Ver más atrás (desde el {diaCorto(ventana.masAtras)})
          </Link>
        )}
      </section>
    </main>
  );
}
