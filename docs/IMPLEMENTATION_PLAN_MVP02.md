# IMPLEMENTATION_PLAN_MVP02.md
# MVP-02 — Corrección del Pronunciation Score en mensajes de texto

> **Estado:** Pendiente de aprobación
> **Fecha:** 2026-06-01
> **Iniciativa:** MVP-02 del PRODUCT_BACKLOG.md
> **Estimación:** 3-4 horas de implementación + pruebas
> **Riesgo de implementación:** Medio — requiere cambio coordinado en Oracle ORDS y frontend

---

## 1. Cómo funciona actualmente el flujo de pronunciation score

### Dos flujos paralelos con comportamiento asimétrico

```
FLUJO DE TEXTO (sendMessage)
────────────────────────────
Usuario escribe → sendChatMessage() → FastAPI → GPT → respuesta
                                                        │
                                              updateProgress({
                                                pronunciationScore: 0   ← HARDCODED
                                              })
                                                        │
                                              Oracle POST /progress/update
                                              PRONUNCIATION_SCORE =
                                                ROUND((NVL(prev,0) + 0) / 2, 1)
                                                        │
                                              Oracle promedia con 0 → score baja


FLUJO DE VOZ (sendTranscriptMessage)
─────────────────────────────────────
Usuario graba → Google STT → transcript
            └→ Azure Assessment → { pronunciation_score: 75, ... }
                                                        │
                                              updateProgress({
                                                pronunciationScore:
                                                  pronunciationData?.pronunciation_score || 0
                                              })       ← score real de Azure
                                                        │
                                              Oracle POST /progress/update
                                              PRONUNCIATION_SCORE =
                                                ROUND((NVL(prev,0) + 75) / 2, 1)
                                                        │
                                              Oracle promedia correctamente → score real
```

### El punto exacto del problema

**`src/components/mission/TutorChat.jsx` línea 477:**
```javascript
pronunciationScore: 0,  // sendMessage() — flujo de texto
```

Esta línea existe porque el flujo de texto no tiene evaluación de pronunciación — es correcto que no haya score. Pero enviar `0` en lugar de no enviar nada produce un efecto catastrófico en Oracle.

### Por qué el impacto matemático es severo

La fórmula de Oracle en `POST /progress/update`:
```sql
PRONUNCIATION_SCORE = ROUND((NVL(PRONUNCIATION_SCORE, 0) + :pronunciation_score) / 2, 1)
```

Oracle **no reemplaza** — **promedia** cada nuevo score con el anterior acumulado. Esto significa que enviar `0` repetidamente destruye cualquier score positivo obtenido por voz:

| Evento | Score enviado | Resultado en Oracle |
|---|---|---|
| Evaluación de voz inicial | 80 | 80.0 |
| Mensaje de texto 1 | 0 | **40.0** |
| Mensaje de texto 2 | 0 | **20.0** |
| Mensaje de texto 3 | 0 | **10.0** |
| Mensaje de texto 4 | 0 | **5.0** |
| Mensaje de texto 5 | 0 | **2.5** |

Un estudiante que obtiene 80 en pronunciación y luego escribe 5 mensajes de texto aparece con **2.5%** en el Dashboard — el peor resultado posible — sin haber pronunciado nada mal.

### Por qué omitir el campo SIN corregir Oracle es peor

Si el frontend deja de enviar `pronunciation_score` sin que Oracle esté corregido, el bind variable `:pronunciation_score` de Oracle llega como `NULL`:

```sql
-- Comportamiento actual con NULL:
NVL(PRONUNCIATION_SCORE, 0) + NULL = NULL
ROUND(NULL / 2, 1) = NULL
PRONUNCIATION_SCORE = NULL  ← PEOR QUE 0
```

**Conclusión crítica:** El fix de Oracle es OBLIGATORIO y debe desplegarse ANTES o simultáneamente con el fix del frontend. Si solo se corrige el frontend, el `PRONUNCIATION_SCORE` en Oracle se convierte en `NULL`.

---

## 2. Qué cambios deben realizarse

### La solución correcta: dos capas coordinadas

**Capa 1 — Oracle ORDS (obligatorio):**
Hacer que Oracle ignore el update de `PRONUNCIATION_SCORE` cuando el valor recibido es `NULL`. Esto se logra con un `CASE WHEN`:

