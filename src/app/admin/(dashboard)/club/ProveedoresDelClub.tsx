"use client";

// ============================================================================
// LOS PROVEEDORES DEL CLUB — lo que les debemos, su cuenta, pagarles y los remitos.
// ============================================================================
//
// Para el dueño: la lista con lo que le debemos a cada uno (los que deben, primero) y el total (el mismo número que
// «Le debemos a proveedores» del Tablero). Tocar uno abre su ficha al lado (o arriba, en el celular): pagar (efectivo
// —sale del cajón— o transferencia, con su PIN), la cuenta con el saldo corrido, sus remitos con lo que trajo cada
// uno y editar los datos. «+ Alta de proveedor» y «Registrar remito» abren lo suyo en el mismo lugar.
//
// Para recepción: sólo el remito (es lo único de proveedores que hace, como el vanilla). Lo que debemos y los pagos
// son del dueño: esconderlo no es seguridad, el motor lo vuelve a controlar (`verProveedores`, `pagarProveedor` +
// PIN). El pago no se deshace (lleva PIN, como el vanilla); lo demás, sí, los 6 s del aviso. Reglas:
// proveedores-core.ts.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { pinesDeEjemplo } from "./caja-core";
import { Campo, CampoPin, Opciones } from "./formulario-del-club";
import { operadorActual } from "./operador-del-club";
import {
  ETIQUETA_MEDIO_PROVEEDOR,
  MEDIOS_PROVEEDOR,
  armarFichaProveedor,
  armarProveedores,
  ejecutarProveedores,
  permisosProveedores,
  type AccionProveedores,
  type DesenlaceProveedores,
  type FilaProveedor,
  type MedioProveedor,
  type VistaFichaProveedor,
} from "./proveedores-core";
import { RegistrarRemito } from "./remito-del-club";
import type { PropsDeSolapa } from "./solapas-club";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";

const tarjeta = "flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";
const OPCIONES_MEDIO = MEDIOS_PROVEEDOR.map((m) => ({ valor: m, etiqueta: ETIQUETA_MEDIO_PROVEEDOR[m] }));

function useHacer(almacen: Almacen) {
  // El pago lleva PIN: no se deshace (como el vanilla). Alta y edición, sí.
  return useCallback(
    (a: AccionProveedores): DesenlaceProveedores => almacen.ejecutar((e, ahora, auth) => ejecutarProveedores(e, a, ahora, auth), { deshacible: a.tipo !== "pagar" }),
    [almacen],
  );
}

function useTituloConFoco() {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return titulo;
}

function FilaDelProveedor({ p, elegido, onAbrir }: { p: FilaProveedor; elegido: boolean; onAbrir: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        id={`proveedor-${p.id}`}
        aria-current={elegido || undefined}
        onClick={() => onAbrir(p.id)}
        className={cn(
          "flex min-h-11 w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          elegido ? "border-accent bg-accent-soft" : "border-line bg-surface-raised hover:border-line-strong",
        )}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-strong">{p.nombre}</span>
          <span className="block text-xs text-body">{[p.rubro, p.cuit ? `CUIT ${p.cuit}` : ""].filter(Boolean).join(" · ") || "Sin datos cargados"}</span>
        </span>
        <span className="shrink-0 tabular-nums">{p.deuda > 0 ? <span className="font-semibold text-strong">Le debemos {pesos(p.deuda)}</span> : <span className="text-body">Al día</span>}</span>
      </button>
    </li>
  );
}

function DatosDelProveedor({ titulo, valores, boton, onGuardar, children }: { titulo?: string; valores: { nombre: string; rubro: string; cuit: string; tel: string }; boton: string; onGuardar: (d: { nombre: string; rubro: string; cuit: string; tel: string }) => void; children?: React.ReactNode }) {
  const [d, setD] = useState(valores);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <form
      aria-label={titulo}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(d);
      }}
    >
      <Campo label="Nombre" value={d.nombre} onChange={set("nombre")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Campo label="Rubro (ej.: bebidas, cocina, insumos)" value={d.rubro} onChange={set("rubro")} />
        <Campo label="CUIT" inputMode="numeric" value={d.cuit} onChange={set("cuit")} />
        <Campo label="Teléfono" inputMode="tel" value={d.tel} onChange={set("tel")} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant={children ? "solid" : "outline"} size="md">
          {boton}
        </Button>
        {children}
      </div>
    </form>
  );
}

