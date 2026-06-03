# IMPLEMENTATION_PLAN_ALT-01.md
# Plan de Implementación: Página /progress

> **Iniciativa:** ALT-01 — Implementación de la página /progress
> **Fecha de análisis:** 2026-06-03
> **Actualización:** 2026-06-03 — Endpoint `/progress/student` verificado en runtime (ver sección 2.3)
> **Estado actual del sistema:** MVP-01 a MVP-11 completados
> **Prerequisitos cumplidos:** MVP-01 (grammar score real) y MVP-02 (pronunciation score en texto) ya implementados — los datos en Oracle son válidos para nuevas interacciones.
> **Impacto esperado:** Página de analítica pedagógica personal completa para el estudiante

---

## 1. Contexto y Estado Actual

La página `/progress` existe en el router (`AppRouter.jsx`) y está protegida por `ProtectedRoute`, pero su componente (`src/pages/Progress.jsx`) solo renderiza:

```jsx
<MainLayout>
  <h1 className="text-white text-5xl font-bold">Progress</h1>
</MainLayout>
```

Todos los datos necesarios para esta página **ya existen en Oracle ADB** y la mayoría de los endpoints ORDS que los exponen **ya están implementados y siendo usados** por otras partes del sistema. No se necesitan cambios en el schema de Oracle ni en el backend de FastAPI.

---

## 2. Mapa de Datos — Qué existe y dónde vive

### 2.1 Datos globales del estudiante (ya disponibles)

| Campo | Fuente | Ya usado en |
|---|---|---|
| `total_xp` | `GET /progress/stats/:id` | Dashboard.jsx, Sidebar.jsx |
| `level` | `GET /progress/stats/:id` | Dashboard.jsx, Sidebar.jsx |
| `xp_next_level` | `GET /progress/stats/:id` | Dashboard.jsx |
| `completed_missions` | `GET /progress/stats/:id` | Dashboard.jsx |
| `total_missions` | `GET /progress/stats/:id` | Dashboard.jsx |
| `total_time` | `GET /progress/stats/:id` | Dashboard.jsx |
| `avg_progress` | `GET /progress/stats/:id` | Dashboard.jsx, Sidebar.jsx |
| `avg_pronunciation` | `GET /progress/stats/:id` | Dashboard.jsx |
| `avg_grammar` | `GET /progress/stats/:id` | Dashboard.jsx |
| `streakDays` | `authStore.student.streakDays` | Dashboard.jsx (MVP-09) |
| `nombre`, `nivel` | `authStore.student` | Dashboard.jsx, Sidebar.jsx |
| `idInscripcion` | `authStore.inscripcion.idInscripcion` | Todos los servicios |
| `idCurso` | `authStore.inscripcion.idCurso` | Dashboard.jsx |

### 2.2 Datos por misión (requieren llamadas adicionales)

| Campo | Fuente | Ya usado en |
|---|---|---|
| Lista de misiones con status | `GET /missions/course/:c/:i` | Dashboard.jsx |
| `progress_percent` por misión | `GET /progress/mission/:id/:missionId` | TutorChat.jsx (al entrar) |
| `grammar_score` por misión | `GET /progress/mission/:id/:missionId` | TutorChat.jsx (al entrar) |
| `pronunciation_score` por misión | `GET /progress/mission/:id/:missionId` | TutorChat.jsx (al entrar) |
| `total_xp_earned` por misión | `GET /progress/mission/:id/:missionId` | TutorChat.jsx (al entrar) |
| `total_time_minutes` por misión | `GET /progress/mission/:id/:missionId` | TutorChat.jsx (al entrar) |
| `total_messages` por misión | `GET /progress/mission/:id/:missionId` | TutorChat.jsx (al entrar) |
| `is_completed` por misión | `GET /progress/mission/:id/:missionId` | TutorChat.jsx (al entrar) |

### 2.3 Endpoint `GET /progress/student/:id_inscripcion` — Verificado en runtime