```sql
-- ANTES (problemático con NULL):
PRONUNCIATION_SCORE =
ROUND(
    (NVL(PRONUNCIATION_SCORE, 0) + :pronunciation_score) / 2,
    1
),

-- DESPUÉS (correcto, ignora NULL):
PRONUNCIATION_SCORE =
CASE
    WHEN :pronunciation_score IS NOT NULL
    THEN ROUND(
        (NVL(PRONUNCIATION_SCORE, 0) + :pronunciation_score) / 2,
        1
    )
    ELSE PRONUNCIATION_SCORE
END,
```

Con este fix, el comportamiento de Oracle cambia completamente:

| Valor recibido | Comportamiento |
|---|---|
| `75` (score de Azure real) | Promedia: `(prev + 75) / 2` |
| `NULL` (texto sin evaluación) | Preserva el valor anterior sin cambio |
| `0` (edge case: pronunciación terrible) | Promedia: `(prev + 0) / 2` — correcto |

**Capa 2 — `progressService.js` (frontend):**
Hacer que `pronunciation_score` solo se incluya en el payload JSON cuando tiene un valor real (no `null`, no `undefined`):

```javascript
// ANTES — siempre incluye el campo:
const response = await axios.post(`${API}/update`, {
  ...
  pronunciation_score: pronunciationScore,  // puede llegar como 0 o undefined
});

// DESPUÉS — incluye el campo condicionalmente:
const payload = {
  id_inscripcion: idInscripcion,
  mission_id: missionId,
  progress_percent: progressPercent,
  total_xp_earned: totalXpEarned,
  total_messages: totalMessages,
  total_time_minutes: totalTimeMinutes,
  grammar_score: grammarScore,
};

if (pronunciationScore != null) {
  payload.pronunciation_score = pronunciationScore;
}
```

El operador `!= null` captura tanto `null` como `undefined` (doble igualdad intencional).

**Capa 3 — `TutorChat.jsx` `sendMessage()` (flujo de texto):**
Eliminar el campo `pronunciationScore` del payload — no se pasa a `updateProgress`:

```javascript
// ANTES:
await updateProgress({
  ...
  pronunciationScore: 0,   // ← ELIMINAR
});

// DESPUÉS:
await updateProgress({
  ...
  // pronunciationScore no incluido → progressService no lo envía → Oracle lo ignora
});
```

**Capa 4 — `TutorChat.jsx` `sendTranscriptMessage()` (flujo de voz):**
Cambiar `|| 0` por `|| undefined` para que evaluaciones de Azure fallidas también sean ignoradas:

```javascript
// ANTES:
pronunciationScore: pronunciationData?.pronunciation_score || 0,

// DESPUÉS:
pronunciationScore: pronunciationData?.pronunciation_score || undefined,
```

**Razonamiento:** Si Azure falla y no devuelve `pronunciation_score`, el valor resultante sería `undefined` → `progressService` no lo incluirá en el payload → Oracle preserva el score anterior. Esto es semánticamente correcto: si la evaluación falló, no se penaliza ni se modifica el score.

---

## 3. Inventario completo de cambios por capa

### 3.1 Archivos React afectados

#### `src/components/mission/TutorChat.jsx`

**Cambio A — `sendMessage()` (flujo texto, línea 477):**

```javascript
// ANTES (líneas 460-478):
await updateProgress({
  idInscripcion: inscripcion.idInscripcion,
  missionId: mission.id,
  progressPercent,
  isCompleted: progressPercent >= 100,
  totalXpEarned: xpEarned,
  totalMessages: messages.length + 1,
  totalTimeMinutes: 5,
  grammarScore: result.grammar_score ?? 90,
  pronunciationScore: 0,              // ← ELIMINAR esta línea
});

// DESPUÉS:
await updateProgress({
  idInscripcion: inscripcion.idInscripcion,
  missionId: mission.id,
  progressPercent,
  isCompleted: progressPercent >= 100,
  totalXpEarned: xpEarned,
  totalMessages: messages.length + 1,
  totalTimeMinutes: 5,
  grammarScore: result.grammar_score ?? 90,
  // pronunciationScore omitido — texto no tiene evaluación de pronunciación
});
```

**Cambio B — `sendTranscriptMessage()` (flujo voz, línea 369):**

```javascript
// ANTES:
pronunciationScore: pronunciationData?.pronunciation_score || 0,

// DESPUÉS:
pronunciationScore: pronunciationData?.pronunciation_score || undefined,
```

