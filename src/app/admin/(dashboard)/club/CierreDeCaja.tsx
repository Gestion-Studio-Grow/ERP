"use client";

// ============================================================================
// EL TURNO DE CAJA — cierre a ciegas, firma, retiro a caja fuerte, egreso por categoría y cierre del día (Tanda B4).
// ============================================================================
//
// Cada turno (mañana / tarde / noche) cierra su parte de la caja en dos pasos, como un arqueo de verdad:
//   1. CONTAR A CIEGAS: quien opera cuenta los billetes por denominación y lo de cada medio SIN ver lo esperado. Al
//      confirmar, el turno queda sellado (lo que se cobre después es del turno siguiente).
//   2. FIRMAR: recién ahí se ve lo esperado y la diferencia; si no cuadra, el motivo es obligatorio; firma un PIN de 4
//      (D-16, provisional): recepción con PIN de 2 opera pero no firma.
// El cierre del día consolida los turnos firmados. Retiro a caja fuerte y egreso por categoría también llevan firma.
//
// Sin internet (C7): contar y firmar un turno que sólo tuvo efectivo va como siempre (queda en la cola del equipo y se
// re-aplica al volver). Si el turno tuvo Mercado Pago, transferencia o débito, la acción queda EN ESPERA en esta
// pantalla (la cinta de abajo lo dice) y se manda sola cuando vuelve la señal. La espera vive en la memoria de la
// pestaña: si se recarga, se vuelve a hacer.
//
// Las reglas son del motor y de caja-core.ts (caja-core.test.ts); acá sólo se piden los datos.

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { MEDIOS, pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Fecha } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { BILLETES, CATEGORIAS_EGRESO, MEDIOS_DEL_TURNO, armarTurno, cajaVaSinInternet, firmantes, leerMonto, type AccionCaja, type VistaTurno } from "./caja-core";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";

type Hacer = (a: AccionCaja) => boolean;

const resultado = (d: number) => (d === 0 ? "cuadra" : `${d > 0 ? "sobran" : "faltan"} ${pesos(Math.abs(d))}`);

/** Quién firma (vacío = quien opera) y su PIN: numérico, sin mostrarse, sin autocompletar. */
function Firma({ almacen, largo, firmaId, setFirmaId, pin, setPin }: { almacen: Almacen; largo: number; firmaId: string; setFirmaId: (x: string) => void; pin: string; setPin: (x: string) => void }) {
  const ids = { quien: useId(), pin: useId() };
  const operador = useOperador(almacen);
  const lista = useMemo(() => firmantes(almacen.estado()), [almacen]);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem] sm:items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.quien} className="text-sm font-medium text-strong">
          Firma
        </label>
        <Select id={ids.quien} value={firmaId} onChange={(e) => setFirmaId(e.target.value)}>
          <option value="">{operador ? `${operador.usuario.nombre} (quien opera)` : "Quien opera"}</option>
          {lista
            .filter((u) => u.id !== operador?.usuario.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
                {u.duenio ? " (dueño/a)" : ""}
              </option>
            ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.pin} className="text-sm font-medium text-strong">
          PIN de {largo} dígitos
        </label>
        <Input id={ids.pin} type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </div>
    </div>
  );
}

