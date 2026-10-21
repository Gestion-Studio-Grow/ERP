# Rediseño del backoffice (/admin) — CH Estética y Magra · 2026-10-20

Un motor, dos marcas: el cambio vive en el skin común del /admin (`globals.css`, bloque «BACKOFFICE MODERNO») y en
el armazón (`AdminShell.tsx`); cada negocio conserva su paleta, tipografía y logo. Sin lógica, sin migraciones,
sin dependencias nuevas.

Capturas antes/después (1366×768 y 390×844, claro y oscuro): `antes/` y `despues/`.
Se regeneran con `node --import tsx scripts/qa/capturas-backoffice.mjs <carpeta>` (base local efímera, nunca Neon).

— Elaborado por GSG
