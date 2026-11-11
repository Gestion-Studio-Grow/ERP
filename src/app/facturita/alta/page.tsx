// FACTURITA · Alta self-serve (/facturita/alta). La página es estática; el alta, no.
//
// Desde el 08/11/2026 (orden del dueño, «alta de negocios automatizada») el asistente crea el negocio
// solo: con punto de venta y mail, «Crear mi cuenta» manda un enlace de confirmación (acciones.ts →
// src/lib/factoque/alta-web.server.ts) y nada se escribe en la base hasta que se confirma. Sin punto de
// venta queda el camino de siempre: el resumen para que GSG lo arme con la persona (alta operada).

import type { Metadata } from "next";
import VidrieraMarco from "../VidrieraMarco";
import { canalGsg } from "../contacto";
import AltaConActivacion from "./AltaConActivacion";
import { conexionMPDisponibleEnElAlta } from "./mp-disponible";
import { pedirAltaFactoque } from "./acciones";

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
        <AltaConActivacion canal={canal} mpDisponible={conexionMPDisponibleEnElAlta()} pedirAlta={pedirAltaFactoque} />
      </div>
    </VidrieraMarco>
  );
}
