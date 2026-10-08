"use client";

import { useState, type FormEvent } from "react";
import { Aviso, BarraProgreso, Boton, Entrada, ModoDemo, Segmentado, Tarjeta } from "@/components/ui";
import { asegurarMuestras } from "@/lib/muestras";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import { iniciarSesion } from "@/lib/sesion";
import s from "./panel.module.css";

type Pestana = "crear" | "ingresar";

/** Alta e ingreso de prueba en una sola pantalla. Sin contraseña: la cuenta vive en este navegador. */
export function Ingreso({ aviso }: { aviso?: string }) {
  const [pestana, setPestana] = useState<Pestana>("crear");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const repo = obtenerRepo();
      if (pestana === "crear") {
        const f = await repo.registrarFotografo({ nombre, email });
        iniciarSesion(f.id);
      } else {
        if (!email.trim()) throw new Error("Poné el email con el que creaste la cuenta.");
        const f = await repo.fotografoPorEmail(email);
        if (!f) throw new Error("No hay ninguna cuenta con ese email en este navegador. Creala en la pestaña “Crear cuenta”.");
        iniciarSesion(f.id);
      }
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  async function probarMuestra() {
    setError(null);
    setOcupado(true);
    setProgreso({ hechas: 0, total: 1 });
    try {
      const { fotografo } = await asegurarMuestras((hechas, total) => setProgreso({ hechas, total }));
      iniciarSesion(fotografo.id);
    } catch (err) {
      setError(mensajeDeError(err));
      setProgreso(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className={s.ingreso}>
      <div className={s.ingresoTexto}>
        <p className="rotulo">Panel del fotógrafo</p>
        <h1 className="titulo-l">Subí, marcá y vendé tus fotos del evento.</h1>
        <p className="bajada">
          Creás el álbum, subís las fotos y la marca de agua se pone sola. Compartís un enlace y la gente se busca por su número.
        </p>
        <ul className={s.ingresoLista}>
          <li>Marca de agua automática, con tu logo si querés.</li>
          <li>Dorsales tomados del nombre del archivo o a mano.</li>
          <li>Paquetes, descuento por cantidad y cupones.</li>
          <li>Enlace para compartir y placa para historias.</li>
        </ul>
      </div>

      <Tarjeta className={s.ingresoTarjeta}>
        <Segmentado<Pestana>
          etiqueta="Cuenta"
          valor={pestana}
          onChange={(v) => {
            setPestana(v);
            setError(null);
          }}
          opciones={[
            { valor: "crear", texto: "Crear cuenta" },
            { valor: "ingresar", texto: "Ingresar" },
          ]}
        />

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <form className={s.formulario} onSubmit={enviar} noValidate>
          {pestana === "crear" ? (
            <Entrada
              etiqueta="Tu nombre o el de tu estudio"
              name="nombre"
              autoComplete="organization"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          ) : null}
          <Entrada
            etiqueta="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <span className={s.rotuloLargo}>
            <ModoDemo>Cuenta de prueba: sin contraseña, los datos quedan en este navegador</ModoDemo>
          </span>
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}
          <Boton type="submit" variante="primario" tam="grande" ancho disabled={ocupado}>
            {pestana === "crear" ? "Crear mi cuenta" : "Ingresar"}
          </Boton>
        </form>

        <div className={s.ingresoMuestra}>
          <p className={s.ayudaChica}>¿Querés ver cómo queda sin cargar nada? Abrimos una cuenta con un álbum ficticio de 18 fotos.</p>
          <Boton variante="secundario" ancho onClick={probarMuestra} disabled={ocupado}>
            Probar con la cuenta de muestra
          </Boton>
          {progreso ? (
            <div className={s.progreso}>
              <BarraProgreso valor={progreso.total ? progreso.hechas / progreso.total : 0} etiqueta="Preparando la cuenta de muestra" />
              <span className={`mono ${s.ayudaChica}`}>
                Preparando fotos de muestra: {progreso.hechas} de {progreso.total}
              </span>
            </div>
          ) : null}
        </div>
      </Tarjeta>
    </div>
  );
}
