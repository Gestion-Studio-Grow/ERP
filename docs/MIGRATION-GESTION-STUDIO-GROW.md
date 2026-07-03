# Plan de migración — a "Gestión Studio Grow" (Claude Max x20)

**Fecha:** 2026-07-03 · **Estado:** Listo para ejecutar · **Owner de la org:** gestionstudiogrow@gmail.com · **Equipo:** Maxi (maxilloveras23-collab) + Facundo

Este documento es el checklist ejecutable de la migración. Se guarda en el repo porque, siguiendo ADR-008 regla 6, la documentación técnica generada vive versionada acá, no en un chat que se pierde.

**Decisiones ya tomadas** (confirmadas antes de escribir este plan, no asumidas):
1. El repo se **transfiere** de `maxilloveras23-collab/ERP` a la org `GestionStudioGrow` (ownership transfer real de GitHub, no fork ni solo acceso).
2. El alcance multi-tenant **sigue como está** — esta migración no arranca RLS ni aislamiento real entre tenants. Eso queda como trabajo futuro ya documentado (ver ADR-001 y el estado de G1 en `docs/adr/INDEX.md`).

---

## 0. Estado verificado del proyecto (línea de base, no supuestos)

| Qué | Estado real, verificado hoy |
|---|---|
| Repo | `github.com/maxilloveras23-collab/ERP`, cuenta personal (no org), branch única `main`, working tree limpio. |
| Deploy | Netlify, sitio `ch-estetica`, auto-deploy en cada push a `main`. `siteId` en `.netlify/state.json` (gitignored — no viaja con el repo). |
| Base de datos | Postgres en Neon, connection string en `.env` local (gitignored, nunca commiteado). |
| Secretos locales (`.env`) | `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`. `RESEND_API_KEY`/`RESEND_FROM_EMAIL`/`CRON_SECRET` están documentados en `DEPLOY.md` pero **no configurados todavía** (recordatorios por email/WhatsApp quedan simulados sin ellos). |
| Documentación de arquitectura | `docs/adr/` — 14 ADRs + `AMENDMENTS-revision-critica.md` + `INDEX.md` como punto de entrada único (protocolo ya definido en ADR-008). |
| Documentación de negocio | `BACKLOG.md` (auditado contra código, no contra supuestos), `docs/marketing-diferenciales.md`, `docs/resumen-ejecutivo-vs-tuturno.md`, `docs/hitos-pendientes-vs-tuturno.md`. |
| Seguridad — estado real | Auth con **contraseña única compartida** (`ADMIN_PASSWORD`), sin roles ni usuarios individuales. RLS de Postgres **diferida a propósito** (un solo tenant activo, ver nota en `prisma/schema.prisma`). MFA y rate-limiting de login (AMD-005) **no implementados**. Audit trail (ADR-009 §4) **sí implementado** (`AuditLog`), pero con un único actor posible ("admin") — su valor real depende de que se resuelvan los roles. |
| Lo que NO existe todavía | Ningún archivo `CONTRIBUTING.md`, `SECURITY.md` ni `CODEOWNERS` en el repo (se agregan en este plan, sección 4). |

**Confirmado por el founder (2026-07-03), reemplaza la sección anterior de incógnitas:**
- Org `GestionStudioGrow` **no existe todavía** en GitHub — hay que crearla.
- Owner de la org: **gestionstudiogrow@gmail.com**.
- Netlify sigue, por ahora, bajo **maxi.lloveras.23@gmail.com** — su migración a la org queda para una fase posterior, **no es parte de este movimiento**. Esto no elimina el riesgo R1 (el link GitHub↔Netlify puede cortarse igual, porque lo que cambia es el dueño del *repo*, no todavía el de Netlify) — sigue siendo un paso a verificar.
- Equipo: **2 personas** — vos (maxilloveras23-collab) y **Facundo**. Falta su usuario de GitHub para poder invitarlo (paso B3 de abajo).

---

## 1. Checklist de migración paso a paso

Orden pensado para que en ningún momento el sitio en producción deje de andar, y para que nadie quede con acceso a secretos más tiempo del necesario.

