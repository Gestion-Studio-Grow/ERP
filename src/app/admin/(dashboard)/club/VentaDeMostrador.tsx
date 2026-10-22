"use client";

// ============================================================================
// VENDER EN EL MOSTRADOR — se carga, se cobra y se cierra en el acto, sin cuenta a nombre de nadie.
// ============================================================================
//
// Dos maneras de la misma venta (el `mostrador` del club vanilla, `venderEnMostrador` de buffet-mesa-core.ts):
//   · `HojaDeVender` (Tanda 2A, diseño §2.4 E y §3.7): la hoja GLOBAL que abre «Vender» de la barra o la tecla V desde
//     cualquier solapa (la monta ClubDemo.tsx). Arriba los 8 favoritos (favoritos-core.ts: los más vendidos de 7 días),
//     el lector siempre escuchando (vender-core.ts), el total grande y los 4 medios que COBRAN DE UNA (el medio va en
//     el comando, no queda elegido para la venta siguiente). Con efectivo, «Paga con» muestra el vuelto (montos-core).
//     «Pasar a la cuenta de…» manda el carrito a una cuenta abierta (comando «ventaACuenta»): no entra a la caja.
//     El carrito sobrevive a cerrar la hoja (se cerró sin querer: vuelve como estaba); se vacía si cambia quien opera.
//   · La venta rápida al fondo de Buffet (default export), como hasta la Tanda 1: buscar, − / +, cómo paga y «Cobrar».
// Lo de alquiler no se vende acá: va a la cuenta de un jugador. Toda acción es un COMANDO con nombre (comandos-core.ts).

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Hoja } from "@/components/ui/Hoja";
import { pesos, productoPorCodigo } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { VENTA_DESHACIBLE, armarCarrito, productosParaMostrador, sumarAlCarrito, type Carrito, type LineaDelCarrito } from "./buffet-mesa-core";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";
import { favoritosDelMostrador } from "./favoritos-core";
import { vueltoDe } from "./montos-core";
import { AvisosDelClub, ComoPaga } from "./piezas";
import { crearLector, cuentasParaPasar } from "./vender-core";
import "./piel/vender.css";

const VACIO: Carrito = {};

