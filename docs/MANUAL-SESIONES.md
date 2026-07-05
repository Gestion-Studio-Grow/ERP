# Manual de sesiones — guía de uso del equipo

Este es el libro de usuario del sistema de trabajo con Claude Code. Es la puerta
de entrada para una persona (o cuenta) nueva: qué tipo de sesión abrir, hasta
dónde llega cada una y cómo se cierra bien.

- **Fuente de verdad de la mecánica:** `docs/TABLERO-SESIONES.md` (la tabla
  canónica y las reglas). Este manual es la capa amigable de arriba; si los dos
  se contradicen, gana el tablero y eso es un hallazgo para `/sesion-consolidacion`.
- **Por qué existe todo esto:** ADR-008 — un thread por tema, toda decisión
  persiste en el repo, el índice liviano como entrada. Los comandos viven
  versionados en `.claude/commands/`, así viajan con el repo a cualquier
  máquina/cuenta y mejoran con cada corrección.
- **¿Sos nuevo en el equipo (persona o agente)?** Empezá por
  `docs/ONBOARDING-EQUIPO.md`: el modelo mental, la ruta de ramp (día 1 / semana 1),
  el estándar de operación de élite y cómo se entrena/mejora a los agentes. Este
  manual es la referencia de la mecánica; ese doc es el entrenamiento por encima.

---

## El gesto: cómo se arranca una sesión

Escribí el comando del tipo + el tema en una línea:

```
/sesion-feature reprogramar turno del cliente
/sesion-arquitectura activar RLS de Postgres
/sesion-negocio comparativa contra Fresha para Carolina
/sesion-seguridad rate-limit en el login de /admin
/sesion-consolidacion
```

El comando carga solo los preconceptos (qué leer, qué reglas aplican). No pegues
archivos en el chat: Claude los lee del filesystem.

**Regla de un tema por sesión:** cada thread es un solo tema. Termina
commiteado y pusheado, o no terminó.

---

## Los 5 tipos de sesión

### `/sesion-feature <tema>` — implementar
- **Cuándo:** implementar algo del `BACKLOG.md` o un pedido concreto del cliente.
- **Alcance (sí):** escribir código, Server Actions, UI, migraciones; verificar
  en preview; actualizar el backlog.
- **No hace:** decidir algo estructural nuevo. Si aparece una decisión de
  arquitectura, se anota y se abre `/sesion-arquitectura` — no se decide acá.
- **Arranca leyendo:** `BACKLOG.md` (+ el ADR puntual si el tema toca una
  decisión ya tomada).
- **Cierra cuando:** `tsc --noEmit` y `build` limpios, verificado en preview si
  es observable, datos de prueba borrados, commit+push, `BACKLOG.md` al día.

### `/sesion-arquitectura <tema>` — decidir
- **Cuándo:** decidir algo estructural (datos, seguridad, plataforma).
- **Alcance (sí):** evaluar alternativas con trade-offs y escribir la decisión
  como ADR, con el *porqué* (que es lo que evita re-discutir en 6 meses).
- **No hace:** **no toca código.** La implementación es una `/sesion-feature`
  posterior que lee el ADR que se escribió acá.
- **Arranca leyendo:** `docs/adr/INDEX.md` (+ el ADR puntual solo si hace falta).
- **Cierra cuando:** ADR nuevo (o enmienda en `AMENDMENTS-revision-critica.md`)
  + fila en `INDEX.md` + "Estado del proyecto" actualizado si cambió + commit+push.

### `/sesion-negocio <tema>` — comunicar
- **Cuándo:** status PMO, docs para el cliente, comparativas, marketing.
- **Alcance (sí):** producir un documento versionado en `docs/`, en el lenguaje
  del destinatario (para Carolina: llano, sin jerga).
- **No hace:** tocar código ni tomar decisiones de arquitectura.
- **Arranca leyendo:** `BACKLOG.md` + `git log` + los docs relevantes.
- **Cierra cuando:** documento en `docs/` + commit+push.

### `/sesion-seguridad <tema>` — auditar y endurecer
- **Cuándo:** auditar la postura de seguridad o endurecer una superficie (auth,
  secretos, aislamiento multi-tenant, validación server-side).
- **Alcance (sí):** encontrar y aplicar endurecimiento concreto que no requiere
  decidir algo nuevo.
- **No hace:** decisiones estructurales (activar RLS, introducir roles) — esas
  se derivan a `/sesion-arquitectura`.
