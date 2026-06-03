# IMPLEMENTATION_PLAN_BUG-01
# completeMission() nunca se llama — misiones no se marcan COMPLETED en Oracle

**Bug ID:** BUG-01  
**Fecha de análisis:** 2026-06-03  
**Referencia normativa:** BR-PROG-03 (BUSINESS_RULES.md), OBS-01 (DATABASE_MAP.md)  
**Estado:** Pendiente de aprobación  
**Autor del análisis:** Claude Code (claude-sonnet-4-6)

---

## 1. Resumen ejecutivo

La función `completeMission()` existe en `progressService.js` y apunta correctamente al endpoint `POST /progress/complete` de Oracle ORDS. El endpoint existe en Oracle. La tabla `USER_PROGRESS` tiene los campos `is_completed`, `status` y `completed_date` listos para recibir el cambio. La infraestructura completa ya existe — simplemente **nunca se conecta**.

El fix es quirúrgico: **un solo archivo React**, dos bloques de código, una línea de llamada en cada uno.

---

## 2. Diagnóstico del estado actual

### 2.1 Flujo actual cuando progressPercent >= 100

```
TutorChat.jsx (sendMessage | sendTranscriptMessage)
  │
  ├── addNotification("Mission Completed!")     ← UX feedback ✅ (ALT-06)
  ├── setMissionCompleted(true)                 ← guard local ✅ (ALT-06)
  ├── await updateProgress({ progressPercent: 100, isCompleted: true, ... })
  │     └── POST /ords/api/progress/update      ← actualiza métricas ✅
  │           ├── progress_percent = 100
  │           ├── grammar_score, pronunciation_score, tiempo...
  │           └── ⚠️ isCompleted se pasa como parámetro pero NO está
  │               en el payload que construye progressService.js
  │               → Oracle NUNCA recibe el cambio de estado
  │
  └── [completeMission() → NUNCA SE LLAMA]      ← ❌ BUG-01
```

### 2.2 Hallazgo crítico en progressService.js

`updateProgress` recibe `isCompleted` desde TutorChat pero **lo ignora silenciosamente**:

```javascript
// TutorChat.jsx llama con:
await updateProgress({
  ...
  isCompleted: progressPercent >= 100,   // ← pasa el valor
  ...
});

// progressService.js lo desestructura pero nunca lo usa en el payload:
export async function updateProgress({
  idInscripcion, missionId, progressPercent,
  totalXpEarned, totalMessages, totalTimeMinutes,
  grammarScore, pronunciationScore
  // isCompleted ni siquiera está en la firma ← silently dropped
}) {
  const payload = {
    id_inscripcion: idInscripcion,
    mission_id: missionId,
    progress_percent: progressPercent,
    total_xp_earned: totalXpEarned,
    total_messages: totalMessages,
    total_time_minutes: totalTimeMinutes,
    grammar_score: grammarScore,
    // is_completed: ← nunca se incluye
  };
  ...
}
```

Esto confirma que `POST /progress/update` nunca recibe `is_completed`. El único camino para marcar la misión como COMPLETED en Oracle es llamar a `POST /progress/complete` mediante `completeMission()`.

### 2.3 Estado de completeMission() en progressService.js

La función existe, está correcta y es la única que NO se importa ni se llama desde TutorChat:

```javascript
export async function completeMission({ idInscripcion, missionId }) {
  const response = await axios.post(`${API}/complete`, {
    id_inscripcion: idInscripcion,
    mission_id: missionId,
  });
  return response.data;
}
```

### 2.4 Estado del XP de completado en el backend

`chat.py` ya calcula el bonus de +50 XP cuando `progress_percent >= 100`:

```python
xp_earned = calculate_xp(
    grammar_score=grammar_score,
    pronunciation_score=0,
    message_count=1,
    completed=request.progress_percent >= 100   ← ya funciona
)
```

`calculate_xp` en `progress_service.py` ya aplica `xp += 50` cuando `completed=True`. El XP de completado **ya se suma correctamente** vía `add_xp_to_progress`. Solo falta el cambio de status en Oracle.

---

## 3. Análisis de impacto por capa

### 3.1 Archivos React afectados

