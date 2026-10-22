"use client";

// LA BIENVENIDA (E1 · M-083): tres pantallas para arrancar sin leer un manual.
//   1. Tu celular y tu alias (para que te escriban y te paguen).
//   2. Cuándo das clases (el mismo editor de Ajustes → Horarios).
//   3. Cuánto sale la clase.
// Al tocar «Listo», el link del turnero queda copiado y aparece «Instalar». Todo se guarda solo
// al salir de cada campo (los horarios, con su botón): si cierra a mitad, lo hecho queda.

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarCampoConfig } from "@/lib/padel/acciones-config";
import { buttonClasses, cn } from "@/components/ui";
import { tarjeta } from "../_vista";
import { CampoAuto, ChipsAuto } from "../config/_campo";
import { CompartirLink, CopiarLink, copiar } from "../config/_compartir";
import { EditorHorarios } from "../config/horarios/EditorHorarios";
import { DURACIONES } from "../config/reglas/opciones";
import type { Semana } from "../config/horarios/grilla";
import { Instalar } from "./_instalar";

const PASOS = ["Tus datos", "Horarios", "Precio"] as const;

type Datos = {
  turnero: string;
  whatsappProfe: string;
  aliasCbu: string;
  titularCuenta: string;
  precioIndividual: number;
  duracionMin: number;
  semana: Semana;
};

const grande = (v: "solid" | "outline" = "solid") => cn(buttonClasses(v, "lg"), "h-12 w-full justify-center");

export function Asistente({ datos }: { datos: Datos }) {
  const [paso, setPaso] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primera = useRef(true);

  // Al cambiar de paso (no al entrar), el foco va al título nuevo: lector y teclado siguen solos.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    titulo.current?.focus();
  }, [paso]);

  const terminar = async () => {
    setCopiado(await copiar(datos.turnero));
    setPaso(3);
  };

  return (
    <div className="grid gap-4">
      {paso < 3 && (
        <ol className="grid grid-cols-3 gap-2" aria-label="Pasos">
          {PASOS.map((p, i) => (
            <li
              key={p}
              aria-current={i === paso ? "step" : undefined}
              className={cn("grid gap-1 text-center text-xs font-semibold", i <= paso ? "text-strong" : "text-muted")}
            >
              <span aria-hidden className={cn("block h-1.5 rounded-full", i <= paso ? "bg-accent" : "bg-line")} />
              {i + 1}. {p}
            </li>
          ))}
        </ol>
      )}

      {paso === 0 && (
        <section className={cn(tarjeta, "grid gap-4")} aria-labelledby="b-t">
          <div>
            <h2 id="b-t" ref={titulo} tabIndex={-1} className="text-lg font-bold text-strong outline-none">Para que te escriban y te paguen</h2>
            <p className="text-sm text-muted">Paso 1 de 3. Se guarda solo.</p>
          </div>
          <CampoAuto clave="whatsappProfe" etiqueta="Tu celular (WhatsApp)" inicial={datos.whatsappProfe} formato="celular" tipo="tel" inputMode="tel" placeholder="11 5555-1234" ayuda="Con código de área." qa="b-whatsapp" />
          <CampoAuto clave="aliasCbu" etiqueta="Tu alias o CBU" inicial={datos.aliasCbu} placeholder="matias.padel" maxLength={60} qa="b-alias" />
          <CampoAuto clave="titularCuenta" etiqueta="Titular de la cuenta (si querés)" inicial={datos.titularCuenta} maxLength={80} qa="b-titular" />
          <button type="button" className={grande()} onClick={() => setPaso(1)} data-qa="b-siguiente-1">
            Siguiente
          </button>
        </section>
      )}

      {paso === 1 && (
        <section className="grid gap-3" aria-labelledby="b-t">
          <div>
            <h2 id="b-t" ref={titulo} tabIndex={-1} className="text-lg font-bold text-strong outline-none">¿Cuándo das clases?</h2>
            <p className="text-sm text-muted">Paso 2 de 3. Tocá los bloques de cada día; con «Copiar a…» lo repetís en otros días.</p>
          </div>
          <EditorHorarios inicial={datos.semana} duracionMin={datos.duracionMin} textoGuardar="Guardar y seguir" alGuardar={() => setPaso(2)} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={grande("outline")} onClick={() => setPaso(0)}>
              Atrás
            </button>
            <button type="button" className={grande("outline")} onClick={() => setPaso(2)} data-qa="b-saltear-2">
              Lo cargo después
            </button>
          </div>
        </section>
      )}

      {paso === 2 && (
        <section className={cn(tarjeta, "grid gap-4")} aria-labelledby="b-t">
          <div>
            <h2 id="b-t" ref={titulo} tabIndex={-1} className="text-lg font-bold text-strong outline-none">¿Cuánto sale la clase?</h2>
            <p className="text-sm text-muted">Paso 3 de 3. Lo podés cambiar cuando quieras en Ajustes.</p>
          </div>
          <CampoAuto clave="precioIndividual" etiqueta="Clase individual ($)" inicial={datos.precioIndividual ? String(datos.precioIndividual) : ""} formato="pesos" inputMode="numeric" placeholder="25000" qa="b-precio" />
          <ChipsAuto clave="duracionMin" leyenda="Cuánto dura" opciones={[...DURACIONES]} inicial={datos.duracionMin} qa="b-duracion" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={grande("outline")} onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button type="button" className={grande()} onClick={terminar} data-qa="b-listo">
              Listo
            </button>
          </div>
        </section>
      )}

      {paso === 3 && (
        <section className={cn(tarjeta, "grid gap-4")} aria-labelledby="b-t">
          <div>
            <h2 id="b-t" ref={titulo} tabIndex={-1} className="text-lg font-bold text-strong outline-none">¡Listo! Ya te pueden pedir clase</h2>
            <p role="status" className="text-sm text-success" data-qa="b-copiado">
              {copiado ? "✓ Tu link quedó copiado: pegalo en la bio de Instagram." : "Copiá tu link y pegalo en la bio de Instagram."}
            </p>
          </div>
          <p className="break-all rounded-lg bg-surface-sunken px-3 py-2 font-mono text-sm text-strong" data-qa="b-link">{datos.turnero}</p>
          <div className="grid grid-cols-2 gap-2">
            <CopiarLink url={datos.turnero} />
            <CompartirLink url={datos.turnero} texto="Pedime clase de pádel acá" />
          </div>
          <Instalar />
          <IrAHoy />
        </section>
      )}

      {paso < 3 && (
        <Link href="/admin/clases/config" className="min-h-12 content-center justify-self-center text-sm text-muted underline underline-offset-2" data-qa="b-despues">
          Lo hago después (ir a Ajustes)
        </Link>
      )}
    </div>
  );
}

/**
 * «Ir a Hoy» (O-9 de la CERT T2+T3): antes de ir, deja anotado que ya vio la Bienvenida; así Hoy no
 * lo rebota aunque haya salteado horarios y precio. Si la marca no se pudo guardar (sin señal), va
 * igual: a lo sumo vuelve a ver la Bienvenida, que no redirige a ningún lado.
 */
function IrAHoy() {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  return (
    <button
      type="button"
      className={grande()}
      disabled={pendiente}
      aria-busy={pendiente}
      onClick={() =>
        start(async () => {
          try {
            await guardarCampoConfig("bienvenidaVista", true);
          } catch {}
          router.push("/admin/clases");
        })
      }
      data-qa="b-ir-a-hoy"
    >
      {pendiente ? "Abriendo Hoy…" : "Ir a Hoy"}
    </button>
  );
}
