# Los datos vienen en el cliente: qué resuelve el parsing y qué no

**La hipótesis que veníamos a verificar:** buena parte de los DATOS que necesita un servidor
(ítems con sus stats, skills, mapas, textos, portales) **no hay que descubrirlos mirando
tráfico de red: vienen adentro de los archivos de datos del cliente**, que Webzen distribuye
gratis. Si es así, el "contenido" de una season nueva es un problema de **parsing**, no de
ingeniería inversa de protocolo.

**Veredicto: la hipótesis es CORRECTA, y más fuerte de lo que suponíamos — pero cubre una
porción del trabajo menor de lo que el enunciado sugiere.** El cliente te entrega la **tabla
maestra de ítems y de skills con sus stats numéricos**, el **terreno y la caminabilidad de
todos los mapas**, los **portales**, los **textos**, y hasta las **fórmulas de display en
texto plano**. No te entrega **monstruos (stats, spawns, drops, exp)**, ni el **protocolo de
red**, ni **una sola línea de lógica de servidor**. Y ya existen **parsers open source vivos
que leen datos de Season 20** — el hallazgo más valioso de este informe.

Todo lo **[VERIFICADO]** se comprobó leyendo el código fuente de los proyectos citados,
clonados el 31/08/2026. Lo **[INFERIDO]** está marcado. Lo que **[NO PUDE VERIFICAR]** está
listado al final, sin disfrazarlo de dato.

---

## 0. Alcance — el límite que este informe no cruza

Lo que se investiga acá es **leer archivos de DATOS del cliente que el usuario baja legal y
gratuitamente del sitio de Webzen**. Taxativamente fuera de alcance, y **no se usó ninguna
fuente de este tipo** para este informe:

- **Files de servidor comerciales o filtrados.** Durante la búsqueda aparecieron decenas de
  repos con código de servidor filtrado (`Lgd-Server`, `Mu_Legend_S17`, `mu-server-ex` y
  similares). **No los usé y no los recomiendo.** Los cito una sola vez, más abajo, para
  señalar un problema de procedencia en una herramienta.
- **Cracks o bypass de protecciones.**
- **Decompilar el EJECUTABLE del cliente.** Parsear archivos de datos sí; decompilar código no.