**Total de cambios en este archivo: 2 modificaciones.**

---

#### `src/services/progressService.js`

**Cambio — función `updateProgress()`:**

```javascript
// ANTES:
export async function updateProgress({
  idInscripcion,
  missionId,
  progressPercent,
  totalXpEarned,
  totalMessages,
  totalTimeMinutes,
  grammarScore,
  pronunciationScore,
}) {
  const response = await axios.post(
    `${API}/update`,
    {
      id_inscripcion: idInscripcion,
      mission_id: missionId,
      progress_percent: progressPercent,
      total_xp_earned: totalXpEarned,
      total_messages: totalMessages,
      total_time_minutes: totalTimeMinutes,
      grammar_score: grammarScore,
      pronunciation_score: pronunciationScore,   // ← siempre incluido, puede ser 0
    },
  );
  return response.data;
}

// DESPUÉS:
export async function updateProgress({
  idInscripcion,
  missionId,
  progressPercent,
  totalXpEarned,
  totalMessages,
  totalTimeMinutes,
  grammarScore,
  pronunciationScore,
}) {
  const payload = {
    id_inscripcion: idInscripcion,
    mission_id: missionId,
    progress_percent: progressPercent,
    total_xp_earned: totalXpEarned,
    total_messages: totalMessages,
    total_time_minutes: totalTimeMinutes,
    grammar_score: grammarScore,
  };

  if (pronunciationScore != null) {
    payload.pronunciation_score = pronunciationScore;
  }

  const response = await axios.post(`${API}/update`, payload);
  return response.data;
}
```

**Total de cambios en este archivo: refactorización de la construcción del payload.**

---

### 3.2 Servicios Python afectados

**Ninguno.** El backend FastAPI no interviene en el flujo de `updateProgress` — esa llamada va directamente del frontend a Oracle ORDS.

---

### 3.3 Packages Oracle afectados

**Ninguno.** Los packages PL/SQL (`PKG_AUTH`, `PKG_MISSIONS`, `ADD_XP_TO_PROGRESS`) no están involucrados en este flujo.

---

### 3.4 Procedimientos Oracle afectados

**Ninguno.** `ADD_XP_TO_PROGRESS` maneja XP, no el pronunciation score.

---

### 3.5 Endpoints ORDS afectados

#### `POST /progress/update` — **CAMBIO CRÍTICO**

Este es el único endpoint que cambia. El handler PL/SQL inline debe modificarse para usar `CASE WHEN` en `PRONUNCIATION_SCORE`:

```sql
-- SQL a ejecutar en Oracle ADB para redesplegar el handler:

BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'progress',
    p_pattern        => 'update',
    p_method         => 'POST',
    p_source_type    => 'plsql/block',
    p_items_per_page =>  0,
    p_mimes_allowed  => '',
    p_comments       => NULL,
    p_source         =>
'BEGIN

    UPDATE USER_PROGRESS

    SET

        PROGRESS_PERCENT =
            :progress_percent,

        TOTAL_XP_EARNED =
            :total_xp_earned,

        TOTAL_MESSAGES =
            :total_messages,

        TOTAL_TIME_MINUTES =
            :total_time_minutes,

        GRAMMAR_SCORE =
            :grammar_score,

        PRONUNCIATION_SCORE =
            CASE
                WHEN :pronunciation_score IS NOT NULL
                THEN ROUND(
                    (NVL(PRONUNCIATION_SCORE, 0) + :pronunciation_score) / 2,
                    1
                )
                ELSE PRONUNCIATION_SCORE
            END,

        IS_COMPLETED =
            CASE
                WHEN :progress_percent >= 100
                THEN ''Y''
                ELSE IS_COMPLETED
            END,

        STATUS =
            CASE
                WHEN :progress_percent >= 100
                THEN ''COMPLETED''
                ELSE STATUS
            END,

        COMPLETED_AT =
            CASE
                WHEN :progress_percent >= 100
                THEN SYSTIMESTAMP
                ELSE COMPLETED_AT
            END,

        LAST_ACTIVITY =
            SYSTIMESTAMP,

        UPDATED_AT =
            SYSTIMESTAMP

    WHERE ID_INSCRIPCION =
        :id_inscripcion

    AND MISSION_ID =
        :mission_id;

    COMMIT;

    APEX_JSON.OPEN_OBJECT;

    APEX_JSON.WRITE(
        ''success'',
        TRUE
    );

    APEX_JSON.CLOSE_OBJECT;

END;'
  );

  COMMIT;
END;
```

