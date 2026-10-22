"use client";

// Lo que se toca en la ficha del alumno (E9/E27 · M-042/M-071):
// - «Editar»: hoja con nombre, celular y nivel (editarAlumno). Si cambia el celular, el link se
//   renueva y el próximo WhatsApp va al número nuevo: lo decimos y queda «Mandarle su link».
// - Las notas: se guardan solas al salir del campo (autoguardado, «Guardado»).
// - «Mandarle su link» y «Regenerar link» (O-1, con confirmación: el viejo deja de andar).

import { useState } from "react";
import { buttonClasses, cn, Hoja } from "@/components/ui";
import { editarAlumno, mandarLinkAlAlumno, regenerarLink } from "@/lib/padel/acciones";
import { areaTexto, campo, chipEleccion, rotulo } from "../../config/_estilos";
import { NIVELES } from "../_fila";
import { ErrorEnLinea, useAccion } from "../_usar-accion";

const grande = (v: "solid" | "outline" | "danger" = "outline") => cn(buttonClasses(v, "lg"), "h-12 w-full justify-center px-3");

export function EditarAlumno({ alumnoId, nombre, telefono, nivel }: { alumnoId: string; nombre: string; telefono: string; nivel: string }) {
  const [abierta, setAbierta] = useState(false);
  const [n, setN] = useState(nombre);
  const [t, setT] = useState(telefono);
  const [niv, setNiv] = useState(nivel);
  const { pendiente, error, setError, correr } = useAccion();
  const abrir = () => {
    setN(nombre);
    setT(telefono);
    setNiv(nivel);
    setError(null);
    setAbierta(true);
  };
  const guardar = () =>
    correr(
      () => editarAlumno(alumnoId, { nombre: n, telefono: t, nivel: niv }),
      (r) => (r.linkNuevo ? "Guardado · cambió el celular: mandale su link nuevo" : "Guardado"),
      nombre,
      () => setAbierta(false),
    );
  return (
    <>
      <button type="button" onClick={abrir} className={cn(buttonClasses("outline", "lg"), "h-12 px-4")} data-qa="editar-alumno">
        Editar
      </button>
      <Hoja
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Editar alumno"
        descripcion="Si le cambiás el celular, el próximo WhatsApp va al nuevo y su link se renueva."
        pie={
          <div className="grid w-full gap-2 pb-3">
            <ErrorEnLinea texto={error} id="error-editar-alumno" />
            <button type="submit" form="form-editar-alumno" disabled={pendiente} className={grande("solid")} data-qa="guardar-edicion">
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          </div>
        }
      >
        <form
          id="form-editar-alumno"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <div>
            <label htmlFor="ea-nombre" className={rotulo}>Nombre</label>
            <input id="ea-nombre" value={n} onChange={(e) => setN(e.target.value)} maxLength={60} className={campo} aria-describedby={error ? "error-editar-alumno" : undefined} />
          </div>
          <div>
            <label htmlFor="ea-tel" className={rotulo}>Celular</label>
            <input id="ea-tel" type="tel" inputMode="tel" value={t} onChange={(e) => setT(e.target.value)} placeholder="11 5555-1234" className={campo} aria-describedby={error ? "error-editar-alumno" : undefined} data-qa="ea-tel" />
          </div>
          <fieldset>
            <legend className={rotulo}>Nivel</legend>
            <div className="flex flex-wrap gap-2">
              {NIVELES.map((x) => (
                <button key={x} type="button" aria-pressed={niv === x} onClick={() => setNiv((v) => (v === x ? "" : x))} className={chipEleccion}>
                  {x}
                </button>
              ))}
            </div>
          </fieldset>
        </form>
      </Hoja>
    </>
  );
}

/** Las notas del alumno («revés cruzado»): se guardan al salir del campo. */
export function NotasAlumno({ alumnoId, nombre, notas }: { alumnoId: string; nombre: string; notas: string }) {
  const [valor, setValor] = useState(notas);
  const [guardado, setGuardado] = useState(notas);
  const [estado, setEstado] = useState<string | null>(null);
  const { pendiente, error, correr } = useAccion();
  return (
    <div className="grid gap-2">
      <label htmlFor="notas-alumno" className="sr-only">Notas de {nombre}</label>
      <textarea
        id="notas-alumno"
        value={valor}
        maxLength={1000}
        onChange={(e) => {
          setValor(e.target.value);
          setEstado(null);
        }}
        onBlur={() => {
          if (valor.trim() === guardado.trim()) return;
          correr(() => editarAlumno(alumnoId, { notas: valor }), "Guardado", nombre, () => {
            setGuardado(valor);
            setEstado("Guardado");
          });
        }}
        placeholder="Qué está trabajando, cómo le gusta la clase, lo que te quieras acordar."
        className={areaTexto}
        aria-describedby="notas-estado"
        data-qa="notas-alumno"
      />
      <p id="notas-estado" role="status" className="min-h-5 text-sm text-muted">
        {pendiente ? "Guardando…" : estado ? `✓ ${estado}` : "Se guarda solo cuando salís del campo."}
      </p>
      <ErrorEnLinea texto={error} />
    </div>
  );
}

export function MandarLink({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion();
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pendiente}
        className={grande()}
        onClick={() => correr(() => mandarLinkAlAlumno(alumnoId), (r) => ("linkNuevo" in r && r.linkNuevo ? "Link nuevo listo" : "Link listo"), nombre)}
        data-qa="mandar-link"
      >
        Mandarle su link
      </button>
      <ErrorEnLinea texto={error} />
    </div>
  );
}

export function RegenerarLink({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const { pendiente, error, correr } = useAccion();
  const [seguro, setSeguro] = useState(false);
  return (
    <div className="grid gap-2">
      {seguro ? (
        <>
          <p className="text-sm text-muted">El link que tiene hoy deja de andar. Le mandás el nuevo por WhatsApp.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={grande()} onClick={() => setSeguro(false)}>
              No
            </button>
            <button type="button" disabled={pendiente} className={grande("danger")} onClick={() => correr(() => regenerarLink(alumnoId), "Link nuevo listo", nombre, () => setSeguro(false))} data-qa="regenerar-link-si">
              Sí, link nuevo
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="min-h-12 text-sm text-muted underline underline-offset-2" onClick={() => setSeguro(true)} data-qa="regenerar-link">
          Regenerar su link (si lo perdió o lo tiene otro)
        </button>
      )}
      <ErrorEnLinea texto={error} />
    </div>
  );
}
