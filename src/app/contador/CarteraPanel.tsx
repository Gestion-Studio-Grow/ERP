"use client";

// Cartera del contador: tabla de clientes + panel de detalle pegajoso con las
// acciones (emitir automáticas, bajar el paquete del mes, abrir backoffice,
// pausar/reactivar, baja).
// Client component solo por la selección de fila y los estados de las acciones;
// los datos vienen resueltos del server (page.tsx) y las mutaciones son Server
// Actions con su propio gate (capability + pertenencia a la cartera).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Bloque,
  Button,
  Franja,
  Marca,
  MenuMas,
  Plata,
  Renglon,
  buttonClasses,
  fmtCuit,
  fmtMoneyARS,
  fmtNumberAR,
} from "@/components/ui";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { fmtDateTimeAr } from "@/lib/datetime";
import { UMBRAL_ALERTA_CAP, type EstadoCartera, type FilaCartera } from "@/lib/cartera-core";
import { emitirAutomaticasClienteAction, setEstadoCarteraAction } from "@/lib/cartera-actions";
import { fechaCorta, type CierreMesCliente } from "@/lib/cierre-mes/cierre-mes";
import { nombreDelMes } from "@/lib/libros/fecha-fiscal";

/**
 * Mini barra de objetivo (facturas automáticas del mes vs el límite del plan) para la celda
 * de la tabla. El límite es una regla comercial del producto, no la categoría del
 * monotributo: por eso nunca se dice "tope".
 */