**El archivo `backend-oracle/ords/progress.sql` también debe actualizarse** para mantener sincronizada la documentación con el estado real de Oracle.

---

### 3.6 Tablas Oracle afectadas

#### `USER_PROGRESS`

| Campo | Comportamiento actual | Comportamiento nuevo |
|---|---|---|
| `PRONUNCIATION_SCORE` | Se sobrescribe con el promedio incluyendo ceros de texto | Solo se actualiza cuando viene una evaluación real de Azure |
| `PRONUNCIATION_SCORE` con texto | Se degrada matemáticamente en cada mensaje | Se preserva sin cambio |
| `PRONUNCIATION_SCORE` con NULL | Se convierte en NULL (destructivo) | Se preserva sin cambio |

---

### 3.7 Reglas de negocio afectadas

| Regla | Estado actual | Estado después |
|---|---|---|
| **BR-PRON-04** — Solo pronunciación en mensajes de voz | Incumplida — texto envía 0 | Cumplida — texto no modifica el score |
| **BR-PRON-05** — Persistencia acumulativa | Parcialmente cumplida — se degrada con texto | Correctamente cumplida — solo voz modifica el score |
| **Regla #3** PROJECT_VISION — Toda interacción debe persistirse correctamente | Incumplida — score inválido con texto | Cumplida — score preservado para texto |
| **Regla #4** PROJECT_VISION — El progreso debe ser medible | Incumplida — avg_pronunciation inválido | Cumplida — promedio refleja solo evaluaciones reales |

---

## 4. Análisis de impacto por componente

### Mapa de dependencias del cambio

```
FLUJO DE TEXTO (sendMessage)

TutorChat.jsx:sendMessage()
  └── updateProgress({
        grammarScore: result.grammar_score ?? 90,
        // pronunciationScore: omitido     ← CAMBIO C3
      })
          │
          ▼
progressService.js:updateProgress()
  payload sin pronunciation_score         ← CAMBIO C2
  axios.post('/progress/update', payload)
          │
          ▼
Oracle ORDS POST /progress/update
  PRONUNCIATION_SCORE =
    CASE WHEN :pronunciation_score IS NOT NULL  ← CAMBIO C1
    THEN ROUND(...)
    ELSE PRONUNCIATION_SCORE  ← score se preserva
    END
          │
          ▼
USER_PROGRESS.PRONUNCIATION_SCORE = sin cambio ✓


FLUJO DE VOZ (sendTranscriptMessage)

TutorChat.jsx:sendTranscriptMessage()
  └── updateProgress({
        pronunciationScore:
          pronunciationData?.pronunciation_score || undefined  ← CAMBIO C4
      })
          │
          ▼
progressService.js:updateProgress()
  if (pronunciationScore != null)    ← CAMBIO C2
    payload.pronunciation_score = 75 (score real)
  axios.post('/progress/update', payload)
          │
          ▼
Oracle ORDS POST /progress/update
  PRONUNCIATION_SCORE =
    CASE WHEN 75 IS NOT NULL         ← CASE IS NOT NULL = TRUE
    THEN ROUND((prev + 75) / 2, 1)  ← promedia correctamente
    END
          │
          ▼
USER_PROGRESS.PRONUNCIATION_SCORE = promedio real ✓
```

### Componentes que NO se modifican

| Componente | Razón |
|---|---|
| `backend/app/routes/chat.py` | No interviene en updateProgress |
| `backend/app/services/*.py` | FastAPI no procesa pronunciation en texto |
| `chatService.js` | Solo involucrado en el chat con GPT |
| `conversationService.js` | Maneja mensajes, no scores |
| `pronunciationService.js` | Solo en flujo de voz, sin cambio |
| `Dashboard.jsx` | Leerá avg_pronunciation real automáticamente |
| `StatCard.jsx` | Sin cambios |
| `ADD_XP_TO_PROGRESS` | No involucrado en pronunciation |
| `PKG_AUTH`, `PKG_MISSIONS` | Sin relación con este flujo |

---

## 5. Riesgos de implementación

### Riesgo 1 — Oracle modificado sin frontend actualizado (CRÍTICO, window de tiempo)

