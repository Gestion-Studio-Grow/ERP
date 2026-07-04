# Tablero de sesiones — sistema de trabajo con Claude Code

**Qué es:** la operacionalización de ADR-008 ("un thread = un tema, toda decisión persiste en el repo") como un tablero de tipos de sesión con comandos de arranque. Es la estructura con la que escala el equipo: una persona nueva (o una cuenta nueva de Claude) no necesita que nadie le explique el proyecto — abre una sesión con el comando correcto y los preconceptos se cargan solos desde el repo.

**Antes de cualquier sesión, el marco:** [`docs/FUNDAMENTOS-Y-VISION.md`](FUNDAMENTOS-Y-VISION.md) fija la visión y el criterio rector del producto (multi-tenant estilo SAP Public Cloud, un Core compartido, cada cliente un tenant, restricciones de plataforma). Toda sesión decide **dentro** de ese marco; incluye un checklist de encuadre para abrir cualquier sesión.

**Por qué comandos y no prompts pegados:** los comandos viven en `.claude/commands/` versionados en git. Viajan con el repo a cualquier cuenta/máquina, se corrigen con un commit, y cuestan tokens solo cuando se invocan. Un prompt pegado a mano se degrada con cada copia; un comando versionado mejora con cada corrección.

---

## Contador de consolidación

**Sesiones sin consolidar: 0**

Sube en 1 cada vez que cierra una sesión de feature/arquitectura/negocio/seguridad (paso final de su checklist de cierre, en el mismo commit). Vuelve a 0 cuando cierra `/sesion-consolidacion`. No dispara nada solo — es una marca de texto para que se vea a simple vista, apenas se lee este archivo, cuántas sesiones pasaron sin el repaso general. Referencia informal: en ~5 conviene abrir `/sesion-consolidacion`.

---

## Los tipos de sesión

| Comando | Cuándo abrirla | Arranca leyendo | Termina cuando |
|---|---|---|---|
| `/sesion-feature <tema>` | Implementar algo del BACKLOG o un pedido del cliente | `BACKLOG.md` + código relevante | Código verificado (tsc + build + preview si aplica), commit+push, BACKLOG actualizado |
| `/sesion-arquitectura <tema>` | Decidir algo estructural (datos, seguridad, plataforma) | `docs/adr/INDEX.md` (+ el ADR puntual solo si hace falta) | ADR nuevo/enmendado + fila en INDEX. **No implementa código** |
| `/sesion-negocio <tema>` | Status PMO, docs para el cliente, comparativas, marketing | `BACKLOG.md` + `git log` + docs relevantes | Documento versionado en `docs/`, en el lenguaje del destinatario |
| `/sesion-consolidacion` | Cada ~5 sesiones de trabajo, o al cerrar un bloque | Todo lo de abajo (tiene checklist propio) | Docs y código vuelven a coincidir; huecos cerrados con commits |
| `/sesion-seguridad <tema>` | Auditar la postura de seguridad o endurecer una superficie (auth, secretos, aislamiento, validación) | `SECURITY.md` + `docs/adr/INDEX.md` (001/005/AMD-005) + código | Fixes de endurecimiento commiteados + `SECURITY.md` al día. Decisiones estructurales (RLS, roles) se derivan a `/sesion-arquitectura` |

**Regla de oro del tablero:** si una sesión empieza a derivar hacia otro tipo (una feature descubre una decisión de arquitectura, una consolidación descubre un bug), **no se resuelve ahí** — se anota y se abre la sesión del tipo correcto. Es lo que mantiene los threads baratos y encontrables.

## La cola de handoff (`docs/PROXIMOS-PASOS.md`, ADR-016)

El "qué sigue después de cerrar esto" **no se dice en el chat** (que la sesión siguiente no lee) — se persiste en `docs/PROXIMOS-PASOS.md`. Es la tercera cosa que produce una sesión, junto a las decisiones (ADR) y las features (BACKLOG). Cada comando la **lee al abrir** (ofrece los ítems que le tocan como arranque por defecto, sin preguntar en blanco) y la **escribe al cerrar** (anota el follow-up que disparó); `/sesion-consolidacion` la **poda**. Esto es lo que borra la charla repetida de "¿qué abro ahora?".

> **Guía de lectura para el equipo:** el libro de usuario amigable de este sistema es `docs/MANUAL-SESIONES.md`, y el comando `/manual` muestra la versión corta al instante. No son tipos de sesión (no abren trabajo), son la puerta de entrada; este tablero sigue siendo la spec canónica.

## El otro eje: roles autónomos (`docs/METODO-ROLES.md`)

