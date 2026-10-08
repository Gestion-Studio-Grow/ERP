"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/sitio/Logo";
import { AlternadorTema } from "@/components/sitio/Tema";
import { Aviso, Boton, IconoCerrar, IconoMenu, Insignia } from "@/components/ui";
import { useDatos } from "@/lib/hooks";
import { PLANES } from "@/lib/planes";
import { obtenerRepo } from "@/lib/repo";
import { cerrarSesion, useSesion } from "@/lib/sesion";
import type { Fotografo } from "@/lib/tipos";
import { Cargando, ContextoFotografo } from "./comunes";
import { Ingreso } from "./Ingreso";
import s from "./panel.module.css";

interface ItemMenu {
  href: string;
  texto: string;
  /** cómo se decide si está activo */
  activo: (ruta: string) => boolean;
}

const MENU: ItemMenu[] = [
  {
    href: "/panel",
    texto: "Mis álbumes",
    activo: (r) => r === "/panel" || (r.startsWith("/panel/albumes/") && r !== "/panel/albumes/nuevo"),
  },
  { href: "/panel/albumes/nuevo", texto: "Crear álbum", activo: (r) => r === "/panel/albumes/nuevo" },
  { href: "/panel/perfil", texto: "Mi perfil", activo: (r) => r === "/panel/perfil" },
  { href: "/panel/ventas", texto: "Ventas", activo: (r) => r === "/panel/ventas" },
  { href: "/panel/descuentos", texto: "Descuentos y paquetes", activo: (r) => r === "/panel/descuentos" },
  { href: "/panel/cupones", texto: "Cupones", activo: (r) => r === "/panel/cupones" },
  { href: "/panel/colaboradores", texto: "Colaboradores", activo: (r) => r === "/panel/colaboradores" },
  { href: "/panel/marca", texto: "Marca de agua", activo: (r) => r === "/panel/marca" },
  { href: "/panel/cobros", texto: "Cobros", activo: (r) => r === "/panel/cobros" },
  { href: "/panel/facturacion", texto: "Facturación", activo: (r) => r === "/panel/facturacion" },
];

/** Marco del panel del fotógrafo: barra de 64 px, menú y contenido. Sin sesión muestra el ingreso. */
export function MarcoPanel({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const ruta = usePathname();
  const [menu, setMenu] = useState(false);
  const [rutaMenu, setRutaMenu] = useState(ruta);

  // Cerrar el menú móvil al navegar (estado derivado, sin efecto).
  if (rutaMenu !== ruta) {
    setRutaMenu(ruta);
    setMenu(false);
  }

  const r = useDatos(
    async () => ({ id: sesion, fotografo: sesion ? await obtenerRepo().obtenerFotografo(sesion) : null }),
    [sesion],
    ["fotografos"],
  );

  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [menu]);

  const vigente = r.estado === "listo" && r.datos.id === sesion;
  const fotografo: Fotografo | null = vigente ? r.datos.fotografo : null;

  let contenido: ReactNode;
  if (sesion === undefined || (sesion && !vigente && r.estado !== "error")) {
    contenido = <Cargando texto="Abriendo tu panel…" />;
  } else if (sesion && r.estado === "error") {
    contenido = (
      <>
        <Aviso tono="error">No pudimos abrir los datos de este navegador: {r.error}</Aviso>
        <Ingreso />
      </>
    );
  } else if (!fotografo) {
    contenido = <Ingreso aviso={sesion ? "No encontramos tu cuenta en este navegador. Creala de nuevo o probá con la cuenta de muestra." : undefined} />;
  } else {
    contenido = <ContextoFotografo.Provider value={fotografo}>{children}</ContextoFotografo.Provider>;
  }

  return (
    <div className={s.marco}>
      <header className={s.barra}>
        <div className={s.barraIzq}>
          <Logo href="/" />
          <span className={s.barraRotulo}>panel</span>
          <AlternadorTema />
        </div>
        <div className={s.barraDer}>
          {fotografo ? (
            <>
              <span className={s.barraNombre} title={fotografo.nombre}>
                {fotografo.nombre}
              </span>
              <span className={s.barraPlan}>
                <Insignia tono={fotografo.plan === "pro" ? "acento" : undefined}>Plan {PLANES[fotografo.plan].nombre}</Insignia>
              </span>
              <Boton
                variante="fantasma"
                icono
                className={s.soloMovil}
                aria-label={menu ? "Cerrar menú del panel" : "Abrir menú del panel"}
                aria-expanded={menu}
                aria-controls="menu-panel"
                onClick={() => setMenu((m) => !m)}
              >
                {menu ? <IconoCerrar /> : <IconoMenu />}
              </Boton>
            </>
          ) : null}
        </div>
      </header>

      <div className={s.cuerpo} data-con-menu={fotografo ? "true" : "false"}>
        {fotografo ? (
          <aside className={s.lateral}>
            <MenuPanel ruta={ruta} fotografo={fotografo} />
          </aside>
        ) : null}
        <main id="contenido" className={s.principal}>
          {contenido}
          <footer className={s.credito}>Hecho por Gestión Studio Grow</footer>
        </main>
      </div>

      {menu && fotografo ? (
        <div id="menu-panel" className={s.menuMovil}>
          <MenuPanel ruta={ruta} fotografo={fotografo} alElegir={() => setMenu(false)} />
        </div>
      ) : null}
    </div>
  );
}

function MenuPanel({ ruta, fotografo, alElegir }: { ruta: string; fotografo: Fotografo; alElegir?: () => void }) {
  const router = useRouter();
  return (
    <nav aria-label="Panel del fotógrafo" className={s.menu}>
      <ul>
        {MENU.map((m) => (
          <li key={m.href}>
            <Link href={m.href} className={s.menuLink} aria-current={m.activo(ruta) ? "page" : undefined} onClick={alElegir}>
              {m.texto}
            </Link>
          </li>
        ))}
        <li className={s.menuSeparado}>
          <a href={`/f/${fotografo.usuario}`} className={s.menuLink} target="_blank" rel="noopener noreferrer">
            Ver mi perfil público <span className="sr-only">(se abre en otra pestaña)</span>
            <span aria-hidden className={s.menuExterno}>↗</span>
          </a>
        </li>
        <li>
          <button
            type="button"
            className={s.menuLink}
            onClick={() => {
              alElegir?.();
              cerrarSesion();
              router.push("/panel");
            }}
          >
            Cerrar sesión
          </button>
        </li>
      </ul>
    </nav>
  );
}
