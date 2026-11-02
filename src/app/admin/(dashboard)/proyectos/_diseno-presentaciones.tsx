"use client";

// Generar una presentación con plantilla (con reglas, sin IA) y seguirla: enviarla y dejar escrita la respuesta del cliente.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, buttonClasses, cn } from "@/components/ui";
import { enviarPresentacion, generarPresentacion, registrarRespuestaPresentacion } from "@/lib/proyectos/acciones-diseno";
import { ESTADOS_PRESENTACION, PLANTILLAS, type Plantilla } from "@/lib/proyectos/diseno-core";
import { etiqueta, tarjeta } from "./_vista";

export interface PresentacionFila {
  id: string;
  nombre: string;
  plantilla: string;
  laminas: number;
  estado: string;
  respuesta: string | null;
  fecha: string;
}

const tonoDe = (e: string) => (e === "APROBADA" ? "success" : e === "CAMBIOS" ? "danger" : "neutral");

export function Presentaciones({ proyectoId, filas, puedeEditar }: { proyectoId: string; filas: readonly PresentacionFila[]; puedeEditar: boolean }) {
  const [plantilla, setPlantilla] = useState<Plantilla>("CLASICA");
  const [fondo, setFondo] = useState("#1f2a44");
  const [acento, setAcento] = useState("#e0a030");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();

  return (
    <div className="grid gap-4">
      {puedeEditar && (
        <section className={tarjeta} aria-label="Generar presentación">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold text-strong">Plantilla</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PLANTILLAS.map((p) => (
                <label key={p.id} className={cn("flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm", plantilla === p.id && "border-accent")}>
                  <input type="radio" name="plantilla" checked={plantilla === p.id} onChange={() => setPlantilla(p.id)} className="mt-0.5 size-5" />
                  <span><span className="block font-medium text-strong">{p.label}</span><span className="text-muted">{p.ayuda}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {plantilla === "CLIENTE" && (
            <div className="mt-3 flex flex-wrap gap-4">
              <label className={etiqueta}>Color de fondo<input type="color" value={fondo} onChange={(e) => setFondo(e.target.value)} className="h-11 w-20 rounded-lg border border-line bg-surface" /></label>
              <label className={etiqueta}>Color de acento<input type="color" value={acento} onChange={(e) => setAcento(e.target.value)} className="h-11 w-20 rounded-lg border border-line bg-surface" /></label>
            </div>
          )}
          <p className="mt-3 text-sm text-muted">Se arma sola con la idea, las imágenes elegidas y el brief. No necesita IA.</p>
          <Button
            className="mt-2"
            disabled={ocupado}
            onClick={() => {
              setError(null);
              iniciar(async () => {
                try {
                  const r = await generarPresentacion({ proyectoId, plantilla, fondo, acento });
                  if (!r.ok) return setError(r.error);
                  router.refresh();
                } catch {
                  setError("No se pudo generar. Probá de nuevo.");
                }
              });
            }}
          >
            {ocupado ? "Generando…" : "Generar presentación"}
          </Button>
          {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
        </section>
      )}
      {filas.length === 0 && <p className="text-sm text-muted">Todavía no hay presentaciones de este proyecto.</p>}
      <ul className="grid gap-3">
        {filas.map((f) => <Fila key={f.id} f={f} puedeEditar={puedeEditar} />)}
      </ul>
    </div>
  );
}

function Fila({ f, puedeEditar }: { f: PresentacionFila; puedeEditar: boolean }) {
  const [respondiendo, setRespondiendo] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const hacer = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) return setError(r.error);
        setRespondiendo(false);
        setRespuesta("");
        router.refresh();
      } catch {
        setError("No se pudo guardar. Probá de nuevo.");
      }
    });
  };
  return (
    <li className={cn(tarjeta, "grid min-w-0 gap-2")}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words font-medium text-strong">{f.nombre}</h3>
        <Badge tone={tonoDe(f.estado)}>{ESTADOS_PRESENTACION[f.estado] ?? f.estado}</Badge>
      </div>
      <p className="text-sm text-muted">{PLANTILLAS.find((p) => p.id === f.plantilla)?.label ?? f.plantilla} · {f.laminas} láminas · {f.fecha}</p>
      {f.estado === "BORRADOR" && <p className="text-sm text-muted">Al enviarla aparece en el portal del cliente, donde puede aprobarla o pedir cambios.</p>}
      {f.respuesta && <p className="whitespace-pre-wrap break-words text-sm text-strong">Respuesta del cliente: «{f.respuesta}»</p>}
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/proyectos/presentacion/${f.id}`} className={buttonClasses("outline", "md")}>Abrir</Link>
        {puedeEditar && f.estado === "BORRADOR" && <Button disabled={ocupado} onClick={() => hacer(() => enviarPresentacion({ id: f.id }))}>Enviar al cliente</Button>}
        {puedeEditar && f.estado !== "BORRADOR" && !respondiendo && <Button variant="outline" onClick={() => setRespondiendo(true)}>Cargar respuesta del cliente</Button>}
      </div>
      {respondiendo && (
        <div className="grid gap-2">
          <label className={etiqueta}>
            Qué dijo
            <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} maxLength={2000} autoFocus className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={ocupado} onClick={() => hacer(() => registrarRespuestaPresentacion({ id: f.id, aprueba: true, respuesta }))}>Aprobó</Button>
            <Button variant="outline" disabled={ocupado || !respuesta.trim()} onClick={() => hacer(() => registrarRespuestaPresentacion({ id: f.id, aprueba: false, respuesta }))}>Pidió cambios</Button>
            <Button variant="ghost" onClick={() => setRespondiendo(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </li>
  );
}
