"use client";

// Los pedazos con estado de Administración: marcar, guardar al salir del campo, confirmar en dos pasos, importar y editar.

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { marcarCuota } from "@/lib/proyectos/acciones-ficha";
import { cuentasParaMarcar, editarExtrasLiquidacion, generarLiquidaciones, guardarDatoCuota, importarExtracto, marcarCuotaEmpresa, marcarLiquidacionVista } from "@/lib/proyectos/acciones-empresa";
import { MEDIOS, MEDIO_LABEL } from "@/lib/proyectos/core";
import { campo } from "../_vista";

type Salida = { ok: boolean; error?: string; [k: string]: unknown } | void;
type Accion = (fd: FormData) => Promise<Salida>;

const mensajeDeError = (e: unknown) => (e instanceof Error && e.message ? e.message : "No se pudo guardar. Probá de nuevo.");

/** Corre una acción: lo que devuelve como error y lo que tira terminan en el mismo cartel. */
function useAccion() {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const correr = (accion: Accion, fd: FormData, alTerminar?: (r: Salida) => void) =>
    iniciar(async () => {
      setError(null);
      try {
        const r = await accion(fd);
        if (r && r.ok === false) return setError(r.error ?? "No se pudo guardar.");
        alTerminar?.(r);
      } catch (e) {
        setError(mensajeDeError(e));
      }
    });
  return { error, ocupado, correr };
}

const Fallo = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm text-danger">{texto}</p> : null);

// ── Formularios ─────────────────────────────────────────────────────────────

export function FormAccion({ accion, children, boton, className, limpiar = true }: { accion: Accion; children?: ReactNode; boton: string; className?: string; limpiar?: boolean }) {
  const { error, ocupado, correr } = useAccion();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className={cn("grid gap-2", className)}
      action={(fd) =>
        correr(accion, fd, () => {
          if (limpiar) form.current?.reset();
        })
      }
    >
      {children}
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11 justify-self-start")}>{ocupado ? "Guardando…" : boton}</button>
      <Fallo texto={error} />
    </form>
  );
}

/** Sin alert ni confirm: el primer toque pregunta en el mismo lugar, el segundo hace. */
export function BotonDosPasos({ accion, campos, etiqueta, pregunta, principal }: { accion: Accion; campos: Record<string, string>; etiqueta: string; pregunta: string; principal?: boolean }) {
  const { error, ocupado, correr } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const hacer = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    correr(accion, fd, () => setAbierto(false));
  };
  return (
    <div className="grid gap-1">
      {abierto ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-strong">{pregunta}</span>
          <button type="button" disabled={ocupado} onClick={hacer} className={cn(buttonClasses("solid", "md"), "min-h-11")}>{ocupado ? "…" : "Sí"}</button>
          <button type="button" disabled={ocupado} onClick={() => setAbierto(false)} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>No</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className={cn(buttonClasses(principal ? "solid" : "ghost", "md"), "min-h-11 justify-self-start")}>{etiqueta}</button>
      )}
      <Fallo texto={error} />
    </div>
  );
}

// ── Cuotas ──────────────────────────────────────────────────────────────────

/** Cobrado o Pagar: pide el medio antes de asentar. La cuota de proyecto y la de la empresa van por acciones distintas. */
function ElegirCuenta() {
  const [cuentas, setCuentas] = useState<{ id: string; nombre: string; moneda: string }[]>([]);
  useEffect(() => {
    cuentasParaMarcar().then(setCuentas).catch(() => setCuentas([]));
  }, []);
  if (cuentas.length === 0) return null;
  return (
    <select name="cuenta" aria-label="Cuenta que se mueve" defaultValue="" className={campo}>
      <option value="">Sin cuenta</option>
      {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
    </select>
  );
}

export function MarcarCuota({ id, deEmpresa, etiqueta }: { id: string; deEmpresa: boolean; etiqueta: string }) {
  const { error, ocupado, correr } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={cn(buttonClasses("solid", "md"), "min-h-11 whitespace-nowrap")}>{etiqueta}</button>
    );
  }
  return (
    <form
      className="grid min-w-44 gap-1"
      action={(fd) => {
        fd.set("id", id);
        correr(deEmpresa ? marcarCuotaEmpresa : (marcarCuota as Accion), fd, () => {
          setAbierto(false);
          router.refresh();
        });
      }}
    >
      <select name="medio" aria-label="Medio de pago" defaultValue="TRANSFERENCIA" className={campo}>
        {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
      </select>
      <ElegirCuenta />
      <div className="flex gap-1">
        <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11 flex-1")}>{ocupado ? "…" : "Confirmar"}</button>
        <button type="button" disabled={ocupado} onClick={() => setAbierto(false)} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>Volver</button>
      </div>
      <Fallo texto={error} />
    </form>
  );
}

/** Factura y comentario: se guardan al salir del campo. */
export function DatoCuota({ id, dato, valor, etiqueta }: { id: string; dato: "factura" | "comentario"; valor: string; etiqueta: string }) {
  const { error, ocupado, correr } = useAccion();
  const ultimo = useRef(valor);
  return (
    <div className="grid gap-1">
      <input
        defaultValue={valor}
        aria-label={etiqueta}
        placeholder={etiqueta}
        maxLength={dato === "factura" ? 60 : 300}
        aria-busy={ocupado}
        className={cn(campo, dato === "factura" ? "w-28" : "w-44")}
        onBlur={(e) => {
          const nuevo = e.target.value.trim();
          if (nuevo === ultimo.current) return;
          const fd = new FormData();
          fd.set("id", id);
          fd.set("campo", dato);
          fd.set("valor", nuevo);
          correr(guardarDatoCuota, fd, () => {
            ultimo.current = nuevo;
          });
        }}
      />
      <Fallo texto={error} />
    </div>
  );
}

