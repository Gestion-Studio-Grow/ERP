# Guía del dueño — cómo trabajamos (el paso a paso de SIEMPRE)

Guía corta y en criollo para Maxi. Todo el detalle técnico vive en `docs/METODO-ROLES.md` y
`docs/METODOLOGIA-SPRINT.md`; esto es lo mínimo que necesitás saber para operar.

## 1. Para arrancar o seguir trabajando: escribí **`sprint`**
Da igual desde acá (Claude Code) o desde el celular (Dispatch). Al escribir `sprint`, la sesión:
1. **Lee sola** dónde quedó todo (estado del proyecto + la cola de pendientes, incluida la Agencia Grow).
2. **Continúa lo abierto** y lo avanza — **no hace falta que le expliques el plan**.

## 2. Las 4 palabras (funcionan igual en Dispatch)
| Palabra | Qué hace |
|---|---|
| **`sprint`** | Arranca/continúa el trabajo. Lee el estado y sigue avanzando lo pendiente. |
| **`status`** | Te dice el estado real, en lenguaje de dueño (qué está hecho, qué falta). |
| **`seguimos`** | Retoma desde donde quedó, sin re-preguntar el plan. |
| **`pausa`** | Frena, deja todo prolijo y guardado (backup), y espera. |

## 3. Qué pasa solo y qué necesita tu OK
- ✅ **Solo, sin preguntarte:** escribir código → guardarlo en GitHub. **Esto no gasta plata.**
- 🔒 **Con tu OK (gates):**
  - **Publicar en la web / producción** → tenés que decir **"deployá"**. (Publicar gasta créditos; por eso te lo pregunto.)
  - **Cambiar la estructura de la base de datos** (migraciones) → se **pausa y te avisa**; nunca se corre solo (es lo único difícil de revertir).

## 4. Regla de oro
El **repo (GitHub) es la memoria**. Todo lo importante queda guardado ahí con su porqué. Si abrís una
sesión nueva y escribís `sprint`, retoma exactamente desde donde quedó. No se pierde contexto.

> ¿Dudas de qué se hizo? Escribí `status`. ¿Querés avanzar? Escribí `sprint` o `seguimos`.
