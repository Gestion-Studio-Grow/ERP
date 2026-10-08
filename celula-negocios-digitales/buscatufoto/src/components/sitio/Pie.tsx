import Link from "next/link";
import { Logo } from "./Logo";
import s from "./sitio.module.css";

export function Pie() {
  return (
    <footer className={s.pie}>
      <div className={`contenedor ${s.pieInterior}`}>
        <div className={`${s.pieCol} ${s.pieMarca}`}>
          <Logo />
          <p style={{ color: "var(--muted)", maxWidth: "34ch" }}>
            Fotos y videos de tu carrera, tu torneo o tu fiesta. Buscás tu número, elegís y descargás.
          </p>
        </div>
        <nav className={s.pieCol} aria-label="Producto">
          <span className={s.pieTitulo}>Producto</span>
          <Link href="/funciones">Funciones</Link>
          <Link href="/#precios">Precios</Link>
          <Link href="/calculadora">Calculadora</Link>
          <Link href="/blog">Blog</Link>
        </nav>
        <nav className={s.pieCol} aria-label="Ayuda">
          <span className={s.pieTitulo}>Ayuda</span>
          <Link href="/preguntas">Preguntas frecuentes</Link>
          <Link href="/contacto">Contacto</Link>
          <Link href="/contacto#soporte">Soporte</Link>
        </nav>
        <nav className={s.pieCol} aria-label="Legal">
          <span className={s.pieTitulo}>Nosotros</span>
          <Link href="/nosotros">Sobre nosotros</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/privacidad">Privacidad</Link>
        </nav>
      </div>
      <div className={`contenedor ${s.pieLegal}`}>
        <span>© 2026 buscatufoto. Hecho en Argentina.</span>
        <span>Demo: pagos y WhatsApp en modo demostración.</span>
      </div>
    </footer>
  );
}
