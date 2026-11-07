"use client";

// ============================================================================
// EL CAJÓN DEL TURNO — todo lo de un turno en un solo lugar («Renglón»).
// ============================================================================
//
// El renglón de la agenda ofrece UNA tecla. Todo lo demás del turno vive acá, en el orden en que
// se lo necesita: quién es (y su WhatsApp), qué se hace ahora (cobrar, terminar, confirmar), la
// plata (precio, lo que entró, lo dado de baja, lo que falta), los cobros con su anulación, y al
// pie lo que casi nunca se toca (mover, no vino, cancelar, dar de baja el saldo).
//
// PC: cajón de 480 px a la derecha, con la agenda a la vista. Celular: sube como hoja.
// Cada acción es la de siempre, con los mismos campos y las mismas guardias (campos.ts). Lo que
// mueve plata hacia atrás pide motivo, en dos pasos, como la fila de siempre. Cancelar y «no vino»
// no salen de acá con un toque: abren la hoja `CancelarONoVino` (quién cancela, la seña, la
// consecuencia). «Dar de baja el saldo» es sólo de quien puede perdonar plata (la dueña, D5).
//
// Tanda 2: un Reservado que viene con la seña sin cobrar tiene de tecla principal «Llegó la seña
// $5.000» (`LlegoLaSenia`: cobra y confirma en una operación, con [Deshacer], CH-022) y «Confirmar sin
// seña» al lado; y «Recordar la seña» abre WhatsApp con el pedido armado y deja la marca «seña
// pedida» (`marcarSeniaPedida`, CH-021), que se lee arriba junto al estado.

import { useState, useTransition } from "react";
import Link from "next/link";
import { hrefSumarProducto, turnoAdmiteProducto } from "../../pedidos/cobrar-una-venta";
import { useRouter } from "next/navigation";
import {
  anularCobroTurno,
  condonarSaldoTurno,
  confirmarTurno,
  type ResultadoAccion,
} from "@/lib/actions";
import { Cajon } from "@/components/ui/Cajon";
import { Button, ButtonLink, Franja, Input, Marca, Plata, Renglon, Seccion, atributosBoton, buttonClasses } from "@/components/ui";
import { fmtShortDate, fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { AVISO_CONTACTO_OCULTO, contactoOculto } from "@/lib/clientes/telefono";
import { ALIAS_SENIA_PROVISIONAL, linkWhatsApp, mensajePedidoDeSenia, mensajeSaludo } from "@/lib/turnos/mensajes-whatsapp";
import { puedeEditar } from "./barra-core";
import { pagosDelTurno } from "./pagos-core";
import { marcarSeniaPedida } from "@/lib/turnos/senia-actions";
import { confirmarSinSenia } from "@/lib/turnos/sena-obligatoria-actions";
import { MOTIVO_MINIMO_SIN_SENIA } from "@/lib/turnos/sena-obligatoria-core";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { ETIQUETA_DE_TARJETA } from "@/lib/turnos/cobro-con-producto";
import {
  claseDeCobro,
  cobrosAnulables,
  MOTIVO_MIN,
} from "@/lib/turnos/anulacion";
import { useToast, type AccionDelAviso } from "../../ToastProvider";
import { accionDeConfirmado } from "./aviso-confirmado";
import {
  cierraElTurno,
  marcaDelTurno,
  minutosEntre,
  pasoDelTurno,
  seniaQueFalta,
  seniaParaConfirmar,
  textoSeniaPedida,
  textosAvisoMP,
  yaEmpezo,
  type CierreSinPrestar,
  type Permisos,
  type TurnoDelDia,
} from "../agenda-core";
import {
  aFormData,
  camposDeAnular,
  camposDeCondonar,
  camposDelTurno,
  leerResultado,
} from "./campos";
import CobrarTurno from "./CobrarTurno";
import FijarPrecioDelTurno from "./FijarPrecioDelTurno";
import TerminarTurno from "./TerminarTurno";
import MoverTurno from "./MoverTurno";
import LlegoLaSenia from "./LlegoLaSenia";
import AutorizarAnulacion from "./AutorizarAnulacion";
import ListoDelCobro from "./ListoDelCobro";
import type { CobroHecho } from "@/lib/turnos/cobro-del-cajon";
import { separarNota } from "@/lib/reserva-publica-notas";

/**
 * «Recordar la seña»: abre WhatsApp con el pedido armado (es un enlace: el navegador no lo bloquea) y
 * deja la marca «seña pedida». Si la marca no se pudo guardar, se dice; el WhatsApp ya salió.
 */
function RecordarLaSenia({ t, wa }: { t: TurnoDelDia; wa: string }) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <a
      href={wa}
      target="_blank"
      rel="noopener noreferrer"
      data-ui="button"
      data-variant="outline"
      data-size="sm"
      aria-busy={pendiente || undefined}
      className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 text-sm font-medium"
      onClick={() =>
        empezar(async () => {
          try {
            const r = await marcarSeniaPedida(aFormData(camposDelTurno(t.id)));
            if (!r.ok) showError(`Se abrió WhatsApp, pero no quedó anotada la seña pedida: ${r.error}`);
            else {
              showSuccess(`Seña de ${t.clienta} pedida: queda marcada en la agenda.`);
              router.refresh();
            }
          } catch {
            showError("Se abrió WhatsApp, pero no quedó anotada la seña pedida. Probá de nuevo.");
          }
        })
      }
    >
      {t.seniaPedidaEl ? "Recordarle la seña" : "Pedirle la seña"} por WhatsApp
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}