Los tipos de sesión de arriba definen **un tema por thread**. En paralelo existe un segundo eje —los **roles autónomos**— para trabajo despachado (típicamente desde el móvil): definen **quién** ejecuta, mientras `docs/METODO-ROLES.md` define **cómo** (bucle entender→plan→hacer→verificar→reportar, definición de terminado, seguridad, formato de reporte). Comandos:

| Comando | Qué es |
|---|---|
| `/sesion-movil` | Ejecutor autónomo en rol **PMO**: Maxi despacha tareas y recibe status al terminar cada una. Si la tarea encaja en un tipo del tablero, sigue sus normas. |
| `/rol <rol>` | Adoptás el rol que indique Maxi (PMO, QA, diseñador, redactor…). Autónomo, commit local. |
| `/rol-fullstack` | Developer fullstack + arquitecto senior: implementa features y, si toca una decisión estructural, deja el ADR. |
| `/remoto` | Asistente conversacional + ingeniero de prompts para **retomar desde el móvil** (no abre trabajo de fondo, como `/manual`). |

Todos comparten la política de entrega: **push a GitHub sí, deploy a Netlify no** (gate manual). Si se agrega/cambia un rol o su método, esta tabla y `docs/METODO-ROLES.md` se actualizan en el mismo commit — si divergen, es un hallazgo para `/sesion-consolidacion`.

## La sesión de consolidación (la que mantiene el sistema honesto)

Su trabajo es que el repo no mienta. Casos reales que ya pasaron y que existe para atrapar:
- Código que referencia un ADR que nunca se escribió (pasó con ADR-013/014 — se detectó y corrigió el 2026-07-03).
- `BACKLOG.md` marcando como pendiente algo que ya estaba implementado (pasó con "turno manual" — detectado en la auditoría del 2026-07-03).
- El "Estado del proyecto" del INDEX desactualizado respecto de decisiones ya tomadas (pasó con "Camino A vs. B bloqueada").
- Funciones implementadas pero nunca conectadas (pasó con `getPublishedReviews()`).

## Reglas de economía de tokens (ADR-008, operacionalizado)

1. **Nunca pegar archivos en el chat** — Claude Code los lee del filesystem.
2. **Modelo barato para lo mecánico, caro para diseño** (ADR-008 regla 4).
3. Los comandos de sesión son **cortos a propósito**: cargan los punteros (qué leer, qué reglas aplican), no el contenido.
4. Al cerrar una sesión, lo que quedó decidido/hecho está en el repo — la sesión siguiente **no re-lee threads viejos**, lee el repo.

## Convenciones operativas del equipo (decididas 2026-07-03)

- **Autorización permanente** para el ciclo código→build→commit→**push a GitHub** sin re-preguntar en cada paso. **El deploy a Netlify NO es automático:** el auto-publish está apagado (`stop_builds`), así que el push a `main` va a GitHub sin publicar ni gastar créditos. Publicar en producción es un **gate manual** — solo con el OK explícito de Maxi (*"deployá"*). Detalle en `docs/METODO-ROLES.md` §4.
- **La base de datos es producción real** (Neon) — todo dato de prueba creado durante una sesión se borra antes de cerrarla.
- Commits explican el *porqué* (ver `CONTRIBUTING.md`).
- Scripts de un solo uso (`scripts/_*.ts`) se borran en la misma sesión que los creó.
- Idioma de trabajo: español rioplatense; docs para el cliente (Carolina) en lenguaje llano, sin jerga.

## Cómo agregar un tipo de sesión nuevo

1. Crear `.claude/commands/sesion-<nombre>.md` (copiar la estructura de uno existente: preconceptos → cierre).
2. Agregar la fila en la tabla de arriba, **en el mismo commit**.
Este documento es vivo: si el tablero cambió y este archivo no, eso es un hallazgo para `/sesion-consolidacion`.

---

## Prompt maestro — primera sesión en una cuenta/máquina nueva

Pegar esto tal cual (es lo único que se pega a mano; todo lo demás se carga solo):

> Cloná `github.com/Gestion-Studio-Grow/ERP` (o abrí la carpeta si ya existe) y prepará el entorno:
> 1. `npm install` (corre `prisma generate` solo). Si falta `.env`, pedímelo — las claves (`DATABASE_URL`, `AUTH_SECRET`) no están en el repo a propósito.
> 2. Leé `docs/TABLERO-SESIONES.md`, `docs/adr/INDEX.md` y `BACKLOG.md`.
> 3. Confirmame en 5 líneas: estado del repo, último deploy en Netlify, y qué comandos `/sesion-*` quedaron disponibles.
>
> Este proyecto trabaja con el protocolo ADR-008: un tema por sesión, todo termina commiteado y pusheado, el repo es la única fuente de verdad. Las sesiones de trabajo se abren con los comandos `/sesion-*` — no arranques trabajo de fondo en esta sesión de inicio.
