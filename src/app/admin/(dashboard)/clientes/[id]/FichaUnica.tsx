// LA FICHA ÚNICA (Inicio por apps) — todo lo de una clienta antes de hablar con ella.
//
// Arriba lo que cambia la conversación: si tiene turno, si debe plata, si falta sin avisar y
// si pidió que no le escriban. Después cómo viene (su ciclo, en palabras) y su cumpleaños, los
// pedidos (también los que llegaron sin ficha con su número) y el fiado. Todo sale de
// `cargarFichaCompleta` (src/lib/crm/cargas.server.ts) con las reglas de siempre: el saldo de
// un turno es precio − cobros, como en la agenda.
//
// Lo gastado es plata del negocio: sólo con reports:read. Lo que DEBE sí lo ve la recepción:
// es lo que tiene que cobrarle (el alta de turno ya se lo muestra).

import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, KpiTile, fmtMoneyARS } from "@/components/ui";
import { dateStrInBusinessTz, fmtDateTime, fmtShortDate } from "@/lib/datetime";
import { roleHasCapability } from "@/lib/capabilities";
import { claseBotonWhatsApp } from "../boton-whatsapp";
import { contactoDeLaFicha } from "../contacto-ficha";
import type { SessionUser } from "@/lib/session";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import { cargarFichaCompleta } from "@/lib/crm/cargas.server";
import { explicarCiclo } from "@/lib/crm/ciclo";
import { diasEntre, diasHastaCumple, fmtMesDia, haceDias } from "@/lib/crm/fechas";
import { explicarSegmento, SEGMENTO_ETIQUETA } from "@/lib/crm/segmentos";
import { ACCION_BAJA, CRM_REGLAS, MOTIVO_ETIQUETA, esMotivoContacto } from "@/lib/crm/reglas";
import EditarClienteForm from "./EditarClienteForm";
import PermisoMensajes from "./PermisoMensajes";

const ESTADO_TURNO: Record<string, string> = {
  PENDING: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No se presentó",
};

const ESTADO_PEDIDO: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
};

function quienYCuando(el: Date, por: string | null): string {
  return `el ${fmtShortDate(el)}${por ? `, lo cargó ${por}` : ""}`;
}

