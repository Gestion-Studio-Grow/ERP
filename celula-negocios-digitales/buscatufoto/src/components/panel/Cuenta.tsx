"use client";

import { useState, type FormEvent } from "react";
import { AreaTexto, Aviso, Boton, BotonLink, Entrada, Insignia, ModoDemo, Segmentado, SoloDemo, Tarjeta } from "@/components/ui";
import { aSlug } from "@/lib/ids";
import { mensajeDeError, obtenerRepo, useModoRepo } from "@/lib/repo";
import type { DatosCobro, Fotografo, MetodoCobro } from "@/lib/tipos";
import { Encabezado, useFotografo, useOrigen } from "./comunes";
import s from "./panel.module.css";

/* ---------- Mi perfil ---------- */

interface BorradorPerfil {
  nombre: string;
  email: string;
  usuario: string;
  bio: string;
  instagram: string;
}

const perfilDe = (f: Fotografo): BorradorPerfil => ({ nombre: f.nombre, email: f.email, usuario: f.usuario, bio: f.bio, instagram: f.instagram });

export function Perfil() {
  const f = useFotografo();
  return <FormPerfil key={f.id} f={f} />;
}

function FormPerfil({ f }: { f: Fotografo }) {
  const origen = useOrigen();
  const [b, setB] = useState<BorradorPerfil>(() => perfilDe(f));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const cambiado = JSON.stringify(b) !== JSON.stringify(perfilDe(f));
  const set = (c: Partial<BorradorPerfil>) => {
    setOk(false);
    setB((x) => ({ ...x, ...c }));
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!b.nombre.trim()) return setError("Poné tu nombre o el de tu estudio.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) return setError("Ese email no parece válido.");
    setOcupado(true);
    try {
      const nuevo = await obtenerRepo().actualizarFotografo(f.id, {
        nombre: b.nombre.trim(),
        email: b.email,
        usuario: b.usuario,
        bio: b.bio.trim(),
        instagram: b.instagram
          .trim()
          .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
          .replace(/^@/, "")
          .replace(/\/$/, ""),
      });
      setB(perfilDe(nuevo));
      setOk(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Mi perfil"
        bajada="Lo que ve la gente en tu página pública, con todos tus álbumes publicados."
        acciones={
          <BotonLink href={`/f/${f.usuario}`} externo tam="chico">
            Ver mi perfil público
          </BotonLink>
        }
      />
      <Tarjeta as="section" className={s.tarjetaForm}>
        <form className={s.formulario} onSubmit={guardar} noValidate>
          <div className={s.grilla2}>
            <Entrada etiqueta="Nombre o estudio" value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} autoComplete="organization" />
            <Entrada etiqueta="Email" type="email" inputMode="email" value={b.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" />
          </div>
          <Entrada
            etiqueta="Usuario público"
            value={b.usuario}
            onChange={(e) => set({ usuario: e.target.value })}
            className={s.campoMono}
            spellCheck={false}
            autoCapitalize="off"
            ayuda={
              <>
                Tu página: <span className="mono">{origen}/f/{aSlug(b.usuario) || "…"}</span>. Sólo letras, números y guiones.
              </>
            }
          />
          <AreaTexto etiqueta="Sobre vos" value={b.bio} onChange={(e) => set({ bio: e.target.value })} rows={4} maxLength={400} placeholder="Qué eventos cubrís, dónde, cómo contactarte." />
          <Entrada etiqueta="Instagram" value={b.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="tuestudio" className={s.campoMono} ayuda="Sin la @. También podés pegar el enlace." />
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}
          {ok ? <Aviso tono="ok">Perfil guardado.</Aviso> : null}
          <div className={s.filaBotones}>
            <Boton type="submit" variante="primario" disabled={!cambiado || ocupado}>
              {ocupado ? "Guardando…" : "Guardar perfil"}
            </Boton>
            {cambiado ? (
              <Boton variante="fantasma" onClick={() => setB(perfilDe(f))}>
                Descartar cambios
              </Boton>
            ) : null}
          </div>
        </form>
      </Tarjeta>
    </>
  );
}

/** Modo servidor: el fotógrafo conecta SU cuenta de Mercado Pago pegando el Access Token. Nunca se muestra lo guardado. */
function TokenMercadoPago({ configurado }: { configurado: boolean }) {
  const [token, setToken] = useState("");
  const [estado, setEstado] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conectado = estado ?? configurado;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const t = token.trim();
    if (!t) return setError("Pegá el Access Token de producción de tu cuenta de Mercado Pago.");
    if (t.startsWith("TEST-")) return setError("Ese es un token de prueba (empieza con TEST-). Para cobrar de verdad hace falta el de producción (APP_USR-…).");
    setOcupado(true);
    try {
      await obtenerRepo().guardarTokenMp(t);
      setToken("");
      setEstado(true);
      setOk("Listo: tu cuenta de Mercado Pago quedó conectada.");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  async function quitar() {
    setError(null);
    setOk(null);
    setOcupado(true);
    try {
      await obtenerRepo().quitarTokenMp();
      setEstado(false);
      setOk("Quitamos el token. Mientras no cargues otro, tus compradores sólo pueden pagar por transferencia.");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta as="section" className={s.tarjetaForm}>
      <form className={s.formulario} onSubmit={guardar} noValidate>
        <h2 className="titulo-m">
          Mercado Pago <Insignia tono={conectado ? "ok" : undefined}>{conectado ? "Conectado" : "Sin conectar"}</Insignia>
        </h2>
        <p>
          La plata entra a <strong>TU</strong> cuenta de Mercado Pago; GSG no la toca. El comprador paga en el checkout de Mercado Pago con tu
          cuenta y, cuando el pago se aprueba, se le habilitan las descargas.
        </p>
        <Entrada
          etiqueta={conectado ? "Reemplazar el Access Token" : "Access Token de producción"}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\s/g, ""))}
          className={s.campoMono}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          placeholder="APP_USR-…"
          ayuda="Lo sacás de Mercado Pago Developers → Tus integraciones → Credenciales de producción. Se guarda cifrado y no se vuelve a mostrar."
          disabled={ocupado}
        />
        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : null}
        {ok ? <Aviso tono="ok">{ok}</Aviso> : null}
        <div className={s.filaBotones}>
          <Boton type="submit" variante="primario" disabled={ocupado || !token.trim()}>
            {ocupado ? "Guardando…" : conectado ? "Reemplazar token" : "Conectar Mercado Pago"}
          </Boton>
          {conectado ? (
            <Boton variante="peligro" onClick={quitar} disabled={ocupado}>
              Quitar
            </Boton>
          ) : null}
        </div>
      </form>
    </Tarjeta>
  );
}

