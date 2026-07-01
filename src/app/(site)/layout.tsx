import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-300 text-[9px] text-neutral-400 text-center leading-tight">
              tu logo
            </span>
            <span className="font-semibold text-lg tracking-tight text-neutral-400 whitespace-nowrap">
              [Tu marca]
            </span>
          </Link>
          <nav className="flex items-center gap-4 sm:gap-6 text-sm">
            <Link
              href="/#servicios"
              className="hidden sm:inline text-neutral-600 hover:text-black"
            >
              Servicios
            </Link>
            <Link
              href="/#profesionales"
              className="hidden sm:inline text-neutral-600 hover:text-black"
            >
              Profesionales
            </Link>
            <Link
              href="/reserva"
              className="rounded-md bg-black text-white px-4 py-2 font-medium whitespace-nowrap"
            >
              Reservar turno
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-neutral-400 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} [Acá va el nombre de tu marca]</span>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#" className="hover:text-black">
              [Acá va tu WhatsApp de contacto]
            </a>
            <Link href="/admin" className="text-neutral-400 hover:text-black">
              Acceso administrador
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
