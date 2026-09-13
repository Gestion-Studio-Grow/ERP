# MuEmu — dictamen técnico de adopción

**Qué se evaluó:** [github.com/Yomalex/MuEmu](https://github.com/Yomalex/MuEmu) — emulador de servidor de
MU Online en C#, licencia MIT, que declara soporte de **Season 6 Kor, S9 Eng, S12 Kor, S16 Kor y S17 Kor**.

**Por qué:** en `docs/06-viabilidad-season-nueva.md` (§3) MuEmu quedó marcado como *"el único emulador open
source que apunta arriba de S6"*, con una nota explícita: **"la completitud real de MuEmu por season no
está documentada y no la pude verificar"**. Este documento cierra ese hueco leyendo el código.

**Método:** clone completo (`git fetch --unshallow`, 235 commits) el 31/08/2026, HEAD `92d80f9`
(11/01/2026). Todo lo marcado **[V]** está verificado contra un archivo o un conteo reproducible del
clone. Lo marcado **[I]** es inferencia mía sobre esa evidencia. Lo que no pude verificar está en §9,
dicho como tal y no estimado.

**Fuera de alcance (regla dura):** no se buscaron ni se evaluaron files comerciales filtrados, ni
métodos para decompilar binarios de Webzen. Este informe cubre únicamente código fuente abierto bajo MIT.

---

## 0. Veredicto en tres líneas

**MuEmu NO es un camino real a una season nueva. Es un servidor Season 6 sólido al que se le pegaron
parches de formato de paquete para que clientes de S9/S12/S16/S17 se conecten y dibujen la pantalla sin
desconectarse.** El contenido que define las seasons altas —Ruud, Majestic, Mastery, Artifacts, las
clases nuevas— o no existe, o existe como cáscara que le miente al cliente para que no se cuelgue.

**El README no miente sobre el protocolo: miente por omisión sobre el juego.** "Soporta S17" es cierto en
el sentido de *"un cliente S17 se conecta"*. No es cierto en el sentido de *"podés jugar S17"*.

**Para el caso "jugar con 5-10 amigos": no lo adoptes.** El stack de OpenMU que ya tenés levantado es
mejor en todas las dimensiones que importan acá — madurez, operación, riesgo de proyecto — y lo que
ganarías yendo a MuEmu no es "S17", es "S6 con la interfaz de S17 y la mitad de los botones rotos".

---

## 1. Los números de arranque **[V]**

| Métrica | MuEmu | OpenMU (de `docs/06`, medido 30/08/2026) |
|---|---|---|
| Primer commit | 07/04/2018 | 24/09/2016 |
| Último commit | **11/01/2026** | 30/08/2026 (activo hoy) |
| Commits | **235** | 5.068 |
| Autores | **5 nominales, 232 de 235 commits (98,7%) de una sola persona** (Camejo Yomar) | 82 (líder 67%) |
| Código C# | **51.886 líneas / 271 archivos** | ~152.800 líneas / 3.224 archivos |
| Tests | **0 archivos de test** | tiene suite |
| Issues | **1 abierto, 12 cerrados** | 53 abiertos |
| Licencia | MIT | MIT |

**Commits por año — el dato que más pesa [V]:**

```
2018: 11   2019: 15   2020: 50   2021: 69   2022: 51
2023: 13   2024: 21   2025:  4   2026:  1
```

El proyecto **pico en 2020-2022** (170 de 235 commits = 72%) y desde entonces se apagó: **5 commits en
los últimos 20 meses**. El único issue abierto se titula *"Season 17 Korean"*, es de abril de 2026, y
sigue sin respuesta **[V]**.

> **Corrección al informe anterior [V]:** `docs/06` describió a MuEmu como *"vivo pero lento"*. Con la
> historia completa a la vista, la descripción correcta es **"latente"**: un commit en los últimos doce
> meses y bus factor 1. No está archivado, pero tampoco está en desarrollo.

---

## 2. ¿Qué tan real es el soporte de S16/S17?

### 2.1 La arquitectura: UN protocolo con parches, no definiciones por season **[V]**

Esto es lo primero que hay que entender, porque define todo lo demás. MuEmu **no** tiene un set de
paquetes por season. Tiene **un protocolo base (Season 6 Kor) y un mecanismo de sustitución selectiva**.

Las piezas, en `MU.Network/`:

1. **`OPCodes.cs` (23 KB)** — una tabla de **remapeo de opcodes**. Las seasons nuevas de MU en buena
   medida barajaron los números de operación; este archivo traduce viejo↔nuevo con diccionarios
   `toClient`/`toServer`. Es traducción de números, no semántica nueva.

2. **`VersionSelector.cs`** — un registro `(season, opcode) → tipo de clase C#`. Y acá está el corazón
   del asunto, en `CreateMessage<T>()`:

   ```csharp
   var subType = (from d in s_instance._types
                  where d.Value.ContainsKey(result) && d.Key <= s_instance._activeSeason
                  select d)
               .OrderByDescending(x => x.Key).First().Value[result];
   ```

   **Traducido: si para la season activa no hay una versión específica del paquete, se cae a la season
   inmediatamente inferior que sí la tenga; y si no hay ninguna, usa el tipo base (S6).** Corriendo en
   `Season17Kor`, todo paquete no sobreescrito explícitamente se serializa **con la estructura de S6**.

**Eso no es un defecto de implementación: es el diseño.** Y es un diseño razonable para lo que el autor
quería (que varios clientes hablen con un mismo server). Pero significa que "soportar S17" se reduce a
*"¿cuántos paquetes se sobreescribieron para S17?"*.

### 2.2 La respuesta, contada **[V]**

**Registros explícitos por season** (`grep -c 'VersionSelector.Register<...>(ServerSeason.X'`) — **67 en
todo el repo**:

| Season | Registros | Season | Registros |
|---|---|---|---|
| **Season6Kor** | **24** | Season3Kor | 3 |
| **Season16Kor** | **13** | **Season17Kor75** | **3** |
| Season9Eng | 10 | **Season17Kor** | **2** |
| Season12Eng | 10 | Season6Eng / Season0Kor | 1 / 1 |

**Los 5 paquetes que existen para S17, completos, sin recortar [V]:**

```
GameMessageFactory.cs:210  SInventoryS17     (Season17Kor75, GameOpCode.Inventory)
GameMessageFactory.cs:257  SHeatlUpdateS17   (Season17Kor75, GameOpCode.HealthUpdate)
GameMessageFactory.cs:280  SShopItemListS17  (Season17Kor,   GameOpCode.CloseWindow)
GameMessageFactory.cs:486  SMuunInventoryS17 (Season17Kor,   GameOpCode.MuunInventory)
EventMessageFactory.cs:159 SEventInventoryS17(Season17Kor75, EventOpCode.EventInventory)
```

**Y los 13 de S16** son exactamente el mínimo para que el cliente entre y dibuje: `JoinResult`,
`CharacterList`, `JoinMap2`, `ViewPortCreate`, `ViewPortMCreate`, `Attack`, `Position`, `CharRegen`,
`MoveItem`, `ItemGet`, `PartyList`, `CashPoints`, `GremoryCaseDelete`.

**Clases de paquete con sufijo de season** sobre **666 clases totales** en `MU.Network/` **[V]**:

| S3 | S9 | S12 | **S16** | **S17** | Base (sin sufijo = S6) |
|---|---|---|---|---|---|
| 7 | 28 | 17 | **37** | **7** | **~570** |

**Handlers de mensajes** (`[MessageHandler(typeof(X))]`): **214 en total, de los cuales 20 son
específicos de alguna season** — y de esos 20, seis son de S16 (cinco son de la tienda personal) y
**cero son de S17** **[V]**.

### 2.3 Lo que sí y lo que no

**Sí es real [V]:** hay 96 clases de paquete y 20 handlers escritos contra formatos de wire de seasons
altas. Eso es trabajo genuino de ingeniería de protocolo, y confirma la lectura de `docs/06 §3`: **el
conocimiento del protocolo de seasons altas existe parcialmente en abierto.** Un cliente S16/S17 se
conecta, lista personajes, entra al mapa, se mueve, pega y ve el viewport.

**No es real [V]:** con 5 paquetes S17 y 13 S16 sobre ~570 estructuras base, **el 92% del protocolo que
un cliente S17 habla se le responde con estructuras de Season 6**. Funciona porque el autor eligió con
criterio *cuáles* sobreescribir. No es "soporte de season": es **una capa de compatibilidad de cliente**.

### 2.4 Cómo el `Season` afecta al juego (spoiler: casi nada) **[V]**

Fuera del registro de paquetes, `Program.Season` se consulta en **~20 lugares**, y son casi todos
formato de wire o filtro de contenido:

- **DTO de viewport / party / creación de monstruo** — `SubSystem.cs:66,74,561`, `Party.cs:106`.
- **Filtro de contenido por `MinSeason`** — `ResourceLoader.cs:54` (items), `:574` (mapas),
  `MonstersMng.cs:135,149,165` (monstruos). Es decir: la season **esconde o muestra contenido ya
  existente**; no cambia reglas.
- **Tres detalles de comportamiento** — `GameServices.cs:844` (a qué storage va un pickup),
  `Character.cs:870,882`, `Inventory.cs:139` (tienda personal no mapeada).

**No hay una sola regla de juego que cambie por season.** Fórmulas de daño, curvas de experiencia,
progresión: idénticas. **[V]**

### 2.5 La prueba más limpia: los datos por season son copias **[V]**

El repo trae archivos de datos con nombre por season. Los verifiqué por hash:

```
$ md5sum Data/MasterLevel/*.xml | awk '{print $1}' | sort | uniq -c
     10 24e3a73b7a1cac1eaa67983023cc69c4
```

**Los 10 árboles de Master Skill —S0, S3, S6Kor, S6Eng, S9, S12, S16Kor, S16Eng, S17Kor, S17Kor75— son
el MISMO archivo, byte por byte** (71.229 bytes, 480 skills). El árbol de maestría de S17 es el de S6
con otro nombre de archivo.

Y las quests de mundo, peor:

```
Data/QuestWorld/Quest_Season16Kor.xml   11.001 bytes   167 quests
Data/QuestWorld/Quest_Season17Kor.xml      131 bytes     0 quests  <- XML raíz vacío
Data/QuestWorld/Quest_Season6Kor.xml       131 bytes     0 quests  <- idem
... (7 de los 8 archivos son el mismo XML vacío, mismo md5)
```

**Solo S16Kor tiene quests. Los otros siete archivos son literalmente `<Quests />`.** **[V]**

---

## 3. Los sistemas que definen las seasons altas, uno por uno

Regla que apliqué, como pediste: **un nombre en un enum no es un sistema.** Para cada uno busqué la
lógica detrás.

| Sistema | Veredicto | Evidencia **[V]** |
|---|---|---|
| **Master Level** | ✅ **Implementado de verdad** | `MuEmu/MasterLevel.cs` (199 líneas): curva de XP con la fórmula cúbica real y ajustes en 400/600, puntos por nivel (7 para MG/DL, 5 resto), tope 200, carga del árbol desde XML, persistencia EF (`MasterInfoDto`), handler `CMasterSkill`. Es S6-era y está completo. |
| **Pentagrama** | 🟡 **Parcial pero real y cableado** | `MuEmu/Pentagrama.cs` (197 líneas): tabla de daño elemental 5×6, tasas de elemento, drop con sockets. **Y está enganchado al combate**: `Character.cs:1930` y `:1961` llaman `Pentagrama.GetElementalFactor(...)`. Handler `CPentagramaJewelIn`. Slot de equipo `Pentagrama = 236`. |
| **Errtel** | ❌ **No existe** | **3 menciones en todo el repo.** Un `case 6365: //Errtel of Anger` hardcodeado en `Inventory.cs:487` y dos campos DTO en `MU.Resources/XML/PentagramaDto.cs`. No hay socketing de errtel, ni rangos, ni opciones, ni upgrade. El pentagrama existe; las joyas que le dan sentido, no. |
| **Ruud** | ❌ **Economía muerta** — ver abajo | El hallazgo más contundente del informe. |
| **Mastery items** | ❌ **Cero** | `grep -ri mastery --include=*.cs` → **0 archivos, 0 menciones.** |
| **Artifacts** | ❌ **Cero** | `grep -ri artifact --include=*.cs` → **0 archivos, 0 menciones.** |
| **Muun** | 🟡 **Cáscara** | 2 handlers (`MuEmu/Network/GameServices/MuunServices.cs`, 43 líneas). `CMuunItemGet` recoge un item a un inventario muun. Pero **montar un muun responde un valor fijo**: `new MuunRideVPDto(session.Player.ID, 0xffff)` — o sea "ningún muun". Es una respuesta enlatada para que el cliente no se cuelgue. |
| **Majestic (4ta clase, S16+)** | ❌ **Clase vacía** | Ver abajo. |
| **Seed Sphere / Talisman / Ability Cards** | ❌ **No existen** | `Talisman`: 3 menciones. `AbilityCard`: 0. Seed Spheres solo como tipo de item (`ItemType.Wing_Orb_Seed`), sin sistema de sockets ni niveles. |

### 3.1 Ruud: la moneda que se gasta pero nunca se gana **[V]**

Ruud es la moneda que sostiene la progresión de S9 en adelante. En MuEmu está **todo el andamiaje**:
columna en la DB (`WebZen.DataBase/CharacterDto.cs:69`), propiedad con notificación al cliente
(`Character.cs:387-406`, `OnRuudChange()`), se persiste (`Character.cs:1514`), se manda en el login
(`Auth_S2C.cs:555,642,730`), hay NPC de tienda Ruud (`NPCAttributeType.ShopRuud`) y handler de compra.

Y **una sola mutación del valor en todo el repositorio**:

```
MuEmu/Network/GameServices/GameServices.cs:2743:   @char.Ruud -= (uint)it.BasicInfo.Ruud;
```

`grep -rn "Ruud +=" --include=*.cs .` → **cero resultados.** Ningún monstruo, evento, quest ni Gremory
Case otorga Ruud jamás. **Podés gastar Ruud; no hay forma de conseguirlo.** Todo personaje arranca en 0 y
se queda en 0. La tienda Ruud —y con ella la progresión entera de S9+— es inalcanzable por diseño de
implementación incompleta.

### 3.2 Majestic: el archivo que lo dice todo **[V]**

`MuEmu/MajesticLevel.cs`, **completo, los 10 renglones**:

```csharp
using System;
using System.Collections.Generic;
using System.Text;

namespace MuEmu
{
    internal class MajesticLevel
    {
    }
}
```

Una clase vacía. Y lo que hace el server cuando el cliente pide info Majestic
(`MasterLevel.cs:153-168`) es contestarle **listas vacías** para que no se cuelgue:

```csharp
if(Character.MajesticClass)
{
    await ...SendAsync(new SMajesticInfo { Points = MPoints, SkillList = Array.Empty<MajesticInfoDto>() });
    await ...SendAsync(new SMajesticStatsInfo { SkillList = Array.Empty<MajesticInfoDto>() });
}
```

**Ese patrón —contestar vacío para que el cliente no se cuelgue— es la firma de todo el "soporte S16/S17"
de MuEmu**, y se repite en Muun (`0xffff`), en las quests (XML vacío) y en el árbol Majestic. **[I]**

### 3.3 Las clases nuevas: hay enum, no hay clase **[V]**

El enum `HeroClass` (`MU.Resources/Constants.cs:942-985`) lista Grow Lancer, Rune Wizard, Slayer y Gun
Crusher con sus 2da/3ra/4ta evolución. **Ahí termina el parecido con un sistema.**

**Usos fuera del enum, contados:**

| Clase | Usos en lógica | Qué son |
|---|---|---|
| GrowLancer | **4** | 1 flag de creación + 3 `case` en `Character.cs` (daño, defensa, stats) |
| RuneWizard | **3** | 3 `case` en `Character.cs` — y en el de daño **está agrupado con DarkWizard**, misma fórmula |
| Slayer | **2** | 2 `case` en `Character.cs` |
| GunCrusher | **1** | 1 `case` en `Character.cs` |
| MirageLancer, LightWizard, LemuriaMage, Alchemist, IllusionKnight | **0** | no existen ni en el enum |

**Cero skills.** En `Data/Characters.xml` las clases viejas traen `<Skill>17</Skill>` etc.; **Grow Lancer,
Rune Wizard, Slayer y Gun Crusher no tienen ni un solo nodo `<Skill>`**. Un Rune Wizard sin runas, un
Grow Lancer sin lanza.

**Y el remate — tres de las cuatro ni siquiera se pueden crear [V]:**

```csharp
public enum EnableClassCreation : byte   // MU.Resources/Constants.cs:731
{
    Summoner = 1, DarkLord = 2, MagicGladiator = 4, RageFighter = 8, GrowLancer = 16,
}
```

El enum de flags **termina en GrowLancer**. No existe bandera para Rune Wizard, Slayer ni Gun Crusher, y
`AuthServices.cs:236` manda exactamente esos cinco. **De las clases post-S6, la única creable es Grow
Lancer (S14) — y sin skills.** Las clases de S15/S16 son inalcanzables desde la pantalla de creación.

---

## 4. Qué le falta para ser jugable

Acá viene la parte justa: **como servidor Season 6, MuEmu es bastante completo.** El problema no es que
sea un esqueleto — es que lo que está completo es S6.

**Métrica global de stubs [V]** (script propio; descarté 432 constructores vacíos de serialización, que
son falsos positivos):

```
Métodos reales con cuerpo:      1.214
  cuerpo vacío:                     9   (0,7%)
  solo NotImplementedException:    61   (5,0%)
  TOTAL stub:                      70   (5,8%)
```

**5,8% de stubs es un número sano.** El código no es humo. Pero **59 de los 61 `NotImplementedException`
están en `MuEmu/Events/`** — o sea, la deuda está toda concentrada en el contenido de fin de juego.

**Advertencia metodológica [V]:** el repo tiene **0 comentarios `TODO`/`FIXME`/`HACK`** en 52 KLOC. El
autor no anota deuda. No hay tracker de progreso equivalente al `docs/Progress.md` de OpenMU. **Lo que
falta no está señalizado en ningún lado** — hay que leerlo, como acabo de hacer.

### 4.1 Lo que anda **[V]**

De los **214 handlers**, el núcleo de un MU jugable está cubierto:

- **Combate:** `CAttack`, `CAttackS5E2`, `CBeattack`(+S9), `CMagicAttack`(+S9), `CMagicDuration`(+S9,+S16). Fórmulas de daño por clase, daño elemental de pentagrama, PvP, `SKillPlayer`.
- **Movimiento:** `CMove`(+Eng,+12Eng), `CPositionSet`(+S9), `CWarp`, `CTeleport`(+S9). 116 mapas en `Maps.xml`, **72 archivos `.att` referenciados, 70 de ellos presentes** (76 en el directorio; faltan solo `World133.att` y `World134.att`).
- **Inventario / items:** `Inventory.cs` (1.486 líneas) + `Item.cs` (1.925) — equipar, mover, partir, tirar, agarrar, opciones excelentes, +luck/+skill, sockets, Jewel of Harmony, Chaos Box.
- **Drops:** sistema real de ItemBags, **38 bolsas** en `Data/ItemBags/` con formato clásico de MU.
- **Trade:** completo (`CTradeRequest`, `CTradeResponce`, `CTradeButtonOk/Cancel`, `CTradeMoney`) con intercambio transaccional en `GameServices.cs:1718-1719`.
- **Party:** `Party.cs` (298 líneas) + sistema de matching/búsqueda.
- **Guild:** `Guild.cs` (732 líneas) + `GuildServices.cs` (19 KB), 20 handlers, unions, marcas, matching.
- **Tienda personal:** 16 handlers, con variantes S16Kor propias.
- **NPCs / quests:** `Quests.cs` (987 líneas), quest world, quest EXP, `CTalk`, Marlon, Julia.
- **Otros:** Cash Shop, amigos, correo, storage/vault, duelos, Gens, hunting record, MU Helper/bot, 5 minijuegos (Mu Rummy, Bingo, Buscaminas, Balls&Cows).

### 4.2 Lo que es esqueleto **[V]**

**Eventos — el patrón importa.** Muchos `NotImplementedException` en clases *plurales* (`BloodCastles`,
`ChaosCastles`, `DevilSquares`) son **código muerto**: el manager delega en la instancia por nivel
(`_bridges[n].TryAdd(plr)`) y los overrides stub nunca se llaman. **Blood Castle, Chaos Castle, Devil
Square, Crywolf, Kanturu e Imperial Guardian están implementados** (398-799 líneas cada uno).

**Pero hay stubs alcanzables de verdad — y estos sí rompen:**

**Castle Siege.** `MuEmu/Events/CastleSiege/CastleSiege.cs` (598 líneas) tiene 6 stubs, y **dos están en
un camino que el jugador puede recorrer**:

```
CastleSiege.cs:479  public override void NPCTalk(Player plr)  -> throw new NotImplementedException()
CastleSiege.cs:520  internal void CrownTalk(Player player)    -> throw new NotImplementedException()
```

llamados desde:

```
GameServices.cs:1016   case NPCAttributeType.CastleSiege:      ...GetEvent<CastleSiege>().NPCTalk(...)
GameServices.cs:1021   case NPCAttributeType.CastleSiegeCrown: ...GetEvent<CastleSiege>().CrownTalk(...)
```

**Hablarle al NPC de Castle Siege o a la Corona lanza la excepción**, y el dispatcher
(`SimpleModulus/Network/WZServer.cs:150-155`) la agarra y **desconecta al jugador**. Además
`CastleSiege.TryAdd()` también tira, así que no hay forma de entrar al asedio. **Castle Siege está
inutilizable.** (Dato para dimensionar: a OpenMU le llevó hasta agosto de 2026 —año diez— terminar Castle
Siege; ver `docs/06 §1`.)

**Unity Battle Field.** 46 líneas, **6 de 6 métodos tiran `NotImplementedException`**, incluidos
`TryAdd` y `OnTransition`. No está implementado en absoluto.

**Otros con stubs:** Double Goer (6/6), White Wizard (4), Moon Rabbit (4), Battle of Selupan (4),
Acheron Guardian (3, incluido `NPCTalk`), Event Egg (4), MiniGame base (5).

**Pathing de monstruos — funciona, pero es frágil [V].** `MuEmu/PathFinding.cs` (112 líneas) se presenta
como A* (tiene `G`, `H`, `F`, `Closed`) pero **no lo es**: recorre los tiles abiertos en orden de
inserción (`foreach(var otile in _tiles.Where(x => !x.Closed))`), sin cola de prioridad — es un DFS
recursivo. Y tiene un tope duro:

```csharp
public const int MaxF = 100;                    // Tile
public int F => Math.Min(G + H, MaxF);
if (stile.F == Tile.MaxF) return null;          // aborta la búsqueda
```

**[I]** Con costo 10 por paso ortogonal, eso limita el camino a ~10 tiles y aborta más allá; y siendo
recursivo sobre una lista que crece, en mapas abiertos es candidato a stack overflow y a coste
cuadrático. En la práctica **[I]**: monstruos que persiguen bien de cerca y se traban o se quedan
quietos a media distancia. Es el mismo `MakePath()` que usan todos (`Monster.cs:454`).

---

## 5. Deuda técnica y riesgo de adopción

### 5.1 .NET Core 3.1 — confirmado, y sí es un problema **[V]**

**Los 7 proyectos C# del server declaran `<TargetFramework>netcoreapp3.1</TargetFramework>`**: `MuEmu`,
`MU.Network`, `MU.Resources`, `MU.DataBase`, `CSEmu`, `WebZen` (SimpleModulus), `MU.Tool`.

.NET Core 3.1 salió de soporte el **13/12/2022** — sin parches de seguridad desde entonces. El repo
además usa **EF Core 5.0.4**, también fuera de soporte (mayo 2022).

**Qué implicaría migrar a .NET 8/9 [I]:** el trabajo de fondo parece **chico**, y esto es una buena
noticia dentro del cuadro:
- No hay `DllImport`, ni WinAPI, ni registro de Windows **[V]** (los `CRegistryReq` que aparecen son
  paquetes de *registro de game server contra el connect server*, no el Registry).
- `System.Drawing` se usa 39 veces pero **solo `Point`/`Size`/`Rectangle`** (System.Drawing.Primitives,
  cross-platform). **No hay `Bitmap` ni `Graphics`** **[V]** — no hace falta libgdiplus.
- Las dependencias binarias (§5.3) son **.NET Standard 2.0** **[V]**, cargan en .NET 8 sin drama.
- El CI ya compila con **SDK .NET 8** **[V]**.

**[I]** Estimo cambiar `netcoreapp3.1` → `net8.0` en 7 `.csproj`, subir EF Core 5→8 (que sí trae cambios
de comportamiento en tracking y en el proveedor MySQL: habría que pasar de `MySql.EntityFrameworkCore` a
`Pomelo.EntityFrameworkCore.MySql`), y arreglar lo que rompa. **Del orden de días, no de meses** — pero
es una estimación sin haber compilado, y va marcada como tal.

### 5.2 ¿Compila hoy?

**No lo pude verificar en esta máquina [V]:** `dotnet` no está instalado (`command not found`,
`dotnet --list-sdks` falla), y el intento de bajar el instalador oficial fue **denegado por la política
de red del entorno**. **No compilé MuEmu y no voy a afirmar que compile por mi cuenta.**

**Lo que sí verifiqué, indirectamente [V]:** hay CI —`.github/workflows/dotnet.yml`— que corre en
`windows-latest` con SDK `8.0.x` haciendo `dotnet restore` + `dotnet build` + `dotnet test`, y **las tres
corridas más recientes están en verde**, incluida la del último commit (`92d80f9`, enero 2026).

**Dos salvedades importantes sobre ese verde [V]:**
1. **`dotnet test` no prueba nada**: hay **0 archivos de test** en el repo. El paso pasa por vacío.
2. **Corre solo en Windows.** No hay job de Linux. Y `MuEmu.sln` incluye `MU.Connector.vcxproj`, un
   proyecto **C++ configurado para `Win32`/`x64` de MSBuild**. **[I]** Que la solución compile en Windows
   no prueba que `dotnet build` de los proyectos C# funcione en Linux — probablemente sí, apuntándole a
   los `.csproj` y no al `.sln`, pero **es una hipótesis sin verificar**.

### 5.3 Dependencias binarias sin fuente — el riesgo de cadena de suministro **[V]**

**Los 6 proyectos C# principales referencian DLLs precompiladas commiteadas en el repo**, no paquetes
NuGet:

```xml
<Reference Include="BlubLib">
  <HintPath>..\BlubLib\0.1.4\BlubLib.dll</HintPath>
</Reference>
```

`BlubLib/0.1.4/` contiene **6 DLLs binarias sin código fuente en el repo**: `BlubLib.dll` (96 KB),
`BlubLib.Serialization.dll`, `BlubLib.DotNetty.dll`, `BlubLib.DotNetty.SimpleRmi.dll`, `BlubLib.GUI.dll`,
`BlubLib.WinAPI.dll`.

**Lo que pude establecer sobre ellas [V]:** son PE32 gestionadas, target **.NET Standard 2.0** (cross-
platform, cargan en Linux y en .NET 8), y las rutas de PDB embebidas apuntan al proyecto upstream
(`/builds/wtfblub/BlubLib/...`) — o sea, tienen origen público conocido. `BlubLib.Serialization` usa
`Sigil` + `System.Reflection.Emit` (genera IL en runtime: funciona, pero incompatible con AOT/trimming).

**El riesgo [I]:** **la serialización de todos los paquetes del server pasa por un binario de terceros
que nadie en el proyecto auditó, versión 0.1.4, sin fuente en el árbol y sin verificación de hash.** Para
un server de amigos en LAN es un riesgo aceptable; para cualquier cosa expuesta a internet, es una
dependencia que yo querría reemplazar por el paquete NuGet oficial o por fuente compilada localmente.

### 5.4 Base de datos: **MySQL, y sin camino de migración** **[V]**

- **MySQL**, vía `MySql.Data 8.0.29` + `MySql.EntityFrameworkCore 5.0.0`. 21 `DbSet`, esquema razonable
  (cuentas, personajes, items, guilds, quests, spells, gremory case, hunting, gens…).
- **No hay migraciones EF.** Cero. No existe carpeta `Migrations/`.
- El esquema se crea con `Database.EnsureCreated()` — que **no versiona nada**.

**Y acá está la trampa operativa más peligrosa del repo [V].** El README documenta:

> `- migrate: Update the structure of the db. (Example: db migrate)`

Lo que ese comando hace en realidad (`MuEmu/Program.cs:818-830`):

```csharp
public static void Migrate(object a, EventArgs b)
{
    using (var db = new GameContext())
    {
        Log.Information("Dropping DB");
        db.Database.EnsureDeleted();      // <-- BORRA LA BASE ENTERA
        Log.Information("Creating DB");
        db.Database.EnsureCreated();
    }
}
```

**`db migrate` no migra: borra la base y la vuelve a crear vacía.** Un operador que actualice el server y
corra el comando documentado como "actualizar la estructura" **pierde todas las cuentas, personajes e
items, sin confirmación previa.** Contra el estándar de operación de nuestro stack —donde
`./scripts/actualizar.sh` hace **backup antes de tocar nada** y `restaurar.sh` pide confirmación— esto es
directamente inaceptable sin envolverlo.

### 5.5 Patrones de concurrencia que van a doler **[V]**

- **64 métodos `async void`.** En C#, una excepción dentro de un `async void` no la puede atender ningún
  `try/catch` del llamador: sube al contexto de sincronización y en una app de consola **termina el
  proceso**. Concentrados en `Character.cs` (12), `SubSystem.cs` (7), `Spells.cs` (6), `GremoryCase.cs`
  (5). **[I]** Es la explicación más probable de caídas duras del server bajo carga o ante datos raros.
- **211 llamadas a `.Wait()`** y **47 a `.Result`** dentro de `MuEmu/`, muchas en caminos async
  (bloqueo sincrónico sobre tareas: riesgo de deadlock y de tapar el loop de red). Se ven incluso en
  bucles de broadcast del viewport (`Monster.cs:487`: `obj.Session.SendAsync(...).Wait()` dentro de un
  `foreach` sobre el viewport).
- El dispatcher sí atrapa excepciones de handlers, pero su respuesta es **desconectar al jugador**
  (`WZServer.cs:150-155`).

### 5.6 Seguridad: mejor de lo esperado en lo básico, nula en anti-cheat **[V]**

**Bien:** las contraseñas usan **PBKDF2** (`Rfc2898DeriveBytes`) con **24.000 iteraciones** y salt de 24
bytes desde CSPRNG (`AuthServices.cs:166-181`). Es una implementación correcta, mejor de lo que se
suele ver en este nicho. *(Detalle menor: la comparación del hash es `!=` sobre `string`, no en tiempo
constante — fuga de timing teórica.)*

**Mal:** el anti-cheat es literalmente no-op **[V]**:
```
MuEmu/Network/AntiHackServices.cs:12   void AHCheck()          { }   <- vacío
MuEmu/Security/GameCheckSum.cs:14      void LoadChecksum()     { }   <- vacío
```
Y `AutoRegister` viene en `true` en el `server.xml` de ejemplo: **cualquiera que se conecte se crea una
cuenta con el primer login**. Para LAN/amigos está bien; expuesto a internet, no.

---

## 6. ¿Se puede contenerizar como el stack de OpenMU?

**Dictamen: sí, técnicamente nada lo ata a Windows. Pero el docker-compose lo tendrías que escribir vos
desde cero, y el resultado sería peor operativamente que el que ya tenés.**

### 6.1 Lo que NO es un obstáculo **[V]**

- **No hay dependencias Windows-only en el server.** Sin `DllImport`, sin WinAPI, sin Registry, sin
  `Bitmap`/`Graphics`, sin rutas con backslash hardcodeadas en `MuEmu/`.
- Las DLLs vendorizadas son .NET Standard 2.0 → **cargan en Linux**.
- La DB es **MySQL** → contenedor estándar, mismo patrón que el `postgres:17-alpine` que ya usás.
- Los dos ejecutables (`MuEmu` = game server, `CSEmu` = connect server) son `OutputType=Exe` de .NET
  Core → corren con `dotnet`.
- Los dos proyectos Windows-only **no son parte del server** y se pueden excluir del build:
  - `MU.Connector` es un **`.vcxproj` C++/Win32** — un DLL de lado **cliente** (`dllmain.cpp`,
    `Offsets.h`, `MiniDump.cpp`).
  - `PacketHelper` es una herramienta **WinForms .NET Framework 4.0** — utilitario de desarrollo.

### 6.2 Lo que habría que construir **[I]**

1. **Dockerfile multi-stage** (build con SDK, runtime con `mcr.microsoft.com/dotnet/runtime`). **Ojo:**
   la imagen de runtime **3.1 ya no está soportada**; en la práctica esto empuja a hacer la migración a
   .NET 8 de §5.1 *antes* de contenerizar, no después.
2. **Dos servicios** (`connectserver` + `gameserver`) más `mysql`, más red interna sin puertos
   publicados para la DB — el mismo patrón del `docker-compose.yml` actual.
3. **Generar `server.xml` desde variables de entorno.** El repo **no trae `server.xml`** **[V]**: se
   autogenera al primer arranque con valores por defecto. Habría que hacer un `entrypoint.sh` que lo
   renderice desde el `.env`, igual que hoy `levantar.sh` genera la config de nginx.
4. **Volumen para `./Data/`** y working directory fijo: **todas las rutas de recursos son relativas**
   (`"./Data/..."`) **[V]**, así que el WORKDIR tiene que ser exacto o el server no levanta.
5. **Backups a mano.** Con `mysqldump` es directo. Pero además hay que **envolver o deshabilitar el
   comando `db migrate`** (§5.4) para que nadie se borre la base con el comando que la doc llama
   "actualizar".
6. **El problema del IP anunciado.** El connect server le anuncia al cliente la IP del game server
   (`server.xml → Connection.IP`). Adentro de Docker esa IP es la de la red interna; hay que exponer la
   IP alcanzable desde el cliente. Es el clásico NAT de los emuladores de MU, resoluble, pero es
   configuración fina que hoy no tenés que pensar.

**Esfuerzo total [I]: días de trabajo para un compose equivalente, más la migración de framework.** Es
factible. Lo que no obtenés es lo que hoy tenés gratis: `levantar.sh` con validación de `.env`,
`backup.sh` con verificación y retención de 14, `restaurar.sh` con confirmación, `diagnostico.sh`,
límites de memoria y PIDs, `no-new-privileges`, red interna sin salida, rotación de logs, y el panel
de administración web. **Todo eso hay que rehacerlo, y el panel de admin directamente no existe: MuEmu se
configura por XML a mano y se opera por comandos de consola.**

---

## 7. MuEmu vs OpenMU para "jugar en privado con 5-10 amigos"

| Dimensión | OpenMU (lo que ya tenés) | MuEmu |
|---|---|---|
| **Madurez** | 5.068 commits, 10 años, 82 autores, con suite de tests **[V]** | 235 commits, 8 años, **0 tests** **[V]** |
| **Riesgo de proyecto (bus factor)** | Líder con 67%, pero **81 contribuidores más** y actividad diaria **[V]** | **1 persona con el 98,7%**; **5 commits en 20 meses**; issue de S17 sin responder desde abril 2026 **[V]** |
| **Operación** | Panel web de admin (rates, drops, eventos, spots, game servers) + nuestro stack Docker con backup/restore/diagnóstico **[V]** | XML a mano + comandos de consola. **Sin panel.** Sin compose. **Y `db migrate` te borra la base** **[V]** |
| **Framework** | .NET al día | **.NET Core 3.1, EOL desde 12/2022** **[V]** |
| **Dependencias** | NuGet | **6 DLLs binarias sin fuente en el árbol** **[V]** |
| **Season efectiva** | **S6 Ep3 completo y coherente** | **S6 Kor completo + cáscara de protocolo para S9/S12/S16/S17** **[V]** |
| **Cliente** | Documentado en `docs/02-cliente.md`, resuelto | Tu problema. 6 `.ini` de config en `ClientConfig/`, cero documentación **[V]** |

### Qué ganás realmente yendo de S6 a "S16/S17" con MuEmu **[I]**

Con la evidencia de §2 y §3, la respuesta honesta es: **casi nada de lo que la palabra "S17" te hace
imaginar.**

**Ganás:** que el cliente moderno se conecte y se vea moderno — UI nueva, viewport nuevo, inventario
expandido, Gremory Case, tienda personal con formato nuevo, 15 mapas adicionales habilitados por
`MinSeason`, 167 quests de mundo (solo en S16Kor), y **una** clase nueva creable (Grow Lancer, sin
skills).

**No ganás:** Ruud (economía muerta, §3.1) · Majestic / 4ta clase (clase vacía, §3.2) · Mastery items
(0 menciones) · Artifacts (0 menciones) · Errtel (3 menciones) · Muun real (respuesta enlatada) · Rune
Wizard / Slayer / Gun Crusher (no creables) · árbol de maestría de season alta (es el de S6 renombrado)
· Castle Siege (te desconecta) · Unity Battle Field (0/6 implementado).

**En criollo: ganás el envase de S17 con el contenido de S6, menos Castle Siege, y con la mitad de los
botones del cliente contestando vacío.** Comparado con un S6 Ep3 completo y coherente, es un retroceso
de experiencia de juego disfrazado de avance de versión.

---

## 8. Recomendación

**Quedate en OpenMU. No adoptes MuEmu como servidor.**

No es un descarte por prolijidad — es por las cuatro cosas que encontré leyendo el código:

1. **El "soporte S16/S17" son 18 paquetes sobre ~570** (§2.2). Es compatibilidad de cliente, no season.
2. **La progresión de season alta no existe:** Ruud no se puede ganar (§3.1), Majestic es una clase vacía
   (§3.2), Mastery y Artifacts tienen 0 menciones, y 3 de las 4 clases nuevas no se pueden ni crear
   (§3.3).
3. **`db migrate` borra la base** y el README lo documenta como "actualizar la estructura" (§5.4). Contra
   nuestro estándar de operación —backup antes de tocar nada— es un no rotundo.
4. **Bus factor 1 sobre un proyecto latente** (5 commits en 20 meses) **corriendo en un framework EOL
   desde hace tres años**, con 6 DLLs binarias sin fuente en el camino crítico de serialización.

**Esto confirma y precisa la conclusión de `docs/06`:** MuEmu era la mejor pista disponible de que el
protocolo de seasons altas existe parcialmente en abierto — **y eso sigue siendo cierto y sigue siendo
valioso**. Lo que ahora está verificado es que **esa pista no es un producto**. La recomendación de
`docs/06 §6` —opción **(a)**, quedarse en S6— **se sostiene, ahora con el código a la vista y no por
inferencia.**

**Dónde MuEmu sí tiene valor real [I]:**
- **Como referencia de protocolo.** Si algún día querés extender OpenMU hacia formatos de wire más
  nuevos, `MU.Network/OPCodes.cs` y las 96 clases con sufijo de season son **documentación ejecutable,
  MIT, de cómo cambiaron los paquetes entre S6 y S17**. Eso no existe en ningún otro lado abierto.
- **Como lectura de calibración.** Confirma con números lo que `docs/06` estimó: una persona sola, ocho
  años, 52 KLOC, y el resultado es **S6 completo + fachada**. Es exactamente la curva de costo que
  predice el informe de viabilidad.

**Lo que NO haría:** invertir en contenerizarlo, migrarlo a .NET 8 y envolverle backups **para terminar
con un S6 peor operado que el que ya tenés corriendo.**

---

## 9. Lo que NO pude verificar (dicho, no estimado)

- **Si compila.** No hay `dotnet` en esta máquina y la descarga del instalador fue bloqueada por la
  política de red del entorno. **No compilé el proyecto.** Lo único que sé es que el CI del repo está en
  verde **en Windows con SDK 8**, y que `dotnet test` ahí no prueba nada porque no hay tests.
- **Si corre en Linux.** No hay job de CI de Linux ni Dockerfile en el repo. Mi lectura de que es
  portable (§5.1, §6.1) sale de **ausencia de dependencias Windows** —que sí verifiqué— pero **ausencia
  de evidencia no es prueba de que arranque**. Habría que probarlo.
- **Si un cliente S16/S17 real completa un login end-to-end.** No probé el emulador contra ningún
  cliente. Todo lo de §2 sale de leer el código de serialización, no de tráfico observado. Es
  perfectamente posible que además falten cosas que no se ven leyendo.
- **Calidad de las DLLs de BlubLib.** Verifiqué target framework y origen del PDB; **no las decompilé ni
  las audité**, y no comparé su hash contra ningún release upstream oficial.
- **Cuánto del comportamiento se corrige por archivos de datos.** Buena parte de la configuración vive en
  `Data/*.xml` y `.txt`; revisé los que definen seasons, clases, quests y master level, pero **no audité
  los 306 archivos**.
- **Si el autor tiene trabajo sin publicar.** Hay un Discord linkeado en el README que no consulté. El
  juicio de "latente" sale del repo público únicamente.
- **Comportamiento real del pathfinding bajo carga.** La lectura de §4.2 (tope de ~10 tiles, DFS,
  recursión) sale de leer los 112 renglones; **no lo ejecuté ni lo perfilé.** Está marcada como
  inferencia.

---

**Fuentes:** [Yomalex/MuEmu](https://github.com/Yomalex/MuEmu) — clone completo en HEAD `92d80f9`,
medido el 31/08/2026 · [issues del repo](https://github.com/Yomalex/MuEmu/issues) ·
[CI del repo](https://github.com/Yomalex/MuEmu/actions/workflows/dotnet.yml) ·
`docs/06-viabilidad-season-nueva.md` (calibración contra OpenMU) ·
[Ciclo de vida de .NET Core 3.1 (Microsoft)](https://dotnet.microsoft.com/platform/support/policy/dotnet-core)

— Elaborado por GSG
