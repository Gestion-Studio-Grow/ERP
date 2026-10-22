"use client";

import { useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { agendarClase } from "@/lib/padel/acciones";
import { botonAgendar } from "./boton";

const campo = "h-12 w-full rounded-xl border border-line bg-surface-raised px-3 text-base text-strong";
const rotulo = "mb-1 block text-sm font-semibold text-strong";

export default function AgendarForm({ alumnos, hoy }: { alumnos: { id: string; nombre: string }[]; hoy: string }) {
  const [nuevo, setNuevo] = useState(alumnos.length === 0);
  const [tipo, setTipo] = useState("INDIVIDUAL");
  // Arranca sin alumno elegido (B1): el botón dice «Elegí el alumno» hasta que haya uno.
  const [alumnoId, setAlumnoId] = useState("");
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string; wa?: string | null; enviado?: boolean } | null>(null);

  const enviar = (fd: FormData) =>
    start(async () => {
      const r = await agendarClase(fd);
      setMsg(r.ok ? { ok: true, texto: `Agendada: ${r.cuando}`, wa: r.wa, enviado: r.enviado } : { ok: false, texto: r.error });
    });

  const boton = botonAgendar({ nuevo, alumnoId, pendiente });

  return (
    <form action={enviar} className="grid gap-4">
      {!nuevo ? (
        <div>
          <label htmlFor="ag-alumno" className={rotulo}>Alumno</label>
          <select id="ag-alumno" name="alumnoId" className={campo} required value={alumnoId} onChange={(e) => setAlumnoId(e.target.value)}>
            <option value="" disabled>Elegí el alumno</option>
            {alumnos.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
          <button type="button" className="mt-1 h-11 text-sm text-muted underline" onClick={() => setNuevo(true)}>Es alguien nuevo</button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div>
            <label htmlFor="ag-nombre" className={rotulo}>Nombre</label>
            <input id="ag-nombre" name="nombre" className={campo} autoComplete="off" required />
          </div>
          <div>
            <label htmlFor="ag-tel" className={rotulo}>Celular</label>
            <input id="ag-tel" name="telefono" type="tel" inputMode="tel" placeholder="11 5555-1234" className={campo} required />
          </div>
          {alumnos.length > 0 && <button type="button" className="h-11 text-left text-sm text-muted underline" onClick={() => setNuevo(false)}>Elegir uno de mis alumnos</button>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ag-fecha" className={rotulo}>Día</label>
          <input id="ag-fecha" name="fecha" type="date" min={hoy} defaultValue={hoy} className={campo} required />
        </div>
        <div>
          <label htmlFor="ag-hora" className={rotulo}>Hora</label>
          <input id="ag-hora" name="hora" type="time" step={900} defaultValue="18:00" className={campo} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ag-tipo" className={rotulo}>Tipo</label>
          <select id="ag-tipo" name="tipo" className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="GRUPAL">Grupal</option>
          </select>
        </div>
        {tipo === "GRUPAL" && (
          <div>
            <label htmlFor="ag-personas" className={rotulo}>Personas</label>
            <select id="ag-personas" name="personas" className={campo} defaultValue="2">
              {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
      </div>
      <button type="submit" disabled={boton.disabled} className={cn(buttonClasses("solid", "lg"), "h-14 w-full text-lg")} data-qa="guardar-clase">
        {boton.texto}
      </button>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className="grid gap-2">
          <p className="text-sm font-semibold" style={{ color: msg.ok ? "var(--success)" : "var(--danger)" }}>{msg.ok ? "✓ " : ""}{msg.texto}{msg.enviado && " · le llegó el WhatsApp"}</p>
          {msg.wa && (
            <a href={msg.wa} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center rounded-xl text-base font-bold" style={{ background: "var(--success)", color: "var(--surface-raised)" }} data-qa="avisar-alumno">
              Avisarle por WhatsApp
            </a>
          )}
        </div>
      )}
    </form>
  );
}