| Archivo | Tipo de cambio | Descripción |
|---|---|---|
| `src/components/mission/TutorChat.jsx` | **MODIFICAR** | Importar `completeMission` + llamarla en `sendMessage` y `sendTranscriptMessage` cuando `progressPercent >= 100` |

**Ningún otro archivo React se modifica.**

### 3.2 Servicios Python afectados

**Ninguno.** `completeMission` llama directamente a Oracle ORDS desde el frontend, igual que todos los demás servicios de progreso. No pasa por FastAPI.

### 3.3 Packages Oracle afectados

**Desconocidos** — No tenemos acceso al DDL. Sin embargo, el endpoint `POST /progress/complete` está documentado como existente en DATABASE_MAP.md y la tabla `USER_PROGRESS` ya tiene los campos necesarios. Se asume que el package Oracle que implementa el endpoint ya maneja el UPDATE correctamente.

### 3.4 Procedimientos Oracle afectados

**Ninguno nuevo.** El procedimiento detrás de `POST /progress/complete` ya existe. Presumiblemente ejecuta:

```sql
UPDATE USER_PROGRESS
SET    is_completed   = 'Y',
       status         = 'COMPLETED',
       completed_date = SYSDATE
WHERE  id_inscripcion = :id_inscripcion
AND    mission_id     = :mission_id;
```

No se requiere ningún cambio en Oracle.

### 3.5 Endpoints ORDS afectados

| Endpoint | Cambio | Estado |
|---|---|---|
| `POST /progress/complete` | **Ya existe — se empieza a llamar** | Documentado en DATABASE_MAP.md, nunca invocado hasta ahora |
| `POST /progress/update` | Sin cambios | Sigue actualizando métricas como antes |

### 3.6 Tablas Oracle afectadas

| Tabla | Campos modificados | Cambio |
|---|---|---|
| `USER_PROGRESS` | `is_completed`, `status`, `completed_date` | Por primera vez recibirán el valor correcto al completar una misión |

`USER_PROGRESS.is_completed` pasará de `'N'` a `'Y'`. `USER_PROGRESS.status` pasará de `'ACTIVE'` a `'COMPLETED'`. `USER_PROGRESS.completed_date` recibirá la fecha real de completado.

### 3.7 Reglas de negocio afectadas

| Regla | Estado actual | Estado post-fix |
|---|---|---|
| **BR-PROG-03** — Completar misión | ⚠️ Incompleta — `completeMission()` nunca se llama | ✅ Resuelta — se llama al detectar `progressPercent >= 100` |
| **BR-XP-04** — +50 XP al completar | ✅ Ya funciona (vía `chat.py`) | Sin cambios |
| **BR-MISSION-01** — Estados de misión | ⚠️ `COMPLETED` nunca se persiste en Oracle | ✅ Se persiste cuando `progressPercent >= 100` |
| **Regla Vision #2** — USER_PROGRESS es el núcleo pedagógico | ⚠️ Incumplida — `completed_date` y `status` nunca actualizados | ✅ USER_PROGRESS refleja el estado real de completado |
| **Regla Vision #3** — Toda interacción debe persistirse | ⚠️ El completado no se persiste | ✅ El completado se persiste en Oracle |

---

## 4. Cómo funciona actualmente el flujo de grammar score

El grammar score ya NO está hardcodeado a 85. Fue refactorizado en una iteración previa. El flujo actual real es:

```
TutorChat.jsx → POST FastAPI /chat/message
  │
  └── chat.py
        ├── get_tutor_response() → GPT devuelve { reply, correction }
        ├── grammar_score = 55  si correction tiene contenido (error detectado)
        │   grammar_score = 90  si correction es null  (sin errores)
        └── calculate_xp(grammar_score=grammar_score, ...)
              └── if grammar_score >= 80: xp += 10
                  → 90 → BONUS aplicado (sin error)
                  → 55 → sin bonus (con error)

chat.py retorna { reply, correction, grammar_score }
  │
TutorChat.jsx recibe result.grammar_score
  └── updateProgress({ grammarScore: result.grammar_score ?? 90 })
        → POST /ords/api/progress/update
              → USER_PROGRESS.grammar_score = 55 ó 90 (valor real)
```

**Conclusión:** Grammar score es real y significativo. No requiere cambios para BUG-01.

---