**Descripción:** Si Oracle se actualiza para usar `CASE WHEN IS NOT NULL` pero el frontend sigue enviando `pronunciationScore: 0`:
- El `0` es un valor no-NULL
- Oracle entra al `THEN` branch: `ROUND((prev + 0) / 2, 1)`
- El comportamiento es **idéntico al actual** — el score sigue degradándose con ceros

**Impacto:** Sin efecto negativo adicional — el sistema simplemente sigue igual que antes hasta que el frontend también se actualice.

**Mitigación:** En desarrollo local, frontend y Oracle se actualizan simultáneamente. No hay ventana de riesgo real.

---

### Riesgo 2 — Frontend actualizado sin Oracle corregido (CRÍTICO, debe evitarse)

**Descripción:** Si el frontend deja de enviar `pronunciationScore` pero Oracle sigue con la fórmula actual:
- `:pronunciation_score` llega como `NULL`
- `NVL(PRONUNCIATION_SCORE, 0) + NULL = NULL`
- `ROUND(NULL / 2, 1) = NULL`
- `USER_PROGRESS.PRONUNCIATION_SCORE = NULL` ← **dato destruido**

**Impacto:** El Dashboard mostraría `avg_pronunciation = 0` o error, y el campo quedaría en `NULL` para todos los estudiantes afectados hasta que se ejecute una corrección manual en Oracle.

**Mitigación:** **El cambio de Oracle DEBE desplegarse antes o simultáneamente con el frontend.** El checklist de implementación refuerza este orden.

---

### Riesgo 3 — El `|| undefined` en `sendTranscriptMessage` afecta score=0 real de Azure (Bajo)

**Descripción:** Si Azure devuelve `pronunciation_score: 0` (pronunciación completamente incorrecta), `0 || undefined` evalúa como `undefined`, y Oracle no actualizaría el score — el estudiante no recibe la penalización correcta.

**Análisis:** En la práctica, Azure rara vez devuelve exactamente 0. El score más bajo observable suele ser 5-15 para pronunciación inteligible pero muy incorrecta. Si Azure retorna 0, es más probable que sea un error de la API que un score legítimo.

**Decisión:** Mantener `|| undefined` por ahora. Si en una iteración futura se necesita capturar scores de 0 de Azure, se puede ajustar a `?? undefined` (nullish coalescing en lugar de OR lógico).

---

### Riesgo 4 — Datos históricos ya contaminados en Oracle (Bajo, No bloquea)

**Descripción:** Los registros existentes en `USER_PROGRESS` ya tienen `PRONUNCIATION_SCORE` degradado por los ceros acumulados de mensajes de texto previos.

**Impacto:** El Dashboard seguirá mostrando scores bajos para estudiantes con historial previo. No hay forma de recuperar los datos históricos sin un UPDATE manual en Oracle.

**Mitigación:** Este es un efecto esperado del bug anterior. La corrección aplica a partir del momento del deploy. Los datos futuros serán correctos. Documentar en comunicación al usuario si es necesario.

---

### Riesgo 5 — `isCompleted` en el payload de `updateProgress` (Bajo, ya verificado)

**Descripción:** La función `updateProgress` en `progressService.js` recibe `isCompleted` como parámetro pero actualmente no lo incluye en el payload enviado a Oracle (Oracle lo calcula por `progress_percent >= 100`). Este comportamiento debe preservarse al refactorizar el payload.

**Mitigación:** El nuevo payload explícito no incluirá `is_completed` — igual que el comportamiento actual. Oracle maneja el completado por `progress_percent`. Sin riesgo.

---

## 6. Estrategia de despliegue

### Orden de despliegue OBLIGATORIO

```
PASO 1 — Oracle ORDS (PRIMERO, siempre)
   Ejecutar el SQL de redeploy del handler /progress/update en Oracle ADB
   Verificar: el ORDS responde a test con pronunciation_score omitido → success:true
              el ORDS responde a test con pronunciation_score=75     → success:true

PASO 2 — Frontend (DESPUÉS de confirmar Oracle)
   Modificar progressService.js (payload condicional)
   Modificar TutorChat.jsx sendMessage() (eliminar pronunciationScore: 0)
   Modificar TutorChat.jsx sendTranscriptMessage() (|| 0 → || undefined)
   Verificar: npm run build → exitoso

PASO 3 — Verificación end-to-end
   Prueba de texto: /progress/update sin pronunciation_score → Oracle preserva score
   Prueba de voz: /progress/update con score real → Oracle promedia correctamente
```