### Fase A — Preparación (antes de tocar nada del lado de GitHub/Netlify)
- [x] **A1.** Documentar toda decisión de arquitectura pendiente de persistir. *(Hecho: ADR-013, ADR-014, INDEX.md corregido — commit `366996c`.)*
- [ ] **A2.** Crear la organización en GitHub — **no existe todavía**:
  1. Ir a **github.com/account/organizations/new** (logueado con la cuenta que va a administrarla — puede ser tu cuenta personal o directo con `gestionstudiogrow@gmail.com`, ver nota abajo).
  2. Nombre de la org: `GestionStudioGrow` (o el slug que prefieran — confirmar antes de crear, cambiar el nombre de una org después es posible pero rompe cualquier link ya compartido).
  3. Plan: Free alcanza para 2 personas y un repo privado/público sin límite de colaboradores relevante acá.
  4. Email de contacto de la org: `gestionstudiogrow@gmail.com`.
  5. **Nota sobre "owner":** GitHub no permite que una org sea "dueña" de otra cuenta — el owner de la org es una cuenta de usuario de GitHub (la tuya, o una cuenta nueva creada con `gestionstudiogrow@gmail.com` como email). Si `gestionstudiogrow@gmail.com` todavía no tiene una cuenta de GitHub propia, dos caminos: (a) crear la org con tu cuenta personal como owner inicial y agregar esa cuenta después como segundo owner, o (b) crear primero una cuenta de GitHub con ese email y usarla para crear la org directamente. (a) es más simple si el que va a operar el día a día sos vos.
- [ ] **A3.** Netlify **no se toca en este movimiento** (confirmado: sigue en `maxi.lloveras.23@gmail.com`, migra después). Igual, anotar ahora el link directo al site (`app.netlify.com/sites/ch-estetica`) para el chequeo de la Fase B5 — se va a necesitar apenas se transfiera el repo, aunque la cuenta Netlify no cambie todavía.
- [ ] **A4.** Hacer un backup lógico de la base antes de cualquier cambio de acceso — primera vez que una segunda persona (Facundo) va a tener potencial acceso a producción. `pg_dump` completo de Neon a un archivo fuera del repo.
- [ ] **A5.** Conseguir el usuario de GitHub de Facundo (necesario para B3).

### Fase B — Transferencia del repositorio (GitHub como source of truth)
- [ ] **B1.** Desde `github.com/maxilloveras23-collab/ERP` → Settings → General → Danger Zone → **Transfer ownership** → destino `GestionStudioGrow`. Requiere que la org ya exista (A2) y que tengas permiso para crear repos en ella.
- [ ] **B2.** GitHub preserva issues, PRs, stars y **todo el historial de commits** — no hay pérdida de información acá. La URL vieja queda como redirect automático.
- [ ] **B3.** En la org (`GestionStudioGrow` → `ERP` → Settings → Collaborators and teams):
  - Agregar a `maxilloveras23-collab` (vos) con permiso **Admin** (ya sos el owner original, esto es solo para que quede explícito en la org).
  - Agregar a **Facundo** por su usuario de GitHub (pendiente de A5) — permiso **Write** alcanza para trabajar sobre el código; **Admin** solo si también va a administrar settings del repo/org.
- [ ] **B4.** Actualizar el remote local en cada máquina que tenga el repo clonado (la tuya y la de Facundo):
  ```bash
  git remote set-url origin https://github.com/GestionStudioGrow/ERP.git
  git remote -v   # confirmar
  ```
- [ ] **B5.** **Riesgo concreto a chequear ahora, no después — más relevante todavía porque Netlify sigue en la cuenta de Maxi mientras el repo ya se movió a la org.** La integración GitHub↔Netlify está atada a la instalación de la app de GitHub en la cuenta/org de origen. Después de B1:
  1. Entrar a `app.netlify.com/sites/ch-estetica` → Site configuration → Build & deploy → Repository.
  2. Confirmar que sigue mostrando el repo conectado (ahora en `GestionStudioGrow/ERP`).
  3. Si perdió el link (síntoma: el próximo push no dispara build automático) → Site configuration → Build & deploy → **Link to a different repository**, volver a autorizar la GitHub App de Netlify dando acceso al repo dentro de la org nueva (puede pedir que un Owner de la org apruebe la instalación de la app).
  4. Hacer un commit de prueba chico después de esto y confirmar en Netlify que el deploy se disparó solo — no dar la migración por terminada sin ver ese deploy verde.

