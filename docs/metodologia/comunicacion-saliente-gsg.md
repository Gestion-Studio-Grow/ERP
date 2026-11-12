# Comunicación saliente con marca GSG (mails, documentos y mensajes)

> Orden del dueño, 12/11/2026: salió un mail sin la marca GSG. Esto no se repite.
> Esta norma convierte esa orden en un control que se chequea antes de cada envío.
> Complementa `docs/metodologia/estandar-marca-gsg.md` (sello en producto) y la lección MP-16.

## Qué cubre
Todo lo que GSG le manda a alguien de afuera (cliente, prospecto, tester, proveedor):
mails (borradores de Gmail), Google Docs o PDF que se comparten, propuestas y manuales.
**No cubre** la superficie pública de un tenant (vidriera, mails transaccionales del negocio al
consumidor): ahí manda la marca del cliente y el sello GSG no va (principio de no-colisión).

## El kit mínimo (obligatorio en TODO saliente de GSG)

| Pieza | Cómo | Por qué así |
|---|---|---|
| **Cabecera** | Banda crema `#F4F2EC` con el wordmark «GESTIÓN STUDIO GROW™» en texto, color `#C8541F`. Si el canal admite imagen, el banner oficial encima (ver abajo). | El texto se ve siempre; una imagen bloqueada no deja el mail sin marca. |
| **Cuerpo** | Criollo claro, una idea por párrafo, títulos en `#C8541F`, tipografía sin serifa del sistema. | Tono GSG (ADR-044). |
| **Firma** | Nombre de quien firma + «Gestión Studio Grow» + canal de contacto oficial (dominio propio, nunca un `*.vercel.app`). | Error grave del 10/11: un link con dominio de prueba. |
| **Pie** | «— Elaborado por Gestión Studio Grow (GSG)». | Sello verificable de documentos (estándar de marca, capa 2). |

**Banner oficial:** se renderiza del SVG de la marca (`Factory-GSG/.claude/skills/marca-gsg/marca/gsg/`)
a PNG 600×120 @2x. El PNG vive en **Drive** (carpeta de marca GSG), **nunca en Git** (nada binario en el
repo). Para un mail se adjunta inline; si el canal no lo admite, queda la cabecera de texto.

## El control antes de enviar (checklist del borrador)
Quien arma el borrador lo pasa por esto y lo anota en el informe al dueño:
- [ ] Cabecera GSG presente (texto; banner si el canal lo admite).
- [ ] Firma con el canal oficial; ningún link a dominios de prueba (`vercel.app`, `localhost`, previews).
- [ ] Pie «Elaborado por Gestión Studio Grow (GSG)».
- [ ] Sin secretos, sin contraseñas provisorias (van por mail aparte al titular), sin datos de otros clientes.
- [ ] Destinatarios correctos y autorizados por el dueño (nada a Ale ni a Mariana sin su orden).
- [ ] Vista previa mirada en celular (captura a 390 px) antes de presentarlo al dueño.

**Ningún mail sale sin el «enviá» del dueño.** El agente deja borradores; el envío es del dueño.

## Quién lo sostiene
El rol **Guardián del Sello GSG** (`.claude/agents/sello-marca-gsg.md`) es el responsable: revisa todo
borrador saliente con este checklist antes de que se presente al dueño. La orquestadora no presenta un
borrador sin esa revisión anotada (una línea: «sello saliente: OK» o qué faltaba).

— Elaborado por **Gestión Studio Grow (GSG)**.