/* ---------- Cobros ---------- */

const cobroDe = (f: Fotografo): DatosCobro => f.cobro ?? { metodo: "mercadopago", titular: f.nombre, alias: "", cuit: "" };

export function Cobros() {
  const f = useFotografo();
  return <FormCobros key={f.id} f={f} />;
}

function FormCobros({ f }: { f: Fotografo }) {
  const modo = useModoRepo();
  const [b, setB] = useState<DatosCobro>(() => cobroDe(f));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const cambiado = !f.cobro || JSON.stringify(b) !== JSON.stringify(cobroDe(f));
  const set = (c: Partial<DatosCobro>) => {
    setOk(false);
    setB((x) => ({ ...x, ...c }));
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const cuit = b.cuit.replace(/\D/g, "");
    if (!b.titular.trim()) return setError("Poné el nombre del titular de la cuenta.");
    if (!b.alias.trim()) return setError(b.metodo === "mercadopago" ? "Poné tu alias o CVU de Mercado Pago." : "Poné el alias o el CBU/CVU de la cuenta.");
    if (b.alias.replace(/\s/g, "").match(/^\d+$/) && b.alias.replace(/\s/g, "").length !== 22) return setError("Un CBU o CVU tiene 22 números. Si es un alias, usá letras.");
    if (cuit.length !== 11) return setError("El CUIT o CUIL tiene 11 números (ej.: 20-12345678-3).");
    setOcupado(true);
    try {
      const nuevo = await obtenerRepo().actualizarFotografo(f.id, {
        cobro: { metodo: b.metodo, titular: b.titular.trim(), alias: b.alias.trim(), cuit: `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` },
      });
      setB(cobroDe(nuevo));
      setOk(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Encabezado titulo="Cobros" bajada="Dónde querés recibir la plata de tus ventas." acciones={
          <span className={s.rotuloLargo}>
            <ModoDemo>No se conecta con Mercado Pago ni con ningún banco</ModoDemo>
          </span>
        } />
      <Tarjeta as="section" className={s.tarjetaForm}>
        <form className={s.formulario} onSubmit={guardar} noValidate>
          <div className={s.campoSuelto}>
            <span className={s.etiquetaSuelta}>Cómo cobrás</span>
            <Segmentado<MetodoCobro>
              etiqueta="Método de cobro"
              valor={b.metodo}
              onChange={(v) => set({ metodo: v })}
              opciones={[
                { valor: "mercadopago", texto: "Mercado Pago" },
                { valor: "transferencia", texto: "Transferencia bancaria" },
              ]}
            />
          </div>
          <Entrada etiqueta="Titular" value={b.titular} onChange={(e) => set({ titular: e.target.value })} autoComplete="name" />
          <div className={s.grilla2}>
            <Entrada
              etiqueta={b.metodo === "mercadopago" ? "Alias o CVU" : "Alias o CBU/CVU"}
              value={b.alias}
              onChange={(e) => set({ alias: e.target.value })}
              className={s.campoMono}
              spellCheck={false}
              autoCapitalize="off"
            />
            <Entrada etiqueta="CUIT / CUIL" inputMode="numeric" value={b.cuit} onChange={(e) => set({ cuit: e.target.value })} placeholder="20-12345678-3" />
          </div>
          <SoloDemo>
            <Aviso tono="demo">
              En la demo estos datos sólo se guardan en tu navegador: no se valida la cuenta ni se transfiere plata. Con la plataforma real, cada venta se
              acredita acá menos la comisión de tu plan.
            </Aviso>
          </SoloDemo>
          {error ? (
            <p role="alert" className={s.error}>
              {error}
            </p>
          ) : null}
          {ok ? <Aviso tono="ok">Datos de cobro guardados.</Aviso> : null}
          <div className={s.filaBotones}>
            <Boton type="submit" variante="primario" disabled={!cambiado || ocupado}>
              {ocupado ? "Guardando…" : "Guardar datos de cobro"}
            </Boton>
          </div>
        </form>
      </Tarjeta>
      {modo === "servidor" ? <TokenMercadoPago configurado={!!f.mpConfigurado} /> : null}
    </>
  );
}

