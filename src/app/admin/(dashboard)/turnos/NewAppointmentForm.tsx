"use client";

import { useMemo, useState, useTransition } from "react";
import { createManualAppointment } from "@/lib/actions";
import { getAvailableSlots } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import { fmtShortDate, fmtTime } from "@/lib/datetime";
import { BuscadorCombo, Input, Select, Textarea, Field, buttonClasses, cn, fmtMoneyARS } from "@/components/ui";
import {
  alCambiarTelefono,
  alElegirFicha,
  DATOS_CLIENTA_VACIOS,
  detalleFicha,
  fichaParaTelefono,
  type FichaParaAlta,
} from "@/lib/clientes/ficha-por-telefono";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
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
  fichas,
  faltazos,
  abierto = false,
  fechaInicial = "",
  clienteInicial = "",
}: {
  professionals: Professional[];
  origen?: OrigenAlta;
  /**
   * Las fichas del tenant para el campo "Clienta" (buscar y precargar). OPCIONAL a propósito:
   * el mostrador (MostradorTabs) usa este mismo formulario sin pasarlas, y ahí sigue como
   * antes, con nombre y teléfono a mano. El servidor encuentra la ficha por teléfono igual.
   */
  fichas?: FichaParaAlta[];
  /**
   * Cuántas veces faltó sin avisar cada ficha, sólo las que llegan al umbral del aviso (Inicio
   * por apps). Sin esto, el alta no avisa: es lo de siempre.
   */
  faltazos?: Record<string, number>;
  /**
   * Quién está dando el turno. Decide si se dibuja el bloque de cobro, con la MISMA función
   * que aplica el servidor (`puedeCobrarEsteTurno`), para que pantalla y acción no puedan
   * desincronizarse. Sin `viewer` se asume que puede: el servidor sigue siendo la autoridad.
   */
  viewer?: { role: string; professionalId?: string | null };
  /**
   * Llegar con el alta ya abierta y el día puesto: lo usan los estados vacíos de la agenda
   * ("Dar un turno", `hrefNuevoTurno` en pasos.ts). La fecha ya viene validada por
   * `leerNuevoTurno` (hoy o futura). Sin esto, el formulario arranca como siempre.
   */
  abierto?: boolean;
  fechaInicial?: string;
  /**
   * El id de la ficha con la que se llega desde "Darle un turno" (?cliente=, `leerClienteDelAlta`
   * en pasos.ts). Arranca como si la recepción la hubiera elegido en "Clienta": la MISMA
   * `alElegirFicha`. Si no está entre `fichas` (otro negocio, borrada), el alta arranca vacía.
   */
  clienteInicial?: string;
}) {
  const [open, setOpen] = useState(origen === "mostrador" || abierto);
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(fechaInicial);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Datos de la clienta, controlados para poder precargarlos desde su ficha. Nombre, teléfono y
  // "de la zona" van en UN estado porque la precarga los cambia juntos y tiene que poder
  // deshacerse junta: la regla (qué se completa, qué se destilda cuando la ficha deja de
  // corresponder) es `alCambiarTelefono`/`alElegirFicha`, pura y con test
  // (ficha-por-telefono.test.ts). Acá sólo se llama.
  const lista = useMemo(() => fichas ?? [], [fichas]);
  const [datos, setDatos] = useState(() => {
    const f = clienteInicial ? lista.find((x) => x.id === clienteInicial) : undefined;
    return f ? alElegirFicha(DATOS_CLIENTA_VACIOS, f, lista) : DATOS_CLIENTA_VACIOS;
  });
  const opcionesClienta = useMemo(
    () => lista.map((f) => ({ id: f.id, etiqueta: f.nombre, detalle: detalleFicha(f) })),
    [lista],
  );
  // La ficha que corresponde a lo tipeado en "Teléfono", con la MISMA regla que usa el
  // servidor al crear el turno (`buscarFichaPorTelefono` → `elegirFicha`): lo que dice acá
  // es la ficha en la que el turno va a quedar.
  const reconocida = useMemo(
    () => (datos.telefono ? fichaParaTelefono(lista, datos.telefono) : null),
    [lista, datos.telefono],
  );
  // ¿El tilde de "de la zona" lo puso la ficha y sigue como lo dejó? Sólo para decirlo al lado.
  const vecinaDeLaFicha = datos.precarga !== null && datos.vecina && datos.precarga.vecina;

  const professional = useMemo(
    () => professionals.find((p) => p.id === professionalId),
    [professionalId, professionals]
  );
  const service = useMemo(() => professional?.services.find((s) => s.id === serviceId), [professional, serviceId]);
  // El precio que el servidor va a CONGELAR para este turno (antes del cupón): el local si está
  // tildado "de la zona" y el servicio lo tiene. Sale de `precioCongeladoDeReserva`, la misma
  // función que usa `bookAppointment`. Antes era `service.price` a secas: con "de la zona"
  // tildado, "Total del servicio" proponía el precio general y el servidor lo rechazaba por
  // exceder el saldo, porque el turno se congela con el local.
  const precio = service ? precioCongeladoDeReserva(service, datos.vecina).priceAtBooking : 0;
  // Seña del catálogo (monto fijo, provisional a confirmar): se propone cobrarla en el acto.
  const senia = service ? seniaDelServicio({ depositAmount: service.depositAmount, precio }) : 0;

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
    const s = svc
      ? seniaDelServicio({ depositAmount: svc.depositAmount, precio: precioCongeladoDeReserva(svc, datos.vecina).priceAtBooking })
      : 0;
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
    setDatos(DATOS_CLIENTA_VACIOS);
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
          type="button"
          onClick={() => {
            reset();
            if (origen !== "mostrador") setOpen(false);
          }}
          className="text-sm text-muted hover:text-strong transition-colors max-sm:min-h-11 max-sm:px-2"
        >
          {origen === "mostrador" ? "Limpiar" : "Cancelar"}
        </button>
      </div>
      {clienteInicial && reconocida && (
        // Llegó desde la ficha ("Darle un turno"): que se vea para quién es antes de elegir
        // profesional y horario. Es la ficha en la que el turno va a quedar (misma regla que el servidor).
        <p className="-mt-1 mb-3 text-sm text-muted">
          Para <span className="font-medium text-strong">{reconocida.nombre}</span>
          {reconocida.telefono ? ` · ${reconocida.telefono}` : ""}
        </p>
      )}

      <form
        action={async (fd) => {
          setError("");
          // `createManualAppointment` DEVUELVE el error de dominio en vez de tirarlo. Antes
          // se leía `err.message` de un throw, y en producción eso no es el mensaje: Next
          // reemplaza los errores de Server Action por un digest, así que la recepcionista
          // veía "Minified React error #441" en la pantalla donde cobra la seña. El `catch`
          // se queda para lo que sí sigue tirando —un bug de verdad— con un texto que al
          // menos dice qué hacer.
          try {
            const r = await createManualAppointment(fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setOpen(false);
            reset();
          } catch {
            setError("No se pudo crear el turno por un error del sistema. Probá de nuevo; si sigue, avisá y miramos el registro.");
          }
        }}
        className="space-y-3"
      >
        {/* Una columna en el celular: con dos, el nombre del servicio y su precio no entraban. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div role="group" aria-labelledby="na-horario">
            <p id="na-horario" className="mb-1.5 text-sm font-medium text-strong">
              Horario
            </p>
            {!professionalId || !serviceId ? (
              <p className="text-sm text-muted">Elegí profesional y servicio para ver los horarios libres.</p>
            ) : isPending ? (
              <p className="text-sm text-muted">Buscando horarios…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted">No hay horarios libres ese día. Probá con otra fecha u otro profesional.</p>
            ) : null}
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => {
                const label = fmtTime(slot);
                const isSelected = slot === selectedSlot;
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-sm transition-colors max-sm:min-h-11",
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
            {opcionesClienta.length > 0 && (
              <Field label="Clienta" htmlFor="na-clienta" hint="Buscala por nombre o teléfono. Si es nueva, completá nombre y teléfono abajo.">
                <BuscadorCombo
                  id="na-clienta"
                  ariaLabel="Buscar clienta por nombre o teléfono"
                  placeholder="Buscar clienta…"
                  opciones={opcionesClienta}
                  valor={reconocida?.id ?? ""}
                  onElegir={(id) => {
                    const f = lista.find((x) => x.id === id);
                    if (f) setDatos((d) => alElegirFicha(d, f, lista));
                  }}
                />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre del cliente" htmlFor="na-client-name">
                <Input
                  id="na-client-name"
                  name="clientName"
                  required
                  value={datos.nombre}
                  onChange={(e) => {
                    const nombre = e.target.value;
                    setDatos((d) => ({ ...d, nombre }));
                  }}
                />
              </Field>
              <Field label="Teléfono" htmlFor="na-client-phone">
                <Input
                  id="na-client-phone"
                  name="clientPhone"
                  type="tel"
                  required
                  value={datos.telefono}
                  onChange={(e) => {
                    // Tipeado el número de una clienta con ficha: se completa el nombre si
                    // estaba vacío y "de la zona" como dice su ficha. Corregido a un número
                    // sin ficha: se deshace lo que la precarga había puesto.
                    const telefono = e.target.value;
                    setDatos((d) => alCambiarTelefono(d, telefono, lista));
                  }}
                />
              </Field>
            </div>
            {reconocida && <FichaReconocida ficha={reconocida} nombreTipeado={datos.nombre} faltazos={faltazos?.[reconocida.id] ?? 0} />}
            <label className="flex min-h-11 items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                name="isResident"
                className="accent-accent"
                checked={datos.vecina}
                onChange={(e) => {
                  const vecina = e.target.checked;
                  setDatos((d) => ({ ...d, vecina }));
                }}
              />
              Cliente de la zona (precio local)
              {vecinaDeLaFicha && <span className="text-xs text-muted">· según su ficha</span>}
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

// Lo que la recepción necesita saber de una clienta que ya existe, en el momento de darle el
// turno: que es ella, qué se hizo la última vez, sus notas y si debe algo.
function FichaReconocida({ ficha, nombreTipeado, faltazos }: { ficha: FichaParaAlta; nombreTipeado: string; faltazos: number }) {
  const otroNombre = nombreTipeado.trim() !== "" && nombreTipeado.trim() !== ficha.nombre.trim();
  return (
    <div className="rounded-md border border-line bg-surface-sunken p-3 text-sm space-y-1" role="status">
      <p className="text-strong">
        <span className="font-medium">Ya tiene ficha: {ficha.nombre}</span>{" "}
        <span className="text-muted">
          · {ficha.turnos} turno{ficha.turnos === 1 ? "" : "s"}
        </span>
      </p>
      {ficha.ultimaVisita ? (
        <p className="text-muted">
          Última visita: {fmtShortDate(ficha.ultimaVisita.fecha)} · {ficha.ultimaVisita.servicio} con{" "}
          {ficha.ultimaVisita.profesional}
        </p>
      ) : (
        <p className="text-muted">Sin visitas completadas en el último año.</p>
      )}
      {ficha.notas && <p className="whitespace-pre-line text-body">Notas: {ficha.notas}</p>}
      {ficha.saldo > 0 && (
        <p className="font-medium text-danger">Debe {fmtMoneyARS(ficha.saldo, 0)} de turnos anteriores.</p>
      )}
      {/* `faltazos` llega sólo si llega al umbral (cargarFaltazosPorFicha): el aviso es para
          pedir seña, no para marcar a quien faltó una vez. */}
      {faltazos > 0 && (
        <p className="font-medium text-warning">
          Faltó {faltazos} veces sin avisar. Conviene pedirle la seña para confirmar el turno.
        </p>
      )}
      {otroNombre && (
        <p className="text-xs text-warning">
          El turno queda en la ficha de {ficha.nombre}: el nombre tipeado no la cambia.
        </p>
      )}
    </div>
  );
}
