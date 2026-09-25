// ============================================================================
// LA FICHA DEL CLIENTE — diseño nuevo («Renglón»). Servidor.
// ============================================================================
//
// Se ve SÓLO con el interruptor «Diseño nuevo» del negocio (page.tsx pregunta `disenoNuevo()`);
// apagado, la ficha de siempre (CH) o la ficha única (piloto), intactas. CH está en producción:
// prenderle esto es decisión del dueño.
//
// Es la página del cuaderno de la clienta, leída como un ciclo de vida, de arriba abajo:
//   1. Quién es: el nombre, el teléfono y UNA línea con lo que cambia la conversación (turno, deuda,
//      faltazos, si no quiere mensajes). Al lado, UNA tecla: darle un turno o escribirle.
//   2. La plata: lo que debe (con el detalle del fiado) y, sólo con reports:read, lo gastado.
//   3. Sus datos: cómo viene, cumpleaños, notas, permiso de mensajes y editar.
//   4. Lo que pasó: turnos y pedidos, un renglón cada uno.
//   5. El historial de la ficha: cuándo se abrió, el permiso y el último contacto.
// Documentos (comprobantes a su nombre) no aparece: no hay consulta que los traiga por cliente, y un
// bloque sin datos no se dibuja (ARQUITECTURA §6 regla 10).
//
// Los datos son los de la ficha única (`cargarFichaCompleta`), con sus mismas reglas y guardias:
// cambia CÓMO se ve, no QUÉ se consulta ni quién puede qué.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Bloque, DosColumnas, PageContainer, PageHeader, Plata, Renglon, atributosBoton, buttonClasses } from "@/components/ui";
import { dateStrInBusinessTz, fmtShortDate, fmtTime } from "@/lib/datetime";
import { roleHasCapability } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import { cargarFichaCompleta } from "@/lib/crm/cargas.server";
import { explicarCiclo } from "@/lib/crm/ciclo";
import { diasEntre, diasHastaCumple, fmtMesDia, haceDias } from "@/lib/crm/fechas";
import { explicarSegmento, SEGMENTO_ETIQUETA } from "@/lib/crm/segmentos";
import { ACCION_BAJA, CRM_REGLAS, MOTIVO_ETIQUETA, esMotivoContacto } from "@/lib/crm/reglas";
import { claseBotonWhatsApp } from "../boton-whatsapp";
import { contactoDeLaFicha } from "../contacto-ficha";
import { hrefNuevoTurno } from "../../turnos/pasos";
import EditarClienteForm from "./EditarClienteForm";
import PermisoMensajes from "./PermisoMensajes";
import { comoVieneMostrador, detalleSinDeuda, estadoDeLaFicha, notaDelRitmo, pedidoSinCobrar, teclaPrincipal } from "./ficha-core";

const ESTADO_TURNO: Record<string, string> = {
  PENDING: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Completado",
  NO_SHOW: "No vino",
};

const ESTADO_PEDIDO: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
};

