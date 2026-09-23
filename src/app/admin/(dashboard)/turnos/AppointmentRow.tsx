"use client";

import { useState } from "react";
import {
  registrarCobroTurno,
  anularCobroTurno,
  condonarSaldoTurno,
  confirmarTurno,
  cancelAppointment,
  completeAppointment,
  markNoShow,
  type ResultadoAccion,
} from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import RescheduleForm from "./RescheduleForm";
import { fmtDateTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { buttonClasses, fmtMoneyARS } from "@/components/ui";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import {
  cobroSugerido,
  esCuentaACobrar,
  estadoCobroTurno,
  seniaDelServicio,
  METODOS_DE_PAGO,
  METODO_LABEL,
} from "@/lib/turnos/cobros";
import {
  claseDeCobro,
  cobrosAnulables,
  desglosarCobros,
  MOTIVO_MIN,
} from "@/lib/turnos/anulacion";

// La fila de cobro tal como la ve esta pantalla: la de `anulacion.ts` más lo que la grilla
// del calendario puede no traer.
type FilaDeCobroUI = { id?: string; amount: number; method: string; note?: string | null };

type Appointment = {
  id: string;
  startsAt: Date;
  status: string;
  professionalId: string;
  serviceId: string;
  priceAtBooking: number | null;
  notes: string | null;
  client: { name: string; phone: string };
  professional: { name: string; cobraEnMostrador?: boolean };
  service: { name: string; price: number; depositAmount?: number | null };
  box: { name: string };
  // `Payment` = agregado de los cobros del turno (o el pago 1:1 previo a los cobros parciales).
  payment: { method: string; comprobanteNro: string | null; amount?: number; status?: string } | null;
  // Cobros parciales (seña / saldo / lo que registró la recepción) MÁS sus contrapartidas
  // y condonaciones (anulacion.ts): el `id` es lo que se anula y la `note` lo que distingue
  // un cobro de la reversa que lo dio de baja. Ausente en demo.
  // `id`, `note` y `createdAt` son opcionales porque la grilla del calendario declara su
  // propia copia de este tipo sin esas columnas (CalendarGrid.tsx). En los datos reales
  // vienen siempre —las carga `conCobros`—; sin `id` la fila simplemente no ofrece anular.
  collections?: { id?: string; amount: number; method: string; note?: string | null; createdAt?: Date }[];
};

// Estados mapeados a la capa semántica, no a colores crudos de Tailwind.
const statusStyles: Record<string, string> = {
  PENDING: "bg-warning-soft text-warning",
  CONFIRMED: "bg-success-soft text-success",
  CANCELLED: "bg-surface-sunken text-muted",
  COMPLETED: "bg-info-soft text-info",
  NO_SHOW: "bg-danger-soft text-danger",
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusStyles[status] ?? "bg-surface-sunken text-muted"
      }`}
    >
      {label}
    </span>
  );
}

const selectClasses =
  "rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent";
const inputClasses =
  "rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent w-28";
const linkButtonClasses =
  "inline-flex items-center min-h-6 self-start text-sm text-muted hover:text-danger transition-colors";

function nuevaClave() {
  // uuid del formulario: la clave de idempotencia del cobro. Se renueva tras cada cobro
  // registrado, así el MISMO formulario puede cobrar de nuevo (otro parcial) sin chocar.
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;
}

function MetodoSelect({ name, id, defaultValue = "EFECTIVO" }: { name: string; id?: string; defaultValue?: string }) {
  return (
    <select name={name} id={id} className={selectClasses} defaultValue={defaultValue} required aria-label="Medio de pago">
      {METODOS_DE_PAGO.map((m) => (
        <option key={m} value={m}>
          {METODO_LABEL[m]}
        </option>
      ))}
    </select>
  );
}

// "Registrar cobro": seña, saldo o parcial. El monto viene precargado con lo que corresponde
// ahora (la seña si no se cobró nada y el servicio la define; si no, el saldo) y es editable.
function CobroForm({ appointmentId, monto, titulo }: { appointmentId: string; monto: number; titulo: string }) {
  const [clave, setClave] = useState(nuevaClave);
  const [error, setError] = useState("");
  return (
    <form
      action={async (fd) => {
        setError("");
        const r: ResultadoAccion = await registrarCobroTurno(fd);
        if (!r.ok) setError(r.error);
        else setClave(nuevaClave());
      }}
      className="flex flex-col gap-1.5"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="idempotencyKey" value={clave} />
      <p className="text-xs font-medium text-muted">{titulo}</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          name="amount"
          min={1}
          step="1"
          defaultValue={Math.round(monto)}
          className={inputClasses}
          aria-label="Monto a cobrar"
          required
        />
        <MetodoSelect name="method" />
        <SubmitButton pendingText="Cobrando…" className={buttonClasses("outline", "sm", "whitespace-nowrap")}>
          Registrar cobro
        </SubmitButton>
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// "Marcar como completado": si falta plata, pide el medio (o deja el saldo a cobrar).
function CompletarForm({ appointmentId, saldo, yaOcurrio }: { appointmentId: string; saldo: number; yaOcurrio: boolean }) {
  const [error, setError] = useState("");
  const [dejarSaldo, setDejarSaldo] = useState(false);
  return (
    <form
      action={async (fd) => {
        setError("");
        const r: ResultadoAccion = await completeAppointment(fd);
        if (!r.ok) setError(r.error);
      }}
      className="flex flex-col gap-1.5"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {saldo > 0 && (
        <>
          <p className="text-xs font-medium text-muted">Cobrar el saldo de {fmtMoneyARS(saldo, 0)} con</p>
          <div className="flex flex-wrap items-center gap-2">
            {!dejarSaldo && <MetodoSelect name="method" />}
            <label className="flex items-center gap-1.5 text-xs text-body">
              <input
                type="checkbox"
                name="saldo"
                value="a-cobrar"
                className="accent-accent"
                checked={dejarSaldo}
                onChange={(e) => setDejarSaldo(e.target.checked)}
              />
              Dejar saldo a cobrar
            </label>
          </div>
        </>
      )}
      <SubmitButton
        pendingText="Guardando…"
        className={buttonClasses("solid", "sm", `whitespace-nowrap self-start ${yaOcurrio ? "" : "opacity-60"}`)}
      >
        Marcar como completado
      </SubmitButton>
      {!yaOcurrio && <p className="text-xs text-muted">Se puede completar recién a partir de su horario.</p>}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// Confirmación en DOS PASOS con motivo obligatorio, para las dos correcciones que mueven
// plata hacia atrás. Dos pasos y no uno porque el botón vive al lado de "Registrar cobro" y
// un clic de más no puede deshacer un cobro; el motivo es obligatorio porque es lo único
// que, seis meses después, explica por qué la caja de ese día tiene un egreso.
function CorreccionConMotivo({
  etiqueta,
  pregunta,
  confirmar,
  placeholder,
  peligro = true,
  campos,
  accion,
}: {
  etiqueta: string;
  pregunta: string;
  confirmar: string;
  placeholder: string;
  peligro?: boolean;
  campos: Record<string, string>;
  accion: (fd: FormData) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={peligro ? linkButtonClasses : "inline-flex items-center min-h-6 self-start text-sm text-muted hover:text-strong transition-colors"}
      >
        {etiqueta}
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken px-3 py-2"
      role="group"
      aria-label={pregunta}
      action={async (fd) => {
        setError("");
        const r = await accion(fd);
        if (!r.ok) setError(r.error);
        else setAbierto(false);
      }}
    >
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <p className="text-xs font-medium text-strong">{pregunta}</p>
      <input
        type="text"
        name="motivo"
        required
        minLength={MOTIVO_MIN}
        maxLength={200}
        placeholder={placeholder}
        aria-label="Motivo"
        className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
      />
      <div className="flex items-center gap-3 text-xs">
        <SubmitButton pendingText="Guardando…" className="font-semibold underline text-danger">
          {confirmar}
        </SubmitButton>
        <button type="button" className="text-muted hover:underline" onClick={() => { setAbierto(false); setError(""); }}>
          No
        </button>
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// Los cobros ya registrados del turno, con su anulación al lado. Es la pantalla que faltaba:
// antes la fila decía "cobrado $18.000 · saldado" y no ofrecía NADA más — ni ver con qué
// medio se cobró, ni corregirlo. El error típico (medio equivocado, el select viene en
// EFECTIVO por default) se arreglaba tipeando dos asientos de fantasía en el libro.
function CobrosRegistrados({
  appointmentId,
  cobros,
  puedeAnular,
}: {
  appointmentId: string;
  cobros: readonly FilaDeCobroUI[];
  puedeAnular: boolean;
}) {
  const anulables = new Set(cobrosAnulables(cobros).map((c) => c.id));
  if (cobros.length === 0) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      <p className="text-xs font-medium text-muted">Cobros registrados</p>
      <ul className="mt-1 flex flex-col gap-1.5">
        {cobros.map((c, i) => {
          const clase = claseDeCobro(c.note);
          return (
            <li key={c.id ?? i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {clase === "cobro" && (
                <span className="text-body">
                  {fmtMoneyARS(c.amount, 0)} · {METODO_LABEL[c.method as keyof typeof METODO_LABEL] ?? c.method}
                </span>
              )}
              {clase === "anulacion" && (
                <span className="text-muted line-through">{fmtMoneyARS(Math.abs(c.amount), 0)}</span>
              )}
              {clase === "anulacion" && (
                <span className="inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-muted">Anulado</span>
              )}
              {clase === "condonacion" && (
                <span className="inline-block rounded-full bg-info-soft px-2 py-0.5 text-info">
                  Saldo dado de baja {fmtMoneyARS(c.amount, 0)}
                </span>
              )}
              {c.note && clase !== "cobro" && <span className="text-muted">{c.note.replace(/^[A-Z]+:\S*\s*—?\s*/, "")}</span>}
              {clase === "cobro" && puedeAnular && c.id && anulables.has(c.id) && (
                <CorreccionConMotivo
                  etiqueta="Anular"
                  // NO promete el libro. La reversa se asienta sólo si el cobro original dejó
                  // asiento y su medio se traduce a un medio de caja; con las columnas sin migrar
                  // no se asienta nada. La fila no puede saber cuál de esos casos es el suyo, y
                  // prometer un asiento que no ocurre es peor que no decir nada.
                  pregunta={`¿Anular el cobro de ${fmtMoneyARS(c.amount, 0)}?`}
                  confirmar="Sí, anular"
                  placeholder="Por qué se anula (cobré el medio equivocado…)"
                  campos={{ collectionId: c.id, appointmentId }}
                  accion={anularCobroTurno}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AppointmentRow({
  appointment,
  statusLabel,
  canManage = true,
  canCollect = true,
  viewer,
  ancla = false,
}: {
  appointment: Appointment;
  statusLabel: Record<string, string>;
  /**
   * ¿Esta fila lleva el ancla `#turno-<id>` a la que enlaza el cierre de caja? Sólo UNA fila
   * por turno puede llevarla: la lista dibuja un Completado con saldo en "Saldos a cobrar" y
   * otra vez en el Historial, y el calendario dibuja el mismo turno en la grilla y en el
   * detalle. Un `id` repetido en el DOM deja el enlace yendo a cualquiera de las dos. Por eso
   * es opt-in: la pone sólo la sección a la que apunta el enlace (los pasados sin cerrar y los
   * reservados de la lista).
   */
  ancla?: boolean;
  /**
   * Quién está mirando. Se usa SÓLO para decidir si se dibuja el botón de cobrar: la regla
   * la resuelve `puedeCobrarEsteTurno`, la misma función que aplica el servidor, así que la
   * pantalla y la acción no pueden desincronizarse. Sin `viewer` se asume que puede (es lo
   * que hacía antes) y el servidor sigue siendo la única autoridad.
   */
  viewer?: { role: string; professionalId?: string | null };
  // Gestión de agenda (cobrar / confirmar / cancelar) — solo OWNER/RECEPTION. El
  // PROFESSIONAL solo cierra sus turnos (completar / no-show). Es UX: el server
  // igual bloquea las acciones que su rol no puede (ADR-017 §2.e).
  canManage?: boolean;
  /**
   * ¿Puede COBRAR este turno? Va aparte de `canManage` porque el profesional cobra los
   * suyos (y rinde la comisión después) sin poder crear ni cancelar turnos ajenos.
   */
  canCollect?: boolean;
}) {
  // La recepción cobra a todas salvo a quien cobra aparte (decisión del dueño). El servidor
  // lo rechaza igual; acá se usa la MISMA función para que el botón no aparezca y la
  // recepcionista no se entere del límite recién después de apretar, con la clienta enfrente.
  const veredictoCobro = viewer
    ? puedeCobrarEsteTurno({
        rol: viewer.role,
        professionalIdDelUsuario: viewer.professionalId,
        professionalIdDelTurno: appointment.professionalId,
        nombreProfesional: appointment.professional.name,
        cobraEnMostrador: appointment.professional.cobraEnMostrador,
      })
    : ({ ok: true } as const);

  const isPending = appointment.status === "PENDING";
  const isConfirmed = appointment.status === "CONFIRMED";

  // Plata del turno: precio congelado, cobrado (Σ cobros, o el pago 1:1 previo) y saldo derivado.
  const precio = appointment.priceAtBooking ?? appointment.service.price;
  const cobros = appointment.collections ?? [];
  const pagoLegado =
    appointment.payment && appointment.payment.amount != null && appointment.payment.status
      ? { status: appointment.payment.status, amount: appointment.payment.amount }
      : null;
  const plata = estadoCobroTurno({ precio, cobros, pagoLegado });
  const senia = seniaDelServicio({ depositAmount: appointment.service.depositAmount, precio });
  const sugerido = cobroSugerido({ status: appointment.status, precio, depositAmount: appointment.service.depositAmount, cobros, pagoLegado });
  const cuentaACobrar = esCuentaACobrar({ status: appointment.status, saldo: plata.saldo });
  // Cobrado y condonado se muestran SEPARADOS: sumarlos diría que entraron $20.000 cuando
  // entraron $17.000, que es justo la mentira que obligaba a inventar asientos en la caja.
  const desglose = desglosarCobros(cobros);
  // "Ya ocurrió" es sólo una pista visual (el server es la autoridad: `puedeCompletarse`);
  // el reloj se toma una vez al montar para no leer `Date.now()` en el render.
  const [ahora] = useState(() => Date.now());
  const yaOcurrio = new Date(appointment.startsAt).getTime() <= ahora;

  // El teléfono es un link a WhatsApp (549 + número normalizado, ver `waLinkClienta`): antes
  // era texto y confirmar un turno era copiar el número a mano. Si lo cargado no es un número
  // de 10 dígitos, queda como texto: no se abre un chat a un número que no es el de ella.
  const wa = waLinkClienta(appointment.client.phone);

  return (
    // `id` = el ancla a la que lleva el cierre de caja ("#turno-<id>", ver `ancla`); `target:`
    // la resalta al llegar, para que se vea cuál de la lista era.
    <div
      id={ancla ? `turno-${appointment.id}` : undefined}
      className="scroll-mt-24 rounded-lg border border-line bg-surface-raised p-4 target:border-warning target:ring-2 target:ring-warning/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-strong">
            {appointment.client.name}{" "}
            <span className="text-muted font-normal">
              —{" "}
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-strong"
                  aria-label={`WhatsApp a ${appointment.client.name}: ${appointment.client.phone}`}
                >
                  {appointment.client.phone}
                </a>
              ) : (
                appointment.client.phone
              )}
            </span>
          </p>
          <p className="text-sm text-muted">
            {appointment.service.name} · {appointment.professional.name} ·{" "}
            {appointment.box.name}
          </p>
          <p className="text-sm text-muted">{fmtDateTime(appointment.startsAt)}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge
              status={appointment.status}
              label={statusLabel[appointment.status] ?? appointment.status}
            />
            <span className="text-sm font-medium text-strong">{fmtMoneyARS(precio, 0)}</span>
            {plata.cobrado > 0 && (
              <span className="text-xs text-muted">
                {desglose.cobrado > 0 ? `cobrado ${fmtMoneyARS(desglose.cobrado, 0)}` : "sin cobrar"}
                {desglose.condonado > 0 ? ` · dado de baja ${fmtMoneyARS(desglose.condonado, 0)}` : ""}
                {plata.saldo > 0 ? ` · saldo ${fmtMoneyARS(plata.saldo, 0)}` : " · saldado"}
              </span>
            )}
            {plata.cobrado === 0 && (isPending || isConfirmed) && senia > 0 && (
              <span className="inline-block rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                Seña {fmtMoneyARS(senia, 0)} sin cobrar
              </span>
            )}
            {cuentaACobrar && (
              <span className="inline-block rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">
                Saldo a cobrar {fmtMoneyARS(plata.saldo, 0)}
              </span>
            )}
          </div>
          {appointment.notes && (
            <p className="text-sm text-body mt-2 rounded-md bg-warning-soft px-2 py-1">
              {appointment.notes}
            </p>
          )}
        </div>

        {/* La seña de un turno pendiente se COBRA, no se gestiona: sale del bloque de
            `canManage` por la misma razón que el saldo de abajo. Confirmar y cancelar sí
            se quedan adentro — eso sí es gestionar la agenda. */}
        {isPending && canCollect && veredictoCobro.ok && plata.saldo > 0 && (
          <div className="flex flex-col gap-2 min-w-[260px]">
            <CobroForm
              appointmentId={appointment.id}
              monto={sugerido.monto}
              titulo={sugerido.tipo === "senia" ? "Seña al reservar" : "Cobro"}
            />
          </div>
        )}

        {isPending && canManage && (
          <div className="flex flex-col gap-2 min-w-[260px]">
            <form action={confirmarTurno}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton pendingText="Confirmando…" className={buttonClasses("solid", "sm", "whitespace-nowrap")}>
                Confirmar turno
              </SubmitButton>
            </form>
            <form action={cancelAppointment}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton pendingText="Cancelando…" className={linkButtonClasses}>
                Cancelar turno
              </SubmitButton>
            </form>
            <RescheduleForm
              appointmentId={appointment.id}
              serviceId={appointment.serviceId}
              currentProfessionalId={appointment.professionalId}
            />
          </div>
        )}

        {isConfirmed && (
          <div className="flex flex-col gap-2 min-w-[260px]">
            <CompletarForm appointmentId={appointment.id} saldo={plata.saldo} yaOcurrio={yaOcurrio} />
            {canCollect && plata.saldo > 0 && (
              veredictoCobro.ok ? (
                <CobroForm
                  appointmentId={appointment.id}
                  monto={sugerido.monto}
                  titulo={sugerido.tipo === "senia" ? "Seña pendiente" : "Cobro parcial"}
                />
              ) : (
                <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
                  {veredictoCobro.motivo} Quedan {fmtMoneyARS(plata.saldo)} a cobrar.
                </p>
              )
            )}
            {canManage && (
              <form action={cancelAppointment}>
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <SubmitButton pendingText="Cancelando…" className={linkButtonClasses}>
                  Cancelar turno
                </SubmitButton>
              </form>
            )}
            <form action={markNoShow}>
              <input type="hidden" name="appointmentId" value={appointment.id} />
              <SubmitButton pendingText="Guardando…" className={linkButtonClasses}>
                No se presentó
              </SubmitButton>
            </form>
            {canManage && (
              <RescheduleForm
                appointmentId={appointment.id}
                serviceId={appointment.serviceId}
                currentProfessionalId={appointment.professionalId}
              />
            )}
          </div>
        )}

        {/* COBRAR EL SALDO DE UN TURNO YA PRESTADO.
            Estaba gateado por `canManage`, que es gestionar la agenda —crear, confirmar,
            cancelar—, no cobrar. Dos consecuencias, las dos contra una decisión ya tomada
            del dueño: la profesional, que cobra lo suyo y rinde la comisión después, tiene
            `agenda:collect` pero NO `agenda:manage`, así que no podía cobrar su propio
            saldo; y a la recepción se le ofrecía el botón incluso para la profesional que
            cobra aparte, con el servidor rechazándolo después, con la clienta enfrente.
            Ahora usa el mismo veredicto que aplica el servidor. */}
        {cuentaACobrar && (canCollect || canManage) && (
          <div className="flex flex-col gap-2 min-w-[260px]">
            {canCollect &&
              (veredictoCobro.ok ? (
                <CobroForm appointmentId={appointment.id} monto={plata.saldo} titulo="Cobrar el saldo pendiente" />
              ) : (
                <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
                  {veredictoCobro.motivo} Quedan {fmtMoneyARS(plata.saldo)} a cobrar.
                </p>
              ))}
            {/* DAR DE BAJA EL SALDO. Sin esto, un saldo que el negocio decidió no cobrar
                —un descuento hecho en el sillón, una deuda incobrable— se queda para
                siempre en "Saldos a cobrar" (la única pantalla que muestra el fiado real)
                y además traba la comisión de la profesional, que sí prestó el servicio.
                Va con `canManage`: perdonar plata lo decide el negocio, no quien cobra. */}
            {canManage && (
              <CorreccionConMotivo
                etiqueta={`Dar de baja el saldo de ${fmtMoneyARS(plata.saldo, 0)}`}
                pregunta={`¿Dar de baja ${fmtMoneyARS(plata.saldo, 0)} que no se van a cobrar? No mueve la caja: sólo deja de figurar como deuda.`}
                confirmar="Sí, dar de baja"
                placeholder="Por qué no se cobra (descuento de la dueña, incobrable…)"
                peligro={false}
                campos={{ appointmentId: appointment.id }}
                accion={condonarSaldoTurno}
              />
            )}
          </div>
        )}
      </div>

      <CobrosRegistrados
        appointmentId={appointment.id}
        cobros={cobros}
        puedeAnular={canCollect && veredictoCobro.ok}
      />
    </div>
  );
}