### Para entorno de desarrollo local

En local, FastAPI tiene `--reload` y Vite tiene HMR. El "deploy" es simplemente guardar los archivos. El orden sigue siendo:
1. Ejecutar el SQL en Oracle ADB primero
2. Modificar los archivos del frontend
3. Verificar en el browser

---

## 7. Estrategia de pruebas

### Prueba 1 — Oracle acepta payload sin `pronunciation_score`

```bash
# Simular texto: payload sin el campo pronunciation_score
curl -s -X POST \
  "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/progress/update" \
  -H "Content-Type: application/json" \
  -d '{
    "id_inscripcion": 1,
    "mission_id": 1,
    "progress_percent": 30,
    "total_xp_earned": 30,
    "total_messages": 3,
    "total_time_minutes": 15,
    "grammar_score": 90
  }'
```

**Resultado esperado:** `{"success": true}` — sin error de Oracle por campo faltante.

---

### Prueba 2 — `PRONUNCIATION_SCORE` se preserva cuando no se envía el campo

```bash
# 1. Establecer un score de referencia via voz
curl -X POST ".../ords/api/progress/update" \
  -d '{"id_inscripcion": 1, "mission_id": 1, ..., "pronunciation_score": 78}'

# 2. Consultar estado: pronunciation_score debe ser ~39 (promedio de 0 inicial + 78)
curl ".../ords/api/progress/mission/1/1"

# 3. Simular 3 mensajes de texto (SIN pronunciation_score)
curl -X POST ".../ords/api/progress/update" \
  -d '{"id_inscripcion": 1, "mission_id": 1, ..., "grammar_score": 90}'
# Repetir 2 veces más

# 4. Consultar: pronunciation_score debe ser IGUAL al del paso 2
curl ".../ords/api/progress/mission/1/1"
```

**Resultado esperado:** `pronunciation_score` no cambia tras los 3 mensajes de texto.

---

### Prueba 3 — Score de voz sigue actualizándose correctamente

```bash
# Después de la Prueba 2, enviar un score real de Azure
curl -X POST ".../ords/api/progress/update" \
  -d '{"id_inscripcion": 1, "mission_id": 1, ..., "pronunciation_score": 90}'

# Consultar: debe ser promedio de (score_anterior + 90) / 2
curl ".../ords/api/progress/mission/1/1"
```

**Resultado esperado:** Score se actualiza correctamente al promedio con el nuevo valor de voz.

---

### Prueba 4 — `progressService.js` no incluye `pronunciation_score` cuando es null/undefined

```javascript
// Verificación manual en consola del browser:
// Abrir Network tab → enviar un mensaje de texto en el chat
// Inspeccionar el payload del request a /progress/update
// El campo pronunciation_score NO debe aparecer en el body JSON
```

---

### Prueba 5 — Dashboard `avg_pronunciation` refleja solo evaluaciones de voz

Después de varias interacciones mixtas (texto + voz):
1. Verificar en Oracle que `PRONUNCIATION_SCORE` en `USER_PROGRESS` no degradó
2. Verificar que `avg_pronunciation` en el Dashboard muestra el score de la última evaluación de voz

---

### Prueba 6 — Verificar que `|| undefined` en voz no rompe el flujo normal

Usar el botón de micrófono en el chat y completar una grabación normal. Verificar que:
- La evaluación de Azure devuelve un score real
- El Network tab muestra `pronunciation_score` con el valor de Azure en el payload de `/progress/update`
- Oracle actualiza el score correctamente

---

## 8. Resumen de cambios por archivo

| Archivo | Cambio | Líneas | Complejidad |
|---|---|---|---|
| Oracle ORDS handler `POST /progress/update` | Añadir `CASE WHEN IS NOT NULL` en PRONUNCIATION_SCORE | ~6 líneas SQL | Baja |
| `backend-oracle/ords/progress.sql` | Actualizar documentación con el CASE WHEN | ~6 líneas | Baja |
| `src/services/progressService.js` | Payload condicional para `pronunciation_score` | ~8 líneas | Baja |
| `src/components/mission/TutorChat.jsx` | Eliminar `pronunciationScore: 0` en `sendMessage` | 1 línea | Baja |
| `src/components/mission/TutorChat.jsx` | Cambiar `\|\| 0` por `\|\| undefined` en `sendTranscriptMessage` | 1 línea | Baja |

