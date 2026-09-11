"use client";

import { useMemo, useState, useTransition } from "react";
import { createManualAppointment } from "@/lib/actions";
import { getAvailableSlots } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtTime } from "@/lib/datetime";
import { Input, Select, Textarea, Field, buttonClasses, cn, fmtMoneyARS } from "@/components/ui";
import { seniaDelServicio, METODOS_DE_PAGO, METODO_LABEL } from "@/lib/turnos/cobros";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import {
  cobroPropuestoAlAlta,
  montoDelCobro,
  quedaSaldado,
  type ModoCobro,
  type OrigenAlta,
} from "@/lib/turnos/cobro-alta";

type Service = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null; depositAmount: number | null };
type Professional = { id: string; name: string; services: Service[]; box: { name: string } | null; cobraEnMostrador?: boolean };

// De dónde se abre el formulario. Cambia los defaults, no las reglas — la propuesta de
// cobro vive pura y testeada en `@/lib/turnos/cobro-alta`; el servidor valida igual en los
// dos casos (`createManualAppointment`).

export default function NewAppointmentForm({
  professionals,
  origen = "agenda",
  viewer,
}: {
  professionals: Professional[];
  origen?: OrigenAlta;
  /**
   * Quién está dando el turno. Decide si se dibuja el bloque de cobro, con la MISMA función
   * que aplica el servidor (`puedeCobrarEsteTurno`), para que pantalla y acción no puedan
   * desincronizarse. Sin `viewer` se asume que puede: el servidor sigue siendo la autoridad.
   */
  viewer?: { role: string; professionalId?: string | null };
}) {
  const [open, setOpen] = useState(origen === "mostrador");
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const professional = useMemo(
    () => professionals.find((p) => p.id === professionalId),
    [professionalId, professionals]
  );
  const service = useMemo(() => professional?.services.find((s) => s.id === serviceId), [professional, serviceId]);
  // Seña del catálogo (monto fijo, provisional a confirmar): se propone cobrarla en el acto.
  const senia = service ? seniaDelServicio({ depositAmount: service.depositAmount, precio: service.price }) : 0;
  const precio = service?.price ?? 0;

  // Qué se cobra en el acto. Antes esto era un checkbox que SÓLO aparecía si el servicio
  // tenía seña cargada — o sea que un servicio sin seña no se podía cobrar al darlo de alta,
  // que es justo lo que necesita el mostrador. Ahora siempre se puede elegir, y el total
  // es una opción de primera clase.
  const [queCobrar, setQueCobrar] = useState<ModoCobro>("nada");
  const [montoOtro, setMontoOtro] = useState("");

  const montoACobrar = montoDelCobro({ modo: queCobrar, senia, precio, otro: montoOtro });

  // ¿QUIEN ESTÁ DANDO ESTE TURNO PUEDE COBRARLO? Decisión del dueño: el mostrador cobra los
  // servicios de todas las profesionales salvo una, que cobra lo suyo y rinde la comisión
  // después. El turno SÍ se puede dar de alta —darle agenda no es tocarle la plata—; lo que
  // se apaga es el bloque de cobro.
  //
  // Se resuelve con `puedeCobrarEsteTurno`, la MISMA función que aplica el servidor. La
  // primera versión miraba sólo `origen === "mostrador"` y le escondía el cobro también a la
  // DUEÑA parada en el mostrador — que el servidor sí deja cobrar. Lo encontró la UAT (caso
  // D1): la pantalla le sacaba una atribución que el servidor le daba.
  const veredictoCobro = professional
    ? puedeCobrarEsteTurno({
        rol: viewer?.role ?? "OWNER",
        professionalIdDelUsuario: viewer?.professionalId,
        professionalIdDelTurno: professional.id,
        nombreProfesional: professional.name,
        cobraEnMostrador: professional.cobraEnMostrador,
      })
    : ({ ok: true } as const);
  const leCobraElMostrador = veredictoCobro.ok;

  // Al elegir servicio se propone lo razonable para el contexto, sin trabar nada: el
  // usuario puede cambiarlo. En el mostrador la clienta está ahí, así que el default es
  // cobrar el total; en la agenda se está reservando, así que es la seña (si la hay).
  function propuestaPara(nextServiceId: string): ModoCobro {
    const svc = professional?.services.find((x) => x.id === nextServiceId);
    const s = svc ? seniaDelServicio({ depositAmount: svc.depositAmount, precio: svc.price }) : 0;
    return cobroPropuestoAlAlta({ origen, senia: s });
  }

  function loadSlots(nextProfessionalId: string, nextServiceId: string, nextDate: string) {
    setSlots([]);
    setSelectedSlot("");
    if (!nextProfessionalId || !nextServiceId || !nextDate) return;
    startTransition(async () => {
      const result = await getAvailableSlots(nextProfessionalId, nextServiceId, nextDate);
      setSlots(result);
    });
  }

  function reset() {
    setProfessionalId("");
    setServiceId("");
    setDate("");
    setSlots([]);
    setSelectedSlot("");
    setQueCobrar("nada");
    setMontoOtro("");
    setError("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={buttonClasses("solid", "md", "mb-6")}
      >
        + Nuevo turno
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface-raised shadow-xs p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-strong">
          {origen === "mostrador"
            ? "Cobrar un servicio (elegí profesional y horario)"
            : "Nuevo turno (por teléfono o en el local)"}
        </p>
        <button
          onClick={() => {
            reset();
            if (origen !== "mostrador") setOpen(false);
          }}
          className="text-sm text-muted hover:text-strong transition-colors"
        >
          {origen === "mostrador" ? "Limpiar" : "Cancelar"}
        </button>
      </div>

      <form
        action={async (fd) => {
          setError("");
          try {
            await createManualAppointment(fd);
            setOpen(false);
            reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo crear el turno.");
          }
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Profesional" htmlFor="na-professional">
            <Select
              id="na-professional"
              name="professionalId"
              required
              value={professionalId}
              onChange={(e) => {
                setProfessionalId(e.target.value);
                setServiceId("");
                loadSlots(e.target.value, "", date);
              }}
            >
              <option value="">Elegí un profesional</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.box ? `— ${p.box.name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {/* EL AVISO VA ACÁ, pegado a la elección de profesional, y no junto al bloque de
              cobro. Lo encontró la UAT: con el aviso allá abajo, la recepcionista elegía a
              Vero, elegía servicio, elegía fecha, elegía horario — y recién ahí se enteraba
              de que ese turno no lo cobra ella. Cuatro pasos con la clienta enfrente. */}
          {!veredictoCobro.ok && (
            <div className="rounded-md border border-warning bg-warning-soft p-3 text-sm text-warning">
              <strong>{veredictoCobro.motivo}</strong> Podés darle el turno igual.
            </div>
          )}

          <Field label="Servicio" htmlFor="na-service">
            <Select
              id="na-service"
              name="serviceId"
              required
              value={serviceId}
              disabled={!professional}
              onChange={(e) => {
                setServiceId(e.target.value);
                setQueCobrar(e.target.value ? propuestaPara(e.target.value) : "nada");
                loadSlots(professionalId, e.target.value, date);
              }}
            >
              <option value="">Elegí un servicio</option>
              {professional?.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMin} min) — {fmtMoneyARS(s.price, 0)}
                  {s.residentPrice != null ? ` · precio local ${fmtMoneyARS(s.residentPrice, 0)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Fecha" htmlFor="na-date">
          <Input
            id="na-date"
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              loadSlots(professionalId, serviceId, e.target.value);
            }}
          />
        </Field>

        {date && (
          <div>
            {isPending && <p className="text-sm text-muted">Buscando horarios…</p>}
            {!isPending && slots.length === 0 && (
              <p className="text-sm text-muted">No hay horarios disponibles ese día.</p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => {
                const label = fmtTime(slot);
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-sm transition-colors",
                      isSelected
                        ? "bg-accent text-on-accent border-accent"
                        : "bg-surface-raised border-line-strong text-body hover:bg-accent-soft"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="startsAt" value={selectedSlot} />
          </div>
        )}

        {selectedSlot && (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre del cliente" htmlFor="na-client-name">
                <Input id="na-client-name" name="clientName" required />
              </Field>
              <Field label="Teléfono" htmlFor="na-client-phone">
                <Input id="na-client-phone" name="clientPhone" type="tel" required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" name="isResident" className="accent-accent" />
              Cliente de la zona (precio local)
            </label>
            <Field label="Cupón (opcional)" htmlFor="na-coupon">
              <Input
                id="na-coupon"
                name="couponCode"
                className="uppercase placeholder:normal-case"
              />
            </Field>
            {service && leCobraElMostrador && (
              <div className="rounded-md border border-line bg-surface-sunken p-3 space-y-2">
                {/* El campo del formulario sigue llamándose `senaCobrar`/`senaMonto` porque
                    es lo que lee `createManualAppointment`: cambiarle el nombre no agrega
                    nada y toca el servidor. Lo que cambió es que ahora se puede cobrar el
                    TOTAL, no sólo la seña, y que el bloque aparece siempre — un servicio
                    sin seña cargada también se puede cobrar en el acto. */}
                <Field label="Cobrar ahora" htmlFor="na-que-cobrar">
                  <Select
                    id="na-que-cobrar"
                    value={queCobrar}
                    onChange={(e) => setQueCobrar(e.target.value as typeof queCobrar)}
                  >
                    <option value="nada">Nada — se cobra después</option>
                    {senia > 0 && <option value="senia">Seña — {fmtMoneyARS(senia, 0)}</option>}
                    <option value="total">Total del servicio — {fmtMoneyARS(precio, 0)}</option>
                    <option value="otro">Otro monto</option>
                  </Select>
                </Field>
                {queCobrar !== "nada" && (
                  <>
                    <input type="hidden" name="senaCobrar" value="on" />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Monto" htmlFor="na-sena-monto">
                        <Input
                          id="na-sena-monto"
                          name="senaMonto"
                          type="number"
                          min={1}
                          step="1"
                          required
                          readOnly={queCobrar !== "otro"}
                          value={queCobrar === "otro" ? montoOtro : String(Math.round(montoACobrar))}
                          onChange={(e) => setMontoOtro(e.target.value)}
                        />
                      </Field>
                      <Field label="Medio" htmlFor="na-sena-metodo">
                        <Select id="na-sena-metodo" name="senaMetodo" defaultValue={origen === "mostrador" ? "EFECTIVO" : "TRANSFERENCIA"} required>
                          {METODOS_DE_PAGO.map((m) => (
                            <option key={m} value={m}>
                              {METODO_LABEL[m]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    {quedaSaldado({ monto: montoACobrar, precio }) && (
                      <p className="text-xs text-muted">Queda saldado: el turno no va a mostrar saldo pendiente.</p>
                    )}
                  </>
                )}
                {queCobrar === "nada" && senia > 0 && (
                  <p className="text-xs text-muted">Queda la seña sin cobrar: registrala desde la fila del turno cuando llegue.</p>
                )}
              </div>
            )}
            <Field label="Estado" htmlFor="na-status">
              <Select id="na-status" name="status" defaultValue={origen === "mostrador" ? "CONFIRMED" : "PENDING"}>
                <option value="PENDING">Reservado (la clienta todavía no confirmó)</option>
                <option value="CONFIRMED">Confirmado (ya confirmó que viene)</option>
              </Select>
            </Field>
            <Field label="Notas (opcional)" htmlFor="na-notes" hint="Preferencias, tono, alergias…">
              <Textarea id="na-notes" name="notes" rows={2} />
            </Field>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <SubmitButton
              pendingText="Creando turno…"
              className={buttonClasses("solid", "md", "w-full")}
            >
              Crear turno
            </SubmitButton>
          </div>
        )}
      </form>
    </div>
  );
}
