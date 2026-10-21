# Estética final de Break Point — club de hoy vs club del ERP

Cada pantalla a 1366×768, en claro y oscuro: `vanilla-<pantalla>-<tema>.png` es el club de hoy
(`src/tenants/breakpoint/sitio/club.html`, demo, operando Rober) y `react-<pantalla>-<tema>.png` el club del ERP
(`/admin/club`, con la estética «chapa» y la cabecera del panel de casa). Reloj fijo: sábado 17/10/2026 19:10.

Pantallas: agenda, cuenta-turno, nuevo-turno, fijos-espera, mantenimiento, abrir-cuenta, buffet, caja, clientes,
tablero, proveedores, stock, novedades, configuracion, tienda.

Igualado al club de hoy en la ronda del 21/10 (lista del orquestador):
- Cintas finas ARRIBA de la barra azul: la negra de la demo con «Reiniciar demo» y la ámbar del aviso al dueño con
  «Ver y resolver».
- Barra: logo + «GESTIÓN / DEL CLUB», «Buscar o hacer… Ctrl K», quien opera, la hora grande con −30′/+30′ (demo), el
  candado (adentro: bloquear la pantalla y «Salir») y la luna.
- Solapa Tablero con su número rojo; agenda con «AGENDA · SÁB 17/10 (HOY)», el horario del día y «Cambiar horario»,
  los días «Vie · Hoy · Dom…», la fila «+ Turno · Abrir cuenta · Lista de espera (1) · Mantenimiento y lluvia», la
  lamparita de cada cancha, turnos compactos, la pastilla naranja de la hora y la grilla desde las 17:00.
- «Para resolver ahora»: cada aviso en su tarjeta, «URGENTE» en versalitas, botones chicos.
- Cuenta del turno: nombre grande con la ×, totales en lista a la derecha, medios de pago en una fila, jugadores
  primero, después «Cobrar todo» y «Cobrar la cancha… la mesa sigue», «Hacer fijo» como enlace, el detalle de cargos
  y «quién paga» plegados, y el pie fijo con WhatsApp y «Corte de luz / se suspende».

Diferencias que quedan a propósito (practicidad del ERP sobre la piel del club de hoy):
- Fijos y espera, Mantenimiento y lluvia y Tienda son solapas (en el club de hoy, diálogos o parte de Buffet): se
  llega con un toque desde los accesos de la agenda o «Más».
- La cuenta del turno es una hoja que no bloquea: tocar otro turno la cambia de una.
- En la PC los botones se VEN como los del club de hoy (36 px) pero se TOCAN de 44 px (área invisible); en la tablet y
  el celular los medios de pago miden 44 px de verdad.
- «Estilo» no está: el club del ERP tiene una sola estética, la «chapa».
- Buffet, Caja, Stock y Proveedores todavía tienen su armado del ERP: es la próxima ronda.

Se regeneran con el script de capturas de la sesión (Playwright + Tailwind del repo).

— Elaborado por GSG