### Fase C — Accesos y secretos (seguridad, no como afterthought)
- [ ] **C1.** Dar acceso a Neon (la base de datos) solo a quien realmente necesite tocar producción — no es lo mismo que acceso al repo.
- [ ] **C2.** Dar acceso al team/site de Netlify a quien necesite ver deploys/logs.
- [ ] **C3.** Rotar `AUTH_SECRET` y `ADMIN_PASSWORD` **una vez que el equipo final de Gestión Studio Grow esté definido** — no antes (rotar antes de saber quién necesita el valor nuevo es trabajo doble). Esto invalida sesiones activas del admin, es esperable.
  - `AUTH_SECRET`: generar un valor random nuevo, actualizar en Netlify (Environment variables) y en el `.env` local de cada colaborador — nunca por chat/email, usar el manejo de secretos que ya use el equipo (1Password, Netlify env vars, etc.).
  - `ADMIN_PASSWORD`: cambiarla y comunicarla por un canal que no sea texto plano permanente.
- [ ] **C4. No rotar `DATABASE_URL` como parte de este movimiento** salvo que haya evidencia de exposición — es la connection string de producción con datos reales de Carolina; rotarla sin necesidad agrega riesgo (coordinar Neon + Netlify + todos los `.env` locales) sin beneficio de seguridad claro en este paso.
- [ ] **C5.** Confirmar que ningún secreto quedó pegado en este chat, en un README, o en un mensaje de Slack/WhatsApp del equipo — los secretos viven en Netlify env vars y en `.env` locales gitignored, en ningún otro lado.

### Fase D — Estructura de trabajo consistente (ver sección 4 para contenido)
- [ ] **D1.** Agregar `CONTRIBUTING.md` (ver sección 4 — ya generado en este plan).
- [ ] **D2.** Agregar `SECURITY.md` con el proceso real de reporte de vulnerabilidades (contenido a definir por los founders — no lo invento acá, ver plantilla en sección 4).
- [ ] **D3.** Definir `CODEOWNERS` si va a haber más de 2-3 personas tocando el repo (evita que un PR quede sin revisor asignado).
- [ ] **D4.** Decidir y documentar (en `CONTRIBUTING.md` o en un ADR nuevo) la política de branches: hoy todo el trabajo va directo a `main` con deploy automático — funciona para 1 persona, es un riesgo con 2+ personas trabajando en simultáneo. Ver sección 6, riesgo R3.

### Fase E — Continuidad de Claude en la cuenta nueva
- [ ] **E1.** En la cuenta nueva (Max x20), primera sesión: pegar `docs/adr/INDEX.md` completo — es el protocolo que ya existe (ADR-008) y sigue siendo válido tal cual.
- [ ] **E2.** Pegar también `BACKLOG.md` si la sesión va a tocar features de negocio (no arquitectura).
- [ ] **E3.** Clonar el repo (ya transferido) en el entorno de trabajo de la cuenta nueva y confirmar que `npm install && npx prisma generate` corre limpio antes de tocar código.
- [ ] **E4.** Ver sección 2 para el detalle de qué SÍ y qué NO se reconstruye automáticamente.

---

## 2. Cómo reconstruir el contexto del proyecto dentro de Claude

**Lo que viaja solo, porque ya vive en el repo (esto es la mayor parte del contexto real):**
- Toda decisión de arquitectura → `docs/adr/` + `INDEX.md`.
- Todo el backlog de negocio, auditado contra código → `BACKLOG.md`.
- Todo el código, con comentarios que explican el *por qué*, no el *qué* (convención ya establecida en este repo).
- Historial completo de commits — cada uno con mensaje explicando el motivo del cambio, no solo el diff.

**Lo que NO viaja automáticamente — esto es el riesgo real de "pérdida de contexto" en una migración de cuenta de Claude:**
- La memoria propia de Claude (preferencias tuyas, feedback que me diste, contexto de proyecto) vive en archivos ligados a **esta** cuenta/máquina (`~/.claude/projects/.../memory/`), no en el repo. Una cuenta nueva arranca sin ese historial.
- **Mitigación concreta:** este mismo documento + `docs/adr/INDEX.md` + `BACKLOG.md` cumplen la función de esa memoria, pero versionados y explícitos en vez de implícitos. Es upgrade, no downgrade — es exactamente el "por qué" de la regla 1 de ADR-008 ("toda decisión cerrada se persiste como ADR, nunca queda solo en el chat"), aplicado ahora también a la continuidad entre cuentas.
- Al abrir la primera sesión en la cuenta nueva, decile a Claude explícitamente: *"este proyecto sigue el protocolo de ADR-008 — el INDEX.md de docs/adr/ es tu punto de entrada"*. Eso reconstruye el 90% del contexto de arquitectura en un solo mensaje.

