// El lote del mes: preparar, revisar y autorizar los abonos de TODA la cartera de una vez.
// Server component: arma la vista previa con `prepararLoteDelEstudio` (cada cliente leído con su
// tenantTransaction) y deja un solo botón que emite y manda a ARCA (`EmitirLote`).

import { exigirEstudio } from "@/lib/cartera-gate";
import { prepararLoteDelEstudio } from "@/lib/cartera-abonos";
import { isInvoicingEnabled } from "@/lib/fiscal";
import Link from "next/link";
import { bordesDelMes, esMesKey, etiquetaDelMes, mesDelNegocio, mesVecino } from "@/lib/libros/fecha-fiscal";
import { Bloque, ButtonLink, Franja, PageContainer, PageHeader, Plata, Renglon, fmtNumberAR } from "@/components/ui";
import { resumirLote, type EstadoRenglonLote } from "../abonos/abonos-core";
import EmitirLote from "./EmitirLote";

export const dynamic = "force-dynamic";

const ESTADO: Readonly<Record<EstadoRenglonLote, string>> = {
  para_emitir: "Para emitir",
  reemitir: "Volver a emitir",
  bloqueada: "Frenado",
  ya_emitida: "Ya emitida",
};

export default async function LotePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const gate = await exigirEstudio();
  if (!gate.ok) {
    return (
      <PageContainer>
        <PageHeader title="Lote del mes" />
        <Franja tono="peligro">{gate.error}</Franja>
      </PageContainer>
    );
  }
  const actual = mesDelNegocio();
  const anterior = mesVecino(actual, -1);
  const { mes: mesRaw } = await searchParams;
  const mes = esMesKey(mesRaw) && (mesRaw === actual || mesRaw === anterior) ? mesRaw : actual;
  const lote = await prepararLoteDelEstudio(gate.estudioTenantId, mes);
  const resumen = resumirLote(lote.renglones);
  const arcaEncendido = isInvoicingEnabled();
  const bordes = bordesDelMes(mes);

  return (
    <PageContainer>
      <PageHeader
        title={`Lote de ${etiquetaDelMes(mes)}`}
        description="Los abonos de toda tu cartera para el mes. Revisá la lista y emití todo de una vez: lo que ya se emitió no se repite."
      />
      <nav aria-label="Mes del lote" className="mb-4 flex flex-wrap gap-2">
        <ButtonLink href="/contador" variant="ghost" className="min-h-11">Volver a la cartera</ButtonLink>
        <ButtonLink href={`/contador/lote?mes=${anterior}`} variant={mes === anterior ? "solid" : "outline"} className="min-h-11" aria-current={mes === anterior ? "page" : undefined}>
          {etiquetaDelMes(anterior)}
        </ButtonLink>
        <ButtonLink href={`/contador/lote?mes=${actual}`} variant={mes === actual ? "solid" : "outline"} className="min-h-11" aria-current={mes === actual ? "page" : undefined}>
          {etiquetaDelMes(actual)}
        </ButtonLink>
        <ButtonLink href="/contador/abonos" variant="outline" className="min-h-11">Cargar o cambiar abonos</ButtonLink>
        <ButtonLink href={`/contador/exportar?mes=${mes}`} variant="outline" className="min-h-11">Bajar el mes de toda la cartera (CSV)</ButtonLink>
      </nav>

      {!arcaEncendido && (
        <Franja tono="atencion" className="mb-4">
          La facturación con ARCA está apagada en esta plataforma: lo que emitas queda pendiente de autorizar hasta que Soporte GSG la encienda.
        </Franja>
      )}
      {lote.sinLeer.length > 0 && (
        <Franja tono="peligro" className="mb-4">
          No se pudo leer a {lote.sinLeer.join(", ")}: sus abonos quedan frenados hasta que vuelvas a cargar la página.
        </Franja>
      )}

      <Bloque id="lote-resumen" titulo="Para emitir" cuenta={`${fmtNumberAR(resumen.paraEmitir)} comprobantes`} className="mb-6">
        <div className="flex flex-wrap items-center gap-4 py-4">
          <p className="text-sm text-muted">
            Total <Plata valor={resumen.importeParaEmitir} /> · {fmtNumberAR(resumen.yaEmitidas)} ya emitidos · {fmtNumberAR(resumen.bloqueadas)} frenados
          </p>
          <EmitirLote mes={mes} cantidad={resumen.paraEmitir} />
        </div>
      </Bloque>

      <Bloque id="lote-detalle" titulo="Abonos del mes" cuenta={lote.renglones.length} className="mb-8">
        {lote.renglones.length === 0 ? (
          <p className="py-4 text-sm text-muted">
            No hay abonos para {etiquetaDelMes(mes)}. Cargalos en <Link className="underline" href="/contador/abonos">Abonos</Link>.
          </p>
        ) : (
          <ul>
            {lote.renglones.map((r) => (
              <Renglon
                key={r.regla.id}
                as="li"
                folio={ESTADO[r.estado]}
                titulo={<span className="break-words">{r.alias} · {r.regla.descripcion}</span>}
                detalle={<span className="break-words">a {r.regla.receptorNombre}{r.motivo ? ` · ${r.motivo}` : ""}</span>}
                plata={<Plata valor={r.regla.importe} />}
              />
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque id="lote-cae" titulo={`Estado ante ARCA de ${etiquetaDelMes(mes)}, por cliente`} nota="Todos los comprobantes del mes, no sólo los abonos">
        <ul>
          {lote.clientes.map((c) => (
            <Renglon
              key={c.clienteTenantId}
              as="li"
              titulo={<Link className="underline" href={`/contador/cliente/${encodeURIComponent(c.clienteTenantId)}/comprobantes?desde=${bordes.primerDia}&hasta=${bordes.ultimoDia}`}>{c.alias}</Link>}
              detalle={
                c.cae
                  ? `${fmtNumberAR(c.cae.autorizados)} autorizados · ${fmtNumberAR(c.cae.pendientes)} pendientes · ${fmtNumberAR(c.cae.rechazados)} rechazados`
                  : "No se pudo leer"
              }
              folio={c.cae && c.cae.rechazados > 0 ? "Con rechazos" : c.cae && c.cae.pendientes > 0 ? "Pendientes" : c.cae ? "Al día" : "—"}
            />
          ))}
        </ul>
      </Bloque>

      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</footer>
    </PageContainer>
  );
}
