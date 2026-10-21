# Estética final de Break Point — club de hoy vs club del ERP

Cada pantalla a 1366×768, en claro y oscuro: `vanilla-<pantalla>-<tema>.png` es el club de hoy
(`src/tenants/breakpoint/sitio/club.html`, demo, operando Rober) y `react-<pantalla>-<tema>.png` el club del ERP
(`/admin/club`, con la estética «chapa» y la cabecera del panel de casa). Reloj fijo: sábado 17/10/2026 19:10.

Pantallas: agenda, cuenta-turno, nuevo-turno, fijos-espera, mantenimiento, abrir-cuenta, buffet, caja, clientes,
tablero, proveedores, stock, novedades, configuracion, tienda.

Diferencias que quedan a propósito (practicidad del ERP sobre la piel del club de hoy):
- Fijos y espera, Mantenimiento y lluvia y Tienda son solapas (en el club de hoy, diálogos o parte de Buffet): se
  llega con un toque desde los accesos de la agenda o «Más».
- La cuenta del turno es una hoja que no bloquea: tocar otro turno la cambia de una.
- Los botones miden 44 px (tablet de recepción, WCAG); el club de hoy usaba 38 px.
- Stock y Proveedores son listas con ficha al costado (el club de hoy, tablas).

Se regeneran con el script de capturas de la sesión (Playwright + Tailwind del repo).

— Elaborado por GSG