**Checklist de reconstrucción de contexto (ejecutar en orden en la primera sesión nueva):**
1. Pegar `docs/adr/INDEX.md` completo.
2. Pedir que lea `BACKLOG.md` del repo (no pegarlo — dejar que Claude Code lo lea del filesystem, más barato en tokens, ADR-008 regla 5).
3. Si la sesión es sobre una feature específica ya resuelta antes, decir explícitamente "esto ya se decidió en ADR-0XX" en vez de dejar que Claude lo redescubra.
4. Confirmar el estado real de deploy antes de asumir nada: `git log --oneline -5` + revisar el último deploy en Netlify.

---

## 3. Cómo conectar GitHub como fuente de verdad

Ya lo es hoy (todo el trabajo pasa por commits reales, no por archivos sueltos) — lo que cambia es *dónde* vive:

1. Después de la transferencia (Fase B), el remote de trabajo pasa a ser `github.com/GestionStudioGrow/ERP`.
2. **Regla operativa, no técnica:** ningún cambio de código, arquitectura o negocio se considera "hecho" hasta que está commiteado y pusheado. Esto ya es la práctica de este repo (ver el historial de commits — cada sesión de trabajo termina en push, no en "avisar por chat que se hizo algo").
3. Deploy automático (Netlify) es la verificación externa de que GitHub es efectivamente la fuente de verdad: si el estado de producción alguna vez no coincide con `main`, GitHub es quien tiene razón, no el estado de un servidor tocado a mano.
4. Nunca se hace `git push --force` a `main` salvo emergencia explícitamente acordada — con más de una persona trabajando, reescribir historia rompe el trabajo de otros silenciosamente.

---

## 4. Estructura recomendada de repositorio

**La estructura actual ya es buena — no se reescribe, se completa.** Verificado, no supuesto:

```
estetica-erp/
├── CLAUDE.md                    # apunta a AGENTS.md (instrucciones para Claude Code)
├── AGENTS.md
├── BACKLOG.md                   # backlog de negocio, vivo
├── README.md
├── DEPLOY.md                    # guía de deploy (Netlify + Neon)
├── docs/
│   ├── adr/
│   │   ├── INDEX.md              # punto de entrada único (ADR-008)
│   │   ├── ADR-001..014-*.md
│   │   └── AMENDMENTS-revision-critica.md
│   ├── marketing-diferenciales.md
│   ├── resumen-ejecutivo-vs-tuturno.md
│   ├── hitos-pendientes-vs-tuturno.md
│   └── MIGRATION-GESTION-STUDIO-GROW.md   # este archivo
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                # una carpeta por migración, nunca editadas a mano después de aplicadas
│   └── seed.ts
├── scripts/                       # utilidades puntuales — nunca dejar scripts de una sola vez en el repo
├── src/
│   ├── app/(site)/                # front público
│   ├── app/admin/                 # backoffice
│   └── lib/                       # server actions, una responsabilidad por archivo
└── .env                           # nunca commiteado — DATABASE_URL, ADMIN_PASSWORD, AUTH_SECRET, etc.
```

**Agregados de este plan** (nuevos, para que la org tenga una base de colaboración real):

- **`CONTRIBUTING.md`** — cómo levantar el proyecto local, convención de commits, y el protocolo ADR-008 explicado para alguien que nunca lo vio. *(Contenido generado en este plan, ver más abajo — se agrega como archivo separado en el mismo commit de este plan.)*
- **`SECURITY.md`** — a quién y cómo reportar una vulnerabilidad. **No invento el contacto ni el SLA** — es una decisión de los founders. Plantilla:
  ```markdown
  # Política de seguridad

  Si encontrás una vulnerabilidad, reportala a: [EMAIL A DEFINIR]
  No abras un issue público para vulnerabilidades no reveladas.
  Tiempo de respuesta esperado: [A DEFINIR].
  ```
