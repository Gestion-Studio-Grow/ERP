"use client";

// EL MOSTRADOR DE SIEMPRE, DIFERIDO EN EL NAVEGADOR (Magra · tanda perf, P-2).
//
// El JS de una pantalla del App Router lleva TODOS los componentes de cliente que alcanza su grafo
// de servidor, se dibujen o no (un `import()` del lado del servidor no lo evita). `MostradorDeVenta`
// importaba estático `VenderForm` (3600 líneas) y `PedidoDesdeWhatsApp` (726): la bandeja del
// boutique los bajaba sin mostrarlos. Con estos envoltorios de cliente (`next/dynamic`, que sí parte
// el código) quedan en su propio pedazo: se arman en el servidor igual que antes (mismo HTML) y su
// código baja sólo donde se dibujan.
import dynamic from "next/dynamic";

export const VenderFormDiferido = dynamic(() => import("../VenderForm"));
export const PedidoDesdeWhatsAppDiferido = dynamic(() => import("../PedidoDesdeWhatsApp"));