El endpoint **existe** y responde correctamente. Sin embargo, su respuesta real difiere de lo que el backlog asumía:

**Respuesta real verificada:**
```json
{
  "items": [
    {
      "total_missions": 5,
      "completed_missions": 3,
      "total_xp": 370,
      "total_time": 58,
      "avg_grammar": 66.666...,
      "avg_pronunciation": 85.033...
    }
  ],
  "first": { "$ref": "..." }
}
```

**Conclusión:** Este endpoint devuelve **datos agregados globales**, no el desglose por misión. Es funcionalmente un duplicado parcial de `GET /progress/stats/:id_inscripcion` con campos distintos y sin `level`, `xp_next_level` ni `avg_progress`.

**Comparación de ambos endpoints de estadísticas:**

| Campo | `/progress/stats/:id` | `/progress/student/:id` |
|---|---|---|
| `total_xp` | ✅ | ✅ |
| `level` | ✅ | ❌ |
| `xp_next_level` | ✅ | ❌ |
| `completed_missions` | ✅ | ✅ |
| `total_missions` | ✅ | ✅ |
| `total_time` | ✅ | ✅ |
| `avg_progress` | ✅ | ❌ |
| `avg_pronunciation` | ✅ | ✅ |
| `avg_grammar` | ✅ | ✅ |

**Decisión:** Para KPIs globales se usa `GET /progress/stats/:id_inscripcion` — tiene más campos y ya está en `dashboardService.js`. El endpoint `/progress/student` no se usará en esta implementación.

**Impacto en la estrategia:** Para datos por misión NO existe un endpoint de consulta masiva. La estrategia de datos por misión es **N+1 con `Promise.all`** usando `GET /progress/mission/:id_inscripcion/:missionId` para cada misión no LOCKED. Esto ya estaba documentado como fallback — ahora es la estrategia principal.

---

## 3. Análisis de Impacto Arquitectónico

### 3.1 Archivos React afectados

| Archivo | Tipo de cambio | Descripción |
|---|---|---|
| `src/pages/Progress.jsx` | **Reescritura completa** | De `<h1>Progress</h1>` a página funcional completa |
| `src/services/progressService.js` | **Adición** | Nueva función `getStudentProgress(idInscripcion)` |
| `src/components/progress/MissionProgressRow.jsx` | **Creación nueva** | Componente de fila de progreso por misión |

### 3.2 Servicios Python afectados

**Ninguno.** La página `/progress` es de solo lectura. No requiere ningún cambio en el backend de FastAPI. Todos los datos se obtienen directamente de Oracle ORDS (patrón actual de la aplicación).

### 3.3 Packages Oracle afectados

**Ninguno en la implementación base.** La página lee datos existentes.

**Condicionalmente:** si `GET /progress/student/:id_inscripcion` no existe, habrá que evaluar si crear el endpoint. Esto sí requeriría:
- Modificar el package `PKG_PROGRESS` o crear `PKG_PROGRESS_STUDENT` en Oracle ADB
- Crear el handler ORDS correspondiente
- Coordinación con el DBA del equipo

### 3.4 Procedimientos afectados

**Ninguno.** Solo lectura de `USER_PROGRESS`.

### 3.5 Endpoints ORDS afectados

| Endpoint | Tipo de uso | Cambio |
|---|---|---|
| `GET /progress/stats/:id_inscripcion` | **Reutilización** | Ya en `dashboardService.js`. Se reutiliza. Sin cambio. |
| `GET /missions/course/:idCurso/:idInscripcion` | **Reutilización** | Ya en `missionService.js`. Se reutiliza. Sin cambio. |
| `GET /progress/student/:id_inscripcion` | **Descartado** | ✅ Verificado: devuelve agregados globales. Redundante con `/stats`. No se usa. |
| `GET /progress/mission/:id/:missionId` | **Uso nuevo — estrategia principal** | Ya en `progressService.js`. Se usa en `Promise.all` para datos por misión. |

