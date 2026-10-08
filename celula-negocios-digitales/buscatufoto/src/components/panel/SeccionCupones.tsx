"use client";

import { useState } from "react";
import { Aviso, Boton, Entrada, IconoBasura, IconoMas, Insignia, Interruptor, Selector } from "@/components/ui";
import { plata } from "@/lib/dinero";
import { nuevoId } from "@/lib/ids";
import { cotizar, motivoCuponInvalido } from "@/lib/precios";
import { mensajeDeError, obtenerRepo } from "@/lib/repo";
import type { Album, Cupon, Medio } from "@/lib/tipos";
import { aEntero, Seccion } from "./comunes";
import s from "./panel.module.css";

interface CuponB {
  id: string;
  /** código con el que se guardó (para no perder los usos al renombrar); vacío en filas nuevas */
  orig: string;
  codigo: string;
  tipo: Cupon["tipo"];
  valor: string;
  tope: string;
  usosMax: string;
  activo: boolean;
}

function desdeAlbum(a: Album): CuponB[] {
  return a.cupones.map((c, i) => ({
    id: `c${i}`,
    orig: c.codigo.toUpperCase(),
    codigo: c.codigo,
    tipo: c.tipo,
    valor: String(c.valor),
    tope: String(c.tope),
    usosMax: String(c.usosMax),
    activo: c.activo,
  }));
}

const firma = (l: CuponB[]) => JSON.stringify(l.map(({ codigo, tipo, valor, tope, usosMax, activo }) => [codigo.trim().toUpperCase(), tipo, valor.trim(), tope.trim(), usosMax.trim(), activo]));

const opcional = (t: string) => (t.trim() === "" ? 0 : aEntero(t));

/** Arma los cupones con los usos que tiene el álbum guardado (los usos los suma el carrito, no se editan). */
function aCupones(l: CuponB[], usosDe: (codigo: string) => number): { cupones: Cupon[]; error: string | null } {
  let error: string | null = null;
  const cupones = l.map((c) => {
    const codigo = c.codigo.trim().toUpperCase();
    const valor = aEntero(c.valor);
    const tope = opcional(c.tope);
    const usosMax = opcional(c.usosMax);
    if (!Number.isFinite(valor)) error ??= `Poné el valor del cupón ${codigo || "sin código"} (número entero).`;
    if (!Number.isFinite(tope) || !Number.isFinite(usosMax)) error ??= `El tope y los usos del cupón ${codigo || "sin código"} van en números enteros (0 = sin límite).`;
    return { codigo, tipo: c.tipo, valor, tope: c.tipo === "porcentaje" ? tope : 0, usosMax, usos: c.orig ? usosDe(c.orig) : 0, activo: c.activo };
  });
  return { cupones, error };
}

