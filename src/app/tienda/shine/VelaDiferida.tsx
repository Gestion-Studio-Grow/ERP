"use client";

// La puerta de entrada a la vela 3D de Shine: sólo esto entra al JS que comparten todas las vidrieras
// de /tienda (Turbopack agrupa los componentes cliente de la ruta en los mismos chunks, se sirva la
// marca que se sirva). La escena, sus mandos y sus estilos (EscenaVela.tsx) son un chunk asíncrono
// que el navegador pide SÓLO cuando esto se dibuja, es decir, en la portada de Shine; three.js es
// otro chunk, más tarde todavía. Sin SSR: en el HTML no hay nada de la vela, la foto sigue siendo el LCP.

import dynamic from "next/dynamic";

const VelaDiferida = dynamic(() => import("./EscenaVela"), { ssr: false });

export default VelaDiferida;