export default async function FichaUnica({ id, user }: { id: string; user: SessionUser }) {
  const [f, negocio] = await Promise.all([cargarFichaCompleta(id), getNegocioApps(user.role)]);
  if (!f) notFound();
  // El detalle de cada deuda vive en "Fiado y cuentas de clientes": se enlaza sólo si esta
  // persona puede abrirla (si no, el link terminaría en "App no disponible").
  const abreFiado = appPermitida(appPorId("cuentas-a-cobrar"), negocio);
  const { client, resumen, ev } = f;
  const verPlata = roleHasCapability(user.role, "reports:read");
  const puedeEditar = roleHasCapability(user.role, "clients:manage");
  const noQuiere = f.permiso?.accion === ACCION_BAJA;
  const contacto = contactoDeLaFicha({ telefono: client.phone, noQuiere, puedeEditar });
  const debe = resumen.saldoTurnos + (resumen.saldoFiado ?? 0);
  const servicios = f.rubro === "servicios";
  const diasCumple = f.cumple ? diasHastaCumple(f.cumple, f.hoy) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/admin/clientes" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-strong hover:underline">
        ← Clientes
      </Link>
      <h1 className="mt-1 text-2xl font-semibold text-strong [overflow-wrap:anywhere]">{client.name}</h1>
      {/* En el celular: el teléfono, y abajo el botón de WhatsApp a lo ancho — es para lo que se abre
          la ficha antes de hablar con ella. Si no se le puede escribir, se dice por qué. */}
      <div className="mb-6 mt-1 flex flex-wrap items-center gap-2 text-muted">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {client.phone} {client.email ? `· ${client.email}` : ""}
        </span>
        {contacto.tipo === "whatsapp" && (
          <a
            href={contacto.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp a ${client.name}`}
            className={claseBotonWhatsApp("solid")}
          >
            WhatsApp
          </a>
        )}
        {contacto.tipo === "sin-celular" && <p className="w-full text-sm text-warning">{contacto.texto}</p>}
        {ev && <Badge tone={ev.segmento === "en-riesgo" ? "warning" : ev.segmento === "perdida" ? "danger" : "neutral"}>{SEGMENTO_ETIQUETA[ev.segmento]}</Badge>}
        {noQuiere && <Badge tone="danger">No quiere mensajes</Badge>}
        {client.isResident && <Badge tone="accent">Cliente de la zona (precio local)</Badge>}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {servicios && (
          <KpiTile
            label="Próximo turno"
            value={resumen.proximoTurno ? fmtShortDate(resumen.proximoTurno.startsAt) : "—"}
            sub={
              resumen.proximoTurno
                ? `${resumen.proximoTurno.servicio} con ${resumen.proximoTurno.profesional}`
                : "No tiene turno reservado"
            }
          />
        )}
        <KpiTile
          label={servicios ? "Última visita" : "Última compra"}
          value={resumen.ultimaVisita ? haceDias(diasEntre(dateStrInBusinessTz(resumen.ultimaVisita), f.hoy)) : "—"}
          sub={resumen.ultimaVisita ? fmtShortDate(resumen.ultimaVisita) : servicios ? "Todavía no vino" : "Todavía no compró"}
        />
        <KpiTile
          label="Debe"
          value={debe > 0 ? fmtMoneyARS(debe, 0) : "Nada"}
          sub={
            resumen.saldoFiado === null
              ? "Saldo de turnos (el fiado no se pudo leer)"
              : debe > 0
                ? [resumen.saldoTurnos > 0 ? "turnos" : null, (resumen.saldoFiado ?? 0) > 0 ? "cuenta corriente" : null].filter(Boolean).join(" y ")
                : "Está al día"
          }
        />
        {servicios ? (
          <KpiTile
            label="Faltó sin avisar"
            value={resumen.faltazos}
            sub={
              resumen.faltazos >= CRM_REGLAS.faltazosParaAviso
                ? "Conviene pedirle seña al dar el turno"
                : resumen.faltazos === 1
                  ? "Una vez"
                  : "Nunca"
            }
          />
        ) : (
          <KpiTile label="Pedidos" value={resumen.pedidos} sub="sin contar los anulados" />
        )}
        {verPlata && (
          <KpiTile label="Gastó en el último año" value={fmtMoneyARS(resumen.gastadoAnio, 0)} sub="lo cobrado, turnos y pedidos" />
        )}
      </div>

      <section className="mb-6 space-y-3 rounded-lg border border-line bg-surface-raised p-4 text-sm">
        <div>
          <p className="font-medium text-strong">Cómo viene</p>
          <p className="text-muted">
            {ev ? `${explicarSegmento(ev)} ${ev.cantidadVisitas > 0 ? `En general ${explicarCiclo(ev.ciclo)}.` : ""}` : "Sin datos de visitas."}
          </p>
        </div>
        <div>
          <p className="font-medium text-strong">Cumpleaños</p>
          <p className="text-muted">
            {f.cumple
              ? `${fmtMesDia(f.cumple)}${diasCumple === 0 ? " — ¡es hoy!" : diasCumple !== null && diasCumple <= 30 ? ` (en ${diasCumple} ${diasCumple === 1 ? "día" : "días"})` : ""}`
              : puedeEditar
                ? "No está cargado. Sumalo con “Editar datos” para saludar ese día."
                : "No está cargado."}
          </p>
        </div>
        <div className="border-t border-line pt-3">
          <PermisoMensajes
            clientId={client.id}
            noQuiere={noQuiere}
            detalle={f.permiso ? quienYCuando(f.permiso.el, f.permiso.por) : null}
            puedeCambiar={puedeEditar}
          />
          {f.ultimoContacto && (
            <p className="mt-2 text-muted">
              Último contacto desde la bandeja: {fmtShortDate(f.ultimoContacto.el)}
              {esMotivoContacto(f.ultimoContacto.motivo) ? ` (${MOTIVO_ETIQUETA[f.ultimoContacto.motivo]})` : ""}
              {f.ultimoContacto.por ? `, por ${f.ultimoContacto.por}` : ""}.
            </p>
          )}
        </div>
      </section>

      {puedeEditar && (
        <div className="mb-6">
          <EditarClienteForm
            cliente={{
              id: client.id,
              name: client.name,
              phone: client.phone,
              email: client.email,
              notes: client.notes,
              birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : null,
            }}
          />
        </div>
      )}

      {client.notes && (
        <div className="mb-6 rounded-lg border border-line bg-surface-raised p-4">
          <p className="mb-1 text-sm font-medium text-strong">Notas internas</p>
          <p className="whitespace-pre-line text-sm text-muted">{client.notes}</p>
        </div>
      )}

      {f.fiado && f.fiado.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-medium text-strong">Cuenta corriente</h2>
          <ul className="space-y-2">
            {f.fiado.map((d) => {
              const fila = (
                <>
                  <span className="text-strong">{d.concepto || "Fiado"} · {fmtShortDate(d.emitida)}</span>
                  <span className="font-medium text-strong">
                    Debe {fmtMoneyARS(d.saldo, 0)}
                    {d.vence ? <span className="font-normal text-muted"> · vence {fmtShortDate(d.vence)}</span> : null}
                  </span>
                </>
              );
              const clase = "flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm";
              return (
                <li key={d.id}>
                  {abreFiado ? (
                    <Link href={`/admin/cuentas-a-cobrar/${d.id}`} className={`${clase} hover:border-line-strong`}>
                      {fila}
                    </Link>
                  ) : (
                    <div className={clase}>{fila}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(f.pedidos.length > 0 || !servicios) && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-medium text-strong">Pedidos</h2>
          {f.pedidos.length === 0 ? (
            <p className="text-sm text-muted">Todavía no tiene pedidos con este teléfono.</p>
          ) : (
            <ul className="space-y-2">
              {f.pedidos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm">
                  <span className="text-strong">
                    Pedido #{p.code} · {fmtShortDate(p.createdAt)}
                    <span className="text-muted"> · {p.channel === "ONLINE" ? "tienda online" : "mostrador"}</span>
                    {p.clientId === null && <span className="text-muted"> · por su teléfono</span>}
                  </span>
                  <span className="text-muted">
                    {ESTADO_PEDIDO[p.status] ?? p.status}
                    {verPlata ? ` · ${fmtMoneyARS(p.total, 0)}` : ""}
                    {p.status !== "CANCELLED" && !p.paid ? " · sin cobrar" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(servicios || f.turnos.length > 0) && (
        <section>
          <h2 className="mb-2 text-lg font-medium text-strong">Historial de turnos</h2>
          <div className="space-y-2">
            {f.turnos.map((a) => (
              <div key={a.id} className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-strong">{a.service.name}</span>
                  <span className="text-muted">
                    {ESTADO_TURNO[a.status] ?? a.status}
                    {a.review ? ` · reseña ${"★".repeat(a.review.rating)}` : ""}
                  </span>
                </div>
                <p className="text-muted">
                  {a.professional.name} · {fmtDateTime(a.startsAt)}
                </p>
                {a.notes && <p className="mt-1 whitespace-pre-line rounded-md bg-warning-soft px-2 py-1 text-body">{a.notes}</p>}
              </div>
            ))}
            {f.turnos.length === 0 && <p className="text-sm text-muted">Todavía no tiene turnos.</p>}
          </div>
        </section>
      )}
    </main>
  );
}
