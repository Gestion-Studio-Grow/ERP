// Presupuestos de viaje (/admin/viajes) — bandeja del módulo `presupuestos-viaje`.
// Esqueleto vertical mínimo de la spec docs/producto/spec-armador-presupuestos-viaje.md:
// nuevo pedido → (buscar o cargar a mano) → oferta capturada (objeto maestro) → asignada a
// una opción → resumen por opción (precio por persona en doble / single, confianza).
//
// GATE COMPUESTO (`exigirViajes`): flag `VIAJES_ENABLED` OFF → 404 (la pantalla no
// existe); capability `quotes:read` (redirige si no la tiene); módulo no asignado al
// tenant → aviso honesto. Estado "migración pendiente" también honesto.
// Lo que puede OPERAR (crear/capturar) lo decide `quotes:manage` server-side en cada
// action; acá solo se esconden los formularios (UX, no seguridad — ADR-017 §2.e).

import { notFound } from "next/navigation";
import { PageHeader, SectionGroup, Badge, EmptyState, Card, fmtNumberAR } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import { roleHasCapability } from "@/lib/capabilities";
import { cargarPanelViajes, exigirViajes, tieneBuscador, type OfertaVista, type PresupuestoVista } from "@/lib/viajes/glue";
import { BASE_OCUPACION_LABEL, UNIDAD_PRECIO_LABEL, type BaseOcupacion, type UnidadPrecio } from "@/plugins/ofertas-viaje/port";
import { BuscadorOfertas, CapturaManualForm, NuevoPedidoForm, type OpcionDestino } from "./ViajesForms";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  EN_ARMADO: "En armado",
  LISTO_PARA_REVISAR: "Listo para revisar",
  APROBADO: "Aprobado",
  ENVIADO: "Enviado",
  VENCIDO: "Vencido",
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
  SIN_RESPUESTA: "Sin respuesta",
  ARCHIVADO: "Archivado",
};

const TIPO_LABEL: Record<string, string> = { VUELO: "Vuelo", ALOJAMIENTO: "Alojamiento", OTRO: "Otro" };

function fmtMonto(moneda: string, n: number | null): string {
  return n == null ? "No cotizado" : `${moneda} ${fmtNumberAR(n, 2)}`;
}

function fmtFecha(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function unidadTexto(o: Pick<OfertaVista, "unidad" | "baseOcupacion" | "ocupacion" | "noches">): string {
  const u = UNIDAD_PRECIO_LABEL[o.unidad as UnidadPrecio] ?? o.unidad;
  const b = o.baseOcupacion ? ` · base ${BASE_OCUPACION_LABEL[o.baseOcupacion as BaseOcupacion] ?? o.baseOcupacion}${o.baseOcupacion === "OTRA" && o.ocupacion ? ` (${o.ocupacion})` : ""}` : "";
  const n = o.unidad === "POR_HABITACION_NOCHE" && o.noches ? ` · ${o.noches} noches` : "";
  return `${u}${b}${n}`;
}

function VigenciaBadge({ o }: { o: Pick<OfertaVista, "vigencia" | "vigenteHasta" | "vigenciaAsumida"> }) {
  const tone = o.vigencia === "vigente" ? "success" : o.vigencia === "por_vencer" ? "warning" : "danger";
  const label = o.vigencia === "vigente" ? "vigente" : o.vigencia === "por_vencer" ? "por vencer" : "vencida";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={tone}>{label}</Badge>
      <span className="text-xs text-muted tabular-nums">
        hasta {fmtDateTimeAr(o.vigenteHasta)}
        {o.vigenciaAsumida ? " (asumida)" : ""}
      </span>
    </span>
  );
}

