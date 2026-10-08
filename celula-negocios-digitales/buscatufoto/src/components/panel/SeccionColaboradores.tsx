"use client";

import { useState, type FormEvent } from "react";
import { Aviso, Boton, Dialogo, Entrada, IconoBasura, Insignia, Selector } from "@/components/ui";
import { nuevoId } from "@/lib/ids";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Colaborador, RolColaborador } from "@/lib/tipos";
import { Seccion } from "./comunes";
import s from "./panel.module.css";

export const ROLES: Record<RolColaborador, string> = { fotografo: "Fotógrafo", asistente: "Asistente" };

export function SeccionColaboradores({ album }: { album: Album }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<RolColaborador>("fotografo");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aBorrar, setABorrar] = useState<Colaborador | null>(null);

  async function guardarLista(cambiar: (l: Colaborador[]) => Colaborador[]) {
    const repo = obtenerRepo();
    const actual = (await repo.obtenerAlbum(album.id)) ?? album;
    await repo.actualizarAlbum(album.id, { colaboradores: cambiar(actual.colaboradores) });
  }

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const n = nombre.trim();
    const m = email.trim().toLowerCase();
    if (!n) return setError("Poné el nombre del colaborador.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) return setError("Ese email no parece válido.");
    if (album.colaboradores.some((c) => c.email === m)) return setError("Esa persona ya está en el álbum.");
    setOcupado(true);
    try {
      await guardarLista((l) => [...l, { id: nuevoId("co_"), nombre: n, email: m, rol }]);
      setNombre("");
      setEmail("");
      setOk(`${n} quedó registrado como ${ROLES[rol].toLowerCase()}.`);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  async function quitar() {
    if (!aBorrar) return;
    try {
      await guardarLista((l) => l.filter((c) => c.id !== aBorrar.id));
      setABorrar(null);
    } catch (err) {
      setError(mensajeDeError(err));
      setABorrar(null);
    }
  }

  return (
    <Seccion titulo="Colaboradores" bajada="Otros fotógrafos o asistentes que trabajan en este álbum.">
      <Aviso tono="demo">En la demo se registran, pero no reciben invitación ni pueden entrar todavía.</Aviso>

      {album.colaboradores.length === 0 ? (
        <p className={s.ayudaChica}>Todavía no sumaste a nadie.</p>
      ) : (
        <ul className={s.listaSimple}>
          {album.colaboradores.map((c) => (
            <li key={c.id}>
              <div className={s.listaSimpleTexto}>
                <strong>{c.nombre}</strong>
                <span className={`mono ${s.ayudaChica}`}>{c.email}</span>
              </div>
              <Insignia>{ROLES[c.rol]}</Insignia>
              <Boton variante="fantasma" icono tam="chico" aria-label={`Quitar a ${c.nombre}`} title="Quitar" onClick={() => setABorrar(c)}>
                <IconoBasura />
              </Boton>
            </li>
          ))}
        </ul>
      )}

      <form className={s.filaAlta} onSubmit={agregar} noValidate>
        <Entrada etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        <Entrada etiqueta="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <Selector etiqueta="Rol" value={rol} onChange={(e) => setRol(e.target.value as RolColaborador)}>
          <option value="fotografo">Fotógrafo</option>
          <option value="asistente">Asistente</option>
        </Selector>
        <Boton type="submit" variante="primario" disabled={ocupado} className={s.botonAlta}>
          Sumar
        </Boton>
      </form>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
      {ok ? <Aviso tono="ok">{ok}</Aviso> : null}

      <Dialogo
        abierto={aBorrar !== null}
        onCerrar={() => setABorrar(null)}
        titulo="¿Quitar colaborador?"
        pie={
          <div className={s.filaBotones}>
            <Boton variante="peligro" onClick={quitar}>
              Sí, quitar
            </Boton>
            <Boton variante="fantasma" onClick={() => setABorrar(null)}>
              Cancelar
            </Boton>
          </div>
        }
      >
        <p>
          {aBorrar?.nombre} deja de figurar en <strong>{album.nombre}</strong>.
        </p>
      </Dialogo>
    </Seccion>
  );
}