/** Paso 1: el conteo a ciegas (billetes por denominación, monedas y los otros medios). */
function ContarTurno({ v, dia, hacer }: { v: VistaTurno; dia: Fecha | null; hacer: Hacer }) {
  const [billetes, setBilletes] = useState<Record<string, string>>({});
  const [otros, setOtros] = useState<Record<string, string>>({});
  const id = useId();
  const efectivo = BILLETES.reduce((s, d) => s + d * (Number(billetes[String(d)]) || 0), 0) + (billetes.monedas?.trim() ? leerMonto(billetes.monedas) || 0 : 0);
  return (
    <form
      aria-labelledby={`${id}-t`}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const contado = Object.fromEntries(MEDIOS_DEL_TURNO.filter((k) => k !== "efectivo").map((k) => [k, otros[k] ?? ""]));
        if (hacer({ tipo: "contarTurno", dia, contado, billetes, movimientos: v.movimientos, medios: v.medios, numero: v.numero, huella: v.huella })) {
          setBilletes({});
          setOtros({});
        }
      }}
    >
      <h3 id={`${id}-t`} className="font-semibold text-strong">
        Turno {v.numero} · desde las {v.desde} · {v.movimientos} {v.movimientos === 1 ? "movimiento" : "movimientos"}
      </h3>
      <p className="text-sm text-body">Contá el cajón billete por billete. Lo que tendría que haber se ve recién al confirmar el conteo.</p>
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-medium text-strong">Billetes (cantidad)</legend>
        {BILLETES.map((d) => (
          <label key={d} className="flex flex-col gap-1 text-sm text-body">
            {pesos(d)}
            <Input inputMode="numeric" autoComplete="off" value={billetes[String(d)] ?? ""} onChange={(e) => setBilletes((b) => ({ ...b, [String(d)]: e.target.value.replace(/\D/g, "") }))} />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm text-body">
          Monedas ($)
          <Input inputMode="numeric" importe autoComplete="off" value={billetes.monedas ?? ""} onChange={(e) => setBilletes((b) => ({ ...b, monedas: e.target.value }))} />
        </label>
      </fieldset>
      <p className="text-sm font-semibold text-strong tabular-nums" aria-live="polite">
        Efectivo contado: {pesos(efectivo)}
      </p>
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium text-strong">Lo de los otros medios (de la app o el posnet; vacío = nada)</legend>
        {MEDIOS_DEL_TURNO.filter((k) => k !== "efectivo").map((k) => (
          <label key={k} className="flex flex-col gap-1 text-sm text-body">
            {MEDIOS[k]}
            <Input inputMode="numeric" importe autoComplete="off" value={otros[k] ?? ""} onChange={(e) => setOtros((o) => ({ ...o, [k]: e.target.value }))} />
          </label>
        ))}
      </fieldset>
      <Button type="submit" variant="solid" size="md">
        Confirmar el conteo
      </Button>
    </form>
  );
}

/** Paso 2: lo esperado a la vista, el motivo si no cuadra y la firma. */
function FirmarTurno({ almacen, v, hacer }: { almacen: Almacen; v: VistaTurno; hacer: Hacer }) {
  const p = v.paraFirmar!;
  const [motivo, setMotivo] = useState("");
  const [firmaId, setFirmaId] = useState("");
  const [pin, setPin] = useState("");
  const id = useId();
  return (
    <form
      aria-labelledby={`${id}-t`}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (hacer({ tipo: "cerrarTurno", turnoId: p.turnoId, motivo, firmaId: firmaId || null, pin, medios: p.medios })) setMotivo("");
        setPin("");
      }}
    >
      <h3 id={`${id}-t`} className="font-semibold text-strong">
        Turno {p.numero} de {p.responsable}, {p.desdeHasta}: <span className={cn(p.diferencia === 0 ? "text-success" : "text-danger")}>{resultado(p.diferencia)}</span>
      </h3>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="py-1 pr-2 font-medium">Medio</th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">Esperado</th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">Contado</th>
            <th scope="col" className="py-1 text-right font-medium">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {p.lineas.map((l) => (
            <tr key={l.clave} className="border-b border-line last:border-b-0">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-body">{l.medio}</th>
              <td className="py-1 pr-2 text-right">{pesos(l.esperado)}</td>
              <td className="py-1 pr-2 text-right">{pesos(l.contado)}</td>
              <td className={cn("py-1 text-right font-semibold", l.diferencia === 0 ? "text-success" : "text-danger")}>{resultado(l.diferencia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.billetes.length > 0 && <p className="text-xs text-muted">Billetes: {p.billetes.map((b) => (b.denominacion === "monedas" ? `monedas ${pesos(b.cantidad)}` : `${b.cantidad} × ${pesos(Number(b.denominacion))}`)).join(" · ")}</p>}
      <label className="flex flex-col gap-1 text-sm font-medium text-strong">
        {p.pideMotivo ? "Motivo de la diferencia (obligatorio)" : "Nota (opcional)"}
        <Textarea value={motivo} maxLength={200} rows={2} required={p.pideMotivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <Firma almacen={almacen} largo={v.largoFirma} firmaId={firmaId} setFirmaId={setFirmaId} pin={pin} setPin={setPin} />
      <Button type="submit" variant="solid" size="md">
        Firmar y cerrar el turno
      </Button>
    </form>
  );
}

/** Formulario chico con firma: retiro a caja fuerte, egreso por categoría, cierre del día. */
export function ConFirma({ almacen, largo, titulo, boton, children, alMandar }: { almacen: Almacen; largo: number; titulo: string; boton: string; children?: React.ReactNode; alMandar: (firmaId: string | null, pin: string) => boolean }) {
  const [firmaId, setFirmaId] = useState("");
  const [pin, setPin] = useState("");
  const id = useId();
  return (
    <form
      aria-labelledby={`${id}-t`}
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        alMandar(firmaId || null, pin);
        setPin("");
      }}
    >
      <h3 id={`${id}-t`} className="font-semibold text-strong">
        {titulo}
      </h3>
      {children}
      <Firma almacen={almacen} largo={largo} firmaId={firmaId} setFirmaId={setFirmaId} pin={pin} setPin={setPin} />
      <Button type="submit" variant="outline" size="md">
        {boton}
      </Button>
    </form>
  );
}

function Retiro({ almacen, largo, hacer }: { almacen: Almacen; largo: number; hacer: Hacer }) {
  const [monto, setMonto] = useState("");
  const [comprobante, setComprobante] = useState("");
  return (
    <ConFirma almacen={almacen} largo={largo} titulo="Retiro a caja fuerte" boton="Anotar el retiro" alMandar={(firmaId, pin) => {
      const ok = hacer({ tipo: "retiro", monto, comprobante, firmaId, pin });
      if (ok) { setMonto(""); setComprobante(""); }
      return ok;
    }}>
      <label className="flex flex-col gap-1 text-sm font-medium text-strong">
        Monto
        <Input inputMode="numeric" importe autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-strong">
        Comprobante (opcional)
        <Input autoComplete="off" maxLength={120} value={comprobante} placeholder="Ej.: sobre 14" onChange={(e) => setComprobante(e.target.value)} />
      </label>
    </ConFirma>
  );
}

function EgresoPorCategoria({ almacen, largo, hacer }: { almacen: Almacen; largo: number; hacer: Hacer }) {
  const [categoria, setCategoria] = useState("insumos");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [comprobante, setComprobante] = useState("");
  return (
    <ConFirma almacen={almacen} largo={largo} titulo="Egreso en efectivo" boton="Anotar el egreso" alMandar={(firmaId, pin) => {
      const ok = hacer({ tipo: "egresoCategoria", monto, categoria, concepto, comprobante, firmaId, pin });
      if (ok) { setMonto(""); setConcepto(""); setComprobante(""); }
      return ok;
    }}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-strong">
          Categoría
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {Object.entries(CATEGORIAS_EGRESO).map(([k, t]) => (
              <option key={k} value={k}>{t}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-strong">
          Monto
          <Input inputMode="numeric" importe autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-strong">
        Concepto {categoria === "otros" ? "(obligatorio en «Otros»)" : "(opcional)"}
        <Input autoComplete="off" maxLength={120} value={concepto} placeholder="Ej.: hielo, artículos de limpieza" onChange={(e) => setConcepto(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-strong">
        Comprobante (opcional)
        <Input autoComplete="off" maxLength={120} value={comprobante} placeholder="Ej.: factura B 0003-00012345" onChange={(e) => setComprobante(e.target.value)} />
      </label>
    </ConFirma>
  );
}

/** «Corregir medio» de un cobro del turno abierto (efectivo ↔ MP ↔ transferencia), con motivo: queda el rastro. */
export function CorregirMedio({ movimientoId, medio, hacer }: { movimientoId: string; medio: string; hacer: Hacer }) {
  const opciones = (["efectivo", "mercadopago", "transferencia"] as const).filter((m) => m !== medio);
  const [a, setA] = useState<string>(opciones[0]);
  const [motivo, setMotivo] = useState("");
  return (
    <details className="mt-1">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">Corregir medio</summary>
      <form
        className="flex flex-col gap-1 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (hacer({ tipo: "corregirMedio", movimientoId, medio: a, motivo })) setMotivo("");
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-body">
          Pasa a
          <Select value={a} onChange={(e) => setA(e.target.value)}>
            {opciones.map((m) => (
              <option key={m} value={m}>{MEDIOS[m]}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-body">
          Motivo
          <Input autoComplete="off" maxLength={200} value={motivo} required onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <Button type="submit" variant="outline" size="md">
          Corregir
        </Button>
      </form>
    </details>
  );
}

/** ¿Este puesto está sin internet? (Dos puestos y la subida falló, o el navegador dice que no hay red.) */
function estaSinInternet(almacen: Almacen): boolean {
  const s = almacen.sincro();
  return s.dosPuestos && (s.sinInternetDesde !== null || (typeof navigator !== "undefined" && navigator.onLine === false));
}
function useSinInternet(almacen: Almacen): boolean {
  useSyncExternalStore(almacen.suscribirSincro, almacen.sincro, almacen.sincro);
  return estaSinInternet(almacen);
}

/**
 * `dia`: el de una caja ATRASADA que se trabajó por turnos (CajasAtrasadas): se cuenta su turno abierto y se cierra ese
 * día. Sin `dia`, la caja abierta, con retiro y egreso.
 */
export default function CierreDeCaja({ almacen, hacer, dia = null }: { almacen: Almacen; hacer: Hacer; dia?: Fecha | null }) {
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => armarTurno(e, a, dia), [dia]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const sinInternet = useSinInternet(almacen);
  // C7: lo que sin internet no va (un turno con MP, transferencia o débito) queda EN ESPERA acá y se manda al volver.
  const espera = useRef<AccionCaja | null>(null);
  const [enEspera, setEnEspera] = useState(false);
  const mandar = useCallback<Hacer>(
    (a) => {
      if (sinInternet && (a.tipo === "contarTurno" || a.tipo === "cerrarTurno") && !cajaVaSinInternet(a)) {
        espera.current = a;
        setEnEspera(true);
        return true;
      }
      return hacer(a);
    },
    [hacer, sinInternet],
  );
  // Al volver la señal (la sincro del almacén o el «online» del navegador), lo que esperaba se manda solo.
  useEffect(() => {
    const alVolver = () => {
      const a = espera.current;
      if (!a || estaSinInternet(almacen)) return;
      espera.current = null;
      setEnEspera(false);
      hacer(a);
    };
    const soltar = almacen.suscribirSincro(alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      soltar();
      window.removeEventListener("online", alVolver);
    };
  }, [almacen, hacer]);
  const cancelarEspera = () => {
    espera.current = null;
    setEnEspera(false);
  };
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} data-caja="turno" className="flex flex-col gap-4">
      <h2 id={`${id}-t`} className="font-semibold text-strong">
        {dia ? `Cierre de la caja del ${Number(dia.slice(8))}/${Number(dia.slice(5, 7))} (por turnos)` : "Cierre del turno"}
      </h2>
      {enEspera && (
        <div role="status" data-caja="en-espera" className="flex flex-col gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm text-strong sm:flex-row sm:items-center sm:justify-between">
          <span>Sin internet: el cierre del turno tiene Mercado Pago, transferencia o débito y quedó en espera. Se manda solo cuando vuelva la señal (no recargues la página).</span>
          <Button variant="ghost" size="md" onClick={cancelarEspera}>
            Cancelar
          </Button>
        </div>
      )}
      <div className="rounded-lg border border-line bg-surface-raised p-4">
        {v.paraFirmar ? <FirmarTurno key={v.paraFirmar.turnoId} almacen={almacen} v={v} hacer={mandar} /> : <ContarTurno v={v} dia={dia} hacer={mandar} />}
      </div>
      {v.turnos.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul className="text-sm tabular-nums">
            {v.turnos.map((t) => (
              <li key={t.numero} className="flex justify-between gap-2 border-b border-line py-1.5">
                <span className="min-w-0 text-muted">
                  {t.texto}
                  {t.motivo ? ` · «${t.motivo}»` : ""}
                </span>
                <span className={cn("shrink-0 font-semibold", t.diferencia === 0 ? "text-success" : "text-danger")}>{resultado(t.diferencia)}</span>
              </li>
            ))}
          </ul>
          {v.puedeCerrarDia && (
            <ConFirma almacen={almacen} largo={v.largoFirma} titulo={`Cerrar el día (consolida ${v.turnos.length} ${v.turnos.length === 1 ? "turno" : "turnos"})`} boton="Cerrar el día" alMandar={(firmaId, pin) => hacer({ tipo: "cerrarDia", dia, firmaId, pin })} />
          )}
        </div>
      )}
      {!dia && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Retiro almacen={almacen} largo={v.largoFirma} hacer={hacer} />
          <EgresoPorCategoria almacen={almacen} largo={v.largoFirma} hacer={hacer} />
        </div>
      )}
    </section>
  );
}
