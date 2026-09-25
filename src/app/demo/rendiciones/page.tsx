import type { Metadata } from "next";
// Script inline anti-parpadeo del tema (skin Fable). No importa nada: corre antes del primer
// paint y pone `data-theme` según la preferencia guardada o la del sistema.
import AdminThemeScript from "@/app/admin/AdminThemeScript";
import DemoRendi from "./DemoRendi";
import EstilosRendi from "./estilos";
import { ACENTO_RENDI } from "./acento";

// DEMO PÚBLICA DE RENDÍ — rendición de gastos argentina integrada a SAP S/4HANA Cloud Public.
// Es "la app real en modo demo": sin login, sin secretos y con datos 100 % ficticios
// (escenario.ts). Esta página y todo lo que importa no tocan la base: nada de Prisma ni de
// acciones del servidor, y todo lo que pasa en la demo —cargar un comprobante, leer un QR,
// aprobar, generar los archivos para SAP— ocurre en el navegador de quien la mira.
//
// Deuda heredada, igual que en /demo: el layout raíz del ERP es `force-dynamic` y su
// `generateMetadata` intenta leer la marca del tenant (getTenantBrand → base). Sin base cae a la
// marca por defecto y la página funciona igual, pero la ruta no queda 100 % aislada de la base
// mientras ese layout no cambie. El `force-static` de acá pide el pre-renderizado de la página.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Rendí — rendición de gastos con SAP | Demo",
  description:
    "Demo de Rendí: rendición de gastos argentina con lectura del QR de ARCA, motor fiscal que explica en criollo, aprobación por legajo y archivos de carga para SAP S/4HANA Cloud Public. Datos ficticios: nada sale del navegador.",
  robots: { index: false },
  // Sello GSG (estándar de marca): verificable en el <head>.
  generator: "Gestión Studio Grow",
};

export default function RendiDemoPage() {
  return (
    <div
      data-skin="fable"
      data-theme="light"
      suppressHydrationWarning
      style={ACENTO_RENDI}
      className="flex min-h-screen flex-col bg-surface text-body"
    >
      {/* Primer hijo del contenedor del skin: corrige data-theme antes del primer paint. */}
      <AdminThemeScript />
      <EstilosRendi />
      <DemoRendi />
    </div>
  );
}