### 3.6 Tablas Oracle afectadas

| Tabla | Tipo de acceso | Campos leídos |
|---|---|---|
| `USER_PROGRESS` | **Solo lectura** | `progress_percent`, `grammar_score`, `pronunciation_score`, `total_xp_earned`, `total_time_minutes`, `total_messages`, `is_completed`, `completed_date` |
| `MISSIONS` | **Solo lectura (indirecto)** | Via endpoint `/missions/course` |
| `TOPICS` | **Solo lectura (indirecto)** | Via endpoint `/missions/course` |
| `INSCRIPCIONES` | **Solo lectura (indirecto)** | Via `authStore` |

### 3.7 Reglas de negocio afectadas

| ID | Regla | Impacto |
|---|---|---|
| BR-SYS-01 | Oracle ADB es la fuente de verdad | ✅ Cumplida — la página solo lee de Oracle |
| BR-XP-05 | XP calculado por Oracle | ✅ Se muestra `total_xp` de Oracle, no se recalcula |
| BR-PROG-04 | El progreso debe ser medible | ✅ Esta página **materializa** esta regla para el estudiante |
| BR-PRON-05 | Persistencia acumulativa (regla oficial) | ⚠️ La página muestra el último `pronunciation_score` por misión, no un historial acumulativo. Limitación conocida. |

---

## 4. Cómo Funciona Actualmente el Flujo de Grammar Score

### 4.1 Flujo completo (estado actual, después de MVP-01)

```
ESTUDIANTE ESCRIBE UN MENSAJE
          │
          ▼
TutorChat.jsx → sendMessage()
          │
          ├─ POST /ords/api/chat/message   ← guarda mensaje del estudiante en Oracle
          │
          ├─ POST localhost:8000/chat/message
          │       │
          │       ├─ chatRequest = { mission, message, history[-10:] }
          │       │
          │       └─ openai_service.py → get_tutor_response()
          │               │
          │               └─ GPT responde:
          │                   {
          │                     "reply": "...",
          │                     "correction": { original, corrected, explanation } | null
          │                   }
          │
          │   FastAPI → chat.py → calcula:
          │       grammar_score = 90   si correction is None   (buena gramática)
          │       grammar_score = 55   si correction != None    (error detectado)
          │
          ▼
TutorChat.jsx recibe { reply, correction, grammar_score }
          │
          ├─ POST /ords/api/chat/message   ← guarda respuesta del tutor + correction JSON
          │
          ├─ POST /ords/api/progress/update
          │       payload:
          │       {
          │         id_inscripcion: ...,
          │         mission_id: ...,
          │         progress_percent: min(messages * 10, 100),
          │         total_xp_earned: messages * 5,
          │         total_messages: messages,
          │         total_time_minutes: previousTime + sessionElapsed,   ← MVP-05
          │         grammar_score: grammar_score,                        ← MVP-01 (real: 90 o 55)
          │         // pronunciation_score: omitido en texto             ← MVP-02
          │       }
          │
          └─ Oracle actualiza USER_PROGRESS.GRAMMAR_SCORE
```

### 4.2 Lo que el endpoint /progress/stats devuelve

`GET /progress/stats/:id_inscripcion` calcula en Oracle:
- `avg_grammar` = promedio de `GRAMMAR_SCORE` de todos los USER_PROGRESS del estudiante
- Antes de MVP-01: siempre 85.0
- Después de MVP-01: mezcla de valores reales (90/55) para nuevas interacciones + 85 histórico

### 4.3 Implicación para la página /progress

Los datos mostrados son reales para las interacciones posteriores a MVP-01 y MVP-02. Los registros históricos previos tendrán `grammar_score = 85` (corrompidos). La página debe mostrarse tal como están los datos en Oracle sin intentar "limpiar" los históricos.

---

## 5. Cambios a Realizar — Especificación Técnica

### 5.1 PASO 1 — ✅ Verificación del endpoint completada

