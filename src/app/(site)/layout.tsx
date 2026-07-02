import Link from "next/link";
import { whatsappLink } from "@/lib/business-config";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--spa-ivory)", color: "var(--spa-ink)" }}
    >
      <header
        className="sticky top-0 z-10"
        style={{
          borderBottom: "1px solid var(--spa-hairline)",
          background: "var(--spa-ivory)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-baseline gap-2 shrink-0">
            <span
              className="font-serif text-2xl leading-none tracking-tight"
              style={{ color: "var(--spa-ink)" }}
            >
              Beauty
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.3em]"
              style={{ color: "var(--spa-gold)" }}
            >
              &amp; Spa
            </span>
          </Link>

          <nav className="flex items-center gap-8">
            <Link
              href="/#servicios"
              className="hidden sm:inline text-xs uppercase tracking-[0.15em] transition-opacity hover:opacity-60"
              style={{ color: "var(--spa-ink)" }}
            >
              Servicios
            </Link>
            <Link
              href="/#profesionales"
              className="hidden sm:inline text-xs uppercase tracking-[0.15em] transition-opacity hover:opacity-60"
              style={{ color: "var(--spa-ink)" }}
            >
              Equipo
            </Link>
            <Link href="/reserva" className="btn-editorial-solid text-xs uppercase tracking-[0.1em]">
              Reservar
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer style={{ borderTop: "1px solid var(--spa-hairline)" }}>
        <div className="mx-auto max-w-6xl px-6 py-14 grid gap-10 sm:grid-cols-3">
          <div>
            <p className="font-serif text-lg mb-2" style={{ color: "var(--spa-ink)" }}>
              Beauty &amp; Spa
            </p>
            <p className="text-sm" style={{ color: "var(--spa-mocha)" }}>
              Carolina Haponiuk
              <br />
              Barrio La Alameda, Canning
            </p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-[0.2em] mb-3"
              style={{ color: "var(--spa-gold)" }}
            >
              Contacto
            </p>
            <a
              href={whatsappLink("Hola! Quería consultar sobre un turno en Beauty & Spa.")}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-4 decoration-[var(--spa-hairline)] hover:decoration-current"
              style={{ color: "var(--spa-mocha)" }}
            >
              WhatsApp
            </a>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-[0.2em] mb-3"
              style={{ color: "var(--spa-gold)" }}
            >
              Panel
            </p>
            <Link
              href="/admin"
              className="text-sm underline underline-offset-4 decoration-[var(--spa-hairline)] hover:decoration-current"
              style={{ color: "var(--spa-mocha)" }}
            >
              Acceso administrador
            </Link>
          </div>
        </div>
        <div
          className="mx-auto max-w-6xl px-6 py-5 text-xs"
          style={{ borderTop: "1px solid var(--spa-hairline)", color: "var(--spa-mocha)" }}
        >
          © {new Date().getFullYear()} Beauty &amp; Spa
        </div>
      </footer>
    </div>
  );
}