function GoalMini({ usado, limite }: { usado: number; limite: number }) {
  const pct = limite > 0 ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
  const color = pct >= 100 ? "bg-danger-fill" : pct >= UMBRAL_ALERTA_CAP * 100 ? "bg-warning-fill" : "bg-accent";
  return (
    <span className="block min-w-28">
      <span className="tabular-nums text-strong">
        {fmtNumberAR(usado)}
        <span className="text-muted"> / {fmtNumberAR(limite)}</span>
      </span>
      <span
        role="progressbar"
        aria-valuenow={usado}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-label={`Facturas automáticas del mes: ${usado} de un límite del plan de ${limite}`}
        className="mt-1 block h-1 overflow-hidden rounded-full bg-bar-track"
      >
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** El link de descarga del paquete del mes de un cliente (lo arma /contador/paquete). */
function hrefPaquete(clienteTenantId: string, mes: string): string {
  return `/contador/paquete?cliente=${encodeURIComponent(clienteTenantId)}&mes=${encodeURIComponent(mes)}`;
}

/** El cierre del mes anterior del cliente, en una celda: congelado o abierto, y el paquete. */
function CierreCelda({ cierre }: { cierre: CierreMesCliente | null | undefined }) {
  if (!cierre) return <span className="text-muted">—</span>;
  return (
    <span className="block min-w-36">
      {cierre.congelado ? (
        <Badge tone="success" dot>
          Cerrado{cierre.congeladoEl ? ` el ${fechaCorta(new Date(cierre.congeladoEl))}` : ""}
        </Badge>
      ) : (
        <Badge tone="warning" dot>Sin cerrar</Badge>
      )}
      <span className="mt-1 block text-xs text-muted">
        {cierre.paquete
          ? `Paquete bajado por ${cierre.paquete.por} el ${fechaCorta(new Date(cierre.paquete.el))}`
          : "Nadie bajó el paquete"}
      </span>
    </span>
  );
}

/**
 * Diseño nuevo: una cifra del cliente elegido, título y aclaración a la izquierda y el número a la
 * derecha (sin la columna de folio de `Renglon`, que acá quedaría vacía).
 */
function Cifra({ titulo, detalle, valor }: { titulo: string; detalle?: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2">
      <span className="min-w-0">
        <span className="block text-strong">{titulo}</span>
        {detalle && <span className="block text-[13px] text-muted">{detalle}</span>}
      </span>
      <span className="shrink-0 tabular-nums text-strong">{valor}</span>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoCartera }) {
  if (estado === "activa") return <Badge tone="success" dot>Activo</Badge>;
  if (estado === "pausada") return <Badge tone="warning" dot>En pausa</Badge>;
  return <Badge tone="neutral" dot>De baja</Badge>;
}

export default function CarteraPanel({
  filas,
  baseDomain,
}: {
  filas: FilaCartera[];
  baseDomain: string | null;
}) {
  const router = useRouter();
  const nuevo = useDiseno();
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [confirmaBaja, setConfirmaBaja] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  const seleccion = useMemo(
    () => filas.find((f) => f.clienteTenantId === seleccionId) ?? null,
    [filas, seleccionId],
  );

  const seleccionar = (id: string) => {
    setSeleccionId((prev) => (prev === id ? null : id));
    setConfirmaBaja(false);
    setMensaje(null);
  };

  const correr = (fn: () => Promise<{ ok: boolean; textoOk: string; textoError?: string }>) => {
    setMensaje(null);
    startTransition(async () => {
      const r = await fn();
      setMensaje(
        r.ok
          ? { tono: "ok", texto: r.textoOk }
          : { tono: "error", texto: r.textoError ?? "No se pudo completar la acción." },
      );
      router.refresh();
    });
  };

  const emitir = (f: FilaCartera) =>
    correr(async () => {
      const r = await emitirAutomaticasClienteAction(f.clienteTenantId);
      if (!r.ok) return { ok: false, textoOk: "", textoError: r.error };
      const e = r.resultado;
      const partes = [`Se ${e.emitidas === 1 ? "emitió" : "emitieron"} ${fmtNumberAR(e.emitidas)} factura${e.emitidas === 1 ? "" : "s"} de ${f.alias}.`];
      if (e.mensaje) partes.push(e.mensaje);
      if (e.errores.length > 0) {
        partes.push(`${fmtNumberAR(e.errores.length)} propuesta${e.errores.length === 1 ? " falló y quedó" : "s fallaron y quedaron"} para reintentar.`);
      }
      return { ok: true, textoOk: partes.join(" ") };
    });

  const setEstado = (f: FilaCartera, estado: EstadoCartera, textoOk: string) =>
    correr(async () => {
      const r = await setEstadoCarteraAction(f.clienteTenantId, estado);
      if (!r.ok) return { ok: false, textoOk: "", textoError: r.error };
      if (estado === "baja") setSeleccionId(null);
      return { ok: true, textoOk };
    });

  const urlCliente = (f: FilaCartera, path: string): string | null =>
    f.subdomain && baseDomain ? `https://${f.subdomain}.${baseDomain}${path}` : null;

  // El mes de cierre es el mismo para toda la cartera (el anterior al de hoy).
  const mesCierre = filas.find((f) => f.cierreMes)?.cierreMes?.mes ?? null;

  // Diseño nuevo («Renglón»): la cartera como tabla densa (renglón de dos líneas en el celular),
  // sin tarjeta; el cliente elegido, como bloque de renglones con UNA tecla y «Más». Mismo estado,
  // mismas acciones y los mismos textos que la de siempre; cambia sólo la forma.
  if (nuevo) {
    const hayFiscal = filas.some((f) => f.validezFiscal);
    const rotuloPlata = hayFiscal ? "Facturado" : "Emitido en prueba";
    const totalPlata = filas.reduce((a, f) => a + f.montoFacturadoMes, 0);
    const totalFacturas = filas.reduce((a, f) => a + f.facturasMes, 0);
    const totalRevisar = filas.reduce((a, f) => a + f.pendientesRevision, 0);
    const marcaCierre = (c: CierreMesCliente | null | undefined) =>
      !c ? (
        <span className="text-muted">—</span>
      ) : c.congelado ? (
        <Marca tipo="hecho">Cerrado{c.congeladoEl ? ` el ${fechaCorta(new Date(c.congeladoEl))}` : ""}</Marca>
      ) : (
        <Marca tipo="atencion">Sin cerrar</Marca>
      );
    const marcaArca = (f: FilaCartera) =>
      !f.arcaConfigurado ? (
        <Marca tipo="pendiente">Sin CUIT</Marca>
      ) : f.arcaHomologacion ? (
        <Marca tipo="medias">Homologación</Marca>
      ) : (
        <Marca tipo="hecho">Producción</Marca>
      );
    const columnas: ColumnaTabla<FilaCartera>[] = [
      {
        clave: "cliente",
        titulo: "Cliente",
        movil: "asunto",
        celda: (f) => (
          <span className="block min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 font-medium text-strong">
              {f.alias}
              {f.estado !== "activa" && <Marca tipo={f.estado === "pausada" ? "atencion" : "anulado"}>{f.estado === "pausada" ? "En pausa" : "De baja"}</Marca>}
            </span>
            {f.cuit && <span className="block text-[13px] tabular-nums text-muted">{fmtCuit(f.cuit)}</span>}
          </span>
        ),
      },
      {
        clave: "plata",
        titulo: rotuloPlata,
        alinear: "derecha",
        movil: "plata",
        celda: (f) => (
          <span className="block">
            <Plata valor={f.montoFacturadoMes} sinCentavos />
            {hayFiscal && !f.validezFiscal && f.montoFacturadoMes > 0 && (
              <span className="block text-[12px] text-warning">en prueba</span>
            )}
          </span>
        ),
      },
      {
        clave: "facturas",
        titulo: "Facturas del mes",
        alinear: "derecha",
        movil: "oculta",
        celda: (f) => (
          <span className="block whitespace-nowrap tabular-nums">
            <span className="text-strong">{fmtNumberAR(f.facturasMes)}</span>
            <span className="text-muted"> / {fmtNumberAR(f.capFacturasMes)}</span>
            {f.pctCap >= UMBRAL_ALERTA_CAP && <span className="block text-[12px] text-danger">cerca del límite</span>}
          </span>
        ),
      },
      {
        clave: "revisar",
        titulo: "Para revisar",
        alinear: "derecha",
        movil: "oculta",
        celda: (f) =>
          f.pendientesRevision > 0 ? (
            <Marca tipo="atencion">{fmtNumberAR(f.pendientesRevision)}</Marca>
          ) : (
            <span className="tabular-nums text-muted">0</span>
          ),
      },
      {
        clave: "cierre",
        titulo: mesCierre ? nombreDelMes(mesCierre) : "Mes anterior",
        movil: "oculta",
        celda: (f) => marcaCierre(f.cierreMes),
      },
      { clave: "arca", titulo: "ARCA", movil: "oculta", celda: (f) => marcaArca(f) },
      {
        clave: "abrir",
        titulo: "",
        movil: "tecla",
        celda: (f) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              seleccionar(f.clienteTenantId);
            }}
            aria-expanded={f.clienteTenantId === seleccionId}
            aria-controls="cartera-cliente"
            className={buttonClasses("outline", "sm")}
            data-ui="button"
            data-variant="outline"
            data-size="sm"
          >
            {f.clienteTenantId === seleccionId ? "Cerrar" : "Abrir"}
          </button>
        ),
      },
      // Sólo en el celular (en la PC ya están sus columnas): lo que dice cada renglón de dos líneas.
      {
        clave: "resumen",
        titulo: "Resumen",
        movil: "detalle",
        className: "hidden",
        celda: (f) => (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular-nums">
              {fmtNumberAR(f.facturasMes)} / {fmtNumberAR(f.capFacturasMes)} facturas
            </span>
            {f.pendientesRevision > 0 && <Marca tipo="atencion">{fmtNumberAR(f.pendientesRevision)} para revisar</Marca>}
            {marcaCierre(f.cierreMes)}
          </span>
        ),
      },
    ];
    const linkImportar = seleccion ? urlCliente(seleccion, "/admin/facturacion/bancos") : null;
    const linkPanel = seleccion ? urlCliente(seleccion, "/admin") : null;

    return (
      <section aria-label="Cartera de clientes" className="mb-xl">
        <div aria-live="polite">
          {mensaje && (
            <Franja tono={mensaje.tono === "error" ? "peligro" : "info"} className="mb-3">
              <span role={mensaje.tono === "error" ? "alert" : undefined}>{mensaje.texto}</span>
            </Franja>
          )}
        </div>
        {filas.length === 0 ? (
          <Bloque id="cartera" titulo="La cartera">
            <Renglon
              titulo="Tu cartera está vacía."
              detalle="Agregá el primer cliente acá abajo: con el nombre, el CUIT y un email queda dado de alta y listo para facturar."
              tecla={
                <a href="#alta-cliente" className={buttonClasses("outline", "sm")} data-ui="button" data-variant="outline" data-size="sm">
                  Agregar
                </a>
              }
            />
          </Bloque>
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <Bloque
              id="cartera"
              titulo="La cartera este mes"
              cuenta={`${fmtNumberAR(filas.length)} ${filas.length === 1 ? "cliente" : "clientes"}`}
              nota={hayFiscal ? "Facturado: con CAE de ARCA, por la fecha del comprobante" : "Emitido en prueba: con CAE de prueba, todavía no es facturación"}
            >
              <Tabla
                titulo="Clientes de la cartera con su resumen fiscal del mes"
                filas={filas}
                clave={(f) => f.clienteTenantId}
                columnas={columnas}
                onAbrir={(f) => seleccionar(f.clienteTenantId)}
                teclado={false}
                cuenta={
                  <>
                    {rotuloPlata} en total <Plata valor={totalPlata} sinCentavos />
                  </>
                }
                pie={
                  <>
                    {fmtNumberAR(totalFacturas)} facturas · {fmtNumberAR(totalRevisar)} para revisar
                  </>
                }
              />
            </Bloque>

            <aside id="cartera-cliente" aria-label="Detalle del cliente elegido" className="xl:sticky xl:top-6 xl:self-start">
              {seleccion ? (
                <Bloque
                  id="cliente"
                  titulo={seleccion.alias}
                  cuenta={<span className="tabular-nums">{fmtCuit(seleccion.cuit)}</span>}
                  nota={
                    <button type="button" onClick={() => seleccionar(seleccion.clienteTenantId)} className="min-h-11 text-[13px] text-muted underline-offset-2 hover:underline sm:min-h-0">
                      Cerrar
                    </button>
                  }
                >
                  {seleccion.nombre !== seleccion.alias && <p className="pt-2 text-[13px] text-muted">{seleccion.nombre}</p>}
                  <Cifra
                    titulo={seleccion.validezFiscal ? "Facturado este mes" : "Emitido en prueba este mes"}
                    detalle={seleccion.validezFiscal ? "Con CAE de ARCA" : "Sin validez fiscal"}
                    valor={<Plata valor={seleccion.montoFacturadoMes} sinCentavos />}
                  />
                  <Cifra titulo="Facturas automáticas" detalle={`Límite del plan: ${fmtNumberAR(seleccion.capFacturasMes)} por mes`} valor={fmtNumberAR(seleccion.facturasMes)} />
                  <Cifra titulo="Para revisar" detalle="Ventas que necesitan datos del comprador" valor={fmtNumberAR(seleccion.pendientesRevision)} />
                  <Cifra titulo="Listas para emitir" detalle="Propuestas automáticas esperando un clic" valor={fmtNumberAR(seleccion.listasParaEmitir)} />
                  {seleccion.cierreMes && (
                    <Renglon
                      folio={marcaCierre(seleccion.cierreMes)}
                      titulo={`Cierre de ${nombreDelMes(seleccion.cierreMes.mes)}`}
                      detalle={
                        seleccion.cierreMes.paquete
                          ? `Paquete bajado por ${seleccion.cierreMes.paquete.por} el ${fechaCorta(new Date(seleccion.cierreMes.paquete.el))}`
                          : seleccion.cierreMes.congelado
                            ? "Nadie bajó el paquete todavía"
                            : "Sin congelar: el archivo es un borrador"
                      }
                      tecla={
                        <a
                          href={hrefPaquete(seleccion.clienteTenantId, seleccion.cierreMes.mes)}
                          download
                          className={buttonClasses("outline", "sm")}
                          data-ui="button"
                          data-variant="outline"
                          data-size="sm"
                        >
                          {seleccion.cierreMes.congelado ? "Bajar" : "Borrador"}
                        </a>
                      }
                    />
                  )}
                  <Renglon
                    folio={marcaArca(seleccion)}
                    titulo="Extractos"
                    detalle={
                      seleccion.ultimaImportacion
                        ? `Último: ${seleccion.ultimaImportacion.nombreArchivo} · ${fmtDateTimeAr(seleccion.ultimaImportacion.createdAt)}`
                        : linkImportar
                          ? "Sin extractos importados todavía"
                          : "Sin dirección propia todavía: no se puede importar"
                    }
                    tecla={
                      linkImportar ? (
                        <a href={linkImportar} target="_blank" rel="noreferrer" className={buttonClasses("outline", "sm")} data-ui="button" data-variant="outline" data-size="sm">
                          Importar
                        </a>
                      ) : null
                    }
                  />

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="md"
                      disabled={pendiente || seleccion.estado !== "activa" || seleccion.listasParaEmitir === 0}
                      onClick={() => emitir(seleccion)}
                    >
                      {pendiente ? "Emitiendo…" : `Emitir automáticas (${fmtNumberAR(seleccion.listasParaEmitir)})`}
                    </Button>
                    <MenuMas etiqueta={`Más sobre ${seleccion.alias}`}>
                      {linkPanel && (
                        <a href={linkPanel} target="_blank" rel="noreferrer">
                          Abrir su panel
                        </a>
                      )}
                      {seleccion.estado === "activa" ? (
                        <button type="button" disabled={pendiente} onClick={() => setEstado(seleccion, "pausada", `${seleccion.alias} quedó en pausa.`)}>
                          Pausar
                        </button>
                      ) : (
                        <button type="button" disabled={pendiente} onClick={() => setEstado(seleccion, "activa", `${seleccion.alias} volvió a estar activo.`)}>
                          Reactivar
                        </button>
                      )}
                      <button type="button" disabled={pendiente} onClick={() => setConfirmaBaja(true)}>
                        Dar de baja…
                      </button>
                    </MenuMas>
                    {seleccion.estado !== "activa" && <span className="text-[13px] text-muted">En pausa: reactivalo para emitir.</span>}
                  </div>
                  {confirmaBaja && (
                    <Franja tono="peligro" className="mt-3">
                      <span className="block">La baja saca a {seleccion.alias} de tu cartera; sus datos y facturas quedan intactos en su propio negocio.</span>
                      <span className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={pendiente}
                          onClick={() => setEstado(seleccion, "baja", `${seleccion.alias} salió de tu cartera. Sus datos no se borran.`)}
                        >
                          Confirmar la baja
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmaBaja(false)}>
                          Cancelar
                        </Button>
                      </span>
                    </Franja>
                  )}
                </Bloque>
              ) : (
                <p className="hidden text-[13px] text-muted xl:block">
                  Elegí un cliente de la tabla: acá aparecen sus cifras, el paquete del mes y las acciones (emitir, pausar, dar de baja).
                </p>
              )}
            </aside>
          </div>
        )}
      </section>
    );
  }

  if (filas.length === 0) {
    return (
      <section aria-label="Cartera de clientes" className="mb-xl">
        <div className="rounded-xl border border-line bg-surface-raised p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-strong">Tu cartera está vacía</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Agregá tu primer cliente acá abajo: con el nombre, el CUIT y un email queda dado de
            alta y listo para facturar.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Cartera de clientes" className="mb-xl">
      {/* Resultado de la última acción (para lector de pantalla también). */}
      <div aria-live="polite">
        {mensaje && (
          <div
            role={mensaje.tono === "error" ? "alert" : undefined}
            className={`mb-sm rounded-xl border px-4 py-3 text-sm ${
              mensaje.tono === "error"
                ? "border-danger/40 bg-danger-soft text-danger"
                : "border-success/40 bg-success-soft text-success"
            }`}
          >
            {mensaje.texto}
          </div>
        )}
      </div>

      {/* Master-detail unificado con ColaRevision (fixes 3/31): dos columnas
          recién desde xl (1280px) — en notebooks 13" iba apretado con lg. */}
      <div className="grid grid-cols-1 items-start gap-md xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Tabla */}
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised shadow-card">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Clientes de la cartera con su resumen fiscal del mes
            </caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-[11px] uppercase tracking-[.06em] text-muted">
                <th scope="col" className="px-[22px] py-2.5 font-semibold">Cliente</th>
                <th scope="col" className="px-[22px] py-2.5 text-right font-semibold">Facturado</th>
                <th scope="col" className="px-[22px] py-2.5 font-semibold">Facturas / límite del plan</th>
                <th scope="col" className="px-[22px] py-2.5 font-semibold">
                  {mesCierre ? `Cierre de ${nombreDelMes(mesCierre)}` : "Cierre del mes"}
                </th>
                <th scope="col" className="px-[22px] py-2.5 text-right font-semibold">A revisar</th>
                <th scope="col" className="px-[22px] py-2.5 font-semibold">Última importación</th>
                <th scope="col" className="px-[22px] py-2.5 font-semibold">ARCA</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const activaFila = f.clienteTenantId === seleccionId;
                const alerta = f.pctCap >= UMBRAL_ALERTA_CAP;
                return (
                  <tr
                    key={f.clienteTenantId}
                    onClick={() => seleccionar(f.clienteTenantId)}
                    className={`cursor-pointer border-b border-line last:border-b-0 transition-colors ${
                      activaFila
                        ? "bg-accent-soft shadow-[inset_2.5px_0_0_var(--accent)]"
                        : "hover:bg-surface-sunken"
                    } ${f.estado === "pausada" ? "opacity-60" : ""}`}
                  >
                    <td className="px-[22px] py-[13px]">
                      {/* Botón real dentro de la celda: la fila también responde al
                          clic, pero el teclado/lector navega por acá. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          seleccionar(f.clienteTenantId);
                        }}
                        aria-expanded={activaFila}
                        className="block min-h-11 w-full rounded-md text-left sm:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <span className="flex items-center gap-2 font-medium text-strong">
                          {f.alias}
                          {f.estado !== "activa" && <EstadoBadge estado={f.estado} />}
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-muted">
                          {fmtCuit(f.cuit)}
                        </span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-[22px] py-[13px] text-right tabular-nums text-strong">
                      {fmtMoneyARS(f.montoFacturadoMes)}
                      {/* Con CAE de prueba no es facturación: se dice en la misma celda. */}
                      {!f.validezFiscal && f.montoFacturadoMes > 0 && (
                        <span className="mt-0.5 block text-xs font-normal text-warning">
                          en prueba, sin validez fiscal
                        </span>
                      )}
                    </td>
                    <td className="px-[22px] py-[13px]">
                      <GoalMini usado={f.facturasMes} limite={f.capFacturasMes} />
                      {alerta && (
                        <span className="mt-1 block text-xs font-medium text-danger">
                          Cerca del límite del plan
                        </span>
                      )}
                    </td>
                    <td className="px-[22px] py-[13px]">
                      <CierreCelda cierre={f.cierreMes} />
                    </td>
                    <td className="px-[22px] py-[13px] text-right">
                      {f.pendientesRevision > 0 ? (
                        <Badge tone="warning" dot>{fmtNumberAR(f.pendientesRevision)}</Badge>
                      ) : (
                        <span className="tabular-nums text-muted">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-[22px] py-[13px] text-muted">
                      {f.ultimaImportacion ? (
                        <>
                          <span className="block max-w-40 truncate text-strong">
                            {f.ultimaImportacion.nombreArchivo}
                          </span>
                          <span className="text-xs tabular-nums">
                            {fmtDateTimeAr(f.ultimaImportacion.createdAt)}
                          </span>
                        </>
                      ) : (
                        "Sin extractos"
                      )}
                    </td>
                    <td className="px-[22px] py-[13px]">
                      {f.arcaConfigurado ? (
                        // Homologación = warning (mismo criterio que ArcaPill, fix 22):
                        // es un ambiente de prueba, no un estado informativo.
                        <Badge tone={f.arcaHomologacion ? "warning" : "success"} dot>
                          {f.arcaHomologacion ? "Homologación" : "Producción"}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>Sin CUIT</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Panel de detalle pegajoso */}
        <aside className="xl:sticky xl:top-6 xl:self-start" aria-label="Detalle del cliente seleccionado">
          {seleccion ? (
            <div className="rounded-xl border border-line bg-surface-raised p-5 shadow-card">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-strong">{seleccion.alias}</h2>
              <p className="mt-0.5 text-sm text-muted">
                {seleccion.nombre} · <span className="tabular-nums">{fmtCuit(seleccion.cuit)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">
                    {seleccion.validezFiscal ? "Facturado con validez fiscal" : "Emitido en prueba (sin validez fiscal)"}
                  </dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtMoneyARS(seleccion.montoFacturadoMes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Facturas automáticas / límite del plan</dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtNumberAR(seleccion.facturasMes)} / {fmtNumberAR(seleccion.capFacturasMes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Pendientes de revisión</dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtNumberAR(seleccion.pendientesRevision)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Listas para emitir</dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtNumberAR(seleccion.listasParaEmitir)}
                  </dd>
                </div>
              </dl>

              {seleccion.cierreMes && (
                <div className="mt-4 rounded-lg border border-line p-3 text-sm">
                  <p className="text-xs text-muted">Cierre de {nombreDelMes(seleccion.cierreMes.mes)}</p>
                  <div className="mt-1">
                    <CierreCelda cierre={seleccion.cierreMes} />
                  </div>
                  {/* <a> y no un botón con fetch: es una descarga, y cada una queda en la
                      auditoría del cliente como "descargado por". */}
                  <a
                    href={hrefPaquete(seleccion.clienteTenantId, seleccion.cierreMes.mes)}
                    download
                    className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-md border border-line-strong bg-surface-raised px-3 text-sm font-medium text-strong transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {seleccion.cierreMes.congelado
                      ? `Descargar el paquete de ${nombreDelMes(seleccion.cierreMes.mes)}`
                      : `Bajar un borrador de ${nombreDelMes(seleccion.cierreMes.mes)}`}
                  </a>
                  {!seleccion.cierreMes.congelado && (
                    <p className="mt-1 text-xs text-muted">
                      El negocio todavía no congeló el mes: el archivo dice que es borrador y puede cambiar.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  size="md"
                  disabled={pendiente || seleccion.estado !== "activa" || seleccion.listasParaEmitir === 0}
                  onClick={() => emitir(seleccion)}
                >
                  {pendiente
                    ? "Emitiendo…"
                    : `Emitir automáticas (${fmtNumberAR(seleccion.listasParaEmitir)})`}
                </Button>
                {seleccion.estado !== "activa" && (
                  <p className="text-xs text-muted">
                    El cliente está en pausa: reactivalo para emitir.
                  </p>
                )}

                {urlCliente(seleccion, "/admin/facturacion/bancos") ? (
                  <a
                    href={urlCliente(seleccion, "/admin/facturacion/bancos")!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-surface-raised px-3 text-sm font-medium text-strong transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Importar extracto (su backoffice)
                  </a>
                ) : (
                  <p className="text-xs text-muted">
                    Este cliente todavía no tiene URL propia: los extractos se importan desde su
                    backoffice cuando el dueño le asigne una.
                  </p>
                )}
                {urlCliente(seleccion, "/admin") && (
                  <a
                    href={urlCliente(seleccion, "/admin")!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-md px-3 text-sm font-medium text-body transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Abrir su backoffice
                  </a>
                )}

                <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-3">
                  {seleccion.estado === "activa" ? (
                    <Button
                      size="md"
                      variant="subtle"
                      disabled={pendiente}
                      onClick={() => setEstado(seleccion, "pausada", `${seleccion.alias} quedó en pausa.`)}
                    >
                      Pausar
                    </Button>
                  ) : (
                    <Button
                      size="md"
                      variant="subtle"
                      disabled={pendiente}
                      onClick={() => setEstado(seleccion, "activa", `${seleccion.alias} volvió a estar activo.`)}
                    >
                      Reactivar
                    </Button>
                  )}
                  {confirmaBaja ? (
                    <>
                      <Button
                        size="md"
                        variant="danger"
                        disabled={pendiente}
                        onClick={() =>
                          setEstado(
                            seleccion,
                            "baja",
                            `${seleccion.alias} salió de tu cartera. Sus datos no se borran.`,
                          )
                        }
                      >
                        Confirmar baja
                      </Button>
                      <Button size="md" variant="ghost" onClick={() => setConfirmaBaja(false)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button size="md" variant="ghost" disabled={pendiente} onClick={() => setConfirmaBaja(true)}>
                      Dar de baja
                    </Button>
                  )}
                </div>
                {confirmaBaja && (
                  <p className="text-xs text-muted">
                    La baja saca al cliente de tu cartera; sus datos y facturas quedan intactos en su
                    propio negocio.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface-raised p-5 text-sm text-muted shadow-xs">
              Elegí un cliente de la tabla para ver el detalle y las acciones: emitir sus facturas
              automáticas, pausarlo o darlo de baja.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
