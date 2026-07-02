import Link from "next/link";
import { whatsappLink } from "@/lib/business-config";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--spa-ivory)", color: "var(--spa-ink)" }}
    >
      <header
        className="border-b backdrop-blur sticky top-0 z-10"
        style={{ borderColor: "var(--spa-sage-light)", background: "rgba(251,248,244,0.9)" }}
      >
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-serif"
              style={{ borderColor: "var(--spa-gold)", color: "var(--spa-mocha)" }}
            >
              B
            </span>
            <span
              className="font-serif text-xl tracking-tight whitespace-nowrap"
              style={{ color: "var(--spa-mocha-dark)" }}
            >
              Beauty &amp; Spa
            </span>
          </Link>
          <nav className="flex items-center gap-5 sm:gap-8 text-sm">
            <Link
              href="/#servicios"
              className="hidden sm:inline transition-colors hover:opacity-70"
              style={{ color: "var(--spa-mocha-dark)" }}
            >
              Servicios
            </Link>
            <Link
              href="/#profesionales"
              className="hidden sm:inline transition-colors hover:opacity-70"
              style={{ color: "var(--spa-mocha-dark)" }}
            >
              Profesionales
            </Link>
            <Link
              href="/reserva"
              className="rounded-full px-5 py-2.5 font-medium whitespace-nowrap text-sm transition-transform hover:scale-105"
              style={{ background: "var(--spa-mocha-dark)", color: "var(--spa-ivory)" }}
            >
              Reservar turno
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t" style={{ borderColor: "var(--spa-sage-light)" }}>
        <div
          className="mx-auto max-w-6xl px-6 py-10 text-sm flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"
          style={{ color: "var(--spa-mocha)" }}
        >
          <span className="font-serif text-base" style={{ color: "var(--spa-mocha-dark)" }}>
            © {new Date().getFullYear()} Beauty &amp; Spa — Carolina Haponiuk
          </span>
          <div className="flex flex-wrap items-center gap-5">
            <span>Barrio La Alameda, Canning</span>
            <a
              href={whatsappLink("Hola! Quería consultar sobre un turno en Beauty & Spa.")}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-70"
            >
              Escribinos por WhatsApp
            </a>
            <Link href="/admin" className="opacity-60 hover:opacity-100">
              Acceso administrador
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
