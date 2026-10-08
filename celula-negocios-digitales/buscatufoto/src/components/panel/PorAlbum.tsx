"use client";

import type { ReactNode } from "react";
import { BotonLink, Insignia, Tarjeta, Vacio } from "@/components/ui";
import { fechaLarga, plata } from "@/lib/dinero";
import { motivoCuponInvalido } from "@/lib/precios";
import type { Album } from "@/lib/tipos";
import { Cargando, Encabezado, ErrorCarga, useAlbumes, useFotografo } from "./comunes";
import { ROLES } from "./SeccionColaboradores";
import s from "./panel.module.css";

/**
 * Vistas globales del menú (descuentos, cupones, colaboradores). En buscatufoto se configuran POR ÁLBUM:
 * acá se listan agrupados y cada uno lleva a editarlo en su álbum.
 */
function ListaPorAlbum({
  titulo,
  bajada,
  seccion,
  render,
}: {
  titulo: string;
  bajada: string;
  seccion: string;
  render: (a: Album) => ReactNode;
}) {
  const f = useFotografo();
  const d = useAlbumes(f.id);
  return (
    <>
      <Encabezado titulo={titulo} bajada={bajada} />
      {d.estado === "cargando" ? <Cargando /> : null}
      {d.estado === "error" ? <ErrorCarga error={d.error} /> : null}
      {d.estado === "listo" && d.datos.length === 0 ? (
        <Vacio>
          <strong style={{ color: "var(--fg)" }}>Todavía no tenés álbumes.</strong>
          <span>Se configura dentro de cada álbum. Creá el primero.</span>
          <BotonLink href="/panel/albumes/nuevo" variante="primario">
            Crear álbum
          </BotonLink>
        </Vacio>
      ) : null}
      {d.estado === "listo" && d.datos.length > 0 ? (
        <ul className={s.listaPorAlbum}>
          {d.datos.map((a) => (
            <li key={a.id}>
              <Tarjeta as="article" className={s.tarjetaPorAlbum}>
                <div className={s.porAlbumCabeza}>
                  <div>
                    <h2 className={s.porAlbumTitulo}>{a.nombre}</h2>
                    <p className={s.ayudaChica}>{fechaLarga(a.fecha)}</p>
                  </div>
                  <BotonLink href={`/panel/albumes/${a.id}?seccion=${seccion}`} tam="chico">
                    Editar en el álbum
                  </BotonLink>
                </div>
                {render(a)}
              </Tarjeta>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function DescuentosGlobal() {
  return (
    <ListaPorAlbum
      titulo="Descuentos y paquetes"
      bajada="Cada álbum tiene su precio, sus paquetes y su descuento por cantidad. Acá los ves todos juntos."
      seccion="precios"
      render={(a) => (
        <div className={s.resumen}>
          <p>
            Precio por foto <strong className="mono">{plata(a.precioFoto)}</strong> · por video{" "}
            <strong className="mono">{a.precioVideo > 0 ? plata(a.precioVideo) : "igual que foto"}</strong>
          </p>
          {a.paquetes.length ? (
            <ul className={s.chips}>
              {a.paquetes.map((p) => (
                <li key={p.id}>
                  <Insignia>
                    {p.nombre}: {p.cantidad === 0 ? "todo el álbum" : `${p.cantidad} u.`} a <span className="mono">{plata(p.precio)}</span>
                  </Insignia>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.ayudaChica}>Sin paquetes.</p>
          )}
          {a.escalones.length ? (
            <ul className={s.chips}>
              {a.escalones.map((e, i) => (
                <li key={i}>
                  <Insignia tono="acento">
                    <span className="mono">{e.porcentaje} %</span> off desde <span className="mono">{e.desde}</span>
                  </Insignia>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.ayudaChica}>Sin descuento por cantidad.</p>
          )}
        </div>
      )}
    />
  );
}

export function CuponesGlobal() {
  return (
    <ListaPorAlbum
      titulo="Cupones"
      bajada="Los cupones son de cada álbum. Acá ves cuántas veces se usó cada uno."
      seccion="cupones"
      render={(a) =>
        a.cupones.length ? (
          <ul className={s.listaSimple}>
            {a.cupones.map((c) => {
              const motivo = motivoCuponInvalido(c);
              return (
                <li key={c.codigo}>
                  <div className={s.listaSimpleTexto}>
                    <strong className="mono">{c.codigo}</strong>
                    <span className={s.ayudaChica}>
                      {c.tipo === "porcentaje" ? `${c.valor} %${c.tope ? ` (tope ${plata(c.tope)})` : ""}` : `${plata(c.valor)} de descuento`}
                    </span>
                  </div>
                  <span className={`mono ${s.ayudaChica}`}>
                    {c.usos}
                    {c.usosMax ? ` / ${c.usosMax}` : ""} usos
                  </span>
                  <Insignia tono={motivo ? undefined : "ok"}>{!c.activo ? "Pausado" : motivo ? "Agotado" : "Activo"}</Insignia>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={s.ayudaChica}>Sin cupones.</p>
        )
      }
    />
  );
}

export function ColaboradoresGlobal() {
  return (
    <ListaPorAlbum
      titulo="Colaboradores"
      bajada="Quién trabaja en cada álbum. En la demo se registran, pero no reciben invitación ni pueden entrar todavía."
      seccion="colaboradores"
      render={(a) =>
        a.colaboradores.length ? (
          <ul className={s.listaSimple}>
            {a.colaboradores.map((c) => (
              <li key={c.id}>
                <div className={s.listaSimpleTexto}>
                  <strong>{c.nombre}</strong>
                  <span className={`mono ${s.ayudaChica}`}>{c.email}</span>
                </div>
                <Insignia>{ROLES[c.rol]}</Insignia>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.ayudaChica}>Sin colaboradores.</p>
        )
      }
    />
  );
}
