// Comprobantes de UN cliente de la cartera, desde el panel del estudio: estado ante ARCA de cada
// uno (CAE, pendiente o rechazado), qué hacer con cada rechazo y el botón para mandar los
// pendientes. El acceso (sesión, módulo y que el cliente sea de SU cartera) lo decide
// `accesoAClienteDeCartera`; la lectura es la misma de Facturación (lista.server.ts), con la
// transacción del CLIENTE (RLS con su GUC).

import Link from "next/link";
import { tenantTransaction } from "@/lib/rls";
import { todayInBusinessTz } from "@/lib/datetime";
import { accesoAClienteDeCartera } from "@/lib/contador/recibidos-db";
import { paginaDeComprobantesEn } from "@/lib/facturacion/lista.server";
import { ESTADOS, TIPOS, esNotaDeCreditoTipo, leerFiltros, nombreDeTipo, nombreDelReceptor, urlDeLista } from "@/lib/facturacion/lista-core";
import { ButtonLink, Franja, PageContainer, PageHeader, Plata, Renglon, Seccion, fmtCuit, fmtNumberAR } from "@/components/ui";
import { explicarRechazo, QUIEN_TEXTO } from "../../../rechazo-core";
import ReintentarEnvios from "./ReintentarEnvios";
import AnularFactura from "./AnularFactura";

export const dynamic = "force-dynamic";
// Next 16 (route segment config): el tope de la página vale para sus Server Actions. «Mandar los pendientes a ARCA» y la nota de crédito hablan con ARCA de a tandas:
// 60 s es el máximo del plan de Vercel de hoy. Si una cartera grande lo pasa, el lote se corta
// sin duplicar nada (origen ABONO) y se vuelve a tocar: retoma lo que falta.
export const maxDuration = 60;

const fechaAr = (f: string) => (f.length === 8 ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : f);
const ESTADO_TEXTO = { AUTHORIZED: "Autorizado", PENDING: "Pendiente", REJECTED: "Rechazado" } as const;

