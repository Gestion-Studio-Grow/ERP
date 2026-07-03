---
description: Guía rápida del sistema de sesiones — qué comando abrir para cada cosa
---

Mostrá esta guía rápida **tal cual** (no re-leas archivos para esto). Si al final
piden más detalle sobre un tipo de sesión, ofrecé abrir el manual completo en
`docs/MANUAL-SESIONES.md`.

---

**Sistema de sesiones** — un tema por thread, todo termina commiteado y pusheado,
el repo es la única fuente de verdad (ADR-008). Se arranca con `/sesion-<tipo> <tema>`.

| Comando | Para qué | No hace |
|---|---|---|
| `/sesion-feature <tema>` | Implementar algo del backlog o pedido del cliente | Decidir arquitectura nueva |
| `/sesion-arquitectura <tema>` | Decidir algo estructural → ADR con el porqué | Tocar código |
| `/sesion-negocio <tema>` | Doc para el cliente / status / comparativa | Tocar código |
| `/sesion-seguridad <tema>` | Auditar y endurecer (auth, secretos, aislamiento) | Decidir RLS/roles (→ arquitectura) |
| `/sesion-consolidacion` | Auditar que docs y código coincidan | Implementar features |

`/sesion-consolidacion` se abre a criterio (no automática) — el aviso es el
contador "Sesiones sin consolidar" al inicio de `docs/TABLERO-SESIONES.md`,
que sube solo al cerrar cada sesión de trabajo.

**Regla de oro:** si una sesión deriva hacia otro tipo, no se resuelve ahí — se
anota y se abre la sesión correcta.

**Vale en toda sesión:** la base es producción real (borrar datos de prueba);
secretos fuera del repo (`.env`); commit+push cierra la sesión (push a `main`
deploya solo en Netlify); español rioplatense.

**¿Feature o arquitectura?** Si ya sabés *qué* construir → feature. Si primero hay
que decidir *cómo* → arquitectura, y la feature viene después.

Manual completo: `docs/MANUAL-SESIONES.md` · Spec canónica: `docs/TABLERO-SESIONES.md`
