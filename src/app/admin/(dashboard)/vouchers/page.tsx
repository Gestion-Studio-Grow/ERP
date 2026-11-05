import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import { todayInBusinessTz } from "@/lib/datetime";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { listarVouchers } from "@/lib/vouchers/voucher-actions";
import type { FilaVoucher } from "@/lib/vouchers/voucher-repo";
import { AvisoError, EmptyState, Input, Marca, PageHeader, Plata, Select, Seccion, buttonClasses, atributosBoton } from "@/components/ui";
import { opcionesDeVouchers, type OpcionDeFiltro } from "./opciones.server";
import {
  ESTADOS_ERP,
  ETIQUETA_ESTADO_ERP,
  etiquetaEstadoErp,
  etiquetaOpenKey,
  faltaLaBaja,
  fechaCorta,
  hayFiltros,
  leerFiltrosDeUrl,
  queryDeFiltros,
  resumirListado,
  sinLiquidar,
  type FiltrosDeUrl,
} from "./vouchers-pantalla";
import { CargarLote } from "./CargarLote";
import { ImportarCsv } from "./ImportarCsv";

export const dynamic = "force-dynamic";

// VOUCHERS DE LA ALAMEDA (CH Estética · docs/tenants/ch/VOUCHERS-OPENKEY.md).
//
// El reporte con el NÚMERO a la vista (lo que CH le manda a La Alameda), los filtros en la URL
// (fecha de uso, lote, vecino, estado, número), el CSV con las mismas columnas y filtros, y las
// tres herramientas: cargar un lote, importar la foto de OpenKey e importar su liquidación.
// Guardia: `requireApp("vouchers")` (rol) + interruptor «vouchers» del negocio: apagado, 404 (no
// existe para ese negocio). La tabla ausente (migración sin aplicar, Gate 2) = «falta un paso de
// base de datos», sin 500.

const ROTULO = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";
const TITULO = "Vouchers de La Alameda";

export default async function VouchersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireApp("vouchers");
  if (!vouchersPrendidos(await interruptoresDelNegocio())) notFound();
  const { filtros, avisos } = leerFiltrosDeUrl(await searchParams);
  const opciones = await opcionesDeVouchers(await getCurrentTenantId());

  if (opciones.faltaMigracion) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title={TITULO} />
        <AvisoError
          tono="aviso"
          titulo="Falta un paso de base de datos"
          comoSeguir="Los vouchers necesitan un paso de base de datos que todavía no se aplicó. Lo aplica el dueño; cuando esté, esta pantalla se enciende sola."
        />
      </main>
    );
  }

  const listado = await listarVouchers(filtros);
  const filas = listado.ok ? listado.valor : [];
  const resumen = resumirListado(filas);
  const puedeCargar = roleHasCapability(user.role, "clients:manage");
  const query = queryDeFiltros(filtros);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={TITULO}
        description="Cada voucher con su número, a quién se le dio, en qué turno se usó, si ya se dio de baja en OpenKey y si OpenKey ya lo pagó."
        estado={[
          `${resumen.total} ${resumen.total === 1 ? "voucher" : "vouchers"}`,
          resumen.usados > 0 ? (
            <span key="c">
              {resumen.usados} {resumen.usados === 1 ? "usado" : "usados"} por <Plata valor={resumen.cubierto} sinCentavos={Number.isInteger(resumen.cubierto)} />
            </span>
          ) : null,
          resumen.faltanBaja > 0 ? <strong key="b">{resumen.faltanBaja} sin baja en OpenKey</strong> : null,
          resumen.sinLiquidar > 0 ? `${resumen.sinLiquidar} sin liquidar` : null,
        ]}
        actions={
          <a href={`/admin/vouchers/export${query}`} download className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
            Exportar CSV
          </a>
        }
      />

      {!opciones.enumListo && (
        <AvisoError
          className="mb-6"
          tono="aviso"
          titulo="Cobrar con voucher todavía no está habilitado"
          comoSeguir="Falta un paso de base de datos para cobrar turnos con voucher (lo aplica el dueño). Mientras tanto podés cargar lotes e importar OpenKey; los turnos se cobran con otro medio."
        />
      )}

      <Filtros filtros={filtros} lotes={opciones.lotes} vecinos={opciones.vecinos} />

      {avisos.length > 0 && (
        <p role="status" className="mb-4 text-sm text-muted">
          {avisos.join(" ")}
        </p>
      )}

      {!listado.ok ? (
        <AvisoError className="mb-6" titulo="No se pudo mostrar el listado" comoSeguir={listado.error} />
      ) : filas.length === 0 ? (
        <EmptyState
          title={hayFiltros(filtros) ? "No hay vouchers con esos filtros" : "Todavía no hay vouchers cargados"}
          description={hayFiltros(filtros) ? "Probá con otras fechas o sacá algún filtro." : "Cargá el primer lote abajo, o importá la exportación de OpenKey."}
        />
      ) : (
        <TablaDeVouchers filas={filas} />
      )}

      {puedeCargar && (
        <div className="mt-8 space-y-6">
          <Herramienta titulo="Cargar un lote" id="cargar-lote">
            <CargarLote hoy={todayInBusinessTz()} />
          </Herramienta>
          <Herramienta titulo="Importar la foto de OpenKey" id="importar-foto">
            <ImportarCsv tipo="foto" />
          </Herramienta>
          <Herramienta titulo="Importar la liquidación de OpenKey" id="importar-liquidacion">
            <ImportarCsv tipo="liquidacion" />
          </Herramienta>
        </div>
      )}
    </main>
  );
}

