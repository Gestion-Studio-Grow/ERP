# Onboarding del equipo técnico — de dev nuevo a operador de élite

**Qué es:** el programa de entrenamiento para que alguien —**una persona o un agente de IA**—
pase de "no conoce el proyecto" a operar esta metodología a nivel de élite. No re-explica la
mecánica de las sesiones (eso está en `docs/MANUAL-SESIONES.md`, la referencia): esto es el
**cómo se opera bien**, la ruta de aprendizaje, y el estándar que separa un buen operador de uno
excelente.

**Por qué existe:** el equipo técnico ejecuta a través de agentes de Claude Code sobre un repo
que es la única fuente de verdad (ADR-008). El activo no es "saber el código de memoria" —el
código cambia—: es **saber operar el sistema** para que cada sesión produzca trabajo correcto,
verificado y persistido, sin depender de que nadie explique nada por chat. Un equipo de élite acá
es uno donde cualquier operador (humano o agente), en cualquier máquina, abre el repo y rinde.

> **Regla base:** este doc es una capa por encima. La mecánica canónica es
> `docs/TABLERO-SESIONES.md`; la guía amigable, `docs/MANUAL-SESIONES.md`; el "cómo trabaja un
> rol autónomo", `docs/METODO-ROLES.md`. Si algo acá se contradice con esos, ganan ellos y es un
> hallazgo para `/sesion-consolidacion`.

---

## 1. El modelo mental en 5 ideas (esto es lo que hay que *entender*, no memorizar)

1. **El repo es la única fuente de verdad (ADR-008).** Nada importante vive en el chat: las
   decisiones son ADRs, las features son BACKLOG, el "qué sigue" es `PROXIMOS-PASOS.md`. Si no
   está en el repo, no existe para la próxima sesión. Trabajás para el repo, no para el thread.
2. **Un tema por sesión.** Cada thread arranca con su `/sesion-*` y termina commiteado y
   pusheado, o no terminó. Si una sesión deriva a otro tipo (una feature descubre una decisión
   estructural), no se resuelve ahí: se anota y se abre la sesión correcta.
3. **Core / Blueprint / Plugin, nunca fork.** Un solo Core multi-tenant; cada cliente es un
   tenant; los verticales entran por Blueprint (config) o Plugin, jamás copiando el producto
   (FUNDAMENTOS §1–4, ADR-001/002). Rubro nuevo dentro de un arquetipo = una sesión de config, no
   de desarrollo.
4. **El *porqué* se persiste.** Un ADR no documenta qué se hizo, documenta **por qué** —para no
   re-discutirlo en 6 meses. Un commit explica la razón, no solo el cambio. Esa es la memoria
   larga del equipo.
5. **Economía de tokens (ADR-008).** Modelo barato para lo mecánico, caro para diseño. No pegar
   archivos en el chat (se leen del filesystem). Reusar sesiones, cerrar las terminadas. Máxima
   calidad donde da valor (arquitectura, seguridad, fiscal, correctitud); mínimo gasto en lo
   accesorio.

---

## 2. Setup — primer arranque (día 0)

El arranque completo (clonar, `npm install`, pedir `.env` si falta, confirmar estado) es el
**"Prompt maestro"** al final de `docs/TABLERO-SESIONES.md` — es lo único que se pega a mano.
En resumen: `npm install` (corre `prisma generate` solo), pedir `.env` si falta (las claves no
están en el repo a propósito), y **no** arrancar trabajo de fondo en la sesión de inicio.

**La DB es producción real (Neon, plan free).** No se corren benchmarks ni escaneos pesados
contra prod; para analizar, se lee `prisma/schema.prisma` y `prisma/migrations/` del repo. Los
datos de prueba de una sesión se borran antes de cerrarla.

---

## 3. Ruta de ramp — de cero a volando

**Día 1 — entender el mapa (solo lectura, nada de código):**
1. `docs/FUNDAMENTOS-Y-VISION.md` — la visión y el criterio rector (el marco donde todo decide).
2. `docs/MANUAL-SESIONES.md` — los 5 tipos de sesión y cómo se cierra cada uno.
3. `docs/ROADMAP.md` — qué tiene el producto hoy (verificado contra código) y hacia dónde va.
4. `docs/adr/INDEX.md` — el índice de decisiones; leer un par de ADRs enteros para ver el estilo
   (por ej. ADR-001 multi-tenant, ADR-008 método, ADR-018 RLS).