## 5. Qué cambios deben realizarse

### 5.1 Único archivo a modificar: `TutorChat.jsx`

**Cambio A — Agregar import de `completeMission`**

```javascript
// ANTES
import {
  startProgress,
  updateProgress,
  getMissionProgress,
} from "../../services/progressService";

// DESPUÉS
import {
  startProgress,
  updateProgress,
  getMissionProgress,
  completeMission,
} from "../../services/progressService";
```

**Cambio B — Refactorizar el bloque de completado en ambas funciones**

Introducir una variable local `justCompleted` que captura la decisión en el momento exacto, antes de que `setMissionCompleted(true)` cambie el estado. Esto permite:
1. Disparar la notificación inmediatamente (UX).
2. Llamar `updateProgress` primero (actualizar métricas).
3. Llamar `completeMission` después (cambiar status), evitando race condition sobre el mismo registro de Oracle.

```javascript
// ANTES (en sendMessage y sendTranscriptMessage)
setProgress(progressPercent);

if (progressPercent >= 100 && !missionCompleted) {
  addNotification({ type: "success", title: "Mission Completed!", ... });
  setMissionCompleted(true);
}

await updateProgress({ ... });

// DESPUÉS (en sendMessage y sendTranscriptMessage)
setProgress(progressPercent);

const justCompleted = progressPercent >= 100 && !missionCompleted;

if (justCompleted) {
  addNotification({ type: "success", title: "Mission Completed!", ... });
  setMissionCompleted(true);
}

await updateProgress({ ... });

if (justCompleted) {
  await completeMission({
    idInscripcion: inscripcion.idInscripcion,
    missionId: mission.id,
  });
}
```

**Por qué `justCompleted` y no repetir `progressPercent >= 100 && !missionCompleted`:**
En el momento en que el segundo `if` se ejecuta, `setMissionCompleted(true)` ya fue llamado. React no actualiza el estado síncronamente, pero la buena práctica es no recalcular la condición — `justCompleted` es la fuente de verdad para esa ejecución del flujo.

**Por qué `completeMission` va DESPUÉS de `updateProgress`:**
Ambos hacen UPDATE sobre el mismo registro `USER_PROGRESS` en Oracle. Ejecutarlos secuencialmente evita cualquier condición de carrera. `updateProgress` actualiza las métricas (XP, mensajes, tiempo, scores). `completeMission` actualiza el status y la fecha. Orden correcto: métricas primero, cierre después.

**Nota TD-A05 — Duplicación inevitable:** El mismo cambio se aplica en `sendMessage` y `sendTranscriptMessage`. Esto es consecuencia directa de la deuda técnica documentada como TD-A05. El refactor de esas dos funciones en un hook compartido está planificado en la Iteración 5 del roadmap.

---

## 6. Riesgos de implementación

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-BUG01-01 | `POST /progress/complete` devuelve error en Oracle (registro no existe, constraint) | Baja | Medio | El `catch` del `try/catch` existente en `sendMessage` captura el error y lo loguea sin romper el UX. El `updateProgress` ya habrá corrido. |
| R-BUG01-02 | Race condition entre `updateProgress` y `completeMission` sobre el mismo registro | Baja | Bajo | Mitigado con ejecución secuencial: `await updateProgress` primero, `await completeMission` después. |
| R-BUG01-03 | `completeMission` se llama en misiones que ya estaban COMPLETED en Oracle | Muy baja | Bajo | El guard `!missionCompleted` lo previene. Si `loadProgress` ya estableció `missionCompleted = true`, `justCompleted` nunca es `true`. |
| R-BUG01-04 | El endpoint Oracle `POST /progress/complete` no existe o tiene un schema diferente | Muy baja | Alto | Documentado en DATABASE_MAP.md como existente. Verificable en pruebas antes de producción. |
| R-BUG01-05 | `completeMission` falla en el backend Oracle y bloquea el flujo de chat | Baja | Medio | El `try/catch` de `sendMessage` absorbe el error. El chat sigue funcionando. Mitigación adicional: si se quiere tolerancia total, usar `.catch(console.error)` en lugar de `await`. |

**Riesgo neto: BAJO.** La infraestructura existe. El código es mínimo. El único riesgo real es que el endpoint Oracle tenga un comportamiento inesperado, lo cual se detecta inmediatamente en las pruebas.

