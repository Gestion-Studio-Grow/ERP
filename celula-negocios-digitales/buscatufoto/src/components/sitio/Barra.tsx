"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Boton, BotonLink, IconoCerrar, IconoIdioma, IconoMenu } from "@/components/ui";
import { Logo } from "./Logo";
import s from "./sitio.module.css";
import { AlternadorTema } from "./Tema";

const NAV = [
  { href: "/#como-funciona", texto: "¿Cómo funciona?" },
  { href: "/#precios", texto: "Precios" },
  { href: "/blog", texto: "Blog" },
];

/** Barra superior de 64 px: logo, tema, idioma, navegación y acceso "Soy fotógrafo". */
export function Barra() {
  const ruta = usePathname();
  const [desplazada, setDesplazada] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rutaMenu, setRutaMenu] = useState(ruta);

  // Cerrar el menú móvil al navegar (patrón de estado derivado, sin efecto).
  if (rutaMenu !== ruta) {
    setRutaMenu(ruta);
    setMenu(false);
  }

  useEffect(() => {
    const f = () => setDesplazada(window.scrollY > 8);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [menu]);

  return (
    <header className={s.barra} data-desplazada={desplazada || menu}>
      <div className={`contenedor ${s.barraInterior}`}>
        <div className={s.barraIzq}>
          <Logo />
          <span style={{ width: 8 }} />
          <AlternadorTema />
          <Idioma />
        </div>
        <nav className={s.barraNav} aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={s.navLink} aria-current={ruta === n.href ? "page" : undefined}>
              {n.texto}
            </Link>
          ))}
        </nav>
        <div className={s.barraDer}>
          <BotonLink href="/panel" variante="claro" tam="chico" className={s.soloEscritorio}>
            Soy fotógrafo
          </BotonLink>
          <Boton
            variante="fantasma"
            icono
            className={s.soloMovil}
            aria-label={menu ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menu}
            aria-controls="menu-movil"
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? <IconoCerrar /> : <IconoMenu />}
          </Boton>
        </div>
      </div>
      {menu ? (
        <nav id="menu-movil" className={s.menuMovil} aria-label="Menú">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMenu(false)}>
              {n.texto}
            </Link>
          ))}
          <Link href="/funciones" onClick={() => setMenu(false)}>
            Funciones
          </Link>
          <Link href="/calculadora" onClick={() => setMenu(false)}>
            Calculadora
          </Link>
          <div style={{ paddingTop: 16 }}>
            <BotonLink href="/panel" variante="primario" ancho tam="grande">
              Soy fotógrafo
            </BotonLink>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

/** Selector de idioma. Hoy sólo español rioplatense; inglés anunciado como próximamente (no se finge). */
function Idioma() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);
  return (
    <div className={s.idioma} ref={ref}>
      <Boton variante="fantasma" icono aria-label="Idioma: español" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        <IconoIdioma />
      </Boton>
      {abierto ? (
        <div className={s.idiomaMenu} role="menu" aria-label="Idioma">
          <button type="button" role="menuitemradio" aria-checked="true" className={s.idiomaOpcion} onClick={() => setAbierto(false)}>
            Español (Argentina)
          </button>
          <button type="button" role="menuitemradio" aria-checked="false" className={s.idiomaOpcion} disabled>
            English <span style={{ fontSize: 12 }}>próximamente</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