**Semana 1 — primera vuelta de manija (trabajo real, chico y verificado):**
- Tomá un ítem chico y sin gate de `docs/PROXIMOS-PASOS.md` o del `BACKLOG.md`, abrí la
  `/sesion-*` que corresponde, y llevalo hasta commit+push con `tsc`+build en verde. El objetivo
  no es el tamaño del cambio: es **completar el ciclo entero** (entender→hacer→verificar→persistir)
  una vez.
- Leé `docs/METODO-ROLES.md` (el bucle de trabajo y la definición de terminado) y aplicalo.

**Cuando ya volás — operás autónomo:**
- Despacho desde el móvil con los roles autónomos (`/sesion-movil`, `/rol`, `/rol-fullstack`); la
  continuidad de un sprint de varias sesiones la lleva `docs/SPRINT-MOVIL.md` (pedís "status" o
  "seguimos" y se retoma exacto).
- Corrés `/sesion-consolidacion` cada ~5 sesiones para que el repo no empiece a mentir.

---

## 4. El bucle de trabajo (en TODA tarea)

`entender → plan → hacer → verificar → reportar`. Detalle en `docs/METODO-ROLES.md §2`. Lo
esencial:
- **Entender:** leer los punteros que aplican **y el código real** antes de opinar. Nada de
  suposiciones ("ya pasó que un ítem figuraba pendiente estando implementado").
- **Hacer:** el cambio más simple y correcto que resuelve el tema (ADR-006:
  simple-y-correcto-ahora > elegante-especulativo).
- **Verificar:** no está listo hasta que `tsc --noEmit` y `build` están en verde; si es
  observable en la app, se verifica en preview. La verificación es parte del trabajo, no un
  extra.
- **Reportar:** al dueño en su idioma (funcional, no técnico — `METODO-ROLES.md §5`); y dejar el
  follow-up en `PROXIMOS-PASOS.md`.

---

## 5. Estándar de élite — qué separa "bien" de "excelente"

Estas son las prácticas no negociables de un operador de élite acá:

- **Leé el código, no tu memoria.** El framework tiene APIs distintas a tu entrenamiento
  (`AGENTS.md`: leer `node_modules/next/dist/docs/` antes de escribir Next). Un dato de negocio,
  un ADR citado, un "esto ya está hecho": se confirma abriendo el archivo, no se asume.
- **Verificá siempre; nunca declares sin evidencia.** `tsc`+build en verde antes de cada commit.
  Si algo falla, se dice con el output; si un paso se saltó, se dice.
- **Decisión estructural = ADR, siempre.** Si tu cambio implica una decisión que sobrevive al
  código (datos, seguridad, plataforma), se escribe el ADR con el porqué. Código que cita un ADR
  que no existe es un bug de proceso (ya pasó con ADR-013/014).
- **Respetá los gates como sagrados.** Push a GitHub es libre; **deploy a prod/Netlify y
  `prisma migrate deploy` NO se cruzan solos** — se paran y se reportan para el OK del dueño.
  Nada destructivo contra prod (force push, reset --hard, DROP, migrate reset están bloqueados).
- **Dejá el handoff listo.** Toda sesión, al cerrar, deja en `PROXIMOS-PASOS.md` el trabajo
  concreto que disparó. La próxima sesión lo lee del repo, no reconstruye de memoria.
- **No frenes por datos.** Falta un dato/seed/config → placeholder coherente marcado "provisional
  a confirmar" y seguís; el flujo no se detiene (`METODO-ROLES`). Nunca un menú interactivo que
  bloquee al dueño: decidís con criterio y documentás el porqué.
- **Autonomía de gerente, escalado solo owner-level.** Lo técnico/implementación/prioridad
  operativa lo decide el operador con criterio experto y sigue; al dueño se escala solo lo
  estratégico/negocio/gasto/legal/irreversible.
- **Consolidá.** El repo tiende a mentir con el tiempo; `/sesion-consolidacion` es el feedback
  loop que lo vuelve honesto. No es opcional: es lo que mantiene la confianza en la fuente de
  verdad.

