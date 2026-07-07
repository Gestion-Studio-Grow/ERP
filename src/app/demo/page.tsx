import type { Metadata } from "next";
import DemoTour from "./DemoTour";
// Import puro y edge-safe (cero deps, sin Prisma/credenciales): NO rompe el
// aislamiento force-static del /demo — solo lee la flag de entorno del deploy
// para decidir si mostrar la puerta al backoffice-demo. El motor del tour
// (demo-content/scenes) sigue 100% puro.
import { isDemoSandbox } from "@/lib/demo-flag";

// DEMO INTERACTIVA DEL ERP (Célula 3 — Producto/Contenido).
// Ruta pública, SIN login, a la que apunta la publicidad de Instagram Stories.
// force-static: se pre-renderiza en build, sin DB ni credenciales → costo cero
// y 100% aislada de prod (no importa nada de @/lib/prisma ni acciones). Todo el
// contenido es de EJEMPLO (ver demo-content.ts).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Mirá tu negocio funcionando — Demo | Gestión Studio Grow",
  description:
    "Recorré en 30 segundos cómo se ve tu negocio con agenda, cobro, facturación electrónica y el Panel del Dueño. Sin instalar nada.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Mirá tu negocio funcionando",
    description:
      "Agenda, caja, facturación ARCA y un panel que te habla en castellano. Echá un vistazo.",
    type: "website",
  },
};

export default function DemoPage() {
  // Se evalúa en build (force-static): en el deploy de demo la flag está puesta
  // y el botón se hornea; en un deploy real queda ausente.
  return <DemoTour showBackofficeEntry={isDemoSandbox()} />;
}