**Una salvedad honesta de procedencia:** algunas de las constantes que usan las herramientas
open source (la clave LEA-256, la contraseña del ZIP `Lang.mpr`) **originalmente salieron de
reversear el ejecutable** — MuClientTools16 lo dice explícitamente, y hasta publica el offset
en el binario donde encontró la password. Vos **no** tenés que hacer eso: la constante ya está
publicada en código abierto y la usás como cualquier otra constante. Pero conviene saber de
dónde vino, y que ese origen no es replicable dentro de nuestro alcance. **[VERIFICADO]** —
[README de MuClientTools16](https://github.com/VDraven/MuClientTools16).

---

## 1. Qué archivos trae el cliente y qué guarda cada uno

### 1.1 El inventario

Fuente primaria del inventario clásico (S6-era):
[MuOnline Client Files Description](https://gist.github.com/rafaelvieiras/5cf243ec9247cb86f01ee2963f1a5d7c)
(copia de `site.pentiumtools.com` vía Web Archive — comunitaria, no oficial). Cruzado contra
la cobertura real de tres herramientas que sí lo leen. **[VERIFICADO en ese carácter]**

| Archivo | Qué guarda | ¿Sirve al servidor? |
|---|---|---|
| **`Item.bmd`** | **La tabla maestra de ítems**: nombre, modelo, tipo, slot, daño min/max, defensa, defense rate, resistencia mágica, velocidad de ataque, durabilidad, requisitos (str/dex/ene/vit/cmd/nivel), drop level, precio NPC, flags por clase, resistencias elementales, y flags de comerciable / almacén / reparable / apilable | **Sí, muchísimo** |
| **`Skill.bmd`** / `Skill(kor).txt` | **La tabla maestra de skills**: nombre, nivel requerido, daño base, costo de maná, costo de AG, distancia, delay (cooldown en ms), requisitos de stats, clases habilitadas, tipo de efecto | **Sí, muchísimo** |
| **`*.att`** (`Terrain1.att`…) | **Atributos de terreno por casilla** de cada mapa: caminable, safe zone, no-move, no-ground, agua, altura, zona sin ataque. Grilla de 256×256 | **Sí — es el mapa jugable** |
| **`*.map`** | Texturas/mapping del terreno (cómo se ve el suelo) | Poco (presentación) |
| **`*.obj`** | Posición y rotación de los objetos estáticos del mapa (escenografía) | Poco (presentación) |
| **`*.ozb`** | Heightmap / lightmap del terreno (es un BMP con header propio) | Poco (presentación) |
| **`*.ozj` `.ozt` `.ozp` `.ozd` `.ozg`** | Texturas y UI: JPG, TGA, PNG, DDS y GFX/SWF con header propio | No (presentación) |
| **`*.bmd`** (modelos) | Modelos 3D con esqueleto y animaciones | No (presentación) |
| **`Gate.bmd`** / `Gate.txt` | **Portales**: mapa origen, rectángulo (x1,y1,x2,y2), destino, dirección, **nivel requerido** | **Sí** |
| **`Text.bmd`** / `Text(kor).txt` | Textos generales del juego | Sí (nombres/UI) |
| **`MonsterSkill.bmd`** | **Qué skills tiene cada monstruo** (ID de monstruo → hasta 10 IDs de skill) | **Sí, parcial** |
| **`MapCharacters.bmd`** | **Qué monstruos aparecen en qué mapa** (mapa → lista de IDs) | **Sí, parcial** |
| **`Mix.bmd`** / `ElementalMixList.txt` | Recetas de mezcla del Chaos Machine (qué entra) | Sí, parcial — **sin las tasas** |
| **`FormulaData.bmd`** | **Fórmulas en texto plano** con placeholders `%d`/`%f` | **Sí, parcial — ver §5.3** |
| **`Quest.bmd` `QuestProgress.bmd` `QuestWords.bmd` `NPCDialogue.bmd`** | Quests y diálogos de NPC | Sí, parcial |
| **`ItemToolTip.bmd` `ItemAddOption.bmd` `ItemSetOption.bmd` `ItemSetType.bmd` `SocketItem.bmd` `ExcellentCommonOption.bmd` `JewelOfHarmonyOption.bmd` `StatOption.bmd`** | Opciones de ítem: excellent, ancient (sets), sockets, +380, Jewel of Harmony | **Sí** |
| **`MasterSkillTreeData.bmd`** | Árbol de master skills | **Sí** |
| **`Pet.bmd` `PetData.bmd` `Muun*.bmd` `PentagramMixNeedSource.bmd` `RuudShopViewInfo.bmd`** | Pets, Muun, Pentagrama, tienda Ruud (sistemas de seasons altas) | **Sí, parcial** |
| **`ServerList.bmd`** | Lista de servidores | Sí (operación) |
| **`Lang.mpr`** | **Archivo ZIP con password** que en seasons nuevas contiene ~35 archivos `.txt` en TEXTO PLANO tabulado (ver §4.2) | **Sí, muchísimo** |
| **`message.wtf`** | Textos y direcciones del launcher | No |

### 1.2 El detalle que decide el asunto: qué hay dentro de `Item.bmd`

Esto no es una lista de nombres. Es la definición completa que un servidor necesita para
resolver equipamiento. La estructura, tal como está publicada en código abierto para
**Season 20 (cliente 1.20.61)** — [`Client.Data/BMD/ItemBMD.cs`](https://github.com/bernatvadell/muonline/blob/main/Client.Data/BMD/ItemBMD.cs)
— **[VERIFICADO leyendo el archivo]**:

```
ItemIndex, ItemSubGroup, ItemSubIndex, szModelFolder[260], szModelName[260], szItemName[64],
KindA, KindB, Type, TwoHands, DropLevel, Slot, SkillIndex, Width, Height,
DamageMin, DamageMax, DefenseRate, Defense, MagicResistance, AttackSpeed, WalkSpeed,
Durability, MagicDur, MagicPower, CombatPower,
ReqStr, ReqDex, ReqEne, ReqVit, ReqCmd, ReqLvl, ItemValue, Money,
SetAttr, DW, DK, FE, MG, DL, SU, RF, GL, RW, SL, GC, KM, LM, IK, AL,
Resist_0..Resist_6, Dump, Transaction, PersonalStore, Warehouse, SellNpc, Expensive,
Repair, Overlap, PcFlag, MuunFlag
```

Los flags `DW`/`DK`/`FE`/`MG`/`DL`/`SU`/`RF`/`GL`/`RW`/`SL`/`GC`/`KM`/`LM`/`IK`/`AL` son las
**15 clases** de S20 (la última, `AL`, comentada como *alchemist*). En la versión S16 del mismo
struct hay 11 clases. Es decir: **el archivo te dice, ítem por ítem, qué clase lo puede usar,
en la season que sea.** **[VERIFICADO]** — comparación entre
[`ClientStructures.h` de MuClientTools16 (S16)](https://github.com/VDraven/MuClientTools16/blob/main/_src_/Core/ClientStructures.h)
y `ItemBMD.cs` (S20).

### 1.3 Y dentro de `Skill`

En S20 la tabla de skills viaja como **TXT tabulado** dentro de `Lang.mpr`, con **~59 columnas**.
Las primeras 13 están identificadas: `Id, Name, Level, Damage, ManaCost, AGCost, Distance,
Delay, ReqEne, ReqStr, ReqDex, ReqVit, ReqCmd`. Después vienen `ElementalType, UseType,
BaseSkill, ReqKillCount, Status1..3`, los 15 flags de clase, `BuffIcon, Animation`,
`ScalingStat/ScalingStatValue` ×2, `ImprintDMG` — y **una veintena de columnas cuyo
significado nadie identificó todavía** (el parser las llama `Value39`…`Value58`, y el propio
autor dejó escrito `//TODO: needs work`). **[VERIFICADO]** —
[`Client.Data/LANG/LangSkillReader.cs`](https://github.com/bernatvadell/muonline/blob/main/Client.Data/LANG/LangSkillReader.cs).

Ese `TODO` es la foto exacta del estado del arte: **el layout está resuelto, la semántica está
resuelta a medias.**

### 1.4 `.att`: el mapa jugable, verificado en el propio OpenMU

El formato `.att` es: **header de 4 bytes** (`version=0`, `index`, `width=255`, `height=255`) +
**256×256 bytes** de flags por casilla, todo XOR-eado. Los flags:

```
0x0001 SafeZone · 0x0002 Character · 0x0004 NoMove · 0x0008 NoGround · 0x0010 Water
0x0020 Action · 0x0040 Height · 0x0080 CameraUp · 0x0100 NoAttackZone · 0x0200+ Att1..Att7
```

**[VERIFICADO]** — [`Client.Data/ATT/TWFlags.cs`](https://github.com/bernatvadell/muonline/blob/main/Client.Data/ATT/TWFlags.cs).

Y acá está la evidencia más directa de toda la hipótesis, adentro del stack que ya tenemos
corriendo: **OpenMU ya usa archivos `.att` del cliente**. En el repo hay **76 archivos `.att`**
embebidos como recursos en `src/Persistence/Initialization/Resources/` (`Terrain1.att`,
`Terrain35_WAR.att`, `075_Terrain1.att`, etc.), `Terrain1.att` pesa exactamente **65.539 bytes**
(= 3 + 256×256, con el primer byte de header ya consumido), y el parser los lee así:

```csharp
public GameMapTerrain(byte[]? terrainData) { this.ReadTerrainData(terrainData.AsSpan(3)); }
```

**[VERIFICADO]** — clone de [OpenMU](https://github.com/MUnique/OpenMU) en el commit `c7ad7ba4`
(30/08/2026): `src/GameLogic/GameMapTerrain.cs`, `src/Persistence/Initialization/TerrainUpdateHelper.cs`
y los 76 recursos contados.

**Traducción:** el emulador open source de referencia **ya resolvió el problema de "de dónde
saco los mapas" copiando los archivos del cliente**. Lo hace de forma manual (archivos
pre-desencriptados, commiteados a mano) y **no tiene importador** — busqué issues de import de
datos del cliente en OpenMU y no hay ninguno **[VERIFICADO — 0 resultados]**. Pero el precedente
está sentado y el patrón es exactamente el que propone la hipótesis.

---

## 2. El cifrado: sí, es simple, está documentado y hay implementaciones abiertas

Verificado **leyendo el código de dos proyectos independientes, en dos lenguajes distintos, que
coinciden byte por byte.** Eso es lo más cerca de una confirmación cruzada que se puede pedir.

### 2.1 XOR de 3 bytes ("bux code") — el de los `.bmd` de datos

```c
#define _MU_XOR3_KEY_  0xFC, 0xCF, 0xAB
for (i = 0; i < len; ++i) buf[i] ^= _xor3key[i % 3];
```

Sí: es literalmente **XOR con una clave fija de 3 bytes**, tal como decía la hipótesis.
Aparece idéntico en:
- C++ — [`_src_/Core/MuCrypto.cpp`](https://github.com/VDraven/MuClientTools16/blob/main/_src_/Core/MuCrypto.cpp) (MuClientTools16, MIT)
- C# — [`Client.Data/BuxCryptor.cs`](https://github.com/bernatvadell/muonline/blob/main/Client.Data/BuxCryptor.cs)
- TypeScript — [`src/crypto/file-cryptor.ts`](https://github.com/xulek/muonline-bmd-viewer/blob/main/src/crypto/file-cryptor.ts) (`BUX_MASK`)

**[VERIFICADO en las tres implementaciones.]**

Hay una variante `Xor3Byte2` que además XOR-ea con el byte bajo de una `wkey` por archivo, y
en `Lang.mpr` se usa XOR3 + `0xDC` fijo. **[VERIFICADO]**

### 2.2 CRC de archivo (los 4 bytes finales)

```c
DWORD CRC = wkey << 9;
for (i = 0; i <= len-4; i += 4) {
    DWORD temp = *(DWORD*)&buf[i];
    if ((wkey + (i>>2)) % 2 == 1) CRC += temp; else CRC ^= temp;
    if (i % 16 == 0) CRC ^= (CRC + wkey) >> ((i>>2) % 8 + 1);
}
```
No es un CRC estándar, es un invento de Webzen. Cada archivo tiene su `wkey` (para `Lang.mpr`
es `0x12dc`). **[VERIFICADO]** — misma función en `MuCrypto.cpp` (C++) y en `LangMPRReader.cs` (C#).

### 2.3 Cifrado de `.map` / `.att` / `.obj` — XOR encadenado con clave de 16 bytes

```c
key[16] = { 0xD1,0x73,0x52,0xF6,0xD2,0x9A,0xCB,0x27,0x3E,0xAF,0x59,0x31,0x37,0xB3,0xE7,0xA2 };
seed = 0x5E;
// decrypt:
temp = buf[i]; buf[i] ^= key[i%16]; buf[i] -= seed; seed = temp + 0x3D;
```
Encadenado (cada byte depende del anterior) pero trivial de invertir. **[VERIFICADO]** — idéntico
en `MuCrypto.cpp` y en `file-cryptor.ts`.

### 2.4 "ModulusCryptor" — el de los `.ozd`/`.ozp` y los `.att`/`.map` nuevos

Acá se pone más entretenido, pero sigue siendo determinístico y ya está implementado. El
esquema: **8 block ciphers clásicos** (TEA, ThreeWay, CAST-128, RC5, RC6, MARS, IDEA, GOST),
**el algoritmo se elige con los 2 primeros bytes del archivo** (`algoritmo & 7`), y la clave
maestra es un string en claro:

```c
#define _MU_MODULUS_KEY_ "webzen#@!01webzen#@!01webzen#@!0"
```

Los primeros 34 bytes del archivo son `[alg2][alg1][key2 (32 bytes)]`; con `key1` (la constante
de arriba) se descifran bloques de 1024 bytes al principio, al final y al medio; con `key2` (que
sale del propio archivo) se descifra el resto. **[VERIFICADO]** — `MuCrypto::ModulusDecrypt` en
[`MuCrypto.cpp`](https://github.com/VDraven/MuClientTools16/blob/main/_src_/Core/MuCrypto.cpp),
reimplementado en C# en [`Client.Data/ModulusCryptor/`](https://github.com/bernatvadell/muonline/tree/main/Client.Data/ModulusCryptor)
y en TypeScript en [`src/crypto/modulus-cryptor.ts`](https://github.com/xulek/muonline-bmd-viewer/blob/main/src/crypto).

### 2.5 LEA-256 y el ZIP con password — lo nuevo de las seasons altas

En S16+ el `Lang.mpr` es un **ZIP con contraseña**, y en S20 además va cifrado con **LEA-256**
(cifrador de bloque coreano, estándar KS X 3246) con clave fija de 32 bytes. Ambas constantes
están publicadas en `LEACrypto.cs` y `LangMPRReader.cs`. **[VERIFICADO]** —
[`Client.Data/LEACrypto.cs`](https://github.com/bernatvadell/muonline/blob/main/Client.Data/LEACrypto.cs).

**Conclusión de §2:** nada de esto es criptografía seria. Es ofuscación. **Está 100% resuelto y
publicado, en tres lenguajes, con licencias permisivas.** Cero trabajo de investigación pendiente.

---

## 3. Herramientas open source que ya leen estos archivos

**Esto es lo más valioso del informe.** Todo lo de la tabla fue clonado o inspeccionado el
31/08/2026.

| Proyecto | Lenguaje | Licencia | Cubre | Season objetivo | Actividad | Veredicto |
|---|---|---|---|---|---|---|
| **[bernatvadell/muonline](https://github.com/bernatvadell/muonline)** → `Client.Data/` | C# (.NET 10) | **"Educational"** ⚠️ no OSI | BMD (modelos + **Item + Skill**), **ATT**, MAP, OBJ, OZB, OZJ/OZT/OZP/OZD, OZG, CAP, CWS, **Lang.mpr (skills, gates)**, ModulusCryptor completo, LEA-256 | **Season 20 (1.20.61)** | Último commit en `main` **10/02/2026** | **La joya.** Librería de datos separada y reutilizable, S20, la más completa que encontré |
| **[xulek/muonline](https://github.com/xulek/muonline)** | C# | igual (fork) | igual | S20 | **731 commits**, 49 ★, más movido que el upstream | El fork activo del anterior |
| **[xulek/muonline-bmd-viewer](https://github.com/xulek/muonline-bmd-viewer)** | TypeScript | **ISC** ✅ | BMD, **ATT** (+inspector visual), MAP, OBJ, OZB, OZJ/OZT/OZD/OZG, **items.bmd**, **skill.bmd**, cripto completa (CAST5/IDEA/GOST/**LEA256**/MARS/RC5/RC6/TEA/ThreeWay/modulus) | No lo declara; lee formatos nuevos | **91 commits, último 24/07/2026**, 57 ★ / 38 forks — **el más vivo** | **El mejor punto de partida** si vas por JS/TS. Licencia limpia |
| **[VDraven/MuClientTools16](https://github.com/VDraven/MuClientTools16)** | C++17 | **MIT** ✅ | **45/45 archivos de datos** (Item, ItemToolTip, Quest, Mix, Pentagram, Muun, MonsterSkill, MapCharacters, FormulaData, Lang.mpr…) + OZJ/OZT/OZB/OZP/OZD/OZG + BMD→SMD/FBX + **MAP/ATT/OBJ** | **Season 16 pt.1.1** (cliente 1.19.46) | 57 commits, **último 16/10/2022** — congelado | **La referencia de formatos.** Los structs C++ documentan campo por campo. No está vivo, pero no lo necesita |
| **[samik3k/MuClientTools](https://github.com/samik3k/MuClientTools)** | C++ | **MIT** ✅ | 34/44 archivos de datos + gráficos | **Season 13 ep.1** | Último 31/03/2021 — muerto | Útil solo para comparar el drift entre S13 y S16 |
| **[VD1988/MuOnline-WorldEditor](https://github.com/VD1988/MuOnline-WorldEditor)** | C++ | **MIT** ✅ | Editor visual de **map / att / obj** | S16e1 | Septiembre 2021, "completed", 57 ★ | Para tocar mapas a mano |
| **[beater-studios/mu-file-viewer](https://github.com/beater-studios/mu-file-viewer)** | PHP + JS | **MIT** ✅ | BMD, OZJ/OZB/OZT/OZD/OZP/MMK, texturas, audio | No declara | 12 commits, 2026 | Menor. Su ModulusDecrypt está **portado de MuClientTools16** (lo dice el README) |
| **[baranovskis/bmd-converter](https://github.com/baranovskis/bmd-converter)** | Go | **MIT** ✅ | BMD de datos → CSV → BMD | **S1 y S9** | 3 commits | Testimonial. Sirve el patrón, no el código |
| **[MUnique/OpenMU](https://github.com/MUnique/OpenMU)** | C# | **MIT** ✅ | **Consume 76 `.att` del cliente**, ya desencriptados y commiteados | S6 + 0.75/0.95d/0.97d | Commit hoy | **No tiene importador.** Copia manual. Hueco evidente |

### 3.1 El hallazgo que cambia el tablero

`bernatvadell/muonline` (y su fork `xulek/muonline`) es un **cliente** de MU escrito de cero en
.NET 10 + MonoGame que hace exactamente esto:

> *"Uses Season 6 protocol; consumes **Season 20 (1.20.61) client data** for assets. Intended to
> connect to **OpenMU** (or any Season 6 compatible server)."*
> — [`CLAUDE.md` del repo](https://github.com/bernatvadell/muonline), **[VERIFICADO leyendo el archivo]**

Y su README indica el link de descarga: `https://full-wkr.mu.webzen.co.kr/muweb/full/MU_Red_1_20_61_Full.zip`
— el cliente completo de **MU Red 1.20.61**, del servidor oficial de Webzen. **[VERIFICADO que
el README lo publica; NO PUDE VERIFICAR que el link responda: `webzen.co.kr` y
`muonline.webzen.com` están bloqueados por el proxy de egress de esta red.]**

**Lo que esto demuestra, y es enorme:** los **datos del cliente y el protocolo de red son dos
ejes independientes**. Alguien ya tiene corriendo **contenido visual y tablas de Season 20 contra
un servidor Season 6**. La hipótesis no solo es cierta: **ya está explotada en producción por un
proyecto público.**

⚠️ **Ojo con la licencia:** `bernatvadell/muonline` **no tiene licencia OSI** — declara
"Educational purposes only, non-commercial". Eso significa: **mirala, aprendé de ella, no copies
su código a algo que vayas a distribuir o cobrar.** Para reusar código de verdad, las opciones
limpias son **MuClientTools16 (MIT)** y **muonline-bmd-viewer (ISC)**.

---

## 4. Cobertura por season: ¿un parser de S6 sirve para S20?

**Respuesta corta: la envoltura sí, el contenido de los registros no. Pero el drift es
incremental y auto-detectable, no un rediseño.**

### 4.1 Los tres tipos de cambio, verificados

**(a) El cifrado: cambió por acumulación, no por reemplazo.** El XOR3 `FC CF AB` sigue siendo
el mismo desde las seasons viejas hasta S20 — está idéntico en las tres implementaciones que
revisé. Lo que se agregó arriba fue el ModulusCryptor (para `.ozd`/`.ozp`, y después para
`.att`/`.map`) y LEA-256 + ZIP con password (`Lang.mpr`). Los archivos nuevos **se
autoidentifican con un magic header**, así que el parser puede soportar las dos variantes a la
vez. Ejemplo textual del `ATTReader` de S20:

```csharp
if (buffer[0]=='A' && buffer[1]=='T' && buffer[2]=='T' && buffer[3]==1)
     buffer = ModulusCryptor.Decrypt(enc);   // formato nuevo
else buffer = FileCryptor.Decrypt(buffer);   // formato viejo
```
Y lo mismo para `MAP\x01`. **[VERIFICADO]** — `Client.Data/ATT/ATTReader.cs` y `MAP/MAPReader.cs`.
El mismo `.att` además admite dos variantes de tamaño: **1 byte por casilla (legacy)** o
**2 bytes por casilla (extended)**, y el reader lo deduce del tamaño total. **[VERIFICADO]**

**(b) Los registros: Webzen agrega campos, casi nunca reordena.** Comparando el struct de
`Item.bmd` entre S16 y S20 **[VERIFICADO]**:

| S16 (MuClientTools16) | S20 (Client.Data) |
|---|---|
| 11 flags de clase (DW…GC) | **15** (+KM, LM, IK, AL) |
| `ItemValue` BYTE | `ItemValue` INT |
| `MagicPower` DWORD | + **`CombatPower` INT** (campo nuevo) |
| `Slot` BYTE + gap | `Slot` USHORT |
| `WORD Unk_End[3]` de cola | `byte[19] leftover` de cola |

Es exactamente lo que advierte el autor de MuClientTools16 en su README:
> *"It might (or might not) work for files from older/newer versions… **Client Data Struct:
> Sometime, WZ might add a few bytes to the existing.**"* **[VERIFICADO]**

**Y hay un truco que hace esto mucho menos doloroso de lo que parece:** los `.bmd` de datos son
**arrays de registros de tamaño fijo, con el conteo al principio y el CRC al final**. Entonces
el tamaño de registro **se deduce del propio archivo**, sin saber nada de la season:

```csharp
var itemCount   = br.ReadInt32();
var BytesPerItem = (len - 8) / itemCount;   // -4 del count, -4 del CRC
```
**[VERIFICADO]** — mismo cálculo en `ItemBMDReader.cs` (C#) y en `item-bmd.ts` (TypeScript),
escritos por gente distinta. **Traducción práctica: los primeros ~600 bytes de cada registro
(nombre, modelo, daño, defensa, requisitos) están en el mismo offset en S16 y en S20. Lo que
cambia es la cola.** Un parser tolerante lee lo conocido, ignora la cola, y sigue funcionando
entre seasons. Eso ya lo hacen los dos parsers citados.

**(c) Migración de binario a texto plano — el regalo.** Este es el cambio más favorable, y no
lo esperaba. En seasons altas Webzen movió **~35 archivos de datos de `.bmd` binario a `.txt`
tabulado dentro de `Lang.mpr`**. La lista, textual del README de MuClientTools16 **[VERIFICADO]**:

```
4ThTreeData.txt  4ThTreeSideOption.txt  4ThTreeSkillTooltip.txt  ArcaBattleBootyMix.txt
ArcaBattleScript.txt  AttributeVariation.txt  BonusExp.txt  BuffEffect.txt
CharacterInfoSetup.txt  ElementalMixList.txt  Gate.txt  GradedOption.txt  GuideQuest.txt
HuntingRecord.txt  ItemLevelTooltip.txt  ItemTRSData.txt  LabyrinthOfDimensionInfo.txt
MasteryItemBonusOption.txt  MuunEffectInfo.txt  npcName(kor).txt
PentagramJewelOptionValue.txt  PentagramOption.txt  SeedsphereUpgrade.txt  Skill(kor).txt
SkillRequire.txt  SocketitemUpgrade.txt  SpellStone.txt  Text(kor).txt  WingAttribute.txt  …
```

**Eso es TSV.** Se abre con `split('\t')`. Ahí adentro están **las skills con sus stats, los
gates, las opciones de pentagrama, el upgrade de seed spheres, los bonus de EXP, los atributos
de alas, las mezclas elementales y los nombres de NPC** — de las seasons nuevas, en texto plano.
Encoding EUC-KR (codepage 51949) **[VERIFICADO]** — `BaseLangReader`/`LangSkillReader`.

**El chiste: cuanto más nueva la season, MÁS fácil es el parsing, no menos.**

### 4.2 Lo que no está cubierto

- **No encontré ninguna herramienta que declare cobertura de S17–S21.** La más nueva por
  cobertura declarada es MuClientTools16 (**S16**, 2022); la más nueva por datos consumidos es
  `Client.Data` (**S20 / 1.20.61**), que **no publica un tracker de cobertura por archivo**: lee
  lo que ese cliente necesita, no las 45 tablas. **[VERIFICADO — busqué y no hay]**
- **De Season 21 no encontré absolutamente nada.** **[NO VERIFICADO — puede existir en foros
  cerrados tipo RaGEZONE, que no consulté]**

---

## 5. Qué NO está en el cliente — la delimitación precisa

El cliente es una **cáscara de presentación con las tablas maestras adentro**. La lógica
autoritativa vive en el servidor y **no viaja en el cliente**. El corte exacto:

### 5.1 Monstruos: el agujero grande

**El cliente NO trae stats de monstruos.** Revisé el listado completo de tablas de datos de
S13 (44 archivos) y S16 (45 archivos), y **no existe un `Monster.bmd`**. Lo que sí hay es:

| Del monstruo, en el cliente | Del monstruo, NO en el cliente |
|---|---|
| Modelo 3D + animaciones (`.bmd`) | **Nivel, HP, daño min/max, defensa, attack rate, defense rate** |
| Nombre (`npcName.txt` / `Text.bmd`) | **EXP que otorga** |
| **Qué skills tiene** (`MonsterSkill.bmd`) | **Tabla de drops** |
| **En qué mapas aparece** (`MapCharacters.bmd`) | **Coordenadas y cantidad de spawn, respawn delay** |
| | **Rangos de movimiento/ataque/visión, delays, IA** |

Todo eso vive del lado servidor, en archivos que **no** vienen con el cliente: `Monster.txt`
(stats) y **`MonsterSetBase.txt` (posiciones y cantidad de spawn)**. **[VERIFICADO]** — el
formato `MonsterSetBase.txt` como archivo **de servidor** está confirmado por resultados de
búsqueda y por repos de files (que no usé); y **está confirmado por omisión** en los tres
inventarios de datos del cliente que revisé.

Y se confirma por dónde OpenMU los tiene: **a mano, en C#**. Textual de
`src/Persistence/Initialization/Version075/Maps/Lorencia.cs` **[VERIFICADO]**:

```csharp
bullFighter.Designation = "Bull Fighter";
bullFighter.MoveRange = 3; bullFighter.AttackRange = 1; bullFighter.ViewRange = 5;
bullFighter.MoveDelay = new TimeSpan(400 * TimeSpan.TicksPerMillisecond);
bullFighter.AttackDelay = new TimeSpan(1600 * TimeSpan.TicksPerMillisecond);
bullFighter.RespawnDelay = new TimeSpan(3 * TimeSpan.TicksPerSecond);
{ Stats.Level, 6 }, { Stats.MaximumHealth, 100 },
{ Stats.MinimumPhysBaseDmg, 16 }, { Stats.MaximumPhysBaseDmg, 20 },
{ Stats.DefenseBase, 6 }, { Stats.AttackRatePvm, 28 }, { Stats.DefenseRatePvm, 6 },
```

Diez años de proyecto y esos números están tipeados a mano, uno por uno, sacados de conocimiento
comunitario. **El cliente no ayuda con esto.**

### 5.2 Lógica de servidor: no está, punto

Nada de esto viene en el cliente, y no hay atajo:

- **Resolución de combate:** cómo se calcula el daño real, cómo se tira el acierto/fallo, cómo
  entra la defensa, cómo cambia en PvP vs PvM, críticos, excellent, reflect, absorb.
- **Tasas de éxito de las mezclas.** El cliente te dice **qué** entra al Chaos Machine
  (`Mix.bmd`, `ElementalMixList.txt`); **jamás** te dice el % de éxito. Eso es servidor puro.
- **IA de monstruos:** agro, pathing, uso de skills, huida, llamada de ayuda.
- **Condiciones y máquina de estados de eventos:** cuándo abre Blood Castle, qué dispara cada
  fase, quién gana Castle Siege. (Recordá: OpenMU tardó **10 años** en cerrar Castle Siege.)
- **Progresión:** curva de EXP, resets, distribución de puntos, master tree.
- **Economía:** balance de drops, tasas de jewels, precios reales de vendedores.
- **Anti-cheat, validación de movimiento, autoridad de estado.**
- **El protocolo de red entero.**

### 5.3 La zona gris que vale la pena mirar: `FormulaData.bmd`

Y acá hay algo que **no esperaba y que matiza el punto 5 del enunciado**. `FormulaData.bmd`
contiene **fórmulas escritas como texto**, con placeholders `printf`. Extracto textual del
archivo de ejemplo que viene en el propio repo de MuClientTools16
(`_bin_/Data/Misc_bmd/formuladata.txt`) **[VERIFICADO leyendo el archivo]**:

```
//Group  //ID  Text
0   0   (%d*15)+((((%d*15)*0.2)/500)*(%d-%d))
1   0   (%d/100)*(%d/20)
1   1   (%d/3.5)
2   0   %d/10
3   1   1+((((((%d)-30)^3)+25000)/499)/6)
3   6   52/(1+(((((((%d-30)^3)+25000)/499)/6))))
3   9   (1+(((((((%d-30)^3)+25000)/499)/50)*100)/12))*85
```

Esas son curvas de progresión y de conversión de stats, en claro, dentro del cliente.

**Lo que esto es:** las fórmulas que **el cliente usa para MOSTRAR** valores derivados (tu daño
en la ventana de personaje, el efecto de un punto de stat, un tooltip). En MU esas fórmulas
tienen que coincidir con las del servidor o el jugador ve números que no le cierran — así que
**son un espejo muy fuerte de la matemática real**.

**Lo que esto NO es:** la resolución de combate del servidor. Ninguna de estas expresiones te
dice cómo se tira el acierto, cómo se aplica la reducción en PvP, ni cómo se rollea un drop.
Y hay un problema práctico serio: **el `%d` no te dice qué variable es.** Sabés la FORMA de la
fórmula pero no el binding de los parámetros; eso hay que deducirlo probando contra el cliente.

**Veredicto de §5.3:** el cliente te da **la forma de las curvas** — que es la parte que más
tiempo lleva adivinar por prueba y error — pero no te da la lógica. Es un acelerador fuerte,
no una respuesta.

---

## 6. Fuentes de mecánica para lo que no está en el cliente

Acá tengo que ser honesto sobre una limitación del entorno: **`muonline.webzen.com`,
`webzen.co.kr`, `muonlinefanz.com` y `muonline.fandom.com` están todos bloqueados por el proxy
de egress de esta red.** No pude abrir ninguno. Lo que sigue es lo que pude establecer por
resultados de búsqueda y por citas de terceros, y está marcado como tal.

### 6.1 Webzen oficial — es la única fuente autoritativa, y es de baja resolución

- **Patch notes oficiales:** `muonline.webzen.com/en/news/notices/patch-note`.
  **[NO VERIFICADO directamente — dominio bloqueado.]** Por los resúmenes de búsqueda, el nivel
  de detalle es de **anuncio comercial**: "nueva clase Crusader", "Sanctuary of Aquilas para
  nivel 1.600+", "Speed Server sube de 800 a 900", "se corrigió el cálculo de Extra Damage".
  **Te dicen QUÉ cambió, casi nunca CON QUÉ NÚMEROS.**
- **Notas de prensa corporativas:** `company.webzen.com/en/pr` — mismo nivel, o menos.
- **Guías oficiales de juego / wiki oficial:** **[NO VERIFICADO — no pude confirmar que exista
  una wiki oficial mantenida por Webzen con datos de mecánica.]**

**Conclusión [INFERIDA, con base en lo anterior]:** Webzen **no publica** fórmulas de daño,
tasas de éxito de mezclas, tablas de drop ni stats de monstruos. Nunca lo hizo. Como fuente de
mecánica sirve para **saber qué sistemas existen y en qué orden salieron** — que no es poco
para armar un roadmap — y para nada más.

### 6.2 Fuentes comunitarias — con su nivel de confianza

| Fuente | Qué tiene | Confiabilidad |
|---|---|---|
| **[muonlinefanz.com](https://www.muonlinefanz.com/tools/items/)** (item + mob database) | Base de ítems y de monstruos con stats y ubicaciones de drop | **La referencia histórica de la comunidad.** **[NO VERIFICADO — bloqueada desde acá]**. Su cobertura de seasons nuevas es dudosa **[INFERIDO]** |
| **[muonline.fandom.com](https://muonline.fandom.com/)** | Wiki comunitaria. Declara "Latest Version: Season 20" pero con **70 artículos y 5.171 ediciones** | **Baja para mecánica.** 70 artículos no cubren 15 seasons. Sirve de índice conceptual **[NO VERIFICADO directamente]** |
| **muonline.us / muonline.ai** | Bases de datos de ítems ("4.834 ítems") y guías por season | **Sin verificar.** Sitios de terceros orientados a SEO / servers privados **[NO VERIFICADO]** |
| **[AlighieriDemiurgs/MuHistory](https://github.com/AlighieriDemiurgs/MuHistory)** | Historial S0–S21 | Ya citada en el doc 06. Comunitaria, útil para el roadmap, no para números |
| **Foro RaGEZONE** | Donde vive de verdad el conocimiento técnico de MU | **Alta señal, mezclada con material fuera de nuestro alcance** (files filtrados). No lo consulté para este informe |
| **El código de OpenMU** | 10 años de números destilados por 82 personas, en C# legible, MIT | **La mejor fuente práctica de mecánica de S6 que existe.** Es documentación ejecutable |

**El punto incómodo, dicho sin vueltas:** para la mecánica de seasons nuevas **no hay ninguna
fuente autoritativa pública**. Ni oficial ni comunitaria seria. Lo que existe está en files
comerciales y filtrados, que es justamente lo que está fuera de alcance. **Esa es la parte que
sigue siendo cara, y el cliente no la abarata ni un poco.**

---

## 7. La revisión de la estimación del doc 06

### 7.1 Cómo descompongo el trabajo

El doc 06 estimó **10–20 persona-años** para un servidor jugable de season nueva partiendo de
OpenMU. Para revisarla, parto el trabajo en cinco paquetes y evalúo cuánto toca el cliente:

| # | Paquete | ¿Lo resuelve el cliente? | Peso **[INFERIDO]** |
|---|---|---|---|
| **A** | **Datos de contenido de presentación y equipamiento** — ítems y sus stats, skills y sus stats, opciones (excellent/ancient/socket/+380), terreno y caminabilidad de ~100 mapas, portales, textos y nombres, tooltips, árbol de master skills, tablas de Pentagrama/Muun/Ruud/Seed Sphere | **SÍ, casi por completo.** De parsing puro | ~15% |
| **B** | **Datos de contenido de mundo vivo** — stats de monstruos, spawns (coordenadas y cantidad), tablas de drop, EXP, tiendas NPC, tasas de mezcla, parámetros de eventos | **NO.** Solo "qué monstruo en qué mapa" (`MapCharacters.bmd`) y "qué skills tiene" (`MonsterSkill.bmd`) | ~10% |
| **C** | **Protocolo de red S20/S21** — framing, cifrado de paquetes, ~500 mensajes, handshake, el muro del map-join del doc 09 | **NO. Cero.** Descubrimiento puro | ~25% |
| **D** | **Lógica de servidor** — combate, IA, eventos, quests, party/guild/siege, progresión, anti-cheat | **NO.** Solo la *forma* de algunas curvas vía `FormulaData.bmd` | ~45% |
| **E** | **Arquitectura e infra** — red, persistencia, plugins, panel | **Ya resuelto por OpenMU** (y ya lo teníamos contado a favor en el doc 06) | ~5% |

Los pesos son **[INFERIDOS]**. La evidencia que los sostiene, medida en el clone de OpenMU
(commit `c7ad7ba4`, `wc -l` sobre `.cs`, incluye blancos y comentarios — **no comparable con las
152.800 líneas del doc 06, que salieron de otro método de conteo**):

- `src/Persistence/Initialization` = **68.465 líneas** (las tablas de datos)
- `src/GameLogic` = **81.126** · `src/GameServer` = **34.050** (la lógica)
- Dentro de la season 6: `Maps/` = **15.790** líneas y `Items/` = **6.516**, sobre **33.056**
  totales → **~67% del contenido de esa season son tablas de datos escritas a mano.**
- Pero de esas 15.790 líneas de `Maps/`, **la mayoría son stats y spawns de monstruos** — o sea
  el paquete **B**, el que el cliente **no** cubre.

### 7.2 El número revisado

Aplicando: el cliente elimina casi todo el paquete A (~15%) y una fracción menor del B (~2%).
Es decir, **recorta entre 15% y 20% del esfuerzo total.**

> ### Estimación revisada: **8–17 persona-años**, contra los 10–20 del doc 06.
>
> Un recorte real, medible y bien fundado — **pero no un cambio de categoría.** El proyecto
> sigue siendo de años-equipo, no de meses-persona.

### 7.3 El reparto que pediste

> **Parsing (tratable, semanas): ~15–20% del trabajo total.**
> **Descubrimiento de protocolo + lógica de servidor (duro, años): ~70%.**
> **Datos que hay que reconstruir a mano igual (monstruos, drops, spawns, tasas): ~10%.**
> **Arquitectura: ~5%, ya regalada por OpenMU.**

### 7.4 Pero el número no es lo importante — esto sí

Los persona-años bajan poco. **Lo que cambia de verdad es otra cosa, y es lo que hay que
llevarse de este informe:**

**(1) La curva de arranque se da vuelta.** El paquete A no es solo "15% del esfuerzo": es el
15% **más desmoralizante** — miles de filas de transcripción manual, sin recompensa visible,
que es exactamente donde mueren los proyectos de hobby. Ese trabajo pasa de **meses de tipeo**
a **una tarde de script**. Los primeros 6–12 meses del proyecto se vuelven muchísimo más
productivos.

**(2) La fidelidad sube, gratis.** Los números que salen del cliente son **los números de
Webzen**, no una aproximación comunitaria. Un ítem parseado es exacto por construcción. Un
monstruo tipeado a mano tiene un error de transcripción esperándote.

**(3) Aparece un objetivo intermedio que el doc 06 no contemplaba, y es el hallazgo accionable:**

> **Servidor OpenMU (protocolo S6) + datos y assets del cliente de Season 20.**

Eso **ya lo hace `bernatvadell/muonline` hoy** (§3.1). Con eso conseguís **el contenido visual
y el catálogo de ítems/skills de S20 sobre mecánica S6**. No es "Season 21 exacta" — la mecánica
sigue siendo S6, y los sistemas nuevos (pentagramas, Ruud, master 4to nivel) siguen sin existir
del lado servidor. Pero como **escalón intermedio verificable** es infinitamente más barato que
los 8–17 persona-años, y **no estaba en el cuadro de opciones del doc 06.** **[INFERIDO —
factible según la evidencia; no lo probé end-to-end.]**

**(4) Cambia el orden de los pasos del doc 09.** El doc 09 arranca por el espía de protocolo.
Con lo que sabemos ahora, **el paso barato va antes**: bajar el cliente de Webzen, correr un
parser sobre `Item.bmd`, `Skill`, `Lang.mpr` y los `.att`, y ver qué sale. Es **una tarde de
trabajo**, no requiere que nadie te conteste un paquete, y **te dice más sobre la season nueva
que las primeras dos semanas de sniffing**. No reemplaza al espía: lo precede.

### 7.5 Lo que NO cambia

La recomendación del doc 06 sigue en pie, y esto no la mueve:

- **El protocolo sigue siendo la traba.** Es ~25% del esfuerzo, no se paraleliza, y ahí se trabó
  el autor de MuEmu (hito 6, *"client closed on map join"*). Ningún parser de archivos te ayuda
  con eso.
- **La lógica de servidor (~45%) sigue intacta**, y es la mitad del proyecto.
- **El blanco se sigue moviendo** dos veces por año.
- **Para "jugar con amigos el mes que viene", la respuesta sigue siendo (a): quedarse en S6.**

Lo que cambia es que **la parte de "datos" dejó de ser un argumento en contra**. Si el atractivo
es el desafío técnico, ahora hay un primer escalón concreto, corto y verificable — y eso vale
más que bajar un número de un rango a otro.

---

## 8. Lo que no pude verificar (dicho, no estimado)

1. **Los links de descarga oficiales de Webzen.** `muonline.webzen.com` y `webzen.co.kr` están
   **bloqueados por el proxy de egress de esta red**. Sé que un proyecto público publica
   `https://full-wkr.mu.webzen.co.kr/muweb/full/MU_Red_1_20_61_Full.zip` como fuente oficial del
   cliente S20; **no pude comprobar que responda ni qué versión sirve hoy.** Verificalo vos.
2. **Los patch notes oficiales de Webzen y si existe una wiki oficial.** Mismo bloqueo. Todo lo
   de §6.1 sale de resúmenes de búsqueda, no de leer la fuente.
3. **muonlinefanz.com y muonline.fandom.com** — bloqueadas. No pude evaluar su cobertura real de
   seasons nuevas.
4. **Que exista alguna herramienta de S17–S21.** No encontré ninguna, pero **no consulté
   RaGEZONE**, que es donde vive el grueso del conocimiento técnico de MU. Puede haber material
   que no vi.
5. **La cobertura archivo-por-archivo de `Client.Data` (S20).** No publica tracker. Sé que lee
   Item, Skill, Gate, ATT, MAP, OBJ, OZB y texturas; **no sé si cubre las 45 tablas** como
   MuClientTools16 en S16.
6. **Los pesos de §7.1 (15/10/25/45/5).** Son **juicio mío** calibrado con la estructura de
   OpenMU. No hay registro de horas de nadie. Si alguien tiene datos duros, esto se corrige.
7. **Que el escalón "OpenMU + datos S20" funcione end-to-end.** El proyecto declara hacerlo; **no
   lo levanté ni lo probé.**
8. **El binding de parámetros de `FormulaData.bmd`.** Sé que las fórmulas están ahí en claro;
   **no sé qué variable es cada `%d`.** Eso hay que deducirlo.
9. **La semántica de ~20 columnas de la tabla de skills de S20.** El parser público las llama
   `Value39`…`Value58` y su autor escribió `//TODO: needs work`. Nadie las identificó.

---

## 9. Si mañana arrancás: los tres primeros comandos

Fuera de cualquier estimación, esto es lo que hay que hacer primero, y es barato:

1. **Bajá el cliente de Webzen** (gratis, legal, de su sitio) y quedate con la carpeta `Data/`.
2. **Corré un parser sobre las tablas.** El camino más limpio por licencia es
   [`muonline-bmd-viewer`](https://github.com/xulek/muonline-bmd-viewer) (**ISC**, TypeScript,
   vivo) o [`MuClientTools16`](https://github.com/VDraven/MuClientTools16) (**MIT**, C++,
   congelado pero completo para S16). Sacá `Item.bmd`, la tabla de skills, `Gate` y los `.att`.
3. **Comparalo contra lo que OpenMU ya tiene.** Los 76 `.att` de
   `src/Persistence/Initialization/Resources/` te dan un caso donde ya sabés la respuesta — el
   mismo principio de calibración del Paso 1 del doc 09, pero para archivos en vez de paquetes.

Si eso sale bien, tenés el catálogo de la season nueva sobre la mesa en una tarde. **Recién
después** poné a andar el espía del `lab-protocolo/`.

---

**Fuentes principales** (todas revisadas o clonadas el 31/08/2026):
[bernatvadell/muonline · Client.Data](https://github.com/bernatvadell/muonline) ·
[xulek/muonline](https://github.com/xulek/muonline) ·
[xulek/muonline-bmd-viewer](https://github.com/xulek/muonline-bmd-viewer) ·
[VDraven/MuClientTools16](https://github.com/VDraven/MuClientTools16) ·
[samik3k/MuClientTools](https://github.com/samik3k/MuClientTools) ·
[VD1988/MuOnline-WorldEditor](https://github.com/VD1988/MuOnline-WorldEditor) ·
[beater-studios/mu-file-viewer](https://github.com/beater-studios/mu-file-viewer) ·
[baranovskis/bmd-converter](https://github.com/baranovskis/bmd-converter) ·
[MUnique/OpenMU](https://github.com/MUnique/OpenMU) (clone en `c7ad7ba4`, 30/08/2026) ·
[MuOnline Client Files Description (gist)](https://gist.github.com/rafaelvieiras/5cf243ec9247cb86f01ee2963f1a5d7c) ·
[AlighieriDemiurgs/MuHistory](https://github.com/AlighieriDemiurgs/MuHistory)

**Documentos relacionados:** [`06-viabilidad-season-nueva.md`](06-viabilidad-season-nueva.md)
(la estimación que este informe revisa) · [`09-camino-propio.md`](09-camino-propio.md)
(el orden de pasos que este informe reordena).

— Elaborado por GSG