**Resultado verificado en runtime:**

`GET /progress/student/:id_inscripcion` existe pero devuelve estadísticas globales agregadas, no desglose por misión. No reemplaza la necesidad de `GET /progress/mission/:id/:missionId`.

**Estrategia de datos por misión confirmada:** `Promise.all` de llamadas individuales a `GET /progress/mission/:id_inscripcion/:missionId` para cada misión con status `ACTIVE` o `COMPLETED`. Las misiones `LOCKED` se omiten de la carga de progreso.

**Estimación de llamadas paralelas:** En el sistema actual hay 5 misiones, 3 completadas. La carga de progreso hará máximo 5 llamadas paralelas — completamente manejable por Oracle ORDS.

---

### 5.2 PASO 2 — Agregar función en `progressService.js`

**Archivo:** `src/services/progressService.js`

**Adición** (no modifica funciones existentes):

```javascript
export async function getAllMissionsProgress(idInscripcion, missions) {
  const practicedMissions = missions.filter(m => m.status !== 'LOCKED');
  const results = await Promise.all(
    practicedMissions.map(m => getMissionProgress(idInscripcion, m.missionId))
  );
  // Devuelve un objeto indexado por missionId para lookup O(1) en el render
  return practicedMissions.reduce((acc, m, i) => {
    acc[m.missionId] = results[i];
    return acc;
  }, {});
}
```

**Notas de diseño:**
- Reutiliza `getMissionProgress` (ya existe en el mismo archivo) sin duplicar la URL.
- Las misiones `LOCKED` se omiten porque no tienen registro en `USER_PROGRESS`.
- El resultado es un objeto `{ [missionId]: progressData }` para acceso directo en el render sin `.find()` por cada fila.
- Si una misión practicada no tiene registro en Oracle (edge case), `getMissionProgress` devuelve vacío — `MissionProgressRow` lo maneja con valores nulos.

---

### 5.3 PASO 3 — Crear componente `MissionProgressRow.jsx`

**Archivo nuevo:** `src/components/progress/MissionProgressRow.jsx`

Responsabilidad: renderizar una fila de progreso por misión con:
- Nombre de la misión, nivel CEFR
- Barra de progreso con `progress_percent`
- Badge de estado (ACTIVE / COMPLETED / LOCKED)
- Score de gramática con color semáforo (rojo < 60, amarillo 60-79, verde >= 80)
- Score de pronunciación con color semáforo (mismo criterio)
- XP ganado en esta misión
- Tiempo de estudio

**Props del componente:**
```jsx
<MissionProgressRow
  mission={missionObject}        // de getMissions()
  progress={progressObject}      // de getStudentProgress() o getMissionProgress()
/>
```

---

### 5.4 PASO 4 — Implementar `Progress.jsx` completo

**Archivo:** `src/pages/Progress.jsx` — Reescritura completa.

**Estructura de la página:**

```
/progress
├── Header: "Learning Analytics" + subtítulo con nombre del estudiante
│
├── Section 1: Global KPIs (grid 2×3 o 2×4)
│   ├── Nivel actual + barra XP hacia siguiente nivel
│   ├── XP total acumulado
│   ├── Tiempo de estudio total
│   ├── Racha de días (streakDays)
│   ├── Pronunciación promedio (avg_pronunciation) — barra coloreada
│   └── Gramática promedio (avg_grammar) — barra coloreada
│
├── Section 2: Progreso de Misiones (agrupadas por topic)
│   ├── Topic header (como en Dashboard)
│   └── MissionProgressRow × N (una por misión)
│       ├── Barra de progreso individual
│       ├── Grammar score badge
│       ├── Pronunciation score badge
│       └── XP + tiempo de esta misión
│
└── Footer info: nota sobre datos reales desde MVP-01/MVP-02
```

**Lógica de carga de datos (dos fases secuenciales):**