- **`.github/CODEOWNERS`** (opcional, solo si son 3+ personas tocando el repo):
  ```
  * @usuario-1 @usuario-2
  ```

---

## 5. Cómo reiniciar arquitectura y seguridad sin pérdida de información

**No es un reinicio — es una continuación documentada.** "Reiniciar sin pérdida" en la práctica significa: antes de que alguien nuevo toque arquitectura o seguridad, tiene que leer lo que ya se decidió, no redecidirlo de cero. Eso ya está armado (`docs/adr/`); lo que faltaba (ADR-013, ADR-014) se completó en este mismo turno.

**Arquitectura — próximo paso real, no genérico:**
El propio `docs/adr/INDEX.md` ya tiene la lista de "Próximos pasos sugeridos" actualizada (sección final del archivo). No la repito acá para no tener dos fuentes de la misma lista — **esa sección del INDEX es la que se mantiene viva**, esta migración no le agrega una segunda.

**Seguridad — esto sí es nuevo en este plan, porque la migración lo activa:**
Hoy la seguridad del sistema depende de una sola contraseña compartida. Eso era un riesgo aceptable con una persona operando; **deja de serlo en el momento en que Gestión Studio Grow suma gente con acceso**. Antes de sumar al segundo colaborador con acceso al admin del sistema (no al repo — al panel `/admin` en producción):
1. Priorizar la implementación de roles de usuario (ya está en `BACKLOG.md`, ítem crítico #2, con un prompt de arranque en `docs/hitos-pendientes-vs-tuturno.md`).
2. Hasta que eso exista, cualquier persona nueva con la contraseña de admin es indistinguible de cualquier otra en el audit trail — asumir eso explícitamente, no ignorarlo.
3. MFA y rate-limiting de login (AMD-005) siguen pendientes — no se agregan solos por migrar de cuenta, hay que decidir cuándo se hacen.

---

## 6. Riesgos de migración y cómo evitarlos

| # | Riesgo | Por qué pasa | Cómo evitarlo |
|---|---|---|---|
| R1 | Netlify deja de deployar después de transferir el repo | La integración GitHub↔Netlify está atada a la instalación de la app en la cuenta/org de origen | Verificar el link en Netlify **inmediatamente** después de B1 (Fase B5), no asumir que sigue andando |
| R2 | Secretos de producción circulando por chat/email durante el traspaso | Es la forma más común de compartir credenciales "para salir del paso" | Usar un gestor de secretos real desde el día 1 (Fase C3); nunca pegar `DATABASE_URL`/`ADMIN_PASSWORD` en un mensaje |
| R3 | Dos personas pusheando directo a `main` con deploy automático pisan cambios entre sí | Hoy el flujo está pensado para una sola persona trabajando | Antes de que trabaje una segunda persona en simultáneo: decidir si se sigue con push directo (con comunicación activa) o se pasa a PRs con revisión — es una decisión de equipo, no técnica, decidirla explícitamente en `CONTRIBUTING.md` |
| R4 | La memoria de Claude de esta cuenta no viaja, y alguien asume que "ya se le explicó" algo a la cuenta nueva | Confusión entre "está en el repo" y "Claude se acuerda" | Checklist de la sección 2 en cada sesión nueva — el INDEX.md reemplaza la memoria implícita |
| R5 | Alguien nuevo con acceso al panel admin, sin roles todavía, y sin saber que el audit trail no lo distingue | La seguridad real (roles) está en el backlog, no implementada | Ver sección 5 — no dar la contraseña de admin a nadie nuevo sin haber leído ese punto |
| R6 | RLS se activa "corriendo" el día que aparece el segundo tenant, bajo presión de un cliente nuevo esperando | Quedó deliberadamente diferido, pero diferido no es lo mismo que olvidado | Tratar "aparece un segundo tenant" como un trigger explícito para retomar G1 con tiempo, no como una sorpresa — dejarlo anotado en el checklist de onboarding de un tenant nuevo cuando ese flujo se diseñe (ADR-009 §5) |
| R7 | Se pierde el hilo de qué se transfirió y qué no (Netlify, Neon, dominio si lo hay) | La migración de este plan cubre GitHub + Claude explícitamente, pero Netlify/Neon tienen sus propias cuentas separadas | Fase A2/A3 de este mismo checklist — confirmarlas antes de dar la migración por terminada |