function PagarAlProveedor({ almacen, f, puedePagar, hacer }: { almacen: Almacen; f: VistaFichaProveedor; puedePagar: boolean; hacer: (a: AccionProveedores) => DesenlaceProveedores }) {
  const operador = useOperador(almacen);
  const quien = operador ? operador.usuario.nombre.split(" ")[0] : null;
  const [medio, setMedio] = useState<MedioProveedor>("transferencia");
  const [monto, setMonto] = useState(String(f.saldo));
  const [pin, setPin] = useState("");
  const id = `pagar-${f.id}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-md border border-line p-3">
      <h3 id={id} className="font-semibold text-strong">
        Pagar
      </h3>
      {puedePagar ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            hacer({ tipo: "pagar", proveedorId: f.id, medio, monto, pin });
            setPin("");
          }}
        >
          <Opciones leyenda="Cómo le pagamos" opciones={OPCIONES_MEDIO} valor={medio} onElegir={setMedio} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Campo label="Monto" inputMode="numeric" importe value={monto} onChange={(e) => setMonto(e.target.value)} />
            <CampoPin quien={quien} rol={operador?.usuario.rol} value={pin} onChange={setPin} />
          </div>
          <p className="text-sm text-body">El efectivo sale del cajón (queda en la caja del día); la transferencia queda anotada como egreso. Lleva tu PIN y queda a tu nombre.</p>
          <Button type="submit" variant="solid" size="md">
            Registrar pago
          </Button>
          {almacen.modo() === "demo" && (
            <details className="text-sm text-body">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">¿Probando la demo? Ver los PIN de ejemplo</summary>
              <p className="tabular-nums">{pinesDeEjemplo(almacen.estado())}. Son de ejemplo, sólo de la demo.</p>
            </details>
          )}
        </form>
      ) : (
        <p className="text-sm text-body">Pagarle a un proveedor es de los dueños, con su PIN.</p>
      )}
    </section>
  );
}

function CuentaConElProveedor({ f }: { f: VistaFichaProveedor }) {
  const id = `cuenta-${f.id}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-strong">
        Cuenta corriente <span className="tabular-nums">{f.saldo > 0 ? `Le debemos ${pesos(f.saldo)}` : "Al día"}</span>
      </h3>
      {f.movimientos.length === 0 ? (
        <p className="text-sm text-body">Sin movimientos todavía.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Cuenta con {f.nombre}: remitos (suman) y pagos (restan), del más viejo al más nuevo</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-body">
              <th scope="col" className="py-1 pr-2 font-medium">
                Concepto y cuándo
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">
                Importe
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {f.movimientos.map((m, i) => (
              <tr key={i} className="border-b border-line align-top last:border-b-0">
                {/* La fecha va debajo del concepto: en el celular, el número de remito entra sin cortarse. */}
                <td className="py-1.5 pr-2 break-words">
                  <span className="block text-strong">{m.concepto}</span>
                  <span className="block text-xs text-body">{m.cuando}</span>
                </td>
                <td className={cn("py-1.5 pr-2 text-right whitespace-nowrap", m.haber > 0 ? "text-success" : "text-strong")}>
                  {m.haber > 0 ? `− ${pesos(m.haber)}` : `+ ${pesos(m.debe)}`}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap text-strong">{pesos(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RemitosDelProveedor({ f }: { f: VistaFichaProveedor }) {
  const id = `remitos-${f.id}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-semibold text-strong">
        Remitos ({f.remitos.length})
      </h3>
      {f.remitos.length === 0 ? (
        <p className="text-sm text-body">Todavía no trajo nada.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {f.remitos.map((r) => (
            <li key={r.id}>
              <details className="rounded-md border border-line px-3 text-sm">
                <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-3 font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">
                  <span>Remito {r.numero}</span>
                  <span className="font-normal text-body tabular-nums">
                    {r.cuando} · {pesos(r.total)}
                  </span>
                </summary>
                <ul className="flex flex-col gap-0.5 pb-2 tabular-nums text-strong">
                  {r.lineas.map((l, i) => (
                    <li key={i}>
                      {l.cant} × {l.nombre} a {pesos(l.costo)} = {pesos(l.subtotal)}
                    </li>
                  ))}
                  <li className="text-body">Lo cargó {r.cargo}.</li>
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FichaDelProveedor({ almacen, proveedorId, puedePagar, onCerrar }: { almacen: Almacen; proveedorId: string; puedePagar: boolean; onCerrar: () => void }) {
  const operador = useOperador(almacen);
  const seleccionar = useCallback((e: EstadoClub) => {
    const r = armarFichaProveedor(e, proveedorId, operador?.auth ?? {});
    return r === null || "motivo" in r ? null : r;
  }, [proveedorId, operador]);
  const f = useSeleccion(almacen, seleccionar, porFirma);
  const hacer = useHacer(almacen);
  const titulo = useTituloConFoco();
  if (!f) return null;
  const detalle = [f.rubro, f.cuit ? `CUIT ${f.cuit}` : "", f.tel].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby={`ficha-proveedor-${f.id}`} className={tarjeta} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`ficha-proveedor-${f.id}`} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            {f.nombre}
          </h2>
          {detalle && <p className="text-sm text-body">{detalle}</p>}
          <p className="text-sm font-semibold text-strong tabular-nums">{f.saldo > 0 ? `Le debemos ${pesos(f.saldo)}` : "No le debemos nada."}</p>
        </div>
        <Button variant="ghost" size="md" onClick={onCerrar}>
          Cerrar
        </Button>
      </header>
      {/* `key`: el pago arranca con el saldo de ahora cada vez que cambia. */}
      {f.saldo > 0 && <PagarAlProveedor key={f.saldo} almacen={almacen} f={f} puedePagar={puedePagar} hacer={hacer} />}
      <CuentaConElProveedor f={f} />
      <RemitosDelProveedor f={f} />
      <details className="rounded-md border border-line px-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">Editar datos</summary>
        <div className="pb-3">
          <DatosDelProveedor
            key={`${f.nombre}|${f.rubro}|${f.cuit}|${f.tel}`}
            titulo={`Datos de ${f.nombre}`}
            valores={{ nombre: f.nombre, rubro: f.rubro, cuit: f.cuit, tel: f.tel }}
            boton="Guardar datos"
            onGuardar={(d) => hacer({ tipo: "editar", proveedorId: f.id, ...d })}
          />
        </div>
      </details>
    </section>
  );
}

function AltaDeProveedor({ almacen, onListo, onCerrar }: { almacen: Almacen; onListo: (id: string) => void; onCerrar: () => void }) {
  const hacer = useHacer(almacen);
  const titulo = useTituloConFoco();
  return (
    <section aria-labelledby="club-alta-proveedor" className={tarjeta} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <h2 id="club-alta-proveedor" ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        Alta de proveedor
      </h2>
      <DatosDelProveedor
        valores={{ nombre: "", rubro: "", cuit: "", tel: "" }}
        boton="Dar de alta"
        onGuardar={(d) => {
          const r = hacer({ tipo: "alta", ...d });
          if (r.ok && r.proveedorId) onListo(r.proveedorId);
        }}
      >
        <Button variant="outline" size="md" onClick={onCerrar}>
          Cancelar
        </Button>
      </DatosDelProveedor>
    </section>
  );
}

/** Recepción: sólo el remito. */
function RemitoDeRecepcion({ almacen, puedeRemito }: { almacen: Almacen; puedeRemito: boolean }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-strong">Proveedores</h2>
        <p className="text-sm text-body">Desde recepción se cargan los remitos. Pagarles a los proveedores y ver lo que les debemos es de los dueños, con su PIN.</p>
      </div>
      {puedeRemito ? <RegistrarRemito almacen={almacen} enfocar={false} /> : <p className="text-sm text-body">Todavía no entró nadie a operar: para cargar un remito, entrá con tu PIN.</p>}
    </div>
  );
}

type Panel = { tipo: "ficha"; id: string } | { tipo: "alta" } | { tipo: "remito" } | null;
const seleccionarLista = (e: EstadoClub) => armarProveedores(e);

export default function ProveedoresDelClub({ almacen }: PropsDeSolapa) {
  useOperador(almacen); // repinta si cambia quién opera (PIN)
  const permisos = permisosProveedores(almacen.estado(), operadorActual(almacen).usuario?.id);
  const v = useSeleccion(almacen, seleccionarLista, porFirma);
  const [panel, setPanel] = useState<Panel>(null);
  const listaId = useId();
  const abierto = panel?.tipo === "ficha" ? panel.id : null;

  const soltar = useCallback(() => {
    const volver = panel?.tipo === "ficha" ? `proveedor-${panel.id}` : panel?.tipo === "remito" ? "club-prov-remito" : "club-alta-proveedor-boton";
    setPanel(null);
    requestAnimationFrame(() => (document.getElementById(volver) ?? document.getElementById(listaId))?.focus());
  }, [panel, listaId]);
  const cerrar = useCallback(() => {
    almacen.olvidarDeshacer();
    soltar();
  }, [almacen, soltar]);

  if (!permisos.ver) return <RemitoDeRecepcion almacen={almacen} puedeRemito={permisos.remito} />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section aria-labelledby="club-proveedores" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 data-pantalla id="club-proveedores" className="text-lg font-semibold text-strong">
              Proveedores ({v.filas.length})
            </h2>
            <p className="text-sm text-strong tabular-nums">Le debemos en total {pesos(v.deudaTotal)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button id="club-prov-remito" variant="outline" size="md" onClick={() => setPanel({ tipo: "remito" })}>
              Registrar remito
            </Button>
            <Button id="club-alta-proveedor-boton" variant="solid" size="md" onClick={() => setPanel({ tipo: "alta" })}>
              + Alta de proveedor
            </Button>
          </div>
        </div>
        {v.filas.length === 0 ? (
          <p id={listaId} tabIndex={-1} className="text-sm text-body">
            Todavía no hay proveedores. Dalos de alta para cargarles remitos.
          </p>
        ) : (
          <ul id={listaId} tabIndex={-1} aria-label="Proveedores del club" className="flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-focus">
            {v.filas.map((p) => (
              <FilaDelProveedor key={p.id} p={p} elegido={p.id === abierto} onAbrir={(id) => setPanel({ tipo: "ficha", id })} />
            ))}
          </ul>
        )}
        <p className="text-sm text-body">Recepción carga los remitos desde la Caja. Pagarles y ver su cuenta es de los dueños, con PIN.</p>
      </section>

      {/* En el celular lo abierto va ARRIBA de la lista; en la PC, al lado. */}
      <div className="order-first lg:order-none lg:sticky lg:top-4 lg:self-start">
        {panel?.tipo === "ficha" ? (
          <FichaDelProveedor key={panel.id} almacen={almacen} proveedorId={panel.id} puedePagar={permisos.pagar} onCerrar={cerrar} />
        ) : panel?.tipo === "alta" ? (
          <AltaDeProveedor almacen={almacen} onListo={(id) => setPanel({ tipo: "ficha", id })} onCerrar={cerrar} />
        ) : panel?.tipo === "remito" ? (
          <RegistrarRemito almacen={almacen} onListo={soltar} onCerrar={cerrar} />
        ) : (
          <p className="hidden rounded-lg border border-dashed border-line-strong p-4 text-sm text-body lg:block">
            Tocá un proveedor para ver su cuenta, pagarle o ver sus remitos.
          </p>
        )}
      </div>
    </div>
  );
}
