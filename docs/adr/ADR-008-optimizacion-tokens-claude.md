# ADR-008: Estrategia de Optimización de Costo de Tokens (Claude) Durante el Desarrollo

Esta misma sesión es el caso de prueba del método — la aplicamos desde ADR-001.

## Reglas de trabajo con Claude para este proyecto

1. **Toda decisión cerrada se persiste como ADR, nunca queda solo en el chat.** Un ADR de 1-2 páginas reemplaza tener que re-explicar contexto completo en cada sesión nueva. Costo marginal de leer un ADR: bajo. Costo de reconstruir el razonamiento de cero cada vez: alto.

2. **Un thread de chat = un tema, no un proyecto entero.** Esta conversación ya se está volviendo larga (8 ADRs). Para lo que sigue — implementación de Scheduling, diseño del Plugin ARCA, etc. — abrí conversaciones nuevas y arrancá pegando **solo el ADR relevante**, no todo el historial. Un ADR de 2 páginas pesa una fracción de lo que pesa este chat completo.

3. **Armá un `INDEX.md`** (te lo dejo armado abajo) **con un resumen de una línea por ADR.** Cuando en una sesión nueva necesites contexto de una decisión ya tomada, pegás el índice (liviano) y le decís a Claude "si necesitás el detalle de X, te paso ADR-00X completo" — así solo cargás el documento pesado cuando realmente hace falta, no siempre.

4. **Para tareas mecánicas (boilerplate de CRUD, tests repetitivos, generación de migraciones estándar), usá el modelo más barato disponible** (Haiku), no el mismo modelo que usás para discutir arquitectura. Reservá el modelo más caro para decisiones de diseño, revisión de código complejo y todo lo que realmente se beneficia de razonamiento profundo.

5. **Para trabajar sobre el código del proyecto, usá Claude Code apuntando al repo real**, en vez de pegar archivos completos en el chat. Claude lee del filesystem lo que necesita en vez de que vos le pegues todo el archivo — mismo resultado, mucho menos texto circulando.

6. **Documentación técnica generada (specs de API, diccionario de datos, contratos de eventos) se guarda como archivos versionados en el repo, no como mensajes de chat.** El chat es para razonar y decidir; el repo es la fuente de verdad permanente.

## Qué NO conviene resumir
Los ADRs de decisiones de arquitectura (como estos 8) no se resumen agresivamente — el "por qué" de cada decisión es lo que evita volver a discutir lo mismo dentro de 6 meses cuando alguien (vos, un socio, un futuro dev) pregunte "¿por qué no usamos schema-per-tenant?". El costo de tokens de guardar el razonamiento completo una vez es bajísimo comparado con el costo de tener esa discusión de nuevo.

## Qué sí conviene resumir agresivamente
Conversaciones de debugging, exploración de alternativas descartadas, y iteración de UI/UX de detalle — una vez resuelto, lo que queda registrado es la decisión final, no el camino que se recorrió para llegar ahí.
