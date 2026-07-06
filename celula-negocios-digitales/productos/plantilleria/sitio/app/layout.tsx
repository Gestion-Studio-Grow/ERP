import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Plantillería AR — Plantillas hechas para la Argentina real",
  description:
    "Planillas de monotributo, presupuestos por oficio, caja de kiosco, sueldos y finanzas, " +
    "localizadas a la normativa argentina (ARCA, monotributo, LCT). Descarga inmediata.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <header className="header">
          <div className="contenedor">
            <a href="/" className="logo">
              Plantillería<span style={{ color: "var(--brand)" }}>.ar</span>
            </a>
            <nav style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <a href="/#catalogo">Plantillas</a>
              <a href="/#faq">Preguntas</a>
              <a className="btn btn-primario" style={{ padding: "10px 20px", fontSize: ".95rem" }} href="/#catalogo">
                Ver catálogo
              </a>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="footer">
          <div className="contenedor">
            <p style={{ fontWeight: 700, color: "#fff", fontSize: "1.1rem" }}>Plantillería.ar</p>
            <p>
              Plantillas de gestión localizadas a la normativa argentina. Producto digital de
              Gestión Studio Grow.
            </p>
            <p style={{ marginTop: 16, fontSize: ".8rem" }}>
              Herramientas de organización. No reemplazan el asesoramiento de un contador matriculado.
              Verificá siempre los valores vigentes en ARCA/AFIP.
            </p>
            <p style={{ marginTop: 8, fontSize: ".8rem" }}>
              © {new Date().getFullYear()} Plantillería.ar — Todos los derechos reservados.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
