// FACTURITA · Alta self-serve (/facturita/alta). Estática y sin base (PD-1).
//
// Hoy el asistente NO crea un negocio: junta los datos en el navegador, enseña a delegar el
// servicio en ARCA y termina con un mensaje para que GSG active la cuenta en el día (alta
// operada, ADR-076 "hasta entonces, altas operadas"). Nada se guarda en el servidor ni en la base:
// ciclo demo → venta → inversión (ADR-030) y DX-1. El cableado a la fábrica de tenants (ADR-074)
// queda pedido a plataforma (docs/producto/facturita/PEDIDOS-A-PLATAFORMA.md).

import type { Metadata } from "next";
import VidrieraMarco from "../VidrieraMarco";
import { canalGsg } from "../contacto";
import AltaAsistente from "./AltaAsistente";
import { conexionMPDisponibleEnElAlta } from "./mp-disponible";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Empezá gratis — Factoque",
  description: "Pedí tu Factoque en pocos pasos: tu Mercado Pago (opcional), tu CUIT, cómo estás inscripto y tu punto de venta.",
  generator: "Gestión Studio Grow",
};

export default function FacturitaAltaPage() {
  // El WhatsApp de GSG sale de la variable de entorno (la misma del login y de /admin/usuarios/plan).
  // Sin número cargado no se inventa uno (DX-4): el resumen va por mail a la casilla de GSG que el
  // repo ya usa como contacto (../contacto.ts), y siempre se puede copiar.
  const canal = canalGsg();

  return (
    <VidrieraMarco botonAlta={false} alta>
      <div className="fx-caja fx-caja--alta" style={{ paddingBlock: "clamp(32px, 2rem + 3vw, 96px) clamp(48px, 3rem + 4vw, 120px)" }}>
        <h1 className="fx-h1">Empezá gratis</h1>
        <p className="fx-lead">
          Seis pasos cortos, y el primero es opcional. No te pedimos tarjeta ni tu clave fiscal.
        </p>
        <AltaAsistente canal={canal} mpDisponible={conexionMPDisponibleEnElAlta()} />
      </div>
    </VidrieraMarco>
  );
}
