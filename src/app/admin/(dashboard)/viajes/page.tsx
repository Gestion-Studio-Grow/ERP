// Presupuestos de viaje (/admin/viajes) — módulo VIAJES, esqueleto vertical mínimo.
//
// Pantalla del operador de una agencia: crea un presupuesto, busca vuelos/hoteles en
// el proveedor conectado y guarda opciones con el precio CONGELADO (snapshot: precio,
// moneda, base de ocupación, fecha de captura, vigencia, proveedor).
//
// GATE COMPUESTO (`exigirViajes`): flag `VIAJES_ENABLED` OFF → 404 (la pantalla no
// existe); capability `viajes:manage` (redirige si no la tiene); módulo `viajes` no
// asignado al tenant → aviso honesto. Estado "migración pendiente" también honesto.

import { notFound } from "next/navigation";
import { PageHeader, SectionGroup, Badge, EmptyState, Card, fmtNumberAR } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import { cargarPanelViajes, exigirViajes, type PresupuestoVista } from "@/lib/viajes/glue";
import { totalesPorMoneda } from "@/lib/viajes/core";
import { BASE_OCUPACION_LABEL, type BaseOcupacion } from "@/plugins/ofertas-viaje/port";
import { BuscadorOfertas, NuevoPresupuestoForm } from "./ViajesForms";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  ACEPTADO: "Aceptado",
  VENCIDO: "Vencido",
  CANCELADO: "Cancelado",
};

function fmtMonto(moneda: string, n: number): string {
  return `${moneda} ${fmtNumberAR(n, 2)}`;
}

function fmtFecha(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export default async function ViajesPage() {
  const gate = await exigirViajes();
  if (!gate.ok && gate.motivo === "flag") notFound();

  const panel = gate.ok ? await cargarPanelViajes(gate.tenantId) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Presupuestos de viaje"
        description="Buscá vuelos y hoteles, elegí opciones y armá el presupuesto. Cada opción queda guardada con el precio del momento, la base (por persona o por habitación) y la fecha en que lo capturaste."
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
          <SectionGroup
            title="Nuevo presupuesto"
            description="Quién viaja y a dónde. Con eso calculamos cuántas personas o habitaciones multiplica cada precio."
          >
            <NuevoPresupuestoForm />
          </SectionGroup>

          <SectionGroup
            title="Buscar ofertas"
            description="Los precios que ves acá son de este momento. Al guardar una opción, el precio se congela con su fecha de captura."
          >
            <BuscadorOfertas
              presupuestos={panel.presupuestos.map((p) => ({ id: p.id, titulo: p.titulo, destino: p.destino }))}
            />
          </SectionGroup>

          <SectionGroup title="Presupuestos" description="Los últimos 100, con sus opciones guardadas.">
            {panel.presupuestos.length === 0 ? (
              <EmptyState
                title="Todavía no hay presupuestos"
                description="Creá el primero arriba y después buscá vuelos u hoteles para sumarle opciones."
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
        </>
      ) : null}
    </main>
  );
}

function PresupuestoCard({ p }: { p: PresupuestoVista }) {
  const totales = totalesPorMoneda(p.opciones);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-strong">{p.titulo}</h3>
          <p className="text-sm text-muted">
            {p.destino} · {fmtFecha(p.fechaSalida)} → {fmtFecha(p.fechaRegreso)} · {p.adultos} {p.adultos === 1 ? "adulto" : "adultos"}
            {p.ninos > 0 ? `, ${p.ninos} ${p.ninos === 1 ? "menor" : "menores"}` : ""} · {p.habitaciones}{" "}
            {p.habitaciones === 1 ? "habitación" : "habitaciones"}
            {p.clienteNombre ? ` · ${p.clienteNombre}` : ""}
          </p>
        </div>
        <Badge tone="neutral">{ESTADO_LABEL[p.estado] ?? p.estado}</Badge>
      </div>

      {p.opciones.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Sin opciones todavía. Buscá arriba y guardá la que le quieras ofrecer.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Opciones guardadas del presupuesto {p.titulo}</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-1.5 pr-3">Opción</th>
                <th scope="col" className="py-1.5 pr-3">Precio</th>
                <th scope="col" className="py-1.5 pr-3">Base</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Total</th>
                <th scope="col" className="py-1.5 pr-3">Capturado</th>
                <th scope="col" className="py-1.5">Vigencia</th>
              </tr>
            </thead>
            <tbody>
              {p.opciones.map((o) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="py-2 pr-3">
                    <span className="text-strong">{o.descripcion}</span>
                    <span className="block text-xs text-muted">
                      {o.tipo === "VUELO" ? "Vuelo" : "Hotel"} · {o.proveedor}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmtMonto(o.moneda, o.precio)}</td>
                  <td className="py-2 pr-3">
                    {BASE_OCUPACION_LABEL[o.baseOcupacion as BaseOcupacion] ?? o.baseOcupacion} × {o.cantidadBase}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium text-strong">{fmtMonto(o.moneda, o.precioTotal)}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmtDateTimeAr(o.capturadoEn)}</td>
                  <td className="py-2">
                    {o.vigencia === "vigente" ? (
                      <Badge tone="success">vigente</Badge>
                    ) : o.vigencia === "vencida" ? (
                      <Badge tone="danger">vencida</Badge>
                    ) : (
                      <span className="text-muted">no informa</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {totales.map((t) => (
                <tr key={t.moneda} className="border-t border-line-strong">
                  <th scope="row" colSpan={3} className="py-2 pr-3 text-left font-medium text-strong">
                    Total en {t.moneda}
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-strong">{fmtMonto(t.moneda, t.total)}</td>
                  <td colSpan={2} />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