```javascript
useEffect(() => {
  async function loadProgressData() {
    setLoading(true);
    try {
      // Fase 1: stats globales + lista de misiones (paralelas entre sí)
      const [statsData, missionsData] = await Promise.all([
        getDashboardStats(inscripcion.idInscripcion),
        getMissions(inscripcion.idCurso, inscripcion.idInscripcion),
      ]);
      setStats(statsData);
      setMissions(missionsData);

      // Fase 2: progreso por misión (requiere missionsData para saber qué IDs pedir)
      // N+1 paralelas — solo misiones no LOCKED
      const progressMap = await getAllMissionsProgress(
        inscripcion.idInscripcion,
        missionsData
      );
      setMissionProgressMap(progressMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  if (inscripcion) loadProgressData();
}, [inscripcion]);
```

**Uso en render:**
```javascript
// progressMap = { [missionId]: { progress_percent, grammar_score, ... } }
const progress = missionProgressMap[mission.missionId] || null;
```

---

## 6. Riesgos de Implementación

### RIESGO-01 — ✅ RESUELTO — Endpoint `/progress/student` verificado

**Estado:** Endpoint verificado en runtime el 2026-06-03. Existe y responde 200.

**Hallazgo:** El endpoint devuelve estadísticas globales agregadas (no desglose por misión). Se descarta como fuente de datos por misión.

**Decisión adoptada:** Estrategia N+1 con `Promise.all` sobre `GET /progress/mission/:id/:missionId`. Con el volumen actual de misiones (5 total, 3-5 practicadas), el impacto de rendimiento es negligible. La función `getAllMissionsProgress()` encapsula este patrón.

---

### RIESGO-02 — Datos históricos corrompidos por grammar_score = 85 (MEDIO)

**Descripción:** Misiones practicadas antes de MVP-01 tienen `grammar_score = 85` en Oracle. La página mostrará este valor ficticio para misiones ya completadas.

**Probabilidad:** Alta — cualquier misión practicada antes del 2026-06-01 tiene datos corruptos.

**Mitigación:**
- No intentar "limpiar" los datos históricos en el frontend.
- Mostrar los datos tal como están, con un indicador visual de "datos reales desde [fecha]" si se desea.
- No bloquear el lanzamiento de la página por este motivo — los datos mejorarán con el tiempo conforme los estudiantes practiquen.

**Impacto:** El `avg_grammar` del Dashboard y de la página de progreso reflejará una mezcla de datos ficticios y reales mientras existan registros históricos. Es una limitación conocida y documentada.

---

### RIESGO-03 — Triple llamada a `getDashboardStats` (BAJO-MEDIO)

**Descripción:** `Sidebar.jsx` ya llama a `getDashboardStats`. `Dashboard.jsx` también. Si `Progress.jsx` agrega una tercera llamada, el problema TD-A11 se agrava.

**Probabilidad:** Alta si se implementa sin considerar la deuda técnica.

**Mitigación:**
1. **Opción simple (recomendada para esta iteración):** Aceptar la triple llamada temporalmente. El impacto de 3 llamadas de lectura en lugar de 2 es mínimo en desarrollo.
2. **Opción correcta:** Implementar ALT-09 (store centralizado para dashboardStats) antes o en paralelo con ALT-01.
3. La página `/progress` solo carga cuando el usuario navega ahí — no es una llamada que ocurra en cada render global como la del Sidebar.

---

### RIESGO-04 — Misiones LOCKED sin registro en USER_PROGRESS (BAJO)

**Descripción:** Las misiones con status `LOCKED` no tienen registro en `USER_PROGRESS` (nunca han sido iniciadas). El endpoint `GET /progress/mission/:id/:missionId` puede devolver vacío o error para estas misiones.

**Mitigación:**
- Filtrar las misiones LOCKED antes de hacer llamadas de progreso.
- `MissionProgressRow` para misiones LOCKED muestra estado "Locked" sin intentar mostrar scores.
- El `progress` prop sería `null` para estas misiones.

