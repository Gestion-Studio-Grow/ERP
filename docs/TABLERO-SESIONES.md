# Tablero de sesiones — sistema de trabajo con Claude Code

**Qué es:** la operacionalización de ADR-008 ("un thread = un tema, toda decisión persiste en el repo") como un tablero de tipos de sesión con comandos de arranque. Es la estructura con la que escala el equipo: una persona nueva (o una cuenta nueva de Claude) no necesita que nadie le explique el proyecto — abre una sesión con el comando correcto y los preconceptos se cargan solos desde el repo.

**Por qué comandos y no prompts pegados:** los comandos viven en `.claude/commands/` versionados en git. Viajan con el repo a cualquier cuenta/máquina, se corrigen con un commit, y cuestan tokens solo cuando se invocan. Un prompt pegado a mano se degrada con cada copia; un comando versionado mejora con cada corrección.

---

## Los tipos de sesión

| Comando | Cuándo abrirla | Arranca leyendo | Termina cuando |
|---|---|---|---|
| `/sesion-feature <tema>` | Implementar algo del BACKLOG o un pedido del cliente | `BACKLOG.md` + código relevante | Código verificado (tsc + build + preview si aplica), commit+push, BACKLOG actualizado |
| `/sesion-arquitectura <tema>` | Decidir algo estructural (datos, seguridad, plataforma) | `docs/adr/INDEX.md` (+ el ADR puntual solo si hace falta) | ADR nuevo/enmendado + fila en INDEX. **No implementa código** |
| `/sesion-negocio <tema>` | Status PMO, docs para el cliente, comparativas, marketing | `BACKLOG.md` + `git log` + docs relevantes | Documento versionado en `docs/`, en el lenguaje del destinatario |
| `/sesion-consolidacion` | Cada ~5 sesiones de trabajo, o al cerrar un bloque | Todo lo de abajo (tiene checklist propio) | Docs y código vuelven a coincidir; huecos cerrados con commits |

**Regla de oro del tablero:** si una sesión empieza a derivar hacia otro tipo (una feature descubre una decisión de arquitectura, una consolidación descubre un bug), **no se resuelve ahí** — se anota y se abre la sesión del tipo correcto. Es lo que mantiene los threads baratos y encontrables.

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

- **Autorización permanente** para el ciclo código→build→commit→push→deploy sin re-preguntar en cada paso (el push a `main` deploya solo en Netlify).
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
> 1. `npm install` (corre `prisma generate` solo). Si falta `.env`, pedímelo — las claves (`DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`) no están en el repo a propósito.
> 2. Leé `docs/TABLERO-SESIONES.md`, `docs/adr/INDEX.md` y `BACKLOG.md`.
> 3. Confirmame en 5 líneas: estado del repo, último deploy en Netlify, y qué comandos `/sesion-*` quedaron disponibles.
>
> Este proyecto trabaja con el protocolo ADR-008: un tema por sesión, todo termina commiteado y pusheado, el repo es la única fuente de verdad. Las sesiones de trabajo se abren con los comandos `/sesion-*` — no arranques trabajo de fondo en esta sesión de inicio.
