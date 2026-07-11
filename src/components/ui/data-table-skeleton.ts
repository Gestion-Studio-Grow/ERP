// Filas fantasma compartidas entre DataTable (client) y los loading.tsx de
// ruta (server components). Módulo SIN "use client" a propósito: un server
// component NO puede importar valores de un módulo client — llegan como
// client-reference (proxy) y `SKELETON_ROWS.map` revienta en runtime con 500.
// Bug real detectado en el recorrido del gate (loading.tsx importaba esto
// desde DataTable.tsx, que es "use client"); vive acá para que ambos mundos
// lo consuman sin cruzar la frontera RSC.
export const SKELETON_ROWS = ["sk-1", "sk-2", "sk-3"];
