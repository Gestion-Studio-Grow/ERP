"use client";

import { useState } from "react";
import {
  registrarCobroTurno,
  confirmarTurno,
  cancelAppointment,
  completeAppointment,
  markNoShow,
  type ResultadoAccion,
} from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import RescheduleForm from "./RescheduleForm";
import { fmtDateTime } from "@/lib/datetime";
import { buttonClasses, fmtMoneyARS } from "@/components/ui";
import {
  cobroSugerido,
  esCuentaACobrar,
  estadoCobroTurno,
  seniaDelServicio,
  METODOS_DE_PAGO,
  METODO_LABEL,
} from "@/lib/turnos/cobros";

type Appointment = {
  id: string;
  startsAt: Date;
  status: string;
  professionalId: string;
  serviceId: string;
  priceAtBooking: number | null;
  notes: string | null;
  client: { name: string; phone: string };
  professional: { name: string };
  service: { name: string; price: number; depositAmount?: number | null };
  box: { name: string };
  // `Payment` = agregado de los cobros del turno (o el pago 1:1 previo a los cobros parciales).
  payment: { method: string; comprobanteNro: string | null; amount?: number; status?: string } | null;
  // Cobros parciales (seña / saldo / lo que registró la recepción). Ausente en demo.
  collections?: { amount: number; method: string }[];
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

export default function AppointmentRow({
  appointment,
  statusLabel,
  canManage = true,
}: {
  appointment: Appointment;
  statusLabel: Record<string, string>;
  // Gestión de agenda (cobrar / confirmar / cancelar) — solo OWNER/RECEPTION. El
  // PROFESSIONAL solo cierra sus turnos (completar / no-show). Es UX: el server
  // igual bloquea las acciones que su rol no puede (ADR-017 §2.e).
  canManage?: boolean;
}) {
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
  // "Ya ocurrió" es sólo una pista visual (el server es la autoridad: `puedeCompletarse`);
  // el reloj se toma una vez al montar para no leer `Date.now()` en el render.
  const [ahora] = useState(() => Date.now());
  const yaOcurrio = new Date(appointment.startsAt).getTime() <= ahora;

  return (
    <div className="rounded-lg border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-strong">
            {appointment.client.name}{" "}
            <span className="text-muted font-normal">
              — {appointment.client.phone}
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
                cobrado {fmtMoneyARS(plata.cobrado, 0)}
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

        {isPending && canManage && (
          <div className="flex flex-col gap-2 min-w-[260px]">
            {plata.saldo > 0 && (
              <CobroForm
                appointmentId={appointment.id}
                monto={sugerido.monto}
                titulo={sugerido.tipo === "senia" ? "Seña al reservar" : "Cobro"}
              />
            )}
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
            {canManage && plata.saldo > 0 && (
              <CobroForm
                appointmentId={appointment.id}
                monto={sugerido.monto}
                titulo={sugerido.tipo === "senia" ? "Seña pendiente" : "Cobro parcial"}
              />
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

        {cuentaACobrar && canManage && (
          <div className="flex flex-col gap-2 min-w-[260px]">
            <CobroForm appointmentId={appointment.id} monto={plata.saldo} titulo="Cobrar el saldo pendiente" />
          </div>
        )}
      </div>
    </div>
  );
}