export default async function ViajesPage() {
  const gate = await exigirViajes("quotes:read");
  if (!gate.ok && gate.motivo === "flag") notFound();

  const panel = gate.ok ? await cargarPanelViajes(gate.tenantId) : null;
  const puedeOperar = gate.ok && roleHasCapability(gate.user.role, "quotes:manage");
  const conBuscador = gate.ok && tieneBuscador(gate.modules);

  const opciones: OpcionDestino[] =
    panel?.ok
      ? panel.presupuestos.flatMap((p) =>
          p.niveles.flatMap((n) =>
            n.opciones.map((o) => ({
              id: o.id,
              label: `${p.titulo} · ${n.nombre} · ${o.nombre}`,
              tramoId: p.solicitud.tramos[0]?.id ?? null,
            })),
          ),
        )
      : [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Presupuestos de viaje"
        description="Tomás el pedido, capturás ofertas con su precio del momento y las asignás a las opciones. Cada precio queda con su unidad, su base de ocupación, la fecha de captura y hasta cuándo vale."
      />

      {!gate.ok ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {gate.error}
        </p>
      ) : panel && !panel.ok ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {panel.error}
        </p>
      ) : panel ? (
        <>
          {puedeOperar ? (
            <SectionGroup
              title="Nuevo pedido"
              description="Quién viaja, cuántos y a dónde. Se crea el presupuesto v1 con tres niveles (Económico, Intermedio, Alto) y una opción por nivel."
            >
              <NuevoPedidoForm />
            </SectionGroup>
          ) : null}

          {puedeOperar && conBuscador ? (
            <SectionGroup
              title="Buscar vuelos y hoteles"
              description="Los precios que ves son de este momento. Al capturar, el precio se congela con su fecha y queda en la biblioteca; si elegís una opción, se asigna ahí mismo."
            >
              <BuscadorOfertas opciones={opciones} />
            </SectionGroup>
          ) : null}

          {puedeOperar ? (
            <SectionGroup
              title="Cargar una oferta a mano"
              description="Para lo que te pasa el mayorista por portal, mail o teléfono. Unidad y base de ocupación son obligatorias: es lo que evita cotizar el doble."
            >
              <CapturaManualForm opciones={opciones} />
            </SectionGroup>
          ) : null}

          <SectionGroup title="Presupuestos" description="Los últimos 50, con sus niveles, opciones y ofertas asignadas.">
            {panel.presupuestos.length === 0 ? (
              <EmptyState
                title="Todavía no hay pedidos"
                description={puedeOperar ? "Creá el primero arriba y después capturá ofertas para armar las opciones." : "Cuando el mostrador cargue un pedido, aparece acá."}
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {panel.presupuestos.map((p) => (
                  <li key={p.id}>
                    <PresupuestoCard p={p} />
                  </li>
                ))}
              </ul>
            )}
          </SectionGroup>

          <SectionGroup title="Biblioteca de ofertas" description="Las últimas 30 capturadas. Una oferta se captura una vez y se puede asignar a varias opciones.">
            {panel.ofertas.length === 0 ? (
              <p className="text-sm text-muted">Sin ofertas capturadas todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Ofertas capturadas</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="py-1.5 pr-3">Oferta</th>
                      <th scope="col" className="py-1.5 pr-3 text-right">Precio</th>
                      <th scope="col" className="py-1.5 pr-3">Unidad y base</th>
                      <th scope="col" className="py-1.5 pr-3">Certeza</th>
                      <th scope="col" className="py-1.5 pr-3">Capturada</th>
                      <th scope="col" className="py-1.5">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {panel.ofertas.map((o) => (
                      <tr key={o.id} className="border-t border-line">
                        <td className="py-2 pr-3">
                          <span className="text-strong">{o.titulo}</span>
                          <span className="block text-xs text-muted">
                            {TIPO_LABEL[o.tipo] ?? o.tipo} · {o.proveedor} · {o.fuente}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums font-medium text-strong">{fmtMonto(o.moneda, o.precio)}</td>
                        <td className="py-2 pr-3">{unidadTexto(o)}</td>
                        <td className="py-2 pr-3">
                          <Badge tone={o.certeza === "VERIFICADA" ? "success" : "warning"}>{o.certeza === "VERIFICADA" ? "verificada" : "estimada"}</Badge>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{fmtDateTimeAr(o.capturadoEn)}</td>
                        <td className="py-2">
                          <VigenciaBadge o={o} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionGroup>
        </>
      ) : null}
    </main>
  );
}

function PresupuestoCard({ p }: { p: PresupuestoVista }) {
  const tramo = p.solicitud.tramos[0];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-strong">
            {p.titulo} <span className="text-muted font-normal">v{p.version}</span>
          </h3>
          <p className="text-sm text-muted">
            {p.solicitud.contactoNombre} · {p.solicitud.cantidadPasajeros} {p.solicitud.cantidadPasajeros === 1 ? "pasajero" : "pasajeros"}
            {tramo ? ` · ${tramo.destino} · ${fmtFecha(tramo.desde)} → ${fmtFecha(tramo.hasta)}` : ""}
            {p.vigenteHasta ? ` · vigente hasta ${fmtDateTimeAr(p.vigenteHasta)}` : ""}
          </p>
        </div>
        <Badge tone="neutral">{ESTADO_LABEL[p.estado] ?? p.estado}</Badge>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {p.niveles.map((n) => (
          <section key={n.id} aria-label={`Nivel ${n.nombre}`} className="rounded-lg border border-line p-3">
            <h4 className="text-sm font-semibold text-strong">{n.nombre}</h4>
            {n.opciones.map((o) => (
              <div key={o.id} className="mt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-strong">{o.nombre}</span>
                  <Badge tone={o.resumen.confianza === "verde" ? "success" : o.resumen.confianza === "ambar" ? "warning" : "danger"}>
                    {o.resumen.confianza === "verde" ? "confiable" : o.resumen.confianza === "ambar" ? "revisar" : "incompleta"}
                  </Badge>
                </div>
                {o.asignaciones.length === 0 ? (
                  <p className="text-xs text-muted">Sin ofertas asignadas.</p>
                ) : (
                  <>
                    <ul className="mt-1 flex flex-col gap-1">
                      {o.asignaciones.map((a) => (
                        <li key={a.id} className="text-xs text-body">
                          <span className="text-strong">{a.oferta.titulo}</span> — {fmtMonto(a.oferta.moneda, a.oferta.precio)} {unidadTexto(a.oferta)}
                          {a.oferta.vigencia === "vencida" ? <Badge tone="danger" className="ml-1">vencida</Badge> : null}
                        </li>
                      ))}
                    </ul>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
                      <dt className="text-muted">Por persona en doble</dt>
                      <dd className="text-right tabular-nums font-medium text-strong">{fmtMonto(o.resumen.moneda ?? "", o.resumen.porPersonaDoble)}</dd>
                      <dt className="text-muted">Por persona en single</dt>
                      <dd className="text-right tabular-nums font-medium text-strong">{fmtMonto(o.resumen.moneda ?? "", o.resumen.porPersonaSingle)}</dd>
                      <dt className="text-muted">Costo total del grupo</dt>
                      <dd className="text-right tabular-nums text-strong">{o.resumen.moneda ? fmtMonto(o.resumen.moneda, o.resumen.costoTotal) : "monedas mezcladas"}</dd>
                    </dl>
                    {o.resumen.avisos.length > 0 ? (
                      <ul className="mt-1 text-xs text-muted">
                        {o.resumen.avisos.map((av) => (
                          <li key={av}>{av}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </Card>
  );
}
