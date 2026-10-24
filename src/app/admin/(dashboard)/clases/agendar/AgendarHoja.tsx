"use client";

// ＋ AGENDAR (F1 · matias-DISENO.md §2.3 · M-053..M-055, M-069, M-070). Una hoja a pantalla
// completa en el celular: ¿A quién? (los 6 de siempre en chips, o el buscador con TODOS, o «+ Nuevo»)
// → ¿Qué día? (cinta de 14) → ¿A qué hora? (sólo libres; «Otra hora…» fuera de grilla) →
// individual o con amigos → el resumen al pie y «Agendar y avisar».
//
// Nunca hay un alumno elegido de entrada (B1): el botón dice «Elegí el alumno» hasta que hay uno.
// Si viene de un hueco (Semana u Hoy), el día y la hora ya están puestos y sólo falta el alumno.
// Al agendar, la hoja se cierra, el WhatsApp queda en la cola de avisos del panel y atrás queda
// «✓ Agendada» con «Agendar otra» (la hoja vuelve limpia).

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BuscadorCombo, Chip, Segmented, buttonClasses, cn } from "@/components/ui";
import { agendarClase, horasLibres } from "@/lib/padel/acciones";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { horaHumana, precioDe } from "@/lib/padel/core";
import { diasDeCinta } from "../_agenda-core";
import { CintaDias, ChipsHoras } from "../_cinta-dias";
import { ErrorAccion, HojaPanel, Pie, Rotulo, chip48, grande, useAccion } from "../_hojas/comun";
import { botonAgendar, textoResumen } from "./resumen";

type Alumno = { id: string; nombre: string; telefono: string };