---

### RIESGO-05 — Carga N+1 por misión (BAJO)

**Descripción:** No existe un endpoint de consulta masiva de progreso por misión. Se usan N llamadas paralelas.

**Contexto:** El sistema actual tiene 5 misiones. A 15-20 misiones (escenario futuro), el `Promise.all` de 20 llamadas paralelas sigue siendo manejable.

**Mitigación:**
- `Promise.all` ya paraleliza todas las llamadas — no es N+1 secuencial, sino N simultáneo.
- Estado de `loading` con skeleton mientras resuelven.
- Si en el futuro el catálogo crece a 50+ misiones, se deberá pedir al DBA un endpoint de batch. Hoy no es un problema.

---

### RIESGO-06 — Pronunciación sin historial acumulativo (INFORMATIVO)

**Descripción:** `USER_PROGRESS.pronunciation_score` guarda el último score, no un historial. La página mostrará "el último score de pronunciación" por misión, no una evolución.

**Impacto:** Limitación pedagógica — no se puede mostrar "estabas en 60%, ahora estás en 80%". La tabla `SPEAKING_ANALYSIS` en Oracle podría resolver esto (BAJ-03), pero está fuera del scope de ALT-01.

**Mitigación:** Documentar la limitación en la UI con texto claro ("Pronunciation score for most recent voice session").

---

## 7. Estrategia de Despliegue

### 7.1 Orden de implementación

```
DÍA 1 — Verificación y backend
  └─ Verificar si GET /progress/student/:id_inscripcion existe y su estructura

DÍA 2 — Capa de servicios
  └─ Agregar getStudentProgress() en progressService.js
  └─ Prueba unitaria manual del endpoint

DÍA 3 — Componente de fila
  └─ Crear MissionProgressRow.jsx
  └─ Probar con datos mock

DÍA 4 — Página principal
  └─ Implementar Progress.jsx completo
  └─ Integrar con datos reales de Oracle

DÍA 5 — Testing y ajustes
  └─ Probar con student real
  └─ Verificar estados de carga y error
  └─ Ajustes de UI/UX
```

### 7.2 Criterio de "listo para mostrar"

La página está lista cuando:
1. Carga sin errores de consola para cualquier `idInscripcion` válido.
2. Muestra datos globales (stats) incluso si el endpoint de progreso por misión falla.
3. Muestra correctamente misiones en todos los estados (LOCKED, ACTIVE, COMPLETED).
4. Maneja el estado de carga (spinner o skeleton) mientras se resuelven las llamadas.
5. Muestra un mensaje de error amigable si Oracle no responde.

### 7.3 Compatibilidad con el sistema actual

- **Sin cambios al router:** `/progress` ya está en `AppRouter.jsx` y `ProtectedRoute`.
- **Sin cambios al store:** se usa `authStore` en modo solo lectura.
- **Sin cambios a otros componentes:** `Sidebar.jsx`, `Dashboard.jsx`, `TutorChat.jsx` no se modifican.
- **Sin cambios al backend:** FastAPI no se toca.
- **Sin cambios al DDL:** Oracle no se toca (si el endpoint ya existe).

---

## 8. Estrategia de Pruebas

### 8.1 Pruebas funcionales (manuales)

| Escenario | Dato a verificar | Resultado esperado |
|---|---|---|
| Estudiante con 0 misiones activas | Stats globales | Muestra 0s / "No missions started yet" |
| Estudiante con misiones ACTIVE y COMPLETED | Sección por misión | Filas correctas por topicTitle, sin LOCKED sin datos |
| Misión COMPLETED con grammar_score = 85 (histórico) | Fila de misión | Muestra 85 sin crash ni error |
| Misión ACTIVE con pronunciación real | Barra de pronunciación | Score > 0 mostrado correctamente |
| Oracle no responde (red cortada) | Estado de error | Mensaje de error, no pantalla blanca |
| Sin misiones practicadas | Sección por misión | Vacío o mensaje "Start practicing to see your progress" |

