# Pericia del CRM comercial — la memoria del equipo

Los agentes no recuerdan nada de una sesión a otra. Lo que el equipo sabe vive acá. **No leas la carpeta entera:**
leé esta página y, de la tabla, sólo lo que toca tu tarea. Si aprendés algo que el próximo necesita, va a
`APRENDIDO.md` (hasta 5 líneas, con fecha, `archivo:línea` y tu código de sesión).

## Qué leer según la tarea
| Si tu tarea es… | Leé | Y de las referencias |
|---|---|---|
| Modelo, ciclo, pases de etapa | `docs/tenants/mia-producciones/CRM-REINGENIERIA.md` §2 | `NEXTCRM.md` punto 1 |
| Permisos, puestos de agente, cola de pedidos | diseño §3 y §5 (E11, E12, E16, E22) | `NEXTCRM.md` puntos 4 y 5 (lo que NO hay que repetir) |
| Tablero por etapas | diseño §4.2 | `NEXTCRM.md` punto 2 · `ATOMIC-Y-TWENTY-UI.md` punto 2 |
| Ficha, línea de tiempo, historial | diseño §4.3 | `NEXTCRM.md` punto 3 · `ATOMIC-Y-TWENTY-UI.md` punto 3 |
| Duplicados, importación | diseño §5 (E1, E18) | `ATOMIC-Y-TWENTY-UI.md` puntos 3 y 5 (`normalizeDomain`, CSV) |
| Borradores, envío, bajas | diseño §2 y §5 (E8) | Factory-GSG `20-PRODUCTO/crm-eventos/REFERENCIAS-CODIGO.md` §1 a §3 (sólo ideas: AGPL/GPL) |
| La prueba con los 20 leads | diseño §6 | `docs/tenants/mia-producciones/crm-prueba/` (la clave no la lee quien construye) |

Criterios con los que se certifica: Factory-GSG `00-ESTADO/certificacion/GSG-CRM-010.md`.
Cómo trabajan los CRM líderes (HubSpot, Salesforce, Pipedrive, Attio, Kommo, Tripleseat): Factory-GSG
`20-PRODUCTO/crm-eventos/INGENIERIA-REVERSA-CRMS-2026-11-16.md`. Licencias de 12 CRM de código abierto:
`CODIGO-ABIERTO-LICENCIAS-2026-11-16.md`, misma carpeta.

## Lo que el equipo ya sabe (16/11/2026)
1. **Ninguna referencia sirve de base.** Todas son para un solo negocio: no traen separación por negocio, permisos
   por puesto de agente, cola de pedidos ni evidencia por pase de etapa. Eso es nuestro y va primero.
2. **De las referencias se toma sobre todo la idea, no el código.** NextCRM (MIT, mismo stack) tiene 442 tests pero
   con la base simulada, sin carreras ni base real. El tablero de Atomic guarda con N escrituras sueltas y no atrapa
   el error.
3. **Piezas que sí se pueden tomar (MIT, con aviso de copyright y fila en `TERCEROS.md`):** `normalizeDomain` de
   twenty-shared para la clave de duplicados; la protección contra inyección al importar CSV; la separación entre
   la lógica de mover una tarjeta y la librería de arrastre de NextCRM (`CRMKanban.tsx:250-349`).
4. **Tres errores ajenos que no se repiten:**
   - Cambiar a qué ficha pertenece algo sin comprobar que la ficha sea del que pide (NextCRM `update-activity.ts:44`,
     `:73-84`). Acá: toda acción comprueba pertenencia de **cada** id que recibe.
   - Auditoría fuera de la transacción, que se traga el error (NextCRM `lib/audit-log.ts:78-91`). Acá: el registro va
     en la misma transacción; si falla, falla todo.
   - Un agente que escribe sin aprobación, sin registro y con todo el rol del usuario (NextCRM `lib/mcp/auth.ts:51`,
     `enrich-contact.ts:128-138`). Acá: permiso por puesto, aprobación por tipo de acción y registro siempre.
5. **Sin control de versión se pisan los cambios.** Ninguna referencia lo tiene; acá toda escritura de oportunidad,
   borrador y pedido lleva versión.
6. **Lección propia (prueba de WPE, 16/11):** un agente falla al contestar un dato que no miró y al actuar sin poder
   comprobar quién le escribe. Por eso: respuesta = dato visto con su fuente; identidad comprobada antes de avanzar.

## Reglas de terceros
Sólo MIT (o Apache-2.0 con su NOTICE). Lo AGPL o GPL es idea, nunca código. Cada pieza copiada: cabecera con el
aviso de copyright y fila en `TERCEROS.md`. Sin dependencias nuevas sin orden del dueño.