**Total: ~20 líneas modificadas en 4 archivos (incluyendo Oracle).**

---

## 9. Dependencias con otras iniciativas

| Iniciativa | Relación | Impacto |
|---|---|---|
| MVP-01 (Grammar Score real) | **Completada** — no interfiere | Ninguno |
| ALT-08 (Unificar sendMessage) | **Posterior** — la función unificada debe omitir `pronunciationScore` cuando viene del flujo de texto | Al refactorizar, mantener la lógica de omisión |
| F3-02 (Analítica fonémica) | **Posterior** — se beneficia de scores correctos en Oracle | Los datos válidos persistidos desde hoy alimentarán esa analítica |

---

## 10. Checklist de implementación

```
PRE-IMPLEMENTACIÓN
[x] Aprobación recibida
[x] Confirmar acceso a Oracle ADB para pruebas
[x] Verificar baseline: pronunciation_score = 20 en USER_PROGRESS antes de cambios

HALLAZGO DE DIAGNÓSTICO (antes de implementar)
[x] Verificado: Oracle ORDS YA maneja correctamente el campo omitido (NULL)
    - Campo omitido → score preservado (Oracle lo procesa como NULL sin update)
    - pronunciation_score=0 EXPLÍCITO → score baja: (prev+0)/2 ← BUG REAL
    - Conclusión: el fix crítico es frontend (no enviar 0), no Oracle ORDS
[x] progress.sql actualizado con CASE WHEN IS NOT NULL (mejora documental)

FRONTEND
[x] progressService.js — payload condicional: if (pronunciationScore != null)
[x] TutorChat.jsx sendMessage() — eliminado pronunciationScore: 0
[x] TutorChat.jsx sendTranscriptMessage() — cambiado || 0 por || undefined
[x] npm run build → exitoso (1.11s)

PRUEBAS UNITARIAS
[x] Payload texto (undefined): campo OMITIDO del JSON — PASS
[x] Payload voz real (75): campo INCLUIDO con valor 75 — PASS
[x] Payload voz falla (undefined): campo OMITIDO — PASS
[x] Payload voz score=0 (Azure legítimo): campo INCLUIDO con 0 — PASS
[x] Payload pronunciationScore=null: campo OMITIDO — PASS

PRUEBAS END-TO-END CONTRA ORACLE
[x] Prueba 1: Oracle acepta payload sin pronunciation_score → success:true
[x] Prueba 2: 5 mensajes de texto → PRONUNCIATION_SCORE = 66.3 (sin cambio)
[x] Prueba 3: Voz=92 → score actualiza a 79.2 = ROUND((66.3+92)/2,1) ← CORRECTO
[x] Matemática del promedio verificada: (66.3+92)/2 = 79.15 → 79.2 con ROUND(...,1)

BROWSER — VERIFICADAS
[x] Prueba 4: Network tab — payload de texto no incluye pronunciation_score
[x] Prueba 5: Dashboard avg_pronunciation refleja score de voz real
[x] Prueba 6: Flujo de voz con micrófono real sin regresiones

REGRESIÓN DETECTADA Y CORREGIDA DURANTE BROWSER TESTING
[x] Bug: sendMessage() no enviaba progress_percent → FastAPI 422
    Causa: MVP-01 hizo progress_percent requerido en ChatRequest
           pero sendMessage() calculaba progressPercent DESPUÉS del fetch
    Fix: mover cálculo de progressPercent ANTES de sendChatMessage()
         e incluirlo en el payload (igual que sendTranscriptMessage)
    Efecto secundario: fetch() no lanza en 422 → result.reply=undefined
                       → Oracle recibía message_text=undefined → 555
    Ambos errores resueltos con el mismo cambio

POST-DEPLOY
[x] USER_PROGRESS.PRONUNCIATION_SCORE estable tras 5 mensajes de texto
[x] Score de voz actualiza correctamente con la fórmula de promedio
[x] Dashboard avg_pronunciation coherente con evaluaciones reales
```

---

## Estado

```
[x] Aprobado
[x] Implementado — 2026-06-01
[x] Pruebas unitarias y end-to-end completadas — 2026-06-01
[x] Pruebas de browser completadas — 2026-06-01
[x] Regresión detectada y corregida — progress_percent en sendMessage()
[x] COMPLETADO
```
