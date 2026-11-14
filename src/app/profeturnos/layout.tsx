// PROFETURNOS · Layout del producto (vidriera + alta). Público, sin base ni sesión.
// Sello GSG (bloque 2 del Gate): `generator` acá; el crédito va en el pie de cada página (`_pie.tsx`,
// y `MarcoLegal` en los legales) para no duplicarlo. La marca visible es ProfeTurnos.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "ProfeTurnos — tus clases de pádel, sin chat infinito", template: "%s — ProfeTurnos" },
  description: "El turnero para profes de pádel: tus alumnos piden clase desde un link, vos confirmás y cobrás por transferencia.",
  generator: "Gestión Studio Grow",
  applicationName: "ProfeTurnos",
};

export default function ProfeTurnosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
