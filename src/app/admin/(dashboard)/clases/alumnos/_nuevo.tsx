"use client";

// «+ Alumno» (E9 · M-042): una hoja con nombre, celular (en Android, «Elegir de contactos» si el
// teléfono lo permite) y el nivel en chips. Si el celular ya es de un alumno, no se duplica: «Ya es
// tu alumno: Lucía» y se abre su ficha. Al guardar, «Mandarle su link» queda a un toque.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn, Hoja, Icono } from "@/components/ui";
import { crearAlumno, mandarLinkAlAlumno } from "@/lib/padel/acciones";
import { useToast } from "../../ToastProvider";
import { campo, chipEleccion, rotulo } from "../config/_estilos";
import { NIVELES } from "./_fila";
import { ErrorEnLinea, useAccion } from "./_usar-accion";

type Contacto = { name?: string[]; tel?: string[] };
type ConContactos = Navigator & { contacts?: { select: (p: string[], o?: { multiple?: boolean }) => Promise<Contacto[]> } };

export function NuevoAlumno() {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nivel, setNivel] = useState("");
  const [creado, setCreado] = useState<{ id: string; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const link = useAccion();
  const nombreRef = useRef<HTMLInputElement>(null);
  // Sólo en el teléfono (después de hidratar): el servidor no sabe si hay selector de contactos.
  const [hayContactos, setHayContactos] = useState(false);
  useEffect(() => setHayContactos("contacts" in navigator), []);

  const limpiar = () => {
    setNombre("");
    setTelefono("");
    setNivel("");
    setCreado(null);
    setError(null);
  };
  const cerrar = () => {
    setAbierta(false);
    limpiar();
  };

  const elegirContacto = async () => {
    try {
      const [c] = (await (navigator as ConContactos).contacts?.select(["name", "tel"], { multiple: false })) ?? [];
      if (c?.name?.[0]) setNombre(c.name[0]);
      if (c?.tel?.[0]) setTelefono(c.tel[0]);
    } catch {
      /* el profe cerró el selector: no pasa nada */
    }
  };

  const guardar = () =>
    start(async () => {
      setError(null);
      const r = await crearAlumno(nombre, telefono, nivel);
      if (r.ok) {
        setCreado({ id: r.alumnoId, nombre: nombre.trim() });
        router.refresh();
        return;
      }
      if ("alumnoId" in r && r.alumnoId) {
        // Ya existía: no se duplica, se abre su ficha.
        showSuccess(r.error);
        cerrar();
        router.push(`/admin/clases/alumnos/${r.alumnoId}`);
        return;
      }
      setError(r.error);
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={cn(buttonClasses("solid", "lg"), "h-12 shrink-0 gap-1.5 px-4")}
        data-qa="nuevo-alumno"
      >
        <Icono nombre="mas" className="size-5" /> Alumno
      </button>

      <Hoja
        abierta={abierta}
        onCerrar={cerrar}
        titulo={creado ? `Listo: ${creado.nombre} ya es tu alumno` : "Alumno nuevo"}
        descripcion={creado ? "Mandale su link: ahí ve sus clases, cancela o te paga." : "Con el celular le llegan los avisos por WhatsApp."}
        pie={
          creado ? (
            <div className="grid w-full gap-2 pb-3">
              <button
                type="button"
                disabled={link.pendiente}
                className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center")}
                onClick={() => link.correr(() => mandarLinkAlAlumno(creado.id), "Link listo", creado.nombre)}
                data-qa="mandar-link-nuevo"
              >
                Mandarle su link
              </button>
              <ErrorEnLinea texto={link.error} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} onClick={() => router.push(`/admin/clases/alumnos/${creado.id}`)}>
                  Ver su ficha
                </button>
                <button
                  type="button"
                  className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")}
                  onClick={() => {
                    limpiar();
                    nombreRef.current?.focus();
                  }}
                >
                  Cargar otro
                </button>
              </div>
            </div>
          ) : (
            <div className="grid w-full gap-2 pb-3">
              <ErrorEnLinea texto={error} id="error-nuevo-alumno" />
              <button
                type="submit"
                form="form-nuevo-alumno"
                disabled={pendiente || !nombre.trim() || !telefono.trim()}
                className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center")}
                data-qa="guardar-alumno"
              >
                {pendiente ? "Guardando…" : !nombre.trim() ? "Poné el nombre" : !telefono.trim() ? "Poné el celular" : "Guardar"}
              </button>
            </div>
          )
        }
      >
        {!creado && (
          <form
            id="form-nuevo-alumno"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              guardar();
            }}
          >
            {hayContactos && (
              <button type="button" onClick={elegirContacto} className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center gap-1.5")} data-qa="elegir-contacto">
                <Icono nombre="persona" className="size-5" /> Elegir de mis contactos
              </button>
            )}
            <div>
              <label htmlFor="na-nombre" className={rotulo}>Nombre</label>
              <input
                ref={nombreRef}
                id="na-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="off"
                maxLength={60}
                className={campo}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "error-nuevo-alumno" : undefined}
                data-qa="na-nombre"
              />
            </div>
            <div>
              <label htmlFor="na-tel" className={rotulo}>Celular</label>
              <input
                id="na-tel"
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="11 5555-1234"
                autoComplete="off"
                className={campo}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "error-nuevo-alumno" : undefined}
                data-qa="na-tel"
              />
            </div>
            <fieldset>
              <legend className={rotulo}>Nivel (si querés)</legend>
              <div className="flex flex-wrap gap-2">
                {NIVELES.map((n) => (
                  <button key={n} type="button" aria-pressed={nivel === n} onClick={() => setNivel((v) => (v === n ? "" : n))} className={chipEleccion}>
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>
          </form>
        )}
      </Hoja>
    </>
  );
}