// ── Bancos ──────────────────────────────────────────────────────────────────

const MAX_ARCHIVO = 500_000;

export function ImportarExtracto({ cuentas }: { cuentas: readonly { id: string; nombre: string }[] }) {
  const { error, ocupado, correr } = useAccion();
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [resultado, setResultado] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const alElegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setResultado(null);
    setErrorArchivo(null);
    if (!f) return;
    if (f.size > MAX_ARCHIVO) {
      setErrorArchivo("El extracto es demasiado grande: subilo de a un período por vez.");
      e.target.value = "";
      return;
    }
    const fd = new FormData();
    fd.set("cuentaId", cuentaId);
    fd.set("csv", await f.text());
    correr(importarExtracto as Accion, fd, (r) => {
      const x = r as unknown as { importadas: number; repetidas: number; ilegibles: number };
      const partes = [`${x.importadas} ${x.importadas === 1 ? "línea importada" : "líneas importadas"}`];
      if (x.repetidas > 0) partes.push(`${x.repetidas} ya estaban`);
      if (x.ilegibles > 0) partes.push(`${x.ilegibles} no se entendieron (un encabezado cuenta como una)`);
      setResultado(`${partes.join(" · ")}.`);
      if (archivo.current) archivo.current.value = "";
    });
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium text-strong">
        Cuenta
        <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={campo}>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-strong">
        Archivo CSV (fecha;descripción;importe)
        <input ref={archivo} type="file" accept=".csv,.txt,text/csv,text/plain" disabled={ocupado || !cuentaId} onChange={alElegir} className={cn(campo, "py-2")} />
      </label>
      {ocupado && <p role="status" className="text-sm text-muted sm:col-span-2">Importando…</p>}
      <div className="sm:col-span-2"><Fallo texto={error ?? errorArchivo} /></div>
      {resultado && <p role="status" className="text-sm text-strong sm:col-span-2">{resultado}</p>}
    </div>
  );
}

// ── Liquidaciones ───────────────────────────────────────────────────────────

export function GenerarLiquidaciones({ periodo }: { periodo: string }) {
  const { error, ocupado, correr } = useAccion();
  const [listo, setListo] = useState<string | null>(null);
  const generar = () => {
    const fd = new FormData();
    fd.set("periodo", periodo);
    setListo(null);
    correr(generarLiquidaciones as Accion, fd, (r) => {
      const x = r as unknown as { generadas: number; publicadas: number };
      setListo(`${x.generadas === 1 ? "1 liquidación" : `${x.generadas} liquidaciones`} al día${x.publicadas > 0 ? ` · ${x.publicadas} publicadas sin tocar` : ""}.`);
    });
  };
  return (
    <div className="grid gap-1">
      <button type="button" disabled={ocupado} onClick={generar} className={cn(buttonClasses("solid", "md"), "min-h-11 justify-self-start")}>{ocupado ? "Generando…" : "Generar o recalcular"}</button>
      <Fallo texto={error} />
      {listo && <p role="status" className="text-sm text-muted">{listo}</p>}
    </div>
  );
}

export function EditarExtras({ id, persona, base: baseActual, manuales }: { id: string; persona: string; base: number; manuales: readonly { nombre: string; monto: number }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [base, setBase] = useState(() => String(baseActual).replace(".", ","));
  const [filas, setFilas] = useState(() => manuales.map((m) => ({ nombre: m.nombre, monto: String(m.monto).replace(".", ",") })));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>Editar</button>;
  const cambiar = (i: number, k: "nombre" | "monto", v: string) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const guardar = () =>
    iniciar(async () => {
      setError(null);
      try {
        const r = await editarExtrasLiquidacion({ id, base, manuales: filas });
        if (!r.ok) return setError(r.error);
        setAbierto(false);
      } catch (e) {
        setError(mensajeDeError(e));
      }
    });
  return (
    <div className="grid min-w-72 gap-2">
      <p className="text-sm font-medium text-strong">Liquidación de {persona}</p>
      <label className="grid gap-1 text-sm text-strong">
        Base
        <input value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" className={campo} />
        <span className="text-xs text-muted">Si volvés a generar el mes, vuelve a la base de la ficha de equipo.</span>
      </label>
      <p className="text-sm font-medium text-strong">Extras</p>
      {filas.map((f, i) => (
        <div key={i} className="flex gap-1">
          <input value={f.nombre} onChange={(e) => cambiar(i, "nombre", e.target.value)} aria-label="Concepto" placeholder="Concepto" maxLength={120} className={campo} />
          <input value={f.monto} onChange={(e) => cambiar(i, "monto", e.target.value)} aria-label="Monto" placeholder="Monto" inputMode="decimal" className={cn(campo, "w-28 flex-none")} />
          <button type="button" aria-label="Sacar este extra" onClick={() => setFilas((x) => x.filter((_, j) => j !== i))} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>Sacar</button>
        </div>
      ))}
      <p className="text-xs text-muted">Un descuento va en negativo.</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setFilas((x) => [...x, { nombre: "", monto: "" }])} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>Sumar extra</button>
        <button type="button" disabled={ocupado} onClick={guardar} className={cn(buttonClasses("solid", "md"), "min-h-11")}>{ocupado ? "Guardando…" : "Guardar"}</button>
        <button type="button" disabled={ocupado} onClick={() => setAbierto(false)} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>Cerrar</button>
      </div>
      <Fallo texto={error} />
    </div>
  );
}

/** Marca «visto» recién cuando la página se abrió en el navegador: una precarga del enlace no cuenta. */
export function MarcarVista({ id }: { id: string }) {
  useEffect(() => {
    void marcarLiquidacionVista(id);
  }, [id]);
  return null;
}