export default async function FichaRenglon({ id, user }: { id: string; user: SessionUser }) {
  const [f, negocio] = await Promise.all([cargarFichaCompleta(id), getNegocioApps(user.role)]);
  if (!f) notFound();
  const { client, resumen, ev } = f;
  const abreFiado = appPermitida(appPorId("cuentas-a-cobrar"), negocio);
  const puedeDarTurno = appPermitida(appPorId("agenda"), negocio) && roleHasCapability(user.role, "agenda:manage");
  const verPlata = roleHasCapability(user.role, "reports:read");
  const puedeEditar = roleHasCapability(user.role, "clients:manage");
  const noQuiere = f.permiso?.accion === ACCION_BAJA;
  const contacto = contactoDeLaFicha({ telefono: client.phone, noQuiere, puedeEditar });
  // La misma suma que la ficha única (FichaUnica.tsx): saldo de turnos + fiado.
  const debe = resumen.saldoTurnos + (resumen.saldoFiado ?? 0);
  const servicios = f.rubro === "servicios";
  const diasCumple = f.cumple ? diasHastaCumple(f.cumple, f.hoy) : null;
  const proximo = resumen.proximoTurno;
  const pedidosSinCobrar = f.pedidos.filter(pedidoSinCobrar).length;

  const datos = estadoDeLaFicha({
    servicios,
    proximoTurno: proximo
      ? `${fmtShortDate(proximo.startsAt)} ${fmtTime(proximo.startsAt)} · ${proximo.servicio} con ${proximo.profesional.split(" ")[0]}`
      : null,
    ultimaVezHace: resumen.ultimaVisita ? haceDias(diasEntre(dateStrInBusinessTz(resumen.ultimaVisita), f.hoy)) : null,
    debe,
    fiadoIlegible: resumen.saldoFiado === null,
    faltazos: resumen.faltazos,
    faltazosParaAviso: CRM_REGLAS.faltazosParaAviso,
    pedidos: resumen.pedidos,
    pedidosSinCobrar,
    noQuiere,
  });
  const tecla = teclaPrincipal({ servicios, puedeDarTurno, tieneTurno: proximo !== null, puedeEscribirle: contacto.tipo === "whatsapp" });

  const whatsapp =
    contacto.tipo === "whatsapp" ? (
      <a
        href={contacto.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Escribirle por WhatsApp a ${client.name}`}
        className={claseBotonWhatsApp(tecla === "whatsapp" ? "solid" : "outline")}
      >
        WhatsApp
      </a>
    ) : null;

  const acciones = (
    // En el celular, las dos teclas del mismo ancho, lado a lado (una mano, el pulgar); en la PC, en fila.
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
      {tecla === "turno" && (
        <Link href={hrefNuevoTurno(null, client.id)} className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
          Darle un turno
        </Link>
      )}
      {whatsapp}
      {tecla !== "turno" && puedeDarTurno && servicios && (
        <Link href={hrefNuevoTurno(null, client.id)} className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
          Otro turno
        </Link>
      )}
    </div>
  );

  const hayPlata = debe > 0 || (f.fiado?.length ?? 0) > 0 || verPlata;

  return (
    <PageContainer>
      <Link href="/admin/clientes" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-strong hover:underline">
        ← Clientes
      </Link>
      <PageHeader
        title={<span className="[overflow-wrap:anywhere]">{client.name}</span>}
        estado={[
          <span key="tel" className="[overflow-wrap:anywhere]">
            {client.phone}
            {client.email ? ` · ${client.email}` : ""}
          </span>,
          ...datos.map((d) =>
            d.tipo === "debe" ? (
              <strong key={d.clave} className="text-danger">
                Debe <Plata valor={d.monto} sinCentavos tono="peligro" />
                {d.aclaracion ? <span className="font-normal text-muted"> ({d.aclaracion})</span> : null}
              </strong>
            ) : (
              <span key={d.clave} className={d.tono === "peligro" ? "font-semibold text-danger" : d.tono === "atencion" ? "font-semibold text-warning" : undefined}>
                {d.texto}
              </span>
            ),
          ),
        ]}
        actions={acciones}
      />
      {contacto.tipo === "sin-celular" && <p className="-mt-2 mb-6 text-sm text-warning">{contacto.texto}</p>}

      <DosColumnas>
        {/* En el celular va primero lo de la derecha (plata y datos); en la PC, a la derecha. */}
        <div className="space-y-8 lg:order-2">
          {hayPlata && (
            <Bloque titulo="La plata" id="ficha-plata">
              {/* Sin columna de folio: son rótulos, no documentos (la del fiado lleva la fecha como detalle). */}
              <ul data-sin-folio="">
                <Renglon
                  as="li"
                  titulo="Debe"
                  detalle={
                    debe > 0
                      ? [resumen.saldoTurnos > 0 ? "turnos sin terminar de cobrar" : null, (resumen.saldoFiado ?? 0) > 0 ? "cuenta corriente" : null].filter(Boolean).join(" y ")
                      : detalleSinDeuda({ servicios, fiadoIlegible: resumen.saldoFiado === null, pedidosSinCobrar })
                  }
                  plata={debe > 0 ? <Plata valor={debe} sinCentavos tono="peligro" /> : <span className="text-muted">Nada</span>}
                />
                {(f.fiado ?? []).map((d) => (
                  <Renglon
                    key={d.id}
                    as="li"
                    titulo={d.concepto || "Fiado"}
                    detalle={`del ${fmtShortDate(d.emitida)} · ${d.vence ? `vence el ${fmtShortDate(d.vence)}` : "sin vencimiento"}`}
                    plata={<Plata valor={d.saldo} sinCentavos />}
                    tecla={
                      abreFiado ? (
                        <Link href={`/admin/cuentas-a-cobrar/${d.id}`} className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")} aria-label={`Ver la cuenta: ${d.concepto || "Fiado"} del ${fmtShortDate(d.emitida)}`}>
                          Ver
                        </Link>
                      ) : undefined
                    }
                  />
                ))}
                {verPlata && (
                  <Renglon as="li" titulo="Gastó en el último año" detalle="lo cobrado, turnos y pedidos" plata={<Plata valor={resumen.gastadoAnio} sinCentavos />} />
                )}
              </ul>
            </Bloque>
          )}

          <Bloque titulo="Sus datos" id="ficha-datos" nota={ev ? notaDelRitmo(SEGMENTO_ETIQUETA[ev.segmento], ev.segmento, servicios) : undefined}>
            <ul data-sin-folio="">
              <Renglon
                as="li"
                titulo="Cómo viene"
                detalle={
                  !servicios
                    ? comoVieneMostrador(ev)
                    : ev
                      ? `${explicarSegmento(ev)} ${ev.cantidadVisitas > 0 ? `En general ${explicarCiclo(ev.ciclo)}.` : ""}`
                      : "Sin datos de visitas."
                }
              />
              <Renglon
                as="li"
                titulo="Cumpleaños"
                detalle={
                  f.cumple
                    ? `${fmtMesDia(f.cumple)}${diasCumple === 0 ? ": es hoy" : diasCumple !== null && diasCumple <= 30 ? ` (en ${diasCumple} ${diasCumple === 1 ? "día" : "días"})` : ""}`
                    : puedeEditar
                      ? "No está cargado. Sumalo con «Editar datos» para saludarla ese día."
                      : "No está cargado."
                }
              />
              {client.isResident && <Renglon as="li" titulo="Precio local" detalle="Es de la zona: se le cobra el precio local." />}
              {client.notes && <Renglon as="li" titulo="Notas internas" detalle={<span className="whitespace-pre-line">{client.notes}</span>} />}
            </ul>
            <div className="mt-3 space-y-3 text-sm">
              <PermisoMensajes
                clientId={client.id}
                noQuiere={noQuiere}
                detalle={f.permiso ? `el ${fmtShortDate(f.permiso.el)}${f.permiso.por ? `, lo cargó ${f.permiso.por}` : ""}` : null}
                puedeCambiar={puedeEditar}
              />
              {puedeEditar && (
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
              )}
            </div>
          </Bloque>
        </div>

        <div className="space-y-8 lg:order-1">
          {(servicios || f.turnos.length > 0) && (
            <Bloque titulo="Turnos" cuenta={f.turnos.length > 0 ? f.turnos.length : undefined} id="ficha-turnos">
              {f.turnos.length === 0 ? (
                <p className="py-3 text-sm text-muted">Todavía no tiene turnos.</p>
              ) : (
                <ul>
                  {f.turnos.map((a) => (
                    <Renglon
                      key={a.id}
                      as="li"
                      folio={
                        <>
                          {fmtShortDate(a.startsAt)}
                          <br />
                          {fmtTime(a.startsAt)}
                        </>
                      }
                      titulo={a.service.name}
                      detalle={
                        <>
                          {a.professional.name} · {ESTADO_TURNO[a.status] ?? a.status}
                          {a.review ? ` · la calificó con ${a.review.rating} de 5` : ""}
                          {a.notes && <span className="mt-1 block whitespace-pre-line text-body">{a.notes}</span>}
                        </>
                      }
                      // Cancelado o «No vino»: sin monto, para que no se lea como deuda ni como cobrado.
                      plata={a.status === "CANCELLED" || a.status === "NO_SHOW" ? undefined : <Plata valor={a.precio} sinCentavos />}
                    />
                  ))}
                </ul>
              )}
            </Bloque>
          )}

          {(f.pedidos.length > 0 || !servicios) && (
            <Bloque titulo="Pedidos" cuenta={f.pedidos.length > 0 ? f.pedidos.length : undefined} id="ficha-pedidos">
              {f.pedidos.length === 0 ? (
                <p className="py-3 text-sm text-muted">Todavía no tiene pedidos con este teléfono.</p>
              ) : (
                <ul>
                  {f.pedidos.map((p) => (
                    <Renglon
                      key={p.id}
                      as="li"
                      folio={`#${p.code}`}
                      titulo={`${fmtShortDate(p.createdAt)} · ${p.channel === "ONLINE" ? "tienda online" : "mostrador"}`}
                      detalle={`${ESTADO_PEDIDO[p.status] ?? p.status}${pedidoSinCobrar(p) ? " · sin cobrar" : ""}${p.clientId === null ? " · llegó por su teléfono" : ""}`}
                      plata={verPlata ? <Plata valor={p.total} sinCentavos /> : undefined}
                    />
                  ))}
                </ul>
              )}
            </Bloque>
          )}

          <Bloque titulo="Historial de la ficha" id="ficha-historial">
            <ul>
              <Renglon as="li" folio={fmtShortDate(client.createdAt)} titulo="Se abrió la ficha" />
              {f.permiso && (
                <Renglon
                  as="li"
                  folio={fmtShortDate(f.permiso.el)}
                  titulo={noQuiere ? "Pidió no recibir mensajes" : "Volvió a aceptar mensajes"}
                  detalle={f.permiso.por ? `lo cargó ${f.permiso.por}` : undefined}
                />
              )}
              {f.ultimoContacto && (
                <Renglon
                  as="li"
                  folio={fmtShortDate(f.ultimoContacto.el)}
                  titulo="Último contacto desde la bandeja"
                  detalle={[esMotivoContacto(f.ultimoContacto.motivo) ? MOTIVO_ETIQUETA[f.ultimoContacto.motivo] : null, f.ultimoContacto.por ? `por ${f.ultimoContacto.por}` : null].filter(Boolean).join(" · ") || undefined}
                />
              )}
            </ul>
          </Bloque>
        </div>
      </DosColumnas>
    </PageContainer>
  );
}
