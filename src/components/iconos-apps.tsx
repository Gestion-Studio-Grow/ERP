// ============================================================================
// ÍCONOS DE LAS APPS — un set chico de línea, sin dependencias.
// ============================================================================
//
// Extraído del mapa que vivía dentro de AdminShell.tsx para que la barra, el Inicio y
// "App no disponible" dibujen el MISMO ícono por app. Los trazos de las pantallas que ya
// existían son idénticos a los del shell: la barra de CH no cambia un pixel.
//
// `currentColor`: el ícono hereda el color del texto (activo = acento del negocio,
// inactivo = apagado). Sin "use client": no tiene estado, lo pueden usar componentes de
// servidor y de cliente.

import type { ReactNode } from "react";
import type { NombreIcono } from "@/apps/contract";

// Tipado con `NombreIcono`: un nombre nuevo en el contrato sin su dibujo acá no compila.
const TRAZOS: Record<NombreIcono, ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  agenda: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
  clientes: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>),
  espera: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  pedidos: (<><path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 01-8 0" /></>),
  caja: (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>),
  // Cierre del día = el cajón YA contado: la silueta de `caja` con un tilde, para que las
  // dos no queden indistinguibles en la barra.
  cierre: (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M8.5 14.8l2 2 4-4" /></>),
  catalogo: (<><path d="M4 6h16M4 12h16M4 18h10" /></>),
  compras: (<><path d="M4 5h2l1.2 11a1.5 1.5 0 001.5 1.3h8.1a1.5 1.5 0 001.5-1.2L20 8H7" /><circle cx="9.5" cy="20" r="1" /><circle cx="17" cy="20" r="1" /><path d="M13 4v4M11 6h4" /></>),
  ajustes: (<><path d="M4 8h9M17 8h3M4 16h3M11 16h9" /><circle cx="15" cy="8" r="2" /><circle cx="9" cy="16" r="2" /></>),
  resenas: (<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8L3.5 9.2l5.9-.9z" />),
  recordatorios: (<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />),
  reportes: (<path d="M5 20V10M12 20V4M19 20v-7" />),
  facturacion: (<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" /></>),
  // Facturación automática: el banco (frontón y columnas). Nuevo: no estaba en la barra.
  bancos: (<><path d="M3 9l9-5 9 5" /><path d="M5 9v9M9.7 9v9M14.3 9v9M19 9v9M3 20h18" /></>),
  auditoria: (<><path d="M9 12l2 2 4-4" /><rect x="4" y="4" width="16" height="16" rx="2" /></>),
  usuarios: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 11l2 2 3-3.5" /></>),
  localizacion: (<><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  apariencia: (<><path d="M12 3a9 9 0 100 18h1.5a2 2 0 001.4-3.4c-.9-.9-.3-2.6 1-2.6H19a3 3 0 003-3c0-5-4.5-9-10-9z" /><circle cx="7.8" cy="10.5" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16.2" cy="10.5" r="1" /></>),
  modulos: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  "cuentas-a-pagar": (<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M12 17v-4M10 15l2-2 2 2" /></>),
  contabilidad: (<><path d="M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2z" /><path d="M9 8h7M9 12h7M9 16h4" /></>),
  devoluciones: (<><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 010 10h-2" /></>),
  inventario: (<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7M12 11v10" /></>),
  lotes: (<><path d="M20.6 13.4 13.4 20.6a2 2 0 01-2.8 0l-6.2-6.2a2 2 0 01-.6-1.4V5a1 1 0 011-1h7.6a2 2 0 011.4.6l6.4 6.4a2 2 0 010 2.8z" /><circle cx="8.5" cy="8.5" r="1.2" /></>),
  despiece: (<><path d="M4 4l9 9M13 13l-2 2-3-3 2-2M13 13l6 6" /><path d="M14 6a3 3 0 104 4z" /></>),
  // "App no disponible": un candado. Nuevo.
  candado: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>),
};

function esNombreIcono(nombre: string): nombre is NombreIcono {
  return Object.prototype.hasOwnProperty.call(TRAZOS, nombre);
}

/**
 * El ícono de una app. Acepta un `string` (la barra de hoy guarda el nombre como texto) y
 * cae al de Inicio si no lo conoce, igual que hacía el shell: un ícono de menos no puede
 * romper la barra.
 */
export function IconoApp({
  nombre,
  className = "w-[17px] h-[17px] shrink-0",
}: {
  nombre: NombreIcono | string;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {esNombreIcono(nombre) ? TRAZOS[nombre] : TRAZOS.dashboard}
    </svg>
  );
}
