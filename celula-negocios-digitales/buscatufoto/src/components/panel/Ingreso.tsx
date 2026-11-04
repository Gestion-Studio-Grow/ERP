"use client";

import { useState, type FormEvent } from "react";
import { Aviso, BarraProgreso, Boton, Entrada, ModoDemo, Segmentado, Tarjeta } from "@/components/ui";
import { asegurarMuestras } from "@/lib/muestras";
import { mensajeDeError, obtenerRepo, useModoRepo } from "@/lib/repo";
import { iniciarSesion } from "@/lib/sesion";
import s from "./panel.module.css";

type Pestana = "crear" | "ingresar";

/**
 * Alta e ingreso en una sola pantalla.
 * - Demo: sin contraseña, la cuenta vive en este navegador (y está la cuenta de muestra).
 * - Servidor: email + contraseña; el alta pide el código de invitación.
 */
export function Ingreso({ aviso }: { aviso?: string }) {
  const [pestana, setPestana] = useState<Pestana>("crear");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [codigo, setCodigo] = useState("");
  const modo = useModoRepo();
  const servidor = modo === "servidor";
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const repo = obtenerRepo();
      if (servidor) {
        if (!email.trim()) throw new Error("Poné tu email.");
        if (pestana === "crear") {
          if (!nombre.trim()) throw new Error("Poné tu nombre o el de tu estudio.");
          if (contrasena.length < 8) throw new Error("La contraseña necesita 8 caracteres o más.");
          if (!codigo.trim()) throw new Error("Poné el código de invitación que te pasamos.");
          const f = await repo.alta({ nombre, email, contrasena, codigo });
          iniciarSesion(f.id);
        } else {
          if (!contrasena) throw new Error("Poné tu contraseña.");
          const f = await repo.ingresar(email, contrasena);
          iniciarSesion(f.id);
        }
      } else if (pestana === "crear") {
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
          {servidor ? (
            <>
              <Entrada
                etiqueta="Contraseña"
                name="contrasena"
                type="password"
                autoComplete={pestana === "crear" ? "new-password" : "current-password"}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
              />
              {pestana === "crear" ? (
                <Entrada
                  etiqueta="Código de invitación"
                  name="codigo"
                  autoComplete="off"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  required
                />
              ) : null}
            </>
          ) : (
            <span className={s.rotuloLargo}>
              <ModoDemo>Cuenta de prueba: sin contraseña, los datos quedan en este navegador</ModoDemo>
            </span>
          )}
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}
          <Boton type="submit" variante="primario" tam="grande" ancho disabled={ocupado || modo === undefined}>
            {pestana === "crear" ? "Crear mi cuenta" : "Ingresar"}
          </Boton>
        </form>

        {modo === "demo" ? (
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
        ) : null}
      </Tarjeta>
    </div>
  );
}