function ConMotivo({
  etiqueta,
  pregunta,
  verbo,
  placeholder,
  peligro = true,
  pideCodigo = false,
  minimo = MOTIVO_MIN,
  hacer,
}: {
  etiqueta: string;
  pregunta: string;
  verbo: string;
  placeholder: string;
  peligro?: boolean;
  /** Letras mínimas del motivo (el servidor exige lo mismo). Por defecto, el de anular un cobro. */
  minimo?: number;
  /** Recepción: además del motivo, el código que la dueña sacó para este cobro. */
  pideCodigo?: boolean;
  hacer: (motivo: string, codigo: string) => Promise<ResultadoAccion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  if (!abierto) {
    return (
      <Button
        type="button"
        variant={peligro ? "danger" : "outline"}
        size="sm"
        onClick={() => setAbierto(true)}
      >
        {etiqueta}
      </Button>
    );
  }
  const corto = motivo.trim().length < minimo;
  const faltaCodigo = pideCodigo && !codigo.trim();
  return (
    <div
      role="group"
      aria-label={pregunta}
      className="w-full space-y-2 border-l-2 border-line-strong pl-3"
    >
      <p className="text-sm font-medium text-strong">{pregunta}</p>
      <Input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder={placeholder}
        aria-label="Motivo"
        maxLength={200}
        autoFocus
      />
      {pideCodigo && (
        <>
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de la dueña"
            aria-label="Código de la dueña"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
          />
          <p className="text-xs text-muted">
            Pedile el código a la dueña. Vale unos minutos y sólo para este cobro.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={peligro ? "danger" : "solid"}
          size="sm"
          disabled={corto || faltaCodigo || pendiente}
          estado={pendiente ? "cargando" : undefined}
          onClick={() =>
            empezar(async () => {
              setError("");
              try {
                const r = await hacer(motivo, codigo);
                if (!r.ok) setError(r.error);
                else {
                  setAbierto(false);
                  setMotivo("");
                  setCodigo("");
                }
              } catch {
                setError("No se pudo. Probá de nuevo; si sigue, avisá.");
              }
            })
          }
        >
          {verbo}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbierto(false)}
        >
          No
        </Button>
      </div>
      {corto && (
        <p className="text-xs text-muted">
          Escribí el motivo (al menos {minimo} letras): es lo que explica la
          caja dentro de seis meses.
        </p>
      )}
    </div>
  );
}

/** Una acción de un solo toque (confirmar): el motivo del servidor, si lo rechaza, se muestra. */
function useAccionSimple() {
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  const correr = (
    accion: (fd: FormData) => Promise<unknown>,
    turnoId: string,
    ok: string,
    onListo?: () => void,
    enElAviso?: AccionDelAviso,
  ) =>
    empezar(async () => {
      try {
        const r = leerResultado(await accion(aFormData(camposDelTurno(turnoId))));
        if (!r.ok) {
          showError(r.error);
          return;
        }
        showSuccess(ok, enElAviso);
        onListo?.();
      } catch (e) {
        const m =
          e instanceof Error && e.message && e.message.length < 200
            ? e.message
            : "No se pudo. Probá de nuevo; si sigue, avisá.";
        showError(m);
      }
    });
  return { pendiente, correr };
}

export default function TurnoCajon({
  turno,
  permisos,
  ahora,
  hrefFicha,
  onCerrar,
  onCerrarSinPrestar,
  onEditar,
}: {
  turno: TurnoDelDia | null;
  permisos: Permisos;
  /** ISO del «ahora» de la carga (el mismo de la agenda: un turno no cambia de estado entre los dos). */
  ahora: string;
  /** La ficha de la clienta, si quien mira puede abrir Clientes. */
  hrefFicha: ((clienteId: string) => string) | null;
  onCerrar: () => void;
  /** Abre la hoja de cancelar / «no vino» (la tiene la mesa). */
  onCerrarSinPrestar: (accion: CierreSinPrestar) => void;
  /** Agenda interactiva: abre la hoja «Editar» de la mesa. Sin él, no hay «Editar». */
  onEditar?: (turnoId: string) => void;
}) {
  const reloj = new Date(ahora);
  const { pendiente, correr } = useAccionSimple();
  const router = useRouter();
  // Acá arriba y no en el botón de anular: el cobro anulado deja de ofrecer el botón y el aviso se iría con él.
  // Con el turno al lado: el cajón es el mismo para todos los turnos, y el aviso es de uno.
  const [avisoAlAnular, setAvisoAlAnular] = useState<{ turnoId: string; texto: string } | null>(null);
  // Venta y agenda simples: lo recién cobrado, para el «Listo ✓» (del turno abierto, no de otro).
  const [cobrado, setCobrado] = useState<{ turnoId: string; cobro: CobroHecho; vino: boolean } | null>(null);
  const t = turno;
  if (!t) return null;
  const avisoDeComision = avisoAlAnular?.turnoId === t.id ? avisoAlAnular.texto : "";

  const paso = pasoDelTurno(t, permisos, reloj);
  const marca = marcaDelTurno(t, reloj);
  const wa = waLinkClienta(t.telefono);
  const vivo = t.estado === "PENDING" || t.estado === "CONFIRMED";
  const cobraEste = permisos.cobrar && t.veredicto.ok;
  // E5: el próximo turno, con su ciclo y el mismo servicio, a mano en la ficha y en el aviso de terminado (U8).
  // Venta y agenda simples: el «¿Le damos el próximo?» del Listo ✓ sale en todas las vistas (también
  // Calendario, que no lee `practica`). Apagado, como siempre.
  const proximo = (permisos.practica || permisos.ventaSimple) && permisos.gestionar ? `/admin/turnos/proximo/${t.id}` : null;
  const cobradoEste = cobrado?.turnoId === t.id ? cobrado : null;
  // Quién anula (orden del dueño): la dueña, recepción con su código; la profesional, no.
  const anular = cobraEste ? permisos.anular : null;
  const anulables = new Set(
    cobrosAnulables(t.cobros.map((c) => ({ ...c, note: c.note ?? null }))).map(
      (c) => c.id,
    ),
  );
  // «No vino» sólo desde la hora del turno (la misma regla que `markNoShow`: CH-014), también
  // para un Reservado al que nadie confirmó.
  const noVino = vivo && yaEmpezo(t, reloj) && permisos.terminar;
  const cancela = permisos.gestionar && vivo;
  const perdona = permisos.perdonar && t.cuentaACobrar;
  // Seña obligatoria (interruptor): un Reservado con la seña sin cobrar no se confirma desde «Qué
  // falta» (el servidor lo rechazaría). La excepción «Confirmar sin seña» va a «Otras acciones», sólo
  // para quien la tiene (la dueña), con motivo. Apagado, todo como siempre.
  const senaExigida = !!permisos.senaObligatoria && paso.tipo === "confirmar" && seniaParaConfirmar(t, reloj) > 0;
  const sinSenia = senaExigida && !!permisos.confirmarSinSenia;
  const hayOtras = cancela || perdona || noVino || sinSenia;
  // La tecla que cierra el turno (terminar, o el «vino» de un Reservado pasado) ya cobra el saldo.
  const cierra = cierraElTurno(paso);
  // Cobrar (un parcial, la seña, el saldo) cuando falta plata y el turno lo acepta, y no es ya la
  // tecla que cierra el turno.
  // Un Reservado que viene, con la seña sin cobrar: «Llegó la seña» es la tecla (cobra y confirma).
  // Con la seña obligatoria prendida manda la regla del servidor (una seña parcial todavía falta);
  // apagado, la de siempre.
  const senia = permisos.senaObligatoria ? seniaParaConfirmar(t, reloj) : seniaQueFalta(t, reloj);
  const llegoLaSenia = senia > 0 && cobraEste;
  const pedida = textoSeniaPedida(t, reloj);
  // Lo que el aviso de Mercado Pago de la seña no pudo resolver solo: se lee arriba, en criollo.
  const avisosMP = textosAvisoMP(t);
  const pedidoPorWa =
    senia > 0 && permisos.gestionar
      ? waLinkClienta(
          t.telefono,
          mensajePedidoDeSenia({ clienta: t.clienta, servicios: t.servicio, inicio: t.inicio, profesional: t.profesional, monto: senia, alias: ALIAS_SENIA_PROVISIONAL }),
        )
      : null;
  const ofreceCobro =
    cobraEste &&
    t.saldo > 0 &&
    t.estado !== "NO_SHOW" &&
    t.estado !== "CANCELLED" &&
    !cierra &&
    // La seña de un Reservado ya la cobra «Llegó la seña» (que además confirma): no dos teclas.
    !llegoLaSenia;

  // La tecla «Anular» de un cobro (la lista de siempre y, con la agenda interactiva, «Pagos»).
  const teclaAnular = (cobroId: string | undefined, medio: string) =>
    cobroId && anulables.has(cobroId) && anular ? (
      <ConMotivo
        etiqueta="Anular"
        pregunta={`¿Anular el cobro de ${medio.toLowerCase()}?`}
        verbo="Sí, anular"
        placeholder="Por qué (cobré por el medio equivocado…)"
        pideCodigo={anular === "con-autorizacion"}
        hacer={async (motivo, codigo) => {
          const r = await anularCobroTurno(
            aFormData(
              camposDeAnular({
                cobroId,
                turnoId: t.id,
                motivo,
                codigo,
              }),
            ),
          );
          if (r.ok && r.aviso) setAvisoAlAnular({ turnoId: t.id, texto: r.aviso });
          return r;
        }}
      />
    ) : undefined;
  // Agenda interactiva: WhatsApp arriba de todo y «Editar»; la plata como «Pagos».
  const interaccion = !!permisos.interaccion;
  const saludo = interaccion ? linkWhatsApp(t.telefono, mensajeSaludo(t.clienta)) : null;
  const editable = interaccion && !!onEditar && puedeEditar(t, permisos, reloj);
  const pagos = interaccion ? pagosDelTurno(t) : null;

  return (
    <Cajon
      abierto
      onCerrar={onCerrar}
      titulo={
        <>
          <span className="tabular-nums">{fmtTime(t.inicio)}</span> ·{" "}
          {t.clienta}
        </>
      }
      descripcion={`${t.servicio} · ${minutosEntre(t.inicio, t.fin)}′ · ${t.profesional}${t.box ? ` · ${t.box}` : ""}`}
    >
      <div className="space-y-6">
        {interaccion && (
          <div className="flex flex-wrap items-center gap-2" data-parte="arriba-del-turno">
            {saludo ? (
              <ButtonLink
                href={saludo}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                className="min-h-11"
                style={{ minHeight: "2.75rem" }}
                aria-label={`WhatsApp a ${t.clienta} (se abre en otra pestaña)`}
              >
                WhatsApp
              </ButtonLink>
            ) : (
              <span className="text-sm text-muted">Sin celular cargado</span>
            )}
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                style={{ minHeight: "2.75rem" }}
                aria-haspopup="dialog"
                aria-label={`Editar el turno de ${t.clienta}`}
                onClick={() => onEditar?.(t.id)}
              >
                Editar
              </Button>
            )}
          </div>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Marca tipo={marca.tipo}>{marca.texto}</Marca>
          {t.avisadaEl && (
            <span className="text-sm text-muted">
              avisada {fmtTime(t.avisadaEl)}
            </span>
          )}
          {pedida && <span className="text-sm text-muted">{pedida}</span>}
        </p>
        {avisosMP.length > 0 && (
          <div data-aviso-mp className="flex flex-col gap-2">
            {avisosMP.map((texto) => (
              <Franja key={texto} tono="atencion">
                {texto}
              </Franja>
            ))}
          </div>
        )}

        <Seccion titulo="La clienta">
          <Renglon
            folio="Teléfono"
            titulo={
              wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline"
                  aria-label={`WhatsApp a ${t.clienta}: ${t.telefono}`}
                >
                  {t.telefono} · WhatsApp
                </a>
              ) : (
                <span>{t.telefono}</span>
              )
            }
            detalle={
              wa
                ? undefined
                : contactoOculto(t.telefono)
                  ? AVISO_CONTACTO_OCULTO
                  : "No es un celular válido: corregilo en su ficha para escribirle."
            }
            tecla={
              hrefFicha ? (
                <Link
                  href={hrefFicha(t.clienteId)}
                  data-ui="button"
                  data-variant="ghost"
                  data-size="sm"
                  className="inline-flex min-h-11 items-center px-3 text-sm"
                >
                  Ver su ficha
                </Link>
              ) : undefined
            }
          />
          {/* G1: lo que mandó el cliente desde la reserva pública (patente y auto) va aparte del
              renglón del equipo, para que nadie lea un texto del cliente como nota interna. */}
          {separarNota(t.notas).delCliente && (
            <Renglon
              folio="Del cliente"
              titulo={<span className="whitespace-pre-line font-normal">{separarNota(t.notas).delCliente}</span>}
            />
          )}
          {separarNota(t.notas).delEquipo && (
            <Renglon
              folio="Nota del equipo"
              titulo={<span className="whitespace-pre-line font-normal">{separarNota(t.notas).delEquipo}</span>}
            />
          )}
        </Seccion>

        {(llegoLaSenia || (senia > 0 && pedidoPorWa)) && (
          <Seccion titulo="La seña">
            <div className="space-y-3 pt-3">
              <p className="text-sm text-muted">
                Pide una seña de <Plata valor={senia} sinCentavos={Number.isInteger(senia)} /> que todavía no entró.
                {pedida ? ` Ya se la pedimos (${pedida.replace(/^seña pedida /, "")}).` : ""}
              </p>
              {llegoLaSenia && (
                <LlegoLaSenia
                  key={t.id}
                  turnoId={t.id}
                  clienta={t.clienta}
                  monto={senia}
                  confirma={permisos.gestionar}
                  onListo={() => router.refresh()}
                />
              )}
              {pedidoPorWa && <RecordarLaSenia t={t} wa={pedidoPorWa} />}
            </div>
          </Seccion>
        )}

        {senaExigida && (
          <Seccion titulo="Qué falta">
            <p className="pt-3 text-sm text-muted">
              Pide seña: se confirma cuando entra (con «Llegó la seña», que cobra y confirma).
              {t.seniaVence ? ` ${marcaDelTurno(t, reloj).texto}.` : ""}
            </p>
          </Seccion>
        )}

        {paso.tipo === "confirmar" && !senaExigida && (
          <Seccion titulo="Qué falta">
            <div className="space-y-2 pt-3">
              <p className="text-sm text-muted">
                {llegoLaSenia
                  ? "Si la clienta confirma sin mandar la seña, confirmalo igual."
                  : "Está reservado. Confirmalo cuando la clienta te diga que viene."}
              </p>
              <Button
                type="button"
                size={llegoLaSenia ? "md" : "lg"}
                variant={llegoLaSenia ? "outline" : undefined}
                className="w-full"
                disabled={pendiente}
                estado={pendiente ? "cargando" : undefined}
                onClick={() =>
                  correr(
                    confirmarTurno,
                    t.id,
                    `Confirmado: ${t.clienta}, ${fmtTime(t.inicio)}.`,
                    undefined,
                    accionDeConfirmado(t),
                  )
                }
              >
                {llegoLaSenia ? "Confirmar sin seña" : "Confirmar el turno"}
              </Button>
            </div>
          </Seccion>
        )}

        {cobradoEste && (
          <ListoDelCobro cobro={cobradoEste.cobro} proximo={cobradoEste.vino ? null : proximo} onCerrar={onCerrar} />
        )}

        {t.precioADefinir && cobraEste && t.estado !== "NO_SHOW" && t.estado !== "CANCELLED" && !cobradoEste && (
          <Seccion titulo="Precio a definir">
            <div className="pt-3">
              <FijarPrecioDelTurno key={t.id} turnoId={t.id} servicio={t.servicio} />
            </div>
          </Seccion>
        )}

        {cierra && !cobradoEste && (
          <Seccion titulo={t.estado === "PENDING" ? "Vino" : "Terminar"}>
            <div className="pt-3">
              <TerminarTurno
                key={t.id}
                turnoId={t.id}
                clienta={t.clienta}
                estado={t.estado}
                saldo={t.saldo}
                puedeCobrar={cobraEste}
                motivoSinCobro={t.veredicto.ok ? undefined : t.veredicto.motivo}
                proximo={proximo}
                conProductos={permisos.cobroConProducto}
                {...(permisos.ventaSimple
                  ? {
                      alCobrar: (cobro: CobroHecho) => setCobrado({ turnoId: t.id, cobro, vino: t.estado === "PENDING" }),
                      telefono: t.telefono,
                      servicio: t.servicio,
                    }
                  : {})}
                onListo={onCerrar}
              />
            </div>
          </Seccion>
        )}

        {ofreceCobro && (
          <Seccion
            titulo={t.sugerido.tipo === "senia" ? "Cobrar la seña" : "Cobrar"}
          >
            <div className="pt-3">
              <CobrarTurno
                turnoId={t.id}
                clienta={t.clienta}
                sugerido={t.sugerido}
                saldo={t.saldo}
              />
            </div>
          </Seccion>
        )}

        {!t.veredicto.ok && t.saldo > 0 && !cierra && (
          <p className="text-sm text-muted">
            {t.veredicto.motivo} Quedan <Plata valor={t.saldo} sinCentavos={Number.isInteger(t.saldo)} /> a cobrar.
          </p>
        )}

        {proximo && t.estado === "COMPLETED" && !cobradoEste && (
          <div className="pt-1">
            <Link href={proximo} className={buttonClasses("outline", "md", "w-full")} {...atributosBoton("outline", "md")}>
              Reservar el próximo
            </Link>
          </div>
        )}

        {/* Venta y agenda simples: si «Terminar» ya suma productos al cobro, el enlace a Pedidos sobra. */}
        {permisos.sumarProducto && turnoAdmiteProducto(t.estado) && !(permisos.cobroConProducto && cierra && cobraEste) && (
          <div className="pt-1">
            <Link href={hrefSumarProducto(t.id)} className={buttonClasses("outline", "md", "w-full")} {...atributosBoton("outline", "md")}>
              Sumar un producto
            </Link>
            <p className="mt-1 text-xs text-muted">Es otro cobro, aparte del turno.</p>
          </div>
        )}

        {pagos && (
          <Seccion titulo="Pagos" nota={pagos.renglones.length || undefined}>
            {avisoDeComision && (
              <p role="status" className="my-2 rounded-md bg-surface-sunken px-3 py-2 text-sm text-strong">
                {avisoDeComision}
              </p>
            )}
            {pagos.vacio ? (
              <p className="py-3 text-sm text-muted">Todavía no pagó nada.</p>
            ) : (
              <ul aria-label="Pagos del turno">
                {pagos.renglones.map((r) => (
                  <li key={r.clave} data-anulado={r.anulado || undefined}>
                    <Renglon
                      folio={r.cuando ? `${fmtShortDate(r.cuando).slice(0, 5)} ${fmtTime(r.cuando)}` : "—"}
                      titulo={r.anulado ? <s>{`${r.medio} · ${r.tipo}`}</s> : `${r.medio} · ${r.tipo}`}
                      detalle={[r.anulado ? "Anulado" : null, r.quien ? `Cobró ${r.quien}` : null].filter(Boolean).join(" · ") || undefined}
                      plata={
                        r.anulado ? (
                          <s>
                            <Plata valor={r.monto} sinCentavos={Number.isInteger(r.monto)} />
                          </s>
                        ) : (
                          <Plata valor={r.monto} sinCentavos={Number.isInteger(r.monto)} />
                        )
                      }
                      tecla={r.anulado ? undefined : teclaAnular(r.clave, r.medio)}
                    />
                    {!r.anulado && anulables.has(r.clave) && anular === "directa" && (
                      <div className="flex justify-end border-b border-line pb-2">
                        <AutorizarAnulacion cobroId={r.clave} turnoId={t.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Renglon
              folio="Total"
              titulo="Total pagado"
              plata={<Plata valor={pagos.totalPagado} sinCentavos={Number.isInteger(pagos.totalPagado)} tono={pagos.totalPagado > 0 ? "cobrado" : undefined} />}
            />
            <Renglon folio="Precio" titulo="Precio del turno" plata={<Plata valor={pagos.precio} sinCentavos={Number.isInteger(pagos.precio)} />} />
            {pagos.deBaja > 0 && (
              <Renglon
                folio="De baja"
                titulo="Saldo dado de baja"
                detalle="No se va a cobrar; no es plata que entró."
                plata={<Plata valor={pagos.deBaja} sinCentavos={Number.isInteger(pagos.deBaja)} />}
              />
            )}
            {pagos.falta > 0 ? (
              <Renglon
                folio="Falta"
                titulo="Falta cobrar"
                plata={<Plata valor={pagos.falta} sinCentavos={Number.isInteger(pagos.falta)} tono={t.cuentaACobrar ? "peligro" : undefined} />}
              />
            ) : (
              <Renglon folio="Falta" titulo="Pagado ✓" plata="—" />
            )}
          </Seccion>
        )}

        {!pagos && (
        <Seccion titulo="La plata">
          {/* O-3: el folio dice qué es; el título, en criollo, de dónde sale. O-4: CH cobra en
              pesos sin centavos: «$14.000», como el botón y el WhatsApp (con centavos sólo si los hay). */}
          <Renglon
            folio="Precio"
            titulo={t.precioADefinir ? "A definir: se carga al cobrar" : "Fijo desde la reserva"}
            plata={t.precioADefinir ? <span className="text-sm text-muted">A definir</span> : <Plata valor={t.precio} sinCentavos={Number.isInteger(t.precio)} />}
          />
          <Renglon
            folio="Entró"
            titulo={
              t.cobrado > 0 ? "Cobrado hasta ahora" : "Todavía no entró nada"
            }
            plata={
              <Plata
                valor={t.cobrado}
                sinCentavos={Number.isInteger(t.cobrado)}
                tono={t.cobrado > 0 ? "cobrado" : undefined}
              />
            }
          />
          {t.condonado > 0 && (
            <Renglon
              folio="De baja"
              titulo="Saldo dado de baja"
              detalle="No se va a cobrar; no es plata que entró."
              plata={<Plata valor={t.condonado} sinCentavos={Number.isInteger(t.condonado)} />}
            />
          )}
          <Renglon
            folio="Falta"
            titulo={
              t.saldo > 0
                ? t.cuentaACobrar
                  ? "Se prestó y se debe"
                  : "Falta para saldarlo"
                : "Saldado"
            }
            plata={
              <Plata
                valor={t.saldo}
                sinCentavos={Number.isInteger(t.saldo)}
                tono={t.cuentaACobrar ? "peligro" : undefined}
              />
            }
          />
        </Seccion>
        )}

        {!pagos && t.cobros.length > 0 && (
          <Seccion titulo="Cobros" nota={t.cobros.length}>
            {avisoDeComision && (
              <p role="status" className="my-2 rounded-md bg-surface-sunken px-3 py-2 text-sm text-strong">
                {avisoDeComision}
              </p>
            )}
            <ul>
              {t.cobros.map((c, i) => {
                const clase = claseDeCobro(c.note);
                const medio =
                  METODO_LABEL[c.method as MetodoDePago] ?? ETIQUETA_DE_TARJETA[c.method] ?? c.method;
                // Debajo del renglón y no en su tecla: en el cajón de 480 px dos botones al lado
                // del importe dejaban el medio en «E…».
                const autoriza =
                  clase === "cobro" &&
                  !!c.id &&
                  anulables.has(c.id) &&
                  anular === "directa";
                return (
                  <li key={c.id ?? i}>
                    <Renglon
                      className={autoriza ? "border-b-0" : undefined}
                      folio={c.createdAt ? fmtTime(c.createdAt) : "—"}
                      titulo={
                        clase === "cobro"
                          ? medio
                          : clase === "anulacion"
                            ? "Anulación"
                            : "Saldo dado de baja"
                      }
                      detalle={
                        c.note && clase !== "cobro"
                          ? c.note.replace(/^[A-Z]+:\S*\s*—?\s*/, "")
                          : undefined
                      }
                      plata={
                        <Plata
                          valor={
                            clase === "anulacion"
                              ? -Math.abs(c.amount)
                              : c.amount
                          }
                          sinCentavos={Number.isInteger(c.amount)}
                        />
                      }
                      tecla={clase === "cobro" ? teclaAnular(c.id, medio) : undefined}
                    />
                    {autoriza && (
                      <div className="flex justify-end border-b border-line pb-2">
                        <AutorizarAnulacion cobroId={c.id!} turnoId={t.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Seccion>
        )}

        {hayOtras && (
          <Seccion titulo="Otras acciones">
            <div className="flex flex-col items-start gap-3 pt-3">
              {/* Mover y avisar (Tanda 2 · 2-C): chips de días y huecos, en vez del formulario de
                  reprogramar. La misma acción del servidor, que re-valida el choque. */}
              {cancela && <MoverTurno key={t.id} turno={t} ahora={ahora} />}
              {noVino && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-haspopup="dialog"
                  onClick={() => onCerrarSinPrestar("no-vino")}
                >
                  No vino
                </Button>
              )}
              {sinSenia && (
                <ConMotivo
                  etiqueta="Confirmar sin seña"
                  pregunta="¿Confirmar sin la seña? Queda en la auditoría con tu nombre y el motivo."
                  verbo="Sí, confirmar"
                  placeholder="Por qué (clienta de años, pagó en persona…)"
                  peligro={false}
                  minimo={MOTIVO_MINIMO_SIN_SENIA}
                  hacer={async (motivo) => {
                    const r = await confirmarSinSenia(t.id, motivo);
                    if (r.ok) router.refresh();
                    return r;
                  }}
                />
              )}
              {perdona && (
                <ConMotivo
                  etiqueta="Dar de baja el saldo"
                  pregunta="¿Dar de baja lo que falta? No mueve la caja: sólo deja de figurar como deuda."
                  verbo="Sí, dar de baja"
                  placeholder="Por qué no se cobra (descuento de la dueña, incobrable…)"
                  peligro={false}
                  hacer={(motivo) =>
                    condonarSaldoTurno(
                      aFormData(camposDeCondonar({ turnoId: t.id, motivo })),
                    )
                  }
                />
              )}
              {cancela && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-haspopup="dialog"
                  onClick={() => onCerrarSinPrestar("cancelar")}
                >
                  Cancelar el turno
                </Button>
              )}
            </div>
          </Seccion>
        )}
      </div>
    </Cajon>
  );
}
