# Metodología de reporte de avance — estados canónicos y cómo se calcula el %

**Qué es:** el protocolo con el que reportamos el avance de cada frente/módulo. Nace de un
problema real: frentes que **del lado nuestro (código/diseño) están terminados y verificados**
pero que esperan una **acción del owner con datos reales** (credenciales, aplicar una migración a
prod, un OK de gate, una homologación) figuraban como "a medias" o "al 55%". Eso miente sobre el
trabajo: no es deuda técnica pendiente, es una **entrega lista esperando ejecución humana**.

**Regla madre:** **el % refleja lo que depende de NOSOTROS** (código, diseño, docs, verificación).
Lo que depende de una acción humana externa **no descuenta %** — se reporta como *estado*, no
como falta. Un frente puede estar al **100% nuestro** y aun así no estar "vivo en prod": esas son
dos dimensiones distintas y se reportan por separado.

---

## Los 3 estados canónicos

Todo frente (o componente de un frente) está en uno de estos estados:

### 🟢 Avanzable ya
Trabajo **nuestro** que se puede hacer **hoy**, sin gate, sin credencial, sin OK del owner. Es lo
único que cuenta como *trabajo pendiente del equipo*. El % de un frente mide cuánto de su alcance
"avanzable" está hecho.

### ✅ Completado — pendiente acción humana (ejecución con datos reales)
Del lado **dev/diseño está terminado y verificado** (`tsc` + build en verde, ADR escrito si
correspondía), y **lo único que resta es una acción del owner con datos reales**: conectar
credenciales, aplicar una migración a prod, dar un OK de gate, correr una homologación. **NO es
deuda técnica, NO es "a medias".** Cuenta como **100% nuestro**. La ejecución con datos reales es
un **paso de acción humana**, no una tarea de ingeniería pendiente.

### 🔒 Gated (Gate 2 / OK owner)
Bloqueado por una **decisión o acción irreversible del owner sobre producción**: aplicar RLS a
prod, `prisma migrate deploy`, deploy a Netlify. Es un subconjunto de "pendiente acción humana",
reservado para los actos **irreversibles** que por política ninguna sesión cruza sola
(`CLAUDE.md`, `docs/METODO-ROLES.md §4`). Se reporta como estado, nunca como % faltante.

> **Regla de clasificación (la que evita el auto-engaño):** las **ejecuciones con datos reales**
> —ARCA (cert/homologación), Mercado Pago (OAuth/credenciales), WhatsApp (proveedor), RLS (aplicar
> a prod)— son **pasos de acción humana**, no deuda técnica. El código que las habilita, una vez
> escrito y verificado, está **Completado**. Si además falta código nuestro para llegar a ese
> punto (p. ej. un adapter todavía sin escribir), *esa parte* sigue siendo 🟢 Avanzable ya —
> se reporta el frente **por sus partes**, en el estado que a cada una le corresponde.

---

## Cómo se calcula el %

- **% = alcance-nuestro-terminado ÷ alcance-nuestro-total**, donde "alcance nuestro" es
  código + diseño + docs + verificación. **Excluye** la ejecución con datos reales.
- Un frente **dev-completo** se reporta **100% (nuestro)** con estado *✅ Completado — pendiente
  acción humana*, aunque no esté vivo en prod.
- Un frente con partes en distinto estado se reporta **por partes** (ej.: "núcleo ✅ completado;
  adapter X 🟢 avanzable; activación pendiente acción humana"). No se promedia a un número que
  esconde la estructura.
- **Honestidad ante todo:** si un adapter/flujo **todavía no está escrito**, no se declara
  "completado — pendiente acción humana"; eso es 🟢 Avanzable ya (trabajo nuestro real). El estado
  ✅ es solo para lo que de verdad está terminado y verificado de nuestro lado.

---

## Cómo se usa

- El **mapa vivo** de todos los frentes bajo esta metodología está en `docs/ESTADO-FRENTES.md`
  (tabla de avance + backlog de frentes a conversar). Ese doc es el que se lee para un "status".
- En un **status desde el móvil** (`/sesion-movil`, `docs/SPRINT-MOVIL.md`), los estados se
  traducen a lenguaje de dueño: *"esto está listo y esperando que vos hagas X"* en vez de
  *"esto está al 60%"*.
- Esta metodología es **fuente de verdad del reporte**; si un doc reporta un frente terminado
  como "a medias", es un hallazgo para `/sesion-consolidacion`.