const campo =
  "h-12 w-full rounded-xl border border-line-strong bg-surface-raised px-3 text-base text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function AgendarHoja({
  hoy,
  frecuentes,
  todos,
  precios,
  inicial,
}: {
  hoy: string;
  frecuentes: Alumno[];
  todos: Alumno[];
  precios: { precioIndividual: number; precioGrupal: number };
  inicial: { fecha: string; hora: string | null; libres: string[]; alumnoId: string | null };
}) {
  const router = useRouter();
  const { pendiente, error, setError, ejecutar, mostrar } = useAccion("");
  const dias = useMemo(() => diasDeCinta(hoy, 14), [hoy]);
  const [abierta, setAbierta] = useState(true);
  const [hecho, setHecho] = useState<{ texto: string; fecha: string } | null>(null);
  const [alumnoId, setAlumnoId] = useState<string | null>(inicial.alumnoId);
  const [nuevo, setNuevo] = useState<{ nombre: string; telefono: string } | null>(todos.length === 0 ? { nombre: "", telefono: "" } : null);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [libres, setLibres] = useState<string[]>(inicial.libres);
  const [cargando, setCargando] = useState(false);
  const [hora, setHora] = useState<string | null>(inicial.hora);
  const [tipo, setTipo] = useState<"INDIVIDUAL" | "GRUPAL">("INDIVIDUAL");
  const [personas, setPersonas] = useState(2);
  const [vuelta, setVuelta] = useState(0);
  const idQuien = useId();
  const idNombre = useId();
  const idTel = useId();
  const idPers = useId();

  // Las horas libres del día elegido (la del día de entrada ya vino del servidor).
  useEffect(() => {
    if (fecha === inicial.fecha && vuelta === 0) return;
    let vigente = true;
    horasLibres(fecha)
      .then((r) => vigente && setLibres(r.ok ? r.libres : []))
      .catch(() => vigente && setLibres([]))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [fecha, vuelta, inicial.fecha]);

  const elegido = alumnoId ? todos.find((a) => a.id === alumnoId) ?? frecuentes.find((a) => a.id === alumnoId) ?? null : null;
  const nombreResumen = nuevo ? nuevo.nombre : elegido?.nombre ?? null;
  const hayAlumno = nuevo ? nuevo.nombre.trim().length >= 2 && nuevo.telefono.replace(/\D/g, "").length >= 8 : Boolean(elegido);
  const precio = precioDe(precios, tipo, tipo === "GRUPAL" ? personas : 1);
  const hhmm = hora ? horaHumana(new Date(hora)) : null;
  const resumen = textoResumen({ alumno: nombreResumen, fecha, hora: hhmm, tipo, personas, precio, hoy });
  const boton = botonAgendar({ alumno: hayAlumno, hora: Boolean(hora), pendiente });
  const opciones = useMemo(() => todos.map((a) => ({ id: a.id, etiqueta: a.nombre, detalle: a.telefono })), [todos]);
  const enFrecuentes = alumnoId ? frecuentes.some((f) => f.id === alumnoId) : false;

  const limpiar = () => {
    setAlumnoId(null);
    setNuevo(todos.length === 0 ? { nombre: "", telefono: "" } : null);
    setHora(null);
    setTipo("INDIVIDUAL");
    setError(null);
  };

  const agendar = () => {
    if (boton.disabled || !hora) return;
    const fd = new FormData();
    // La fecha y la hora salen de la hora elegida (en la hora del negocio).
    fd.set("fecha", dateStrInBusinessTz(new Date(hora)));
    fd.set("hora", horaHumana(new Date(hora)));
    fd.set("tipo", tipo);
    if (tipo === "GRUPAL") fd.set("personas", String(personas));
    if (nuevo) {
      fd.set("nombre", nuevo.nombre);
      fd.set("telefono", nuevo.telefono);
    } else if (alumnoId) fd.set("alumnoId", alumnoId);
    const nombre = nombreResumen ?? "";
    ejecutar(async () => {
      const r = await agendarClase(fd);
      if (!r.ok) {
        // Si se ocupó recién, se vuelven a buscar las libres.
        setHora(null);
        setCargando(true);
        setVuelta((v) => v + 1);
        return r.error;
      }
      const texto = `Agendada: ${r.cuando}${r.linkNuevo ? " · va con su link nuevo" : ""}`;
      setHecho({ texto: `${nombre.split(/\s+/)[0]} · ${r.cuando}`, fecha: dateStrInBusinessTz(new Date(hora)) });
      limpiar();
      setAbierta(false);
      mostrar({ texto, nombre, wa: r.wa, enviado: r.enviado, avisoId: r.avisoId ?? null });
      return null;
    });
  };

  const cerrar = () => {
    if (hecho) return setAbierta(false);
    if (window.history.length > 1) router.back();
    else router.push("/admin/clases");
  };

  return (
    <>
      {/* Lo que queda atrás de la hoja (M-055). */}
      <div className="grid gap-3" aria-live="polite">
        {hecho ? (
          <>
            <p className="rounded-2xl bg-success-soft px-4 py-3 font-semibold text-strong" data-qa="agendada">
              ✓ Agendada: {hecho.texto}
            </p>
            <button type="button" onClick={() => setAbierta(true)} className={grande()} data-qa="agendar-otra">
              Agendar otra
            </button>
            <Link href={`/admin/clases/semana?desde=${hecho.fecha}#dia-${hecho.fecha}`} className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}>
              Ver la semana
            </Link>
          </>
        ) : (
          !abierta && (
            <button type="button" onClick={() => setAbierta(true)} className={grande()}>
              Agendar una clase
            </button>
          )
        )}
      </div>

      {abierta && (
        <HojaPanel
          onCerrar={cerrar}
          titulo="Agendar clase"
          descripcion="Queda confirmada y le avisás por WhatsApp."
          pie={
            <Pie>
              {resumen && (
                <p className="text-sm font-semibold tabular-nums text-strong" data-qa="resumen-agendar">
                  {resumen}
                </p>
              )}
              <button type="button" disabled={boton.disabled} onClick={agendar} className={cn(grande(), "h-14 text-lg")} data-qa="agendar-y-avisar">
                {boton.texto}
              </button>
            </Pie>
          }
        >
          <Rotulo id={idQuien}>¿A quién?</Rotulo>
          {nuevo ? (
            <div className="grid gap-3" data-qa="alumno-nuevo">
              <div>
                <label htmlFor={idNombre} className="mb-1 block text-sm text-strong">
                  Nombre
                </label>
                <input id={idNombre} className={campo} autoComplete="off" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
              </div>
              <div>
                <label htmlFor={idTel} className="mb-1 block text-sm text-strong">
                  Celular
                </label>
                <input id={idTel} type="tel" inputMode="tel" placeholder="11 5555-1234" className={campo} value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
              </div>
              <p className="text-sm text-muted">Si ese celular ya es de un alumno tuyo, se agenda a ese (no se duplica).</p>
              {todos.length > 0 && (
                <button type="button" className="min-h-12 text-left text-sm font-semibold text-muted underline underline-offset-2" onClick={() => setNuevo(null)}>
                  Elegir uno de mis alumnos
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {frecuentes.length > 0 && (
                <div role="group" aria-labelledby={idQuien} className="flex flex-wrap gap-2" data-qa="frecuentes">
                  {frecuentes.map((a) => (
                    <Chip key={a.id} prendido={alumnoId === a.id} onClick={() => setAlumnoId(alumnoId === a.id ? null : a.id)} className={chip48}>
                      {a.nombre.split(/\s+/)[0]}
                    </Chip>
                  ))}
                </div>
              )}
              <BuscadorCombo
                opciones={opciones}
                valor={alumnoId && !enFrecuentes ? alumnoId : ""}
                onElegir={(id) => setAlumnoId(id)}
                placeholder="Buscar un alumno…"
                ariaLabel="Buscar un alumno por nombre o celular"
                className="[&_input]:h-12 [&_input]:text-base"
              />
              <button
                type="button"
                className="min-h-12 text-left text-sm font-semibold text-accent-ink underline underline-offset-2"
                onClick={() => {
                  setAlumnoId(null);
                  setNuevo({ nombre: "", telefono: "" });
                }}
                data-qa="alumno-nuevo-boton"
              >
                + Nuevo: nombre y celular
              </button>
            </div>
          )}

          <CintaDias
            dias={dias}
            elegida={fecha}
            onElegir={(f) => {
              if (f === fecha) return;
              setFecha(f);
              setHora(null);
              setCargando(true);
            }}
          />
          <ChipsHoras fecha={fecha} libres={libres} elegida={hora} onElegir={setHora} cargando={cargando} otraHora vacio="Ese día no tenés huecos. Podés poner otra hora." />

          <Rotulo>¿Cómo es?</Rotulo>
          <Segmented
            name="tipo-agendar"
            leyenda="Tipo de clase"
            lleno
            value={tipo}
            onChange={(e) => setTipo((e.nativeEvent.target as HTMLInputElement | null)?.value === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL")}
            opciones={[
              { valor: "INDIVIDUAL", etiqueta: "Individual" },
              { valor: "GRUPAL", etiqueta: "Con amigos (2–4)" },
            ]}
          />
          {tipo === "GRUPAL" && (
            <>
              <Rotulo id={idPers}>¿Cuántos son?</Rotulo>
              <div role="group" aria-labelledby={idPers} className="flex gap-2">
                {[2, 3, 4].map((n) => (
                  <Chip key={n} prendido={personas === n} onClick={() => setPersonas(n)} className={chip48}>
                    {n}
                  </Chip>
                ))}
              </div>
            </>
          )}
          <ErrorAccion texto={error} className="mt-3" />
        </HojaPanel>
      )}
    </>
  );
}