---

## 6. Operar y **mejorar** a los agentes (el corazón del "equipo de élite")

El equipo ejecuta vía agentes. Que sean cada vez mejores no es magia del modelo: es que el
**sistema alrededor del agente** mejora. Cómo se entrena/mejora un agente acá:

- **Los comandos son el "entrenamiento" versionado.** Un `/sesion-*` o un `rol.md` es un prompt
  que vive en `.claude/commands/`, viaja con el repo y **mejora con cada corrección**. Cuando un
  agente comete un error de proceso recurrente, el fix no es "avisarle en el chat" (se pierde):
  es **corregir el comando** en un commit. Así el próximo agente ya arranca sin ese error. Un
  prompt pegado a mano se degrada con cada copia; un comando versionado sube.
- **Los ADRs son la memoria de decisiones del agente.** Un agente nuevo no necesita que le
  expliquen por qué se eligió RLS mecanismo B o por qué arca es Plugin y no repo: lo lee del ADR.
  Escribir buenos ADRs es literalmente entrenar a todos los agentes futuros.
- **La cola de handoff y el sprint activo son la memoria de trabajo.** `PROXIMOS-PASOS.md` y
  `docs/SPRINT-MOVIL.md → Sprint activo` permiten que un agente retome sin contexto de chat. Un
  operador de élite los deja siempre al día, porque son lo que hace al equipo *stateless y
  resumible*.
- **La consolidación es el control de calidad del agente.** Corregir lo que el agente dejó
  divergente (doc que miente, ADR sin escribir, código muerto) y, mejor aún, **corregir el
  comando/regla que permitió esa divergencia**, es como el equipo sube de nivel de forma
  compuesta.
- **Reglas de oro para un agente operando acá:** adoptá el rol y decidí (no `AskUserQuestion`);
  leé el repo antes de actuar; verificá con tsc+build; un tema por commit con el porqué; pará en
  los gates; y si el sistema te hizo tropezar, dejá el sistema mejor que como lo encontraste
  (corregí el comando/doc/ADR), no solo tu tarea.

---

## 7. Catálogo de anti-patrones (errores reales ya vistos — no los repitas)

Estos son casos que `/sesion-consolidacion` existe para atrapar; conocerlos es media batalla:
- **Código que cita un ADR que nunca se escribió** (pasó con ADR-013/014).
- **El BACKLOG marca pendiente algo ya implementado** (pasó con "turno manual").
- **Un doc afirma algo que el código ya contradice** (el "Estado del proyecto" desactualizado).
- **Función implementada y nunca conectada** (pasó con `getPublishedReviews()`).
- **Deuda silenciosa entre ADR y código** (ADR-004 prometía un `EXCLUDE GIST` inexistente; el
  código usaba check-then-insert). Cuando ADR y código divergen: o el código cumple el ADR, o el
  ADR se enmienda. Uno no puede mentir sobre el otro.

---

## 8. Mapa de docs (a dónde ir por qué)

| Necesito… | Doc |
|---|---|
| La visión y el criterio rector | `docs/FUNDAMENTOS-Y-VISION.md` |
| Qué sesión abrir / cómo cierra | `docs/MANUAL-SESIONES.md` · spec canónica `docs/TABLERO-SESIONES.md` |
| Cómo trabaja un rol autónomo | `docs/METODO-ROLES.md` |
| Continuidad de sprint desde el móvil | `docs/SPRINT-MOVIL.md` |
| Las decisiones estructurales | `docs/adr/INDEX.md` |
| Qué tiene el producto hoy / hacia dónde | `docs/ROADMAP.md` |
| Qué construir / qué falta | `BACKLOG.md` |
| Qué sigue después de cerrar esto | `docs/PROXIMOS-PASOS.md` |
| Cómo se da de alta un tenant | `docs/ONBOARDING-TENANT.md` |

---

## 9. Mantener este doc honesto

Documento vivo. Si cambia la metodología (un tipo de sesión nuevo, una regla de gobierno, un
gate) y este onboarding no lo refleja, es un hallazgo para `/sesion-consolidacion`. La mecánica
canónica siempre gana desde `docs/TABLERO-SESIONES.md`; esto es la capa de entrenamiento por
encima.