/** Las líneas del carrito: nombre, − cantidad +, importe y (en la hoja) «Sacar». */
function LineasDelCarrito({ lineas, onSumar, onSacar }: { lineas: LineaDelCarrito[]; onSumar: (id: string, delta: number) => void; onSacar?: (l: LineaDelCarrito) => void }) {
  return (
    <ul aria-label="Lo que lleva" data-vender="lineas" className="flex flex-col gap-1 text-sm tabular-nums">
      {lineas.map((l) => (
        <li key={l.id} data-vender="linea" className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate">{l.nombre}</span>
          <span className="flex items-center gap-1">
            <Button variant="outline" size="md" className="w-11 px-0!" aria-label={`Uno menos de ${l.nombre}`} onClick={() => onSumar(l.id, -1)}>
              −
            </Button>
            <span className="w-6 text-center font-semibold" aria-label={`${l.cant} de ${l.nombre}`}>
              {l.cant}
            </span>
            <Button variant="outline" size="md" className="w-11 px-0!" aria-label={`Uno más de ${l.nombre}`} onClick={() => onSumar(l.id, 1)}>
              +
            </Button>
          </span>
          <span className="w-20 text-right">{pesos(l.importe)}</span>
          {onSacar && (
            <Button variant="ghost" size="md" className="w-11 px-0!" aria-label={`Sacar ${l.nombre}`} onClick={() => onSacar(l)}>
              <span aria-hidden="true">✕</span>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function VentaDeMostrador({ almacen }: { almacen: Almacen }) {
  const [carrito, setCarrito] = useState<Carrito>(VACIO);
  const [texto, setTexto] = useState("");
  const [medio, setMedio] = useState<MedioCaja>("efectivo");
  const id = useId();
  const estado = almacen.estado();
  const { porCodigo, productos } = productosParaMostrador(estado, texto);
  const { lineas, total } = armarCarrito(estado, carrito);
  const sumar = (productoId: string, delta: number) => setCarrito((c) => sumarAlCarrito(c, productoId, delta));
  const elegir = (productoId: string) => {
    sumar(productoId, 1);
    setTexto("");
  };
  return (
    <section aria-labelledby={`${id}-t`} data-buffet="mostrador" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3">
      <div>
        <h2 id={`${id}-t`} className="font-semibold text-strong">
          Venta rápida de mostrador
        </h2>
        <p className="text-sm text-muted">Se cobra en el acto. Para dejarlo a nombre de alguien, abrí una cuenta.</p>
      </div>
      <Field label="Código o producto (pasá el lector o escribí)" htmlFor={id}>
        <Input
          id={id}
          value={texto}
          autoComplete="off"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && productos.length === 1 && (porCodigo || texto.trim())) {
              e.preventDefault();
              elegir(productos[0].id);
            }
          }}
          aria-describedby={`${id}-r`}
        />
      </Field>
      <p id={`${id}-r`} className="sr-only" aria-live="polite">
        {texto.trim() ? (productos.length ? `${productos.length} productos` : "No hay productos con eso") : ""}
      </p>
      {texto.trim() !== "" && (
        <ul aria-label="Productos para la venta" className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {productos.length === 0 && <li className="text-sm text-muted">No hay productos con eso.</li>}
          {productos.map((p) => (
            <li key={p.id}>
              <Button variant="ghost" size="md" className="w-full justify-between!" onClick={() => elegir(p.id)}>
                <span className="truncate">+ {p.nombre}</span>
                <span className="tabular-nums text-muted">
                  {pesos(p.precio)} · {p.stock}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {lineas.length > 0 ? <LineasDelCarrito lineas={lineas} onSumar={sumar} /> : <p className="text-sm text-muted">Buscá y sumá productos.</p>}
      {lineas.length > 0 && (
        <>
          <ComoPaga medio={medio} onElegir={(m) => m !== "monedero" && setMedio(m)} leyenda="Cómo paga la venta" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p data-buffet="total" className="text-lg font-bold tabular-nums text-strong">
              Total {pesos(total)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="md" onClick={() => setCarrito(VACIO)}>
                Vaciar
              </Button>
              <Button
                variant="solid"
                size="md"
                disabled={!(total > 0)}
                onClick={() => {
                  const d = almacen.comando("venta", [carrito, medio], { deshacible: VENTA_DESHACIBLE });
                  if (d.ok) setCarrito(VACIO);
                }}
              >
                Cobrar {pesos(total)}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default memo(VentaDeMostrador);

// ───────────── la hoja global «Vender» (tecla V) ─────────────

/** Cómo se lee cada medio en su botón (diseño §2.4 E: «Efectivo · MP · Transferencia · Débito»). */
const MEDIO_EN_EL_BOTON: Readonly<Record<MedioCaja, string>> = { efectivo: "Efectivo", mercadopago: "MP", transferencia: "Transferencia", debito: "Débito" };

type UltimaVenta = { texto: string };

/**
 * La hoja «Vender». `abierta` la controla ClubDemo (botón de la barra, tecla V, Escape, ✕ o tocar afuera). El carrito
 * vive acá (no en el cuerpo de la hoja): cerrar sin querer no pierde lo cargado. Cambiar de operador lo vacía.
 */
export function HojaDeVender({ almacen, abierta, onCerrar }: { almacen: Almacen; abierta: boolean; onCerrar: () => void }) {
  const [carrito, setCarrito] = useState<Carrito>(VACIO);
  const [ultima, setUltima] = useState<UltimaVenta | null>(null);
  useEffect(
    () =>
      almacen.suscribirOperador(() => {
        setCarrito(VACIO);
        setUltima(null);
      }),
    [almacen],
  );
  if (!abierta) return null;
  return <VenderAbierta almacen={almacen} carrito={carrito} setCarrito={setCarrito} ultima={ultima} setUltima={setUltima} onCerrar={onCerrar} />;
}

function VenderAbierta({
  almacen,
  carrito,
  setCarrito,
  ultima,
  setUltima,
  onCerrar,
}: {
  almacen: Almacen;
  carrito: Carrito;
  setCarrito: React.Dispatch<React.SetStateAction<Carrito>>;
  ultima: UltimaVenta | null;
  setUltima: (u: UltimaVenta | null) => void;
  onCerrar: () => void;
}) {
  // Abierta, la hoja sigue al almacén (stock, precios, cuentas abiertas). Cerrada no existe: no repinta nada.
  const version = useSyncExternalStore(almacen.suscribir, almacen.version, almacen.version);
  const estado = almacen.estado();
  const ahora = almacen.ahora();
  const [texto, setTexto] = useState("");
  const [pagaCon, setPagaCon] = useState("");
  const [aCuenta, setACuenta] = useState(false);
  const id = useId();
  const cuerpo = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` es la clave: el estado cambia por dentro
  const favoritos = useMemo(() => favoritosDelMostrador(estado, ahora), [version, ahora]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cuentas = useMemo(() => cuentasParaPasar(estado), [version]);
  const { porCodigo, productos } = productosParaMostrador(estado, texto);
  const { lineas, total } = armarCarrito(estado, carrito);
  const vuelto = vueltoDe(total, pagaCon);
  const efectivoNoAlcanza = vuelto.estado === "falta" || vuelto.estado === "invalido";

  const enfocarBuscador = useCallback(() => requestAnimationFrame(() => document.getElementById(id)?.focus()), [id]);
  const sumar = useCallback((productoId: string, delta: number) => setCarrito((c) => sumarAlCarrito(c, productoId, delta)), [setCarrito]);

  /** Un código del lector (o tipeado): si es de un producto que se vende acá, +1; si no, se dice por qué. */
  const porElLector = useCallback(
    (codigo: string) => {
      const e = almacen.estado();
      const r = productoPorCodigo(e, codigo);
      if (!r.ok) return almacen.informar({ ok: false, mensaje: r.motivo });
      if (r.producto.alquiler) return almacen.informar({ ok: false, mensaje: `${r.producto.nombre} es de alquiler: va a la cuenta de un jugador desde su turno.` });
      if (!(r.producto.precio > 0)) return almacen.informar({ ok: false, mensaje: `${r.producto.nombre} no tiene precio cargado.` });
      setUltima(null);
      sumar(r.producto.id, 1);
    },
    [almacen, setUltima, sumar],
  );

  // Al abrir: el foco al buscador (después de que la hoja se abra con showModal) y, al cerrar, de vuelta a donde estaba.
  // Lo enfocado ANTES de abrir se toma en el render (los efectos corren después del showModal de la Hoja).
  const [previo] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    enfocarBuscador();
    return () => {
      requestAnimationFrame(() => {
        if ((!document.activeElement || document.activeElement === document.body) && previo?.isConnected) previo.focus();
      });
    };
  }, [enfocarBuscador, previo]);

  // El lector siempre escuchando: con el foco en cualquier lado de la hoja (un favorito, un − / +, un medio), la ráfaga
  // del lector se junta y su Enter da el código, sin apretar el botón enfocado. En un campo de texto manda el campo.
  useEffect(() => {
    const hoja = cuerpo.current?.closest("dialog");
    if (!hoja) return;
    const lector = crearLector();
    const alTeclear = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.matches("input, textarea, select") || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const codigo = lector.tecla(ev.key, ev.timeStamp);
      if (codigo) {
        ev.preventDefault();
        porElLector(codigo);
      }
    };
    hoja.addEventListener("keydown", alTeclear);
    return () => hoja.removeEventListener("keydown", alTeclear);
  }, [porElLector]);

  const listo = (d: { ok: boolean }, texto: string) => {
    if (!d.ok) return;
    setCarrito(VACIO);
    setPagaCon("");
    setACuenta(false);
    setUltima({ texto });
    enfocarBuscador();
  };
  const cobrar = (medio: MedioCaja) => {
    const conVuelto = medio === "efectivo" && vuelto.estado === "ok" ? ` · vuelto ${pesos(vuelto.vuelto)}` : "";
    const d = almacen.comando("venta", [carrito, medio], { deshacible: VENTA_DESHACIBLE });
    listo(d, `Última venta: ${pesos(total)} en ${ETIQUETA_MEDIO[medio]}${conVuelto}.`);
  };
  const pasar = (cuentaId: string, titular: string) => {
    const d = almacen.comando("ventaACuenta", [cuentaId, carrito], { deshacible: true });
    listo(d, `Última venta: ${pesos(total)} a la cuenta de ${titular}.`);
  };

  const pie =
    lineas.length > 0 ? (
      <div data-vender="pie" className="flex w-full flex-col gap-3 pb-4">
        <p className="flex items-baseline justify-between gap-3">
          <span data-vender="etiqueta" className="text-sm font-semibold uppercase text-muted">
            Total
          </span>
          <span data-vender="total" className="text-3xl font-bold tabular-nums text-strong">
            {pesos(total)}
          </span>
        </p>
        <div data-vender="paga-con" className="flex flex-wrap items-end gap-3">
          <Field label="Paga con (efectivo)" htmlFor={`${id}-paga`} className="w-40">
            <Input
              id={`${id}-paga`}
              importe
              inputMode="numeric"
              autoComplete="off"
              value={pagaCon}
              onChange={(e) => setPagaCon(e.target.value)}
              aria-describedby={`${id}-vuelto`}
              aria-invalid={efectivoNoAlcanza || undefined}
            />
          </Field>
          <div id={`${id}-vuelto`} className="min-h-11 flex-1 content-center text-sm tabular-nums">
            {vuelto.estado === "ok" && (
              <p data-vender="vuelto" aria-live="polite" className="text-base font-semibold text-strong">
                Vuelto {pesos(vuelto.vuelto)}
              </p>
            )}
            {vuelto.estado === "falta" && (
              <p role="alert" className="font-semibold text-danger">
                Con eso no alcanza: faltan {pesos(vuelto.falta)}.
              </p>
            )}
            {vuelto.estado === "invalido" && (
              <p role="alert" className="font-semibold text-danger">
                Escribí con cuánto paga, por ejemplo 10.000.
              </p>
            )}
          </div>
        </div>
        <div role="group" aria-label={`Cobrar ${pesos(total)} de una`} data-vender="medios" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MEDIOS_CAJA.map((m) => (
            <Button key={m} variant={m === "efectivo" ? "solid" : "outline"} size="lg" data-vender="medio" disabled={!(total > 0) || (m === "efectivo" && efectivoNoAlcanza)} onClick={() => cobrar(m)}>
              <span className="sr-only">Cobrar {pesos(total)} en </span>
              {MEDIO_EN_EL_BOTON[m]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="md" aria-expanded={aCuenta} aria-controls={`${id}-cuentas`} onClick={() => setACuenta((x) => !x)}>
            Pasar a la cuenta de… <span aria-hidden="true">▾</span>
          </Button>
          <Button variant="ghost" size="md" onClick={() => setCarrito(VACIO)}>
            Vaciar
          </Button>
        </div>
        {aCuenta && (
          <div id={`${id}-cuentas`} data-vender="cuentas">
            {cuentas.length === 0 ? (
              <p className="text-sm text-muted">No hay cuentas abiertas. Abrí una en Buffet (tecla C) y volvé.</p>
            ) : (
              <ul aria-label="Cuentas abiertas" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {cuentas.map((c) => (
                  <li key={c.id}>
                    <Button variant="outline" size="md" data-vender="cuenta" className="w-full justify-between!" onClick={() => pasar(c.id, c.titular)}>
                      <span className="truncate">
                        <span className="sr-only">Pasar {pesos(total)} a la cuenta de </span>
                        {c.titular}
                      </span>
                      <span className="tabular-nums text-muted">{c.debe > 0 ? `debe ${pesos(c.debe)}` : "en cero"}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    ) : null;

  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo="Vender"
      descripcion={
        <span data-vender="lector" className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" data-vender="punto" className="inline-block size-2 rounded-full bg-success" />
          Lector escuchando: pasá el código o tocá un favorito.
        </span>
      }
      pie={pie}
    >
      <div ref={cuerpo} data-vender="hoja" className="flex flex-col gap-4">
        <ul aria-label="Favoritos: lo más vendido de los últimos 7 días" data-vender="favoritos" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {favoritos.map((f) => (
            <li key={f.id}>
              <Button
                variant="outline"
                size="md"
                data-vender="favorito"
                className="h-auto! min-h-11 w-full flex-col items-start! gap-0! px-3! py-1.5 text-left"
                onClick={() => {
                  setUltima(null);
                  sumar(f.id, 1);
                }}
              >
                <span className="w-full truncate">
                  <span className="sr-only">Sumar </span>
                  {f.nombre}
                </span>
                <span className="tabular-nums text-muted">{pesos(f.precio)}</span>
              </Button>
            </li>
          ))}
        </ul>
        <Field label="Buscar o pasar el lector" htmlFor={id}>
          <Input
            id={id}
            value={texto}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !texto.trim()) return;
              e.preventDefault();
              if (productos.length === 1 && (porCodigo || texto.trim())) {
                setUltima(null);
                sumar(productos[0].id, 1);
                setTexto("");
              } else if (productos.length === 0) porElLector(texto);
            }}
            aria-describedby={`${id}-r`}
          />
        </Field>
        <p id={`${id}-r`} className="sr-only" aria-live="polite">
          {texto.trim() ? (productos.length ? `${productos.length} productos` : "No hay productos con eso") : ""}
        </p>
        {texto.trim() !== "" && (
          <ul aria-label="Productos para la venta" className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {productos.length === 0 && <li className="text-sm text-muted">No hay productos con eso.</li>}
            {productos.map((p) => (
              <li key={p.id}>
                <Button
                  variant="ghost"
                  size="md"
                  className="w-full justify-between!"
                  onClick={() => {
                    setUltima(null);
                    sumar(p.id, 1);
                    setTexto("");
                    enfocarBuscador();
                  }}
                >
                  <span className="truncate">+ {p.nombre}</span>
                  <span className="tabular-nums text-muted">
                    {pesos(p.precio)} · {p.stock}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {lineas.length > 0 ? (
          <LineasDelCarrito lineas={lineas} onSumar={sumar} onSacar={(l) => sumar(l.id, -l.cant)} />
        ) : (
          <p className="text-sm text-muted">{ultima ? ultima.texto : "Tocá un favorito o pasá el lector."}</p>
        )}
        {/* Con la hoja abierta lo de atrás queda inerte: el aviso (y su «Deshacer») se ve y se anuncia acá adentro. */}
        <AvisosDelClub almacen={almacen} />
      </div>
    </Hoja>
  );
}
