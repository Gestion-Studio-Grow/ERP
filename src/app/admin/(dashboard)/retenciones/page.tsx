// RETENCIONES Y PERCEPCIONES SUFRIDAS — los impuestos que el banco ya descontó en el mes.
//
// SIRCREB (Ingresos Brutos), percepciones de IVA y retenciones de Ganancias se pueden tomar A
// CUENTA en la declaración: si nadie los junta, se pagan dos veces. El impuesto a los débitos y
// créditos (el "impuesto al cheque") va aparte y no suma al total: qué parte se computa depende
// de la condición del negocio y la define el contador. La pantalla no afirma porcentajes: el
// que se leía acá ("sólo la parte de los créditos") era una regla vieja.
//
// El dato ya estaba: los movimientos del extracto que se sube en Facturación automática; el
// clasificador del banco los reconocía para no facturarlos y ahí terminaba. La cuenta vive en
// src/lib/reports/retenciones.ts (pura, probada con leyendas reales) y la lectura en
// retenciones-lectura.ts, la misma del botón del Inicio.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { diaLegible, esMesKey, etiquetaDelMes, mesDelNegocio, mesVecino } from "@/lib/libros/fecha-fiscal";
import { fiscalDateToIso } from "@/lib/libros/libro-iva";
import { ETIQUETA_PAGO_A_CUENTA, RETENCIONES_Y_PERCEPCIONES } from "@/lib/reports/retenciones";
import { leerPagosACuenta } from "@/lib/reports/retenciones-lectura";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { EmptyState, PageHeader, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { DosColumnas, LineaDeEstado, Plata, Renglon } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { LineaDeCuenta } from "@/components/ui/LineaDeCuenta";
import { PasoDePeriodo } from "@/components/ui/PasoDePeriodo";
import { mesLargo, nombreMes } from "../caja/_renglon/fechas";

export const dynamic = "force-dynamic";

const RUTA = "/admin/retenciones";

export default async function RetencionesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireApp("retenciones-y-percepciones");
  const actual = mesDelNegocio();
  const { mes: pedido } = await searchParams;
  const mes = esMesKey(pedido) && pedido <= actual ? pedido : actual;
  const tenantId = await getCurrentTenantId();
  const [r, abribles] = await Promise.all([
    leerPagosACuenta(prisma, tenantId, mes),
    appsQuePuedeAbrir(user.role, ["facturacion-automatica"]),
  ]);
  const etiqueta = etiquetaDelMes(mes);
  const anterior = mesVecino(mes, -1);
  const siguiente = mesVecino(mes, 1);
  const subirExtracto = abribles.has("facturacion-automatica") ? (
    <Link href="/admin/facturacion/bancos" className={buttonClasses("solid", "md")}>
      Subir el extracto
    </Link>
  ) : undefined;

  // DISEÑO NUEVO («Renglón»): lo que el banco ya descontó, como una cuenta para el contador (por
  // tipo, con el total que se toma a cuenta) y, aparte, el impuesto al cheque; debajo, cada
  // movimiento del extracto. Mismos números (`leerPagosACuenta`).
  if (await disenoNuevo()) {
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <header data-ui="page-header" className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-strong">Retenciones y percepciones</h1>
            <LineaDeEstado
              datos={[
                <strong key="m">{mesLargo(mes)}</strong>,
                r.movimientos.length > 0 ? (
                  <span key="t">
                    <Plata valor={r.total} sinCentavos /> para pasarle a tu contador
                  </span>
                ) : null,
                r.leidos > 0 ? `${fmtNumberAR(r.leidos)} movimientos leídos del extracto` : "sin extracto del mes",
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PasoDePeriodo
              etiqueta="Mes"
              actual={mesLargo(mes)}
              anterior={{ href: `${RUTA}?mes=${anterior}`, texto: nombreMes(anterior) }}
              siguiente={siguiente <= actual ? { href: `${RUTA}?mes=${siguiente}`, texto: nombreMes(siguiente) } : null}
            />
            {subirExtracto}
          </div>
        </header>
        {r.leidos === 0 || r.movimientos.length === 0 ? (
          <p className="max-w-3xl border-y border-line py-4 text-sm text-body">
            {r.leidos === 0
              ? `Todavía no hay extracto de ${etiqueta}. Las retenciones salen del extracto del banco: subilo en Facturación automática (el mismo archivo que usás para facturar) y acá aparecen solas.`
              : `El extracto de ${etiqueta} no trae retenciones ni percepciones: se leyeron ${fmtNumberAR(r.leidos)} movimientos y ninguno es SIRCREB, IVA, Ganancias ni el impuesto al cheque. Si falta parte del mes, subí el extracto que falta.`}
          </p>
        ) : (
          <DosColumnas>
            <section aria-labelledby="para-el-contador" className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
                <h2 id="para-el-contador" className="text-[15px] font-semibold text-strong">
                  Para tu contador
                </h2>
                <span className="text-[13px] text-muted">se descuentan de lo que tenés que pagar</span>
              </div>
              {RETENCIONES_Y_PERCEPCIONES.map((t) => (
                <LineaDeCuenta key={t} concepto={ETIQUETA_PAGO_A_CUENTA[t]} importe={<Plata valor={r.porTipo[t]} />} />
              ))}
              <LineaDeCuenta total concepto="Retenciones y percepciones" importe={<Plata valor={r.total} />} />
              {r.impuestoAlCheque !== 0 && (
                <div className="mt-5">
                  <LineaDeCuenta
                    concepto={`${ETIQUETA_PAGO_A_CUENTA.cheque} (aparte)`}
                    detalle="No suma arriba: qué parte se toma a cuenta depende de la condición de tu negocio, y la define tu contador."
                    importe={<Plata valor={r.impuestoAlCheque} />}
                  />
                </div>
              )}
            </section>
            <section aria-labelledby="movimientos-extracto" className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
                <h2 id="movimientos-extracto" className="text-[15px] font-semibold text-strong">
                  Del extracto
                </h2>
                <span className="text-[13px] text-muted">{r.movimientos.length}</span>
              </div>
              {r.movimientos.map((m) => (
                <Renglon
                  key={m.id}
                  folio={diaLegible(fiscalDateToIso(m.fecha)).slice(0, 5)}
                  titulo={<span className="font-normal">{m.descripcion}</span>}
                  detalle={`${ETIQUETA_PAGO_A_CUENTA[m.tipo]}${m.importe < 0 ? " · devolución" : ""}`}
                  plata={<Plata valor={m.importe} />}
                />
              ))}
            </section>
          </DosColumnas>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Retenciones y percepciones"
        description={`Los impuestos que el banco te descontó en ${etiqueta}. Pasáselos a tu contador: según la condición de tu negocio, se descuentan de lo que tenés que pagar.`}
      />

      <nav aria-label="Mes" className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`${RUTA}?mes=${anterior}`} rel="prev" className={buttonClasses("outline", "md")}>
          <span className="capitalize">← {etiquetaDelMes(anterior)}</span>
        </Link>
        <span className="text-sm font-medium capitalize text-strong">{etiqueta}</span>
        {siguiente <= actual && (
          <Link href={`${RUTA}?mes=${siguiente}`} rel="next" className={buttonClasses("outline", "md")}>
            <span className="capitalize">{etiquetaDelMes(siguiente)} →</span>
          </Link>
        )}
      </nav>

      {r.leidos === 0 ? (
        <EmptyState
          title={`Todavía no hay extracto de ${etiqueta}`}
          description="Las retenciones salen del extracto del banco. Subilo en Facturación automática (el mismo archivo que usás para facturar) y acá aparecen solas."
          action={subirExtracto}
        />
      ) : r.movimientos.length === 0 ? (
        <EmptyState
          title={`El extracto de ${etiqueta} no trae retenciones ni percepciones`}
          description={`Se leyeron ${fmtNumberAR(r.leidos)} movimientos y ninguno es una retención, una percepción (SIRCREB, IVA, Ganancias) ni el impuesto al cheque. Si falta parte del mes, subí el extracto que falta.`}
          action={subirExtracto}
        />
      ) : (
        <>
          {/* `min-w-0` y el corte: en 412 px van dos por fila y un monto largo no entra en una línea. */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="col-span-2 min-w-0 rounded-lg border border-line p-4 lg:col-span-1">
              <p className="text-sm text-muted">Retenciones y percepciones</p>
              <p className="text-xl font-semibold tabular-nums text-strong [overflow-wrap:anywhere] sm:text-2xl">{fmtMoneyARS(r.total)}</p>
              <p className="mt-1 text-xs text-muted">sin el impuesto al cheque</p>
            </div>
            {RETENCIONES_Y_PERCEPCIONES.map((t) => (
              <div key={t} className="min-w-0 rounded-lg border border-line p-4">
                <p className="text-sm text-muted">{ETIQUETA_PAGO_A_CUENTA[t]}</p>
                <p className="text-lg font-semibold tabular-nums text-strong [overflow-wrap:anywhere] sm:text-xl">{fmtMoneyARS(r.porTipo[t])}</p>
              </div>
            ))}
            <div className="min-w-0 rounded-lg border border-line p-4">
              <p className="text-sm text-muted">{ETIQUETA_PAGO_A_CUENTA.cheque}</p>
              <p className="text-lg font-semibold tabular-nums text-strong [overflow-wrap:anywhere] sm:text-xl">{fmtMoneyARS(r.impuestoAlCheque)}</p>
              <p className="mt-1 text-xs text-muted">aparte</p>
            </div>
          </div>
          {r.impuestoAlCheque !== 0 && (
            <p className="mb-4 text-sm text-muted">
              El impuesto al cheque va aparte y no suma arriba: qué parte se puede tomar a cuenta (de Ganancias, por ejemplo)
              depende de la condición de tu negocio, y la define tu contador.
            </p>
          )}
          <ul className="divide-y divide-line rounded-lg border border-line">
            {r.movimientos.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-strong">{m.descripcion}</span>
                  <span className="block text-xs text-muted">
                    {diaLegible(fiscalDateToIso(m.fecha))} · {ETIQUETA_PAGO_A_CUENTA[m.tipo]}
                    {m.importe < 0 ? " · devolución" : ""}
                  </span>
                </span>
                <span className="whitespace-nowrap tabular-nums font-medium text-strong">{fmtMoneyARS(m.importe)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
