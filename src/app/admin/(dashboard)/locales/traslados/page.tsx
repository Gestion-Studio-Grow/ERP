import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { trasladosAction } from "@/lib/multilocal/multilocal-actions";
import { textoCantidad, type Remito } from "@/lib/multilocal/traslado-core";
import { fmtDateTimeAr } from "@/lib/datetime";
import { AvisoError, Badge, Card, EmptyState, KpiTile, PageContainer, PageHeader, buttonClasses, fmtNumberAR } from "@/components/ui";
import { LocalesSinLeer, NoEsCasa, NoSePudoLeer, SinLocales, SolapasLocales } from "../partes";
import { TrasladoForm } from "./TrasladoForm";

export const dynamic = "force-dynamic";

// TRASLADOS ENTRE LOCALES — mandar mercadería de un lugar de la red a otro.
//
// Sale del origen y entra en el destino en el mismo momento (una sola transacción, rls.ts), al
// costo del origen y sin tocar ninguna caja. Sólo entre lugares con el MISMO CUIT: a otro CUIT
// es una venta. Cada traslado deja su remito interno para imprimir (no es un documento fiscal).
//
// La abren la dueña y el encargado de la casa (`traslados:manage`): no hay costos en pantalla.
// El formulario lleva una clave nueva en cada carga: un doble clic manda la misma y se registra
// un solo traslado.
//
// GUARDIA: `requireApp` (rol, rubro de mostrador y el módulo `multilocal` aun con el gate
// apagado) y `exigirCasa`, que relee el módulo de la base. La action lo repite.

function una(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function TrasladosPage({ searchParams }: { searchParams: Promise<{ producto?: string | string[] }> }) {
  const user = await requireApp("traslados");
  const casa = await exigirCasa("traslados:manage");
  const titulo = "Traslados entre locales";
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoEsCasa error={casa.error} noSeLeyo={casa.noSeLeyo} />
      </PageContainer>
    );
  }
  const r = await trasladosAction();
  if (!r.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoSePudoLeer error={r.error} />
      </PageContainer>
    );
  }
  const sp = await searchParams;
  const sinCuit = r.ubicaciones.filter((u) => !u.cuit);

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        badge={<Badge tone="accent">{r.casa}</Badge>}
        description="Mandá mercadería de un lugar de tu red a otro: sale de uno y entra en el otro en el mismo momento. No toca ninguna caja."
      />
      <SolapasLocales activa="traslados" role={user.role} />
      <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales/traslados" />

      {r.ubicaciones.length < 2 ? (
        r.sinLeer.length === 0 && <SinLocales />
      ) : (
        <>
          <section aria-label="Traslados de hoy" className="mb-lg grid grid-cols-1 gap-[14px] sm:grid-cols-3">
            <KpiTile label="Hoy" value={fmtNumberAR(r.deHoy.cantidad)} sub={r.deHoy.cantidad === 1 ? "traslado" : "traslados"} />
            <KpiTile label="Kilos movidos hoy" value={fmtNumberAR(r.deHoy.kg, Number.isInteger(r.deHoy.kg) ? 0 : 1)} sub="kg entre todos los traslados" />
            <KpiTile label="Unidades movidas hoy" value={fmtNumberAR(r.deHoy.unidades)} sub="de lo que se vende por unidad" />
          </section>

          {sinCuit.length > 0 && (
            <AvisoError
              className="mb-lg"
              tono="aviso"
              titulo={`${sinCuit.map((u) => u.nombre).join(", ")} no ${sinCuit.length === 1 ? "tiene" : "tienen"} el CUIT cargado`}
              comoSeguir="Sin el CUIT no se sabe si es el mismo dueño, y un traslado sólo va entre lugares del mismo CUIT. Pedile a Gestión Studio Grow que lo cargue."
            />
          )}

          <Card className="mb-lg">
            <h2 className="mb-3 text-base font-semibold text-strong">Nuevo traslado</h2>
            <TrasladoForm
              clave={randomUUID()}
              ubicaciones={r.ubicaciones}
              productos={r.productos}
              productoInicial={una(sp.producto) ?? null}
            />
          </Card>

          <section aria-labelledby="ultimos-traslados">
            <h2 id="ultimos-traslados" className="mb-3 text-base font-semibold text-strong">
              Últimos 7 días
            </h2>
            {r.recientes.length === 0 ? (
              <EmptyState
                title="Todavía no hubo traslados esta semana"
                description="Cuando mandes mercadería de un lugar a otro, acá queda cada traslado con su remito para imprimir."
                action={
                  <Link href="/admin/locales/stock" className={buttonClasses("outline", "md")}>
                    Ver el stock de cada local
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2" aria-label="Traslados de los últimos 7 días">
                {r.recientes.map((t) => (
                  <li key={t.clave}>
                    <FilaTraslado t={t} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PageContainer>
  );
}

function FilaTraslado({ t }: { t: Remito }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium text-strong break-words">
          {t.origen.nombre} → {t.destino.nombre}
        </p>
        <p className="text-sm text-muted break-words">
          {t.lineas.map((l) => `${l.nombre} ${textoCantidad(l.cantidad, l.saleUnit, l.unidad)}`).join(" · ")}
        </p>
        <p className="text-xs text-faint">
          {fmtDateTimeAr(new Date(t.fecha))} · remito {t.codigo}
          {t.por ? ` · ${t.por}` : ""}
        </p>
      </div>
      <Link href={`/admin/locales/traslados/${t.clave}`} className={buttonClasses("outline", "md")}>
        Ver remito<span className="sr-only"> {t.codigo}</span>
      </Link>
    </Card>
  );
}