---

## 7. Estrategia de despliegue

BUG-01 no requiere coordinación con el equipo de Oracle ni cambios en el backend Python.

**Orden de implementación (una sola sesión):**

1. Modificar el import en TutorChat.jsx.
2. Refactorizar el bloque de completado en `sendTranscriptMessage` (flujo voz).
3. Refactorizar el bloque de completado en `sendMessage` (flujo texto).
4. Verificar en browser que el Network tab muestra `POST /progress/complete` al completar una misión.

**No requiere:**
- Cambios en Oracle (DDL, packages, procedures).
- Cambios en FastAPI.
- Cambios en `progressService.js` (la función ya está completa).
- Cambios en variables de entorno.
- Migración de datos en Oracle (el UPDATE es idempotente).

---

## 8. Estrategia de pruebas

### 8.1 Prueba principal — Network tab

1. Abrir DevTools → pestaña **Network**.
2. Filtrar por `complete`.
3. Entrar a una misión ACTIVE y enviar 5 mensajes de texto.
4. Al llegar al 100%:
   - **Resultado esperado:** aparece una llamada a `POST /progress/complete` en el Network tab con status `200`.
   - Verificar el payload: `{ id_inscripcion: X, mission_id: Y }`.

### 8.2 Prueba de persistencia — Oracle

1. Completar una misión (5 mensajes).
2. Salir al Dashboard (`/dashboard`).
3. Volver a entrar a la misma misión.
4. **Resultado esperado:** `loadProgress` carga `is_completed = 'Y'` → `setMissionCompleted(true)` → el guard previene que se vuelva a llamar `completeMission`.

### 8.3 Prueba de estado visual — Dashboard

1. Completar una misión.
2. Navegar al Dashboard.
3. **Resultado esperado:** la misión aparece con estado `COMPLETED` en la `MissionCard` (color y badge distintos).
   - Nota: Este cambio depende de que Oracle actualice el campo `status` en la respuesta de `GET /missions/course/:c/:i`. Si el cambio tarda en propagarse, recargar el Dashboard.

### 8.4 Prueba de regresión

- Verificar que los 3 escenarios de ALT-06 (notificaciones) siguen funcionando.
- Verificar que el chat funciona normalmente en mensajes 1-4 (antes del completado).
- Verificar que enviar mensajes adicionales después del completado NO dispara `completeMission` de nuevo.

### 8.5 Prueba de tolerancia a fallos

- Desconectar internet justo antes del mensaje 5.
- **Resultado esperado:** el toast de completado aparece (ya fue disparado antes de `updateProgress`), pero `completeMission` falla silenciosamente sin romper el UX.

---

## 9. Resumen de cambios

```
MODIFICADOS (1 archivo):
  src/components/mission/TutorChat.jsx
    ├── +1 import: completeMission
    ├── sendTranscriptMessage: introducir justCompleted,
    │   llamar completeMission después de updateProgress
    └── sendMessage: mismo cambio (TD-A05 obliga a duplicar)

SIN CAMBIOS:
  src/services/progressService.js    — completeMission() ya existe y es correcta
  backend/app/routes/chat.py         — XP de completado ya funciona
  backend/app/services/*.py          — sin cambios
  Oracle ORDS endpoints              — POST /progress/complete ya existe
  Oracle ADB (tablas/procedures)     — sin cambios de schema
  Resto de componentes React         — sin cambios
```

---

## 10. Impacto pedagógico post-fix

Una vez implementado:

- `USER_PROGRESS.is_completed = 'Y'` se registra en Oracle con la fecha real.
- `USER_PROGRESS.status = 'COMPLETED'` se actualiza en Oracle.
- La lógica de desbloqueo de Oracle (que calcula el estado de las siguientes misiones) puede funcionar correctamente.
- El Dashboard mostrará el estado `COMPLETED` real al recargar misiones.
- Las métricas de progreso en `/progress` reflejarán misiones realmente completadas.
- `completed_missions` en `GET /progress/stats` aumentará correctamente.

Reglas Vision #2 y #3 pasan de incumplidas a cumplidas para el flujo de completado.

---

*Listo para implementación. Esperando aprobación.*
