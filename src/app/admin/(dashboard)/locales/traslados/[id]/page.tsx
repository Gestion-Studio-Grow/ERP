import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { remitoAction } from "@/lib/multilocal/multilocal-actions";
import { LEYENDA_REMITO, htmlDelRemito, textoCantidad } from "@/lib/multilocal/traslado-core";
import { fmtDateTimeAr } from "@/lib/datetime";
import { AvisoError, Card, PageContainer, PageHeader, buttonClasses, fmtCuit } from "@/components/ui";
import { NoEsCasa } from "../../partes";
import { ImprimirRemito } from "./ImprimirRemito";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { Bloque } from "@/components/ui";

export const dynamic = "force-dynamic";

// REMITO INTERNO de un traslado: lo que salió, de dónde, adónde, cuándo y quién lo cargó, con
// lugar para las firmas de quien entrega y quien recibe. NO es un documento fiscal ni reemplaza
// al remito o al COT para circular (la leyenda lo dice arriba y abajo). Si MAGRA necesita COT o
// remito cárnico entre el obrador y los locales: PROVISIONAL, A CONFIRMAR con su contadora.
//
// El remito se busca por su clave en la casa y en los locales de SU red (remitoAction): una
// clave de otra red da "no existe", igual que una inventada.

export default async function RemitoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("traslados");
  const casa = await exigirCasa("traslados:manage");
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title="Remito interno" />
        <NoEsCasa error={casa.error} noSeLeyo={casa.noSeLeyo} />
      </PageContainer>
    );
  }
  const { id } = await params;
  const r = await remitoAction(id);
  const volver = (
    <Link href="/admin/locales/traslados" className={buttonClasses("outline", "md")}>
      Volver a traslados
    </Link>
  );
  if (!r.ok) {
    return (
      <PageContainer>
        <PageHeader title="Remito interno" />
        <AvisoError titulo="No se encontró el remito" comoSeguir={r.error} accion={volver} />
      </PageContainer>
    );
  }
  const t = r.remito;
  const cuando = fmtDateTimeAr(new Date(t.fecha));

  // DISEÑO NUEVO («Renglón»): el remito como hoja, de dónde a dónde en una línea y lo que viajó
  // con la cantidad a la derecha. Mismos datos, misma impresión.
  if (await disenoNuevo()) {
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-3xl px-4 py-6">
        <header data-ui="page-header" className="mb-4">
          <p className="text-[13px] text-muted">
            <Link href="/admin/locales/traslados" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
              Traslados entre locales
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-strong">{`Remito interno ${t.codigo}`}</h1>
          <p className="mt-1 text-sm text-muted">{cuando}</p>
        </header>
        <Bloque titulo={`${t.origen.nombre} → ${t.destino.nombre}`} className="mb-4">
          <p className="pt-2 text-[13px] text-muted break-words">
            {`Sale de ${t.origen.nombre} (CUIT ${fmtCuit(t.origen.cuit)}) y va a ${t.destino.nombre} (CUIT ${fmtCuit(t.destino.cuit)}).`}
          </p>
          <ul aria-label="Lo que se trasladó" className="mt-2">
            {t.lineas.map((l) => (
              <li key={`${l.nombre}-${l.saleUnit}`} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5">
                <span className="min-w-0 text-strong break-words">{l.nombre}</span>
                <span className="shrink-0 font-semibold tabular-nums text-strong">{textoCantidad(l.cantidad, l.saleUnit, l.unidad)}</span>
              </li>
            ))}
          </ul>
          {t.nota && <p className="pt-2 text-sm text-body break-words">{`Nota: ${t.nota}`}</p>}
          <p className="pt-2 text-[13px] text-muted">
            {`Cargado por ${t.por || "la casa"}${t.casa ? ` (${t.casa})` : ""}. Salió del stock de ${t.origen.nombre} y entró en el de ${t.destino.nombre} en el mismo momento.`}
          </p>
          <p className="pt-1 text-[13px] text-muted">{LEYENDA_REMITO}</p>
        </Bloque>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ImprimirRemito html={htmlDelRemito(t, cuando)} />
        </div>
      </main>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={`Remito interno ${t.codigo}`} description={LEYENDA_REMITO} />
      <Card className="mb-lg space-y-4">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Fecha</dt>
            <dd className="text-strong">{cuando}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Sale de</dt>
            <dd className="text-strong break-words">{t.origen.nombre}</dd>
            <dd className="text-xs text-muted">CUIT {fmtCuit(t.origen.cuit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Va a</dt>
            <dd className="text-strong break-words">{t.destino.nombre}</dd>
            <dd className="text-xs text-muted">CUIT {fmtCuit(t.destino.cuit)}</dd>
          </div>
        </dl>
        <ul className="divide-y divide-line border-y border-line" aria-label="Lo que se trasladó">
          {t.lineas.map((l) => (
            <li key={`${l.nombre}-${l.saleUnit}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <span className="text-strong break-words">{l.nombre}</span>
              <span className="tabular-nums text-strong">{textoCantidad(l.cantidad, l.saleUnit, l.unidad)}</span>
            </li>
          ))}
        </ul>
        {t.nota && <p className="text-sm text-body">Nota: {t.nota}</p>}
        <p className="text-xs text-muted">
          Cargado por {t.por || "la casa"}
          {t.casa ? ` (${t.casa})` : ""}. Salió del stock de {t.origen.nombre} y entró en el de {t.destino.nombre} en el mismo momento.
        </p>
      </Card>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ImprimirRemito html={htmlDelRemito(t, cuando)} />
        {volver}
      </div>
    </PageContainer>
  );
}