export function SeccionCupones({ album, medios }: { album: Album; medios: Medio[] }) {
  const [lista, setLista] = useState<CuponB[]>(() => desdeAlbum(album));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cambiado = firma(lista) !== firma(desdeAlbum(album));
  const usosEn = (a: Album) => (codigo: string) => a.cupones.find((x) => x.codigo.toUpperCase() === codigo)?.usos ?? 0;
  const editar = (id: string, c: Partial<CuponB>) => {
    setOk(false);
    setLista((l) => l.map((x) => (x.id === id ? { ...x, ...c } : x)));
  };

  async function guardar() {
    setError(null);
    setOk(false);
    setOcupado(true);
    try {
      const repo = obtenerRepo();
      // Releemos el álbum: si alguien usó un cupón mientras editabas, no pisamos sus usos.
      const actual = (await repo.obtenerAlbum(album.id)) ?? album;
      const { cupones, error: e } = aCupones(lista, usosEn(actual));
      if (e) throw new Error(e);
      const a = await repo.actualizarAlbum(album.id, { cupones });
      setLista(desdeAlbum(a));
      setOk(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  // Ejemplo con 3 fotos (o las que haya) para ver el efecto de cada cupón.
  const n = medios.length > 0 ? Math.min(3, medios.length) : 3;
  const items = Array.from({ length: n }, () => ({ tipo: "foto" as const }));
  const { cupones: vista } = aCupones(lista, usosEn(album));
  const base = { ...album, cupones: vista.map((c) => ({ ...c, valor: Number.isFinite(c.valor) ? c.valor : 0, tope: Number.isFinite(c.tope) ? c.tope : 0, usosMax: Number.isFinite(c.usosMax) ? c.usosMax : 0 })) };
  const sinCupon = cotizar(base, items, null, medios.length);

  return (
    <Seccion
      titulo="Cupones"
      bajada="Un código que el comprador escribe en el carrito. Porcentaje (con tope en pesos si querés) o monto fijo. Se aplica sobre el precio ya con paquetes o descuentos."
      acciones={
        <Boton
          tam="chico"
          onClick={() => {
            setOk(false);
            setLista((l) => [...l, { id: nuevoId("c_"), orig: "", codigo: "", tipo: "porcentaje", valor: "10", tope: "0", usosMax: "0", activo: true }]);
          }}
        >
          <IconoMas /> Agregar cupón
        </Boton>
      }
    >
      {lista.length === 0 ? <p className={s.ayudaChica}>Este álbum no tiene cupones.</p> : null}
      <ul className={s.listaFilas}>
        {lista.map((c) => {
          const codigo = c.codigo.trim().toUpperCase();
          const guardado = album.cupones.find((x) => x.codigo.toUpperCase() === codigo);
          const usos = guardado?.usos ?? 0;
          const motivo = guardado ? motivoCuponInvalido(guardado) : null;
          const ejemplo = codigo ? cotizar(base, items, codigo, medios.length) : null;
          return (
            <li key={c.id} className={s.tarjetaCupon}>
              <div className={s.filaEdicionCupon}>
                <Entrada
                  etiqueta="Código"
                  className={s.campoMono}
                  value={c.codigo}
                  onChange={(e) => editar(c.id, { codigo: e.target.value.toUpperCase().replace(/\s/g, "") })}
                  placeholder="LLEGADA"
                  maxLength={20}
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <Selector etiqueta="Tipo" value={c.tipo} onChange={(e) => editar(c.id, { tipo: e.target.value as Cupon["tipo"] })}>
                  <option value="porcentaje">Porcentaje</option>
                  <option value="monto">Monto fijo</option>
                </Selector>
                <Entrada etiqueta={c.tipo === "porcentaje" ? "Descuento (%)" : "Descuento (ARS)"} inputMode="numeric" value={c.valor} onChange={(e) => editar(c.id, { valor: e.target.value })} />
                {c.tipo === "porcentaje" ? (
                  <Entrada etiqueta="Tope (ARS)" inputMode="numeric" value={c.tope} onChange={(e) => editar(c.id, { tope: e.target.value })} ayuda="0 = sin tope" />
                ) : null}
                <Entrada etiqueta="Usos máximos" inputMode="numeric" value={c.usosMax} onChange={(e) => editar(c.id, { usosMax: e.target.value })} ayuda="0 = ilimitado" />
              </div>
              <div className={s.pieCupon}>
                <Interruptor etiqueta="Activo" checked={c.activo} onChange={(v) => editar(c.id, { activo: v })} />
                <span className={s.ayudaChica}>
                  Usado <span className="mono">{usos}</span>
                  {Number(c.usosMax) > 0 ? (
                    <>
                      {" "}
                      de <span className="mono">{c.usosMax}</span>
                    </>
                  ) : null}{" "}
                  {usos === 1 ? "vez" : "veces"}
                </span>
                {motivo && guardado?.activo ? <Insignia>Agotado</Insignia> : null}
                {!c.activo ? <Insignia>Pausado</Insignia> : null}
                {ejemplo && ejemplo.cupon ? (
                  <span className={s.ayudaChica}>
                    Ejemplo: {n} {n === 1 ? "foto" : "fotos"} = <span className="mono">{plata(sinCupon.subtotal)}</span> → con {codigo}:{" "}
                    <strong className="mono">{plata(ejemplo.total)}</strong>
                  </span>
                ) : null}
                <Boton
                  variante="fantasma"
                  tam="chico"
                  className={s.empujarDerecha}
                  aria-label={`Quitar el cupón ${codigo || "sin código"}`}
                  onClick={() => {
                    setOk(false);
                    setLista((l) => l.filter((x) => x.id !== c.id));
                  }}
                >
                  <IconoBasura /> Quitar
                </Boton>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
      {ok ? <Aviso tono="ok">Cupones guardados.</Aviso> : null}
      {cambiado ? (
        <div className={s.filaBotones}>
          <span className={s.ayudaChica}>Tenés cambios sin guardar. Si quitaste un cupón, recién se borra al guardar.</span>
          <Boton variante="primario" onClick={guardar} disabled={ocupado}>
            {ocupado ? "Guardando…" : "Guardar cupones"}
          </Boton>
          <Boton
            variante="fantasma"
            onClick={() => {
              setLista(desdeAlbum(album));
              setError(null);
            }}
          >
            Descartar
          </Boton>
        </div>
      ) : null}
    </Seccion>
  );
}
