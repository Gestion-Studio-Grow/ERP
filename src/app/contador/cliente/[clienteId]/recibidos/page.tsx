// Compras del cliente (comprobantes recibidos), dentro del panel del estudio.
// Carga del archivo de ARCA + las compras con factura del mes, con el IVA por alícuota y el
// listado exportable. El estudio y el permiso salen de la sesión (accesoAClienteDeCartera).

import { tenantTransaction } from "@/lib/rls";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { esMesKey } from "@/lib/libros/fecha-fiscal";
import { MES_DEMASIADO_GRANDE, accesoAClienteDeCartera, leerComprasConFactura } from "@/lib/contador/recibidos-db";
import { esNotaDeCreditoRecibida, resumirRecibidos, rotuloRecibido } from "@/lib/contador/recibidos-formato";
import { ButtonLink, Franja, PageContainer, PageHeader, Plata, Renglon, Seccion, fmtCuit } from "@/components/ui";
import ImportarRecibidos from "./ImportarRecibidos";

/** El mes anterior al de hoy en Argentina (UTC−3): lo que la contadora cierra. */
function mesAnterior(ahora: Date): string {
  const ar = new Date(ahora.getTime() - 3 * 3600_000);
  const d = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function correrMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Renglones que se dibujan; el resumen y el archivo cuentan TODOS los del mes. */
const EN_PANTALLA = 500;

const fechaAr = (f: string) => `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;

export default async function RecibidosDelCliente({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { clienteId } = await params;
  const { mes: mesRaw } = await searchParams;
  const mes = esMesKey(mesRaw) ? mesRaw : mesAnterior(new Date());
  const acceso = await accesoAClienteDeCartera(clienteId, false);
  if (!acceso.ok) {
    return (
      <PageContainer>
        <PageHeader title="Compras del cliente" />
        <Franja tono="peligro">{acceso.error}</Franja>
        <ButtonLink href="/contador" variant="outline" className="mt-4 min-h-11">Volver a la cartera</ButtonLink>
      </PageContainer>
    );
  }
  const { compras, completa } = await tenantTransaction((tx) => leerComprasConFactura(tx, acceso.cliente.id, mes), {
    tenantId: acceso.cliente.id,
  });
  const resumen = resumirRecibidos(compras);
  const enPantalla = compras.slice(0, EN_PANTALLA);
  const base = `/contador/cliente/${encodeURIComponent(acceso.cliente.id)}/recibidos`;

  return (
    <PageContainer>
      <PageHeader
        title={`Compras de ${acceso.cliente.alias}`}
        description={`Comprobantes recibidos · CUIT ${fmtCuit(acceso.cliente.cuit)}. El mes va por la fecha del comprobante, no por el día en que se cargó.`}
      />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Mes">
        <ButtonLink href={`${base}?mes=${correrMes(mes, -1)}`} variant="outline" className="min-h-11">Mes anterior</ButtonLink>
        <span className="flex min-h-11 items-center px-2 font-medium">{mes.split("-").reverse().join("/")}</span>
        <ButtonLink href={`${base}?mes=${correrMes(mes, 1)}`} variant="outline" className="min-h-11">Mes siguiente</ButtonLink>
        <ButtonLink href={`${base}/csv?mes=${mes}`} variant="outline" className="min-h-11">Descargar para el libro de IVA compras</ButtonLink>
        <ButtonLink href="/contador" variant="ghost" className="min-h-11">Volver a la cartera</ButtonLink>
      </nav>

      <ImportarRecibidos clienteId={acceso.cliente.id} />

      {!completa && <Franja tono="peligro">{MES_DEMASIADO_GRANDE}</Franja>}

      {completa && <Seccion titulo="Resumen del mes" nota={`${resumen.cantidad} comprobantes${resumen.notasDeCredito ? `, ${resumen.notasDeCredito} notas de crédito (restan)` : ""}.`}>
        <Renglon titulo="Neto gravado" plata={<Plata valor={resumen.neto} />} />
        {resumen.ivaPorAlicuota.map((a) => (
          <Renglon key={a.alicuotaId} titulo={`IVA crédito fiscal ${a.etiqueta}`} detalle={<>sobre <Plata valor={a.base} /></>} plata={<Plata valor={a.importe} />} />
        ))}
        {resumen.ivaSinAlicuota !== 0 && (
          <Renglon titulo="IVA a revisar (sin alícuota)" plata={<Plata valor={resumen.ivaSinAlicuota} tono="peligro" />} />
        )}
        <Renglon titulo="No gravado y exento" plata={<Plata valor={sumarAlCentavo([resumen.noGravado, resumen.exento])} />} />
        <Renglon titulo="Otros tributos y percepciones" plata={<Plata valor={resumen.otrosTributos} />} />
        <Renglon titulo="Total" plata={<Plata valor={resumen.total} />} />
      </Seccion>}

      <Seccion
        titulo="Comprobantes del mes"
        nota={
          completa && compras.length > EN_PANTALLA
            ? `Se muestran ${EN_PANTALLA} de ${compras.length}. El resumen de arriba y el archivo para el libro de IVA compras los cuentan todos.`
            : undefined
        }
      >
        {compras.length === 0 ? (
          <p className="text-sm">Todavía no hay compras con factura en este mes. Cargá el archivo de ARCA arriba.</p>
        ) : (
          <ul>
            {enPantalla.map((c) => (
              <Renglon
                as="li"
                key={c.id}
                folio={fechaAr(c.fecha)}
                titulo={`${rotuloRecibido(c)} · ${c.emisor}`}
                detalle={c.aRevisar ? `A revisar: ${c.aRevisar}` : `CUIT ${fmtCuit(c.cuitEmisor)}${c.iva ? "" : " · sin crédito fiscal"}`}
                plata={<Plata valor={esNotaDeCreditoRecibida(c.tipo) ? -c.total : c.total} tono={c.aRevisar ? "peligro" : undefined} />}
              />
            ))}
          </ul>
        )}
      </Seccion>
    </PageContainer>
  );
}