- **Arranca leyendo:** `SECURITY.md` + los ADRs de seguridad (001/005/AMD-005).
- **Cierra cuando:** fixes commiteados, `SECURITY.md` ("Estado de seguridad
  conocido") al día, secretos confirmados fuera del repo, commit+push.

### `/sesion-consolidacion` — mantener el repo honesto
- **Cuándo:** cada ~5 sesiones de trabajo, o al cerrar un bloque. No es
  automática — se abre a criterio. El disparador visible es el contador
  "Sesiones sin consolidar" al principio de `docs/TABLERO-SESIONES.md`: sube
  solo al cerrar cada sesión de los otros tipos, y esta sesión lo vuelve a 0.
- **Alcance (sí):** auditar que docs y código sigan coincidiendo y cerrar los
  huecos con commits. Tiene checklist propio en su comando.
- **No hace:** implementar features nuevas. Lo que excede se anota como sesión
  del tipo correcto.
- **Arranca leyendo:** todo (backlog, ADRs, código, deploy, el tablero mismo).
- **Cierra cuando:** docs y código vuelven a coincidir + resumen final
  (bien / corregido / anotado) + commits pusheados.

---

## La regla de oro

Si una sesión empieza a derivar hacia otro tipo — una feature descubre una
decisión de arquitectura, una consolidación descubre un bug, una sesión de
seguridad necesita decidir el modelo de auth — **no se resuelve ahí.** Se anota
y se abre la sesión del tipo correcto. Es lo que mantiene cada thread barato,
corto y encontrable.

---

## No tenés que acordarte de qué sigue: la cola lo sabe

El "qué hago después de cerrar esto" no vive en tu cabeza ni en el chat del thread
anterior — vive en `docs/PROXIMOS-PASOS.md` (ADR-016). Cada sesión, al cerrar, deja
ahí el trabajo concreto que disparó (con el comando sugerido); cada sesión, al abrir,
lee esa cola y te ofrece lo que le toca **antes de preguntarte en blanco**. O sea:
abrís `/sesion-feature` y ya te dice "lo pendiente para vos es X — ¿ese o hay otro?".
No hay que reconstruir de memoria dónde quedó todo. `/sesion-consolidacion` limpia la
cola cada tanto (saca lo hecho, revalida lo abierto).

## Reglas que valen en toda sesión

- **Autorización permanente** para el ciclo código→build→commit→push a GitHub sin
  re-preguntar en cada paso. **El deploy a Netlify NO es automático** (auto-publish
  apagado, `stop_builds`): el push a `main` va a GitHub sin publicar. Publicar en
  producción es un gate manual, solo con el OK explícito de Maxi (*"deployá"*).
- **La base de datos es producción real** (Neon). Todo dato de prueba creado
  durante una sesión se borra antes de cerrarla. Nada destructivo contra prod.
- **Los secretos no viven en el repo** (`DATABASE_URL`, `ADMIN_PASSWORD`,
  `AUTH_SECRET`). Están en `.env` (gitignoreado). Si falta, se pide.
- **Commits que explican el porqué** (ver `CONTRIBUTING.md`), no solo el qué.
- **Scripts de un solo uso** (`scripts/_*.ts`) se borran en la misma sesión.
- **Idioma:** español rioplatense entre nosotros; docs para el cliente en
  lenguaje llano.
- **Next.js 16 tiene APIs distintas al entrenamiento de Claude** — leer
  `node_modules/next/dist/docs/` antes de escribir código Next (regla de `AGENTS.md`).

---

## Tengo X, ¿qué abro? (árbol de decisión)

| Lo que tenés enfrente | Sesión |
|---|---|
| "Falta esta funcionalidad / el cliente pidió esto" | `/sesion-feature` |
| "¿Cómo deberíamos resolver estructuralmente esto?" | `/sesion-arquitectura` |
| "Necesito un documento para mostrar/decidir con alguien" | `/sesion-negocio` |
| "¿Esto es seguro? / hay que endurecer esta superficie" | `/sesion-seguridad` |
| "Hace rato que trabajamos, ¿el repo sigue diciendo la verdad?" | `/sesion-consolidacion` |
| "No sé qué es esto todavía / ¿qué comandos hay?" | `/manual` |

Duda frecuente: **feature vs arquitectura.** Si ya sabés *qué* construir y solo
falta hacerlo → feature. Si primero hay que **decidir cómo** (y esa decisión
sobrevive al código) → arquitectura, y la feature viene después.

---

## Primera vez en una máquina o cuenta nueva

El arranque completo (clonar, `npm install`, pedir `.env` si falta, confirmar
estado) está documentado como "Prompt maestro" al final de
`docs/TABLERO-SESIONES.md`. Es lo único que se pega a mano; todo lo demás se
carga solo desde el repo.

---

## Mantener este manual honesto

Este documento es vivo. Si se agrega o cambia un tipo de sesión y este manual no
lo refleja, eso es un hallazgo para `/sesion-consolidacion` (punto 8 de su
checklist: el tablero y los comandos que existen deben coincidir). El comando
`/manual` muestra la versión corta de esta guía; su fuente es este archivo.