### 8.2 Pruebas de datos

Verificar en el DevTools de Chrome → Network:
- `GET /progress/stats/:id` responde 200 con todos los campos esperados.
- `GET /progress/student/:id` (si existe) responde 200 con array `items[]`.
- `GET /missions/course/:c/:i` responde 200 con la lista completa.

### 8.3 Pruebas de UI/UX

- La página carga en < 2 segundos en red local.
- Los colores semáforo de grammar y pronunciation son correctos (rojo/amarillo/verde).
- Las barras de progreso no exceden el 100%.
- El nivel de XP se calcula como `FLOOR(total_xp / 200) + 1` (debe coincidir con el valor de `stats.level`).
- La página se ve correctamente en mobile (diseño responsive).

---

## 9. Diseño Propuesto de la Página

### 9.1 Sección Global KPIs

```
┌─────────────────────────────────────────────────────────────────────┐
│  Learning Analytics                                                  │
│  Tracking your English journey, {nombre}                            │
└─────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│  Level Badge                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │  LEVEL {N}   ████████████░░░░░  {total_xp} / {xp_next_level} XP       │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘

┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│  Study Time    │ │  Streak        │ │  Pronunciation │ │  Grammar       │
│  {total_time}  │ │  {streak} Days │ │  {avg_pron}%   │ │  {avg_grammar}%│
│      min       │ │                │ │  ██████░░░░    │ │  ████████░░    │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
```

### 9.2 Sección Progreso por Misión

```
── Daily Life ─────────────────────────────────────────────────────────

Mission 1: Greetings and Introductions           ✅ COMPLETED
Progress ████████████████████ 100%
Grammar ████████░░ 82%   Pronunciation ██████░░░░ 67%   XP: 95   Time: 12 min

Mission 2: At the Café                           🔵 ACTIVE
Progress ██████████░░░░░░░░░░ 50%
Grammar ██████████ 90%   Pronunciation ──────────  --   XP: 45   Time: 8 min

Mission 3: Talking About Family                  🔒 LOCKED
(Complete Mission 2 to unlock)
```

### 9.3 Colores semáforo para scores

```
< 60%  → texto/barra rojo   (text-red-400 / bg-red-500)
60-79% → texto/barra amarillo (text-yellow-400 / bg-yellow-500)
≥ 80%  → texto/barra verde  (text-green-400 / bg-green-500)
null   → texto gris         (text-zinc-500) "No data"
```

---

## 10. Tabla Resumen de Impacto

### Archivos React afectados

| Archivo | Cambio | Prioridad |
|---|---|---|
| `src/pages/Progress.jsx` | Reescritura completa (principal) | Alta |
| `src/services/progressService.js` | Agregar `getStudentProgress()` | Alta |
| `src/components/progress/MissionProgressRow.jsx` | Crear componente nuevo | Alta |

### Servicios Python afectados

| Archivo | Cambio |
|---|---|
| *(ninguno)* | — |

### Packages Oracle afectados

| Package | Cambio | Condición |
|---|---|---|
| `PKG_PROGRESS` o equivalente | Crear handler ORDS para `GET /progress/student/:id` | Solo si el endpoint NO existe |

### Procedimientos afectados

| Procedimiento | Cambio |
|---|---|
| *(ninguno)* | — |

### Endpoints ORDS afectados

| Endpoint | Cambio |
|---|---|
| `GET /progress/stats/:id_inscripcion` | Reutilización (sin cambio) |
| `GET /missions/course/:c/:i` | Reutilización (sin cambio) |
| `GET /progress/student/:id_inscripcion` | ✅ Verificado — descartado (devuelve agregados, redundante con /stats) |
| `GET /progress/mission/:id/:missionId` | Uso nuevo — estrategia principal para datos por misión (sin cambio al endpoint) |

### Tablas Oracle afectadas