/** Una herramienta plegada: se abre con clic, Enter o Espacio (details/summary nativo). */
function Herramienta({ titulo, id, children }: { titulo: string; id: string; children: React.ReactNode }) {
  return (
    <details id={id} className="group rounded-md border border-line px-4 py-2">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-strong focus-visible:outline-2 focus-visible:outline-offset-2">
        {titulo}
        <span aria-hidden className="text-muted group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

function Filtros({ filtros, lotes, vecinos }: { filtros: FiltrosDeUrl; lotes: OpcionDeFiltro[]; vecinos: OpcionDeFiltro[] }) {
  return (
    <Seccion titulo="Filtrar" className="mb-6">
      <form method="get" action="/admin/vouchers" className="grid gap-3 pt-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <label htmlFor="f-numero" className={ROTULO}>
            Número
          </label>
          <Input id="f-numero" name="numero" type="search" defaultValue={filtros.numero ?? ""} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="f-desde" className={ROTULO}>
            Usado desde
          </label>
          <Input id="f-desde" name="desde" type="date" defaultValue={filtros.desde ?? ""} />
        </div>
        <div>
          <label htmlFor="f-hasta" className={ROTULO}>
            Usado hasta
          </label>
          <Input id="f-hasta" name="hasta" type="date" defaultValue={filtros.hasta ?? ""} />
        </div>
        <div>
          <label htmlFor="f-lote" className={ROTULO}>
            Lote
          </label>
          <Select id="f-lote" name="loteId" defaultValue={filtros.loteId ?? ""}>
            <option value="">Todos</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="f-vecino" className={ROTULO}>
            Vecino
          </label>
          <Select id="f-vecino" name="clientId" defaultValue={filtros.clientId ?? ""}>
            <option value="">Todos</option>
            {vecinos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="f-estado" className={ROTULO}>
            Estado
          </label>
          <Select id="f-estado" name="estado" defaultValue={filtros.estado ?? ""}>
            <option value="">Todos</option>
            {ESTADOS_ERP.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_ERP[e]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3 lg:col-span-6">
          <button type="submit" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
            Filtrar
          </button>
          {hayFiltros(filtros) && (
            <Link href="/admin/vouchers" className="inline-flex min-h-11 items-center text-sm text-accent-ink hover:underline">
              Sacar los filtros
            </Link>
          )}
        </div>
      </form>
    </Seccion>
  );
}

const TH = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const TD = "whitespace-nowrap px-3 py-2";

function TablaDeVouchers({ filas }: { filas: FilaVoucher[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line" role="region" aria-label="Listado de vouchers" tabIndex={0}>
      <table className="w-full text-sm">
        <caption className="sr-only">Vouchers con su número, lote, vecino, turno, uso, valor y estado en el ERP y en OpenKey</caption>
        <thead className="border-b border-line-strong bg-surface-raised">
          <tr>
            <th scope="col" className={`${TH} sticky left-0 bg-surface-raised`}>
              Número
            </th>
            <th scope="col" className={TH}>
              Lote
            </th>
            <th scope="col" className={TH}>
              Vecino
            </th>
            <th scope="col" className={TH}>
              Turno
            </th>
            <th scope="col" className={TH}>
              Fecha de uso
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Valor
            </th>
            <th scope="col" className={TH}>
              Estado ERP
            </th>
            <th scope="col" className={TH}>
              Estado OpenKey
            </th>
            <th scope="col" className={TH}>
              Baja OpenKey
            </th>
            <th scope="col" className={TH}>
              Liquidado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((f) => (
            <tr key={f.id}>
              <th scope="row" className={`${TD} sticky left-0 bg-surface text-left font-mono text-base font-semibold text-strong`}>
                {f.numero}
              </th>
              <td className={TD}>{f.lote}</td>
              <td className={TD}>{f.cliente}</td>
              <td className={`${TD} tabular-nums`}>{fechaCorta(f.turno)}</td>
              <td className={`${TD} tabular-nums`}>{fechaCorta(f.usadoEn)}</td>
              <td className={`${TD} text-right`}>{f.valorCubierto == null ? "—" : <Plata valor={f.valorCubierto} sinCentavos={Number.isInteger(f.valorCubierto)} />}</td>
              <td className={TD}>
                <Marca tipo={f.estado === "USADO" ? "hecho" : f.estado === "ANULADO" ? "anulado" : "info"}>{etiquetaEstadoErp(f.estado)}</Marca>
              </td>
              <td className={TD}>{etiquetaOpenKey(f.estadoOpenKey)}</td>
              <td className={`${TD} tabular-nums`}>{faltaLaBaja(f) ? <Marca tipo="atencion">Falta la baja</Marca> : fechaCorta(f.bajaOpenKeyEn)}</td>
              <td className={`${TD} tabular-nums`}>
                {f.liquidadoEn ? (
                  <>
                    {fechaCorta(f.liquidadoEn)}
                    {f.montoLiquidado != null && (
                      <span className="ml-1 text-muted">
                        (<Plata valor={f.montoLiquidado} sinCentavos={Number.isInteger(f.montoLiquidado)} />)
                      </span>
                    )}
                  </>
                ) : sinLiquidar(f) ? (
                  <Marca tipo="pendiente">Sin liquidar</Marca>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