export default async function ComprobantesDelCliente({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clienteId } = await params;
  const sp = await searchParams;
  const acceso = await accesoAClienteDeCartera(clienteId, false);
  if (!acceso.ok) {
    return (
      <PageContainer>
        <PageHeader title="Comprobantes del cliente" />
        <Franja tono="peligro">{acceso.error}</Franja>
        <ButtonLink href="/contador" variant="outline" className="mt-4 min-h-11">Volver a la cartera</ButtonLink>
      </PageContainer>
    );
  }
  const cliente = acceso.cliente;
  const filtros = leerFiltros(sp, todayInBusinessTz());
  const pagina = await tenantTransaction((tx) => paginaDeComprobantesEn(tx, cliente.id, filtros), { tenantId: cliente.id });
  const base = `/contador/cliente/${encodeURIComponent(cliente.id)}/comprobantes`;
  const t = pagina.totales.porEstado;
  const periodo = filtros.desde && filtros.hasta ? `del ${fechaAr(filtros.desde.replace(/-/g, ""))} al ${fechaAr(filtros.hasta.replace(/-/g, ""))}` : "de todos los meses";

  return (
    <PageContainer>
      <PageHeader
        title={`Comprobantes de ${cliente.alias}`}
        description={`CUIT ${fmtCuit(cliente.cuit)} · ${periodo}. Lo que ARCA autorizó, lo que espera y lo que rechazó, con qué hacer en cada caso.`}
      />
      <nav aria-label="Filtros" className="mb-4 flex flex-wrap gap-2">
        <ButtonLink href="/contador" variant="ghost" className="min-h-11">Volver a la cartera</ButtonLink>
        {ESTADOS.map((e) => (
          <ButtonLink
            key={e.valor}
            href={urlDeLista(base, filtros, { estado: e.valor, pagina: 1 })}
            variant={filtros.estado === e.valor ? "solid" : "outline"}
            className="min-h-11"
            aria-current={filtros.estado === e.valor ? "page" : undefined}
          >
            {e.etiqueta}
          </ButtonLink>
        ))}
        <ButtonLink
          href={urlDeLista(base, filtros, { tipo: filtros.tipo === "NC" ? "todos" : "NC", pagina: 1 })}
          variant={filtros.tipo === "NC" ? "solid" : "outline"}
          className="min-h-11"
          aria-current={filtros.tipo === "NC" ? "page" : undefined}
        >
          {TIPOS.find((x) => x.valor === "NC")?.etiqueta}
        </ButtonLink>
      </nav>

      <Seccion titulo="Estado ante ARCA" nota={`${fmtNumberAR(pagina.totales.cantidad)} comprobantes`} className="mb-6">
        <Renglon titulo="Autorizados (con CAE)" detalle="Las notas de crédito restan." plata={<Plata valor={t.AUTHORIZED.importe} />} folio={fmtNumberAR(t.AUTHORIZED.cantidad)} />
        <Renglon titulo="Pendientes de autorizar" detalle="Todavía no son factura: no tienen número ni CAE." plata={<Plata valor={t.PENDING.importe} />} folio={fmtNumberAR(t.PENDING.cantidad)} />
        <Renglon titulo="Rechazados por ARCA" detalle="No son factura. Abajo, qué hacer con cada uno." plata={<Plata valor={t.REJECTED.importe} />} folio={fmtNumberAR(t.REJECTED.cantidad)} />
        <div className="py-4">
          <ReintentarEnvios clienteId={cliente.id} pendientes={t.PENDING.cantidad} />
        </div>
      </Seccion>

      <Franja className="mb-4">
        ¿Hay que anular una factura autorizada? Tocá «Anular» en su renglón: sale una nota de crédito asociada, por todo o por una parte. El sistema nunca deja anular más de lo facturado.
      </Franja>

      <Seccion titulo="Comprobantes" nota={`Página ${pagina.pagina} de ${pagina.paginas}`} nivel="h2">
        {pagina.renglones.length === 0 ? (
          <p className="py-4 text-sm text-muted">No hay comprobantes con este filtro.</p>
        ) : (
          <ul>
            {pagina.renglones.map((r) => {
              const rechazo = r.status === "REJECTED" ? explicarRechazo(r.rechazoMotivo) : null;
              const numero = r.numero !== null ? `${String(r.puntoVenta).padStart(4, "0")}-${String(r.numero).padStart(8, "0")}` : "";
              const anulable = r.status === "AUTHORIZED" && r.numero !== null && !esNotaDeCreditoTipo(r.tipoComprobante);
              return (
                <Renglon
                  key={r.id}
                  as="li"
                  folio={`${fechaAr(r.fecha)} · ${ESTADO_TEXTO[r.status]}`}
                  titulo={
                    <span className="break-words">
                      {nombreDeTipo(r.tipoComprobante)}
                      {numero ? ` ${numero}` : ""} · {nombreDelReceptor(r)}
                    </span>
                  }
                  detalle={
                    rechazo ? (
                      <span className="block break-words">
                        <strong className="text-strong">{rechazo.queQuiereDecir}</strong> {rechazo.queHacer} <em>({QUIEN_TEXTO[rechazo.quien]})</em>
                        <span className="block text-faint">Motivo de ARCA: {r.rechazoMotivo?.trim() || "sin motivo"}</span>
                      </span>
                    ) : r.cae ? (
                      `CAE ${r.cae}`
                    ) : (
                      "Esperando que ARCA lo autorice."
                    )
                  }
                  plata={<Plata valor={r.total} tono={r.status === "REJECTED" ? "peligro" : undefined} />}
                  tecla={anulable ? <AnularFactura clienteId={cliente.id} facturaId={r.id} numero={numero} /> : undefined}
                />
              );
            })}
          </ul>
        )}
      </Seccion>

      {pagina.paginas > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex flex-wrap gap-2">
          {pagina.pagina > 1 && (
            <Link className="underline min-h-11 inline-flex items-center" href={urlDeLista(base, filtros, { pagina: pagina.pagina - 1 })}>
              Anterior
            </Link>
          )}
          {pagina.pagina < pagina.paginas && (
            <Link className="underline min-h-11 inline-flex items-center" href={urlDeLista(base, filtros, { pagina: pagina.pagina + 1 })}>
              Siguiente
            </Link>
          )}
        </nav>
      )}
      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</footer>
    </PageContainer>
  );
}