| Tabla | Cambio |
|---|---|
| `USER_PROGRESS` | Solo lectura |
| `MISSIONS` | Solo lectura (indirecto via endpoint) |
| `TOPICS` | Solo lectura (indirecto via endpoint) |

### Reglas de negocio afectadas

| Regla | Estado |
|---|---|
| Oracle ADB es la fuente de verdad (BR-SYS-01) | ✅ Cumplida |
| USER_PROGRESS es el núcleo pedagógico (Regla #2) | ✅ Materializada visualmente |
| El progreso debe ser medible (Regla #4) | ✅ Esta página implementa la visibilidad de esa regla |
| XP basado en desempeño real (Regla #5) | ✅ Se muestra el XP real de Oracle |

---

## 11. Decisiones Técnicas Pendientes (requieren confirmación)

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | ¿Verificar `GET /progress/student` antes de implementar? | (a) Sí, primer paso; (b) Asumir que existe | **Opción (a) — obligatoria** |
| D2 | Si el endpoint no existe, ¿crear en Oracle o usar N+1? | (a) Crear endpoint (coordinación DBA); (b) N+1 con Promise.all | **Opción (b) inicialmente — más rápido** |
| D3 | ¿Resolver TD-A11 (triple stats call) en este sprint? | (a) Sí, implementar ALT-09 primero; (b) Diferir | **Opción (b) — diferir para no aumentar scope** |
| D4 | ¿Mostrar datos históricos corruptos con disclaimer? | (a) Mostrar tal cual; (b) Agregar nota explicativa | **Opción (b) — nota discreta en UI** |
| D5 | ¿Diseño de MissionProgressRow: tabla o cards? | (a) Filas de tabla; (b) Cards verticales | **Opción (a) — más compacto y escaneable** |

---

## 12. Estimación

| Tarea | Tiempo estimado |
|---|---|
| Verificación del endpoint `GET /progress/student` | 30 min |
| `getStudentProgress()` en progressService.js | 30 min |
| `MissionProgressRow.jsx` componente | 2 horas |
| `Progress.jsx` implementación completa | 4 horas |
| Testing con datos reales + ajustes | 3 horas |
| **Total** | **~1.5 días netos** |

**Estimación del backlog (ALT-01):** "Mediana (1 semana)" — incluye diseño, pruebas con datos reales y potencial coordinación con DBA si el endpoint no existe. La estimación real depende de si `GET /progress/student` existe.

---

## 13. Prerequisitos Verificados

- [x] MVP-01 — Grammar score real implementado
- [x] MVP-02 — Pronunciation score en texto implementado
- [x] MVP-05 — Tiempo de estudio real implementado
- [x] MVP-09 — Streak desde Oracle implementado
- [x] Ruta `/progress` en AppRouter.jsx ✅
- [x] ProtectedRoute en `/progress` ✅
- [x] Link en Sidebar hacia `/progress` ✅
- [x] Verificar `GET /progress/student/:id_inscripcion` ← **COMPLETADO 2026-06-03** — devuelve agregados globales; descartado para datos por misión

---

## 14. Estrategia de datos confirmada — Lista para implementar

Todos los prerequisitos están cumplidos. La estrategia de datos queda así:

| Sección de la página | Fuente de datos | Llamadas |
|---|---|---|
| KPIs globales (XP, nivel, scores, tiempo) | `GET /progress/stats/:id_inscripcion` | 1 |
| Lista de misiones agrupadas por topic | `GET /missions/course/:c/:i` | 1 |
| Datos por misión (progreso, scores, XP, tiempo) | `GET /progress/mission/:id/:missionId` × N | N paralelas via `Promise.all` |
| Nombre, streak, nivel CEFR del estudiante | `authStore.student` | 0 (ya en memoria) |

**Total de llamadas de red al cargar `/progress`:** 2 + N (donde N = misiones no LOCKED, actualmente 3-5).

El plan está listo para implementar en cuanto se dé la aprobación.
