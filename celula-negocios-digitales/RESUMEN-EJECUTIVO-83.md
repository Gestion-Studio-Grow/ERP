# Resumen Ejecutivo — Célula de Negocios Digitales
### 83 negocios evaluados · 12 rondas · 2026-07-06

> **Para el dueño.** La célula pasó de una consultora chica de 4 personas a un pipeline que ya evaluó
> **83 negocios digitales** para Argentina, cada uno con investigación real (fuentes, precios,
> competencia), costeo en pesos, y un veredicto honesto de si conviene construirlo. Esto es el estado
> de la cartera completa, con el panel interactivo en `panel/panel.html`.

---

## 1. El número que importa: 4 en desarrollo, con código ya funcionando

De los 83, solo **4 tienen manos encima construyendo código real** (no solo powerpoint):

| Negocio | Qué es | Estado técnico | Margen |
|---|---|---|---|
| **Kudos** | Reseñas en piloto automático | Motor de respuestas funcionando, demo verificada | 90-95% |
| **Testigo** | Parte de obra por foto+audio | Pipeline completo con ejemplo real | ~90% |
| **Fantasma** | Recepción de WhatsApp nocturna | `tsc` en verde + demo real | 80-85% |
| **Plantillería** | Plantillas fiscales para Argentina | Scaffold + 5 plantillas listas | 90-95% |

**Estos son la apuesta actual.** Todo lo demás (79 negocios) es research validado, esperando tu decisión.

## 2. Cómo se llegó a 83 (el motor que los generó)

```
🛰️ Inteligencia de Señales (noticias + boletines oficiales)
        ↓
🎨 Creativos (varios ángulos, sin sesgo de "otro chatbot más")
        ↓
📊 Analistas + Ingeniería de Datos (TAM/SAM/SOM con fuentes reales, costeo en pesos)
        ↓
📣 Marketing (¿el canal de venta cierra? ¿el paid paga?)
        ↓
⚔️ Red-team + Desafiador senior (operador real, mata lo que no sirve)
        ↓
📣 Reportero (actualiza el panel)
```

El patrón que se repite: **la mayoría de los 83 nacieron de leer una norma nueva** (ARCA, ANSES, BCRA,
SENASA, INV, ley laboral) el mismo día o semana que salió. Cuando el Estado crea una obligación nueva,
crea un mercado el mismo día — y ahí es donde entramos primero.

## 3. Clasificación por qué tan lejos estamos de cobrar

| Estado | Cantidad | Qué significa |
|---|---:|---|
| 🟢 **A producción** | 3 | Kudos, Testigo, Plantillería — validados por el red-team, sin peros grandes |
| 🟡 **En pista** | ~65 | Viables con una condición (canal, vertical, pricing) — la mayoría de la cartera |
| 🔴 **Descartados** | ~15 | Ya hay competidor local o la demanda no paga — **plata y tiempo que NO gastamos** |

**El valor real de esta cifra:** cada uno de los 15 descartados es una idea que en otra consultora
se hubiera construido a ciegas. Acá se mató antes de escribir una línea de código.

## 4. Clasificación por cuánto puede hacer la IA sola (el filtro que pediste)

| Ejecutable | Cantidad aprox. | Ejemplo |
|---|---:|---|
| 🤖 **100% IA** (el equipo de agentes lo construye y opera solo) | ~50 | Kudos, Testigo, Buzón ARCA, Arrepentimiento Blindado |
| ⚙️ **Parcial** (core IA + una pieza humana removible) | ~20 | Reconoce (deriva a estudio), Contra-Retención (rentas sin API) |
| 🧑 **Requiere humano fijo** (bloqueo legal de por vida) | ~10 | PrevenIA (matriculado H&S), Compliance UIF (oficial de cumplimiento), Etiqueta Verde (certificador) |

Esto importa para escalar: los **100% IA** son los que un mismo equipo chico puede operar en paralelo,
sin sumar gente por cada cliente nuevo.

## 5. Las 5 señales más fuertes que trajo el research (para tu radar)

1. **RG 5866/2026 (ARCA)** — reordena toda la factura electrónica, nuevos obligados (directores SA,
   socios SRL, profesionales) desde marzo 2027.
2. **Reforma laboral (Ley 27.802, feb-2026)** — tope del 2% a cuotas sindicales + 446 convenios en
   renegociación → ventana de 2 años para auditar diferencias pagadas de más.
3. **ReSEF reemplazó al Programa Hogar** (ene-2026) — solo el **6% de los hogares elegibles** se
   reinscribió a 3 días de esta ronda. Oportunidad urgente, con invierno encima.
4. **AI Overviews de Google** mataron el SEO informativo (CTR −34/−61%) — lo que sobrevive es
   transaccional, local y con datos propios, no contenido genérico.
5. **Cobrar en USD desde Argentina se liberó en 2025** — vender al exterior es hoy más fácil que antes.

## 6. Aprendizajes que ya nos ahorraron plata (quedan grabados en el ADR de la célula)

- **Validar competidor local antes de entusiasmarse.** Mató VetVoz, Recepcionista IA, GremioPro,
  Mercader — todos con un competidor argentino ya instalado que nadie había buscado.
- **Todo lo conversacional/voz se cobra por uso**, nunca plano — la voz cuesta 15-30× el texto.
- **El costo real no es construir (barato con IA), es vender.** El mercado casi nunca es el problema;
  la distribución sí.
- **La integración con un ente público es el mejor moat disponible** — cuando tu formato se vuelve
  "el que el inspector espera", el cliente no se va nunca.

## 7. La recomendación de PMO — qué hacer con esto

**No hace falta decidir sobre 83 negocios.** Hace falta decidir sobre 3-5. Mi sugerencia:

- **Seguir empujando los 4 en desarrollo** hasta el primer cliente pagando (son los que ya tienen
  código funcionando).
- **Mirar 2-3 "🟢 en pista" de alta señal y bajo costo** como próxima apuesta: candidatos fuertes por
  índice de factibilidad son **Buzón ARCA**, **Vigía de Marca** y **Frená a Tiempo** — todos realizables
  ya, costo de arranque bajo, 100% IA.
- **Ignorar el resto por ahora.** Queda documentado y buscable en el panel para cuando haga falta.

## 8. Dónde mirar todo esto

- **Panel interactivo:** `celula-negocios-digitales/panel/panel.html` — leaderboard, filtros, buscador,
  detalle completo de cada negocio con ejemplo de operación y retorno estimado.
- **Memoria de la célula:** `celula-negocios-digitales/adr/ADR-CELULA-001-metodologia-y-aprendizajes.md`
- **El ciclo automático está PAUSADO** por tu pedido — no genera negocios nuevos hasta que digas "seguí".

---

*Todo local. Nada publicado. Cero conexión a producción ni a Neon.*
