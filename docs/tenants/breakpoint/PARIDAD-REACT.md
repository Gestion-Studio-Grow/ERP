# Break Point — paridad del sistema de hoy (vanilla) con la versión React del ERP

Pedido del dueño (17/10): «si vamos a pasar a React, completá el trabajo: quiero llegar al mismo status que tenemos
con el sistema de hoy». Matriz armada por Fable leyendo el código de las dos versiones (vanilla
`public/previews/breakpoint/club/*` y React `src/app/admin/(dashboard)/club/*` de la rama de terminales).

**Foto:** de ~95 funciones, React tiene **SÍ 31 · PARCIAL 10 · NO 50 · N/A 4**. Lo hecho (la recepción del turno:
agenda, alta, cuenta del turno con «a cargo de» y «la mesa sigue», ciclo, fijos, espera, lluvia, mantenimiento,
buffet básico, caja básica, deshacer) está muy bien. Falta: 8 de las 9 pestañas del dueño/operación, identidad y
seguridad del mostrador (PIN, bloqueo, cambio de usuario), **reloj real**, **persistencia real** (BP-3) y cosas
diarias chicas pero críticas.

## Lo que falta, por prioridad

🔴 = lo usa recepción todos los días · 🟠 = el dueño cada día/semana · 🟢 = ocasional

| Área | Falta | Prioridad | Quién |
|---|---|---|---|
| Tiempo | Reloj real (hoy fijo 19:10), madrugada, cambio de día | 🔴 bloqueante | terminales (almacén) |
| Agenda | Sumar jugador (nombre/ficha), notas, día anterior, bandeja «Para resolver ahora» completa, luces, WhatsApp de confirmación/recordatorio/lluvia/espera | 🔴 | terminales |
| Cuenta del turno | Cobro parcial de cancha, cobrar sólo la parte de cancha, cerrar cancha a cuenta corriente | 🔴 | terminales |
| Buffet | Venta rápida, mesa compleja (pasar cargo, manual, descuento con PIN del dueño), pedidos de la tienda | 🔴 | terminales |
| Caja | Fondo de caja, movimientos completos, PIN en egreso y cierre | 🔴 | terminales |
| Identidad | PIN, cambio de usuario, bloqueo de pantalla (inactividad, pantalla apagada, recarga, intentos que escalan) | 🔴 | club |
| Persistencia (BP-3) | Foto en la base del ERP (AuditLog, sin migración), espejo local, una pestaña, descargar/restaurar respaldo v1 | 🔴 requisito del corte | club |
| Clientes | ABM, ficha, cuenta corriente (habilitar/pedir/cobrar/estado de cuenta), baja de novedades | 🔴 | club |
| Tablero del dueño | Novedades para autorizar (crédito, accesos) + aviso 🔔, KPIs, mapa de calor, platos | 🔴/🟠 | club |
| Aprobación en el celular | Link `#aprobar` (durante el corte sigue el de vanilla) | 🔴 | club (ola 3) |
| Proveedores | Alta, ficha con CC, pagar con PIN, remitos con lector | 🟠 | club |
| Stock | Conteo, baja, códigos, precios y rentabilidad, reposición | 🟠 | club |
| Configuración | Reglas, tarifas, horarios, contactos (dentro del estado), usuarios y PIN, consola, jornada (respaldo, restaurar, limpieza) | 🔴/🟠 | club |
| Novedades | Difusión por audiencia, calendario | 🟠 | club |
| Transversal | Paleta Ctrl+K y atajos | 🟢 | club |
| UAT | Guion del sábado de torneo adaptado a `/admin/club` | requisito del corte | club |

No se portan (decisión a confirmar con el dueño): las cámaras simuladas, los 5 estilos visuales (el panel usa el
tema del ERP) y el Studio de redes (queda en vanilla por ahora).

## Lo que cambia por estar dentro del ERP

- **Login y PIN conviven:** la sesión del ERP es el **puesto** (entra una vez por día); el PIN del club es la
  **persona** (bloqueo, cambio de usuario, acciones sensibles), igual que hoy.
- **Persistencia (BP-3):** la foto del estado (mismo sobre v1 del respaldo) en `AuditLog` con versión optimista,
  poda y espejo local; sin migración de base. Cadencia de guardado medida para no gastar de más en Neon.
- **Multi-tenant:** `requireApp("club")`, `tenantId` de la sesión, RLS; test con base efímera (A no lee lo de B).

## Día de corte (vanilla → React)

Cerrar la caja en vanilla → descargar respaldo → asignar el módulo `club` a `breakpoint` (O4) → restaurar el
respaldo en `/admin/club` → verificar caja al centavo, cuentas, clientes, deudas, usuarios y PIN → trabajar.
El sitio público (portada, turnero, `publico.json`) sigue igual.

**Mínimo para el corte:** olas 0 + 1 + 2 completas; de la 3: clientes, novedades para autorizar + 🔔, precios y
stock; de la 4: usuarios y PIN, reglas/tarifas/horarios/contactos, respaldo y restaurar; UAT de paridad en verde.

## Olas y esfuerzo (estimación de Fable)

| Ola | Qué | Días (Opus) |
|---|---|---|
| 0 | Reloj real, persona y PIN, bloqueo | 2–3 |
| 1 | Lo diario que falta en recepción | 4–5 |
| 2 | Persistencia real y jornada (BP-3) | 3–4 |
| 3 | Clientes, dueño, proveedores, stock | 4–5 |
| 4 | Configuración, consola, novedades | 3–4 |
| 5 | Paleta, atajos y UAT de paridad | 2–3 |

Total 18–24 días de trabajo; con dos sesiones en paralelo (terminales + club), unas 3 semanas.

## Decisiones del dueño

| # | Decisión |
|---|---|
| G1 | Fecha del día de corte y OK a asignar el módulo al club (publicación) |
| G2 | Guardar los datos de Break Point en la base del ERP (Neon) es inversión post-venta: ¿se considera venta concretada? Si no, el corte se hace con guardado local y la base se enciende después |
| G3 | PIN de 2 dígitos (como hoy, recomendado para el corte) o 4 (después) |
| G4 | La aprobación desde el celular del dueño sigue por el link de vanilla durante el corte |
| G5 | El panel usa el tema del ERP, no los 5 estilos del vanilla |
| G6 | Studio de redes y cámaras quedan en vanilla / no se portan |
| G7 | Usuarios del ERP para el club (mail y clave; las claves las pega el dueño) |

— Elaborado por GSG
