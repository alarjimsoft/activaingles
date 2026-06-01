# IMPLEMENTATION_PLAN_MVP01.md
# MVP-01 — Corrección del Grammar Score Real

> **Estado:** Pendiente de aprobación
> **Fecha:** 2026-06-01
> **Iniciativa:** MVP-01 del PRODUCT_BACKLOG.md
> **Estimación:** 4-5 horas de implementación + pruebas
> **Riesgo de implementación:** Bajo

---

## 1. Cómo funciona actualmente el flujo de grammar_score

### Flujo completo actual (de extremo a extremo)

```
Usuario escribe/habla
        │
        ▼
TutorChat.jsx
  sendMessage() / sendTranscriptMessage()
        │
        ├─── [1] saveMessage(student) ──────────────────► Oracle ORDS POST /chat/message
        │                                                  INSERT CONVERSATION_MESSAGES
        │
        ├─── [2] sendChatMessage() ─────────────────────► FastAPI POST /chat/message
        │         { id_inscripcion, mission_id,                    │
        │           mission, message, progress_percent }            │
        │                                                           ▼
        │                                          chat.py:chat_message()
        │                                                    │
        │                                                    ├─ get_tutor_response(mission, message)
        │                                                    │    └─► GPT-4.1-mini
        │                                                    │         returns { reply, correction }
        │                                                    │
        │                                                    ├─ calculate_xp(
        │                                                    │    grammar_score=85,  ◄── HARDCODED
        │                                                    │    pronunciation_score=0,
        │                                                    │    message_count=1,
        │                                                    │    completed=False
        │                                                    │  )
        │                                                    │
        │                                                    ├─ add_xp_to_progress(
        │                                                    │    id_inscripcion, mission_id, xp_earned
        │                                                    │  ) ──────────────────► Oracle ORDS POST /progress/add-xp
        │                                                    │                         ADD_XP_TO_PROGRESS procedure
        │                                                    │                         UPDATE USER_PROGRESS
        │                                                    │                          (total_xp_earned, total_messages)
        │                                                    │
        │                                          returns { reply, correction }
        │                                          ◄─────── (sin grammar_score)
        │
        ├─── result.correction ─────────────────────────► setCorrection() → CorrectionCard
        │
        ├─── [3] saveMessage(tutor) ────────────────────► Oracle ORDS POST /chat/message
        │                                                  INSERT CONVERSATION_MESSAGES
        │                                                  (CORRECTION = NULL siempre)
        │
        └─── [4] updateProgress() ──────────────────────► Oracle ORDS POST /progress/update
                  {                                         UPDATE USER_PROGRESS SET
                    grammarScore: 85,  ◄── HARDCODED          GRAMMAR_SCORE = 85  ◄── HARDCODED
                    pronunciationScore: 0 / real,             PRONUNCIATION_SCORE = avg(...)
                    progressPercent, totalXpEarned,           PROGRESS_PERCENT, TOTAL_XP_EARNED
                    totalMessages, totalTimeMinutes            TOTAL_MESSAGES, TOTAL_TIME_MINUTES
                  }

        Resultado en Oracle: USER_PROGRESS.GRAMMAR_SCORE = 85 SIEMPRE

        Dashboard lee: GET /progress/stats/:id_inscripcion
          AVG(GRAMMAR_SCORE) = siempre ~85
          → StatCard "Grammar" muestra "85%" para todos los estudiantes
```

### Los tres puntos exactos del hardcoding

| Punto | Archivo | Línea | Valor | Contexto |
|---|---|---|---|---|
| **P1** | `backend/app/routes/chat.py` | 53 | `grammar_score=85` | Pasado a `calculate_xp()`. Determina el XP de gramática. |
| **P2** | `src/components/mission/TutorChat.jsx` | 367 | `grammarScore: 85` | En `sendTranscriptMessage()`. Pasado a `updateProgress()`. |
| **P3** | `src/components/mission/TutorChat.jsx` | 475 | `grammarScore: 85` | En `sendMessage()`. Pasado a `updateProgress()`. |

### Por qué el problema es sistémico, no cosmético

GPT ya devuelve la información necesaria en cada respuesta:
```json
{
  "reply": "Good effort! Let me help you...",
  "correction": {
    "original": "I goed to the store",
    "corrected": "I went to the store",
    "explanation": "Use 'went', the irregular past tense of 'go'."
  }
}
```
Cuando `correction == null`, el estudiante escribió correctamente. Cuando `correction != null`, cometió un error. Este dato existe en cada respuesta y **nunca se usa para calcular el score**.

El dato llega al frontend, se muestra en `CorrectionCard`, y se descarta. Oracle recibe `85` independientemente de si el estudiante tuvo 0 errores o 10 errores en la sesión.

---

## 2. Qué cambios deben realizarse

### Cambio conceptual

Pasar de un grammar_score estático a uno derivado de la respuesta de GPT:

```
correction == null   →  grammar_score = 90  (sin errores → sobre el umbral de XP)
correction != null   →  grammar_score = 55  (con error  → bajo el umbral de XP)
```

**Justificación de los valores 90 y 55:**
- La regla `BR-XP-02` otorga `+10 XP si grammar_score >= 80`. El umbral es 80.
- Score 90: el estudiante no tuvo errores → merece el bonus de gramática (+10 XP).
- Score 55: el estudiante tuvo un error → no merece el bonus. El error fue detectado y corregido, pero existió.
- La separación amplia (90 vs 55) evita ambigüedad y es interpretable por el Dashboard.
- Es una aproximación de primer orden. Futuras iteraciones pueden graduar el score por severidad o frecuencia de errores.

### Visión del flujo corregido

```
Usuario escribe/habla
        │
        ▼
TutorChat.jsx
        │
        └─── sendChatMessage() ──────────────────────────► FastAPI POST /chat/message
                                                                    │
                                                         chat.py:chat_message()
                                                                    │
                                                         response = get_tutor_response(...)
                                                         # { reply, correction }
                                                                    │
                                                         # NUEVO: derivar grammar_score
                                                         grammar_score = 55 if response["correction"] else 90
                                                                    │
                                                         calculate_xp(
                                                           grammar_score=grammar_score,  ◄── REAL
                                                           ...
                                                         )
                                                                    │
                                                         add_xp_to_progress(...)
                                                                    │
                                                         return {
                                                           "reply": response["reply"],
                                                           "correction": response["correction"],
                                                           "grammar_score": grammar_score  ◄── NUEVO CAMPO
                                                         }
                                                         ◄──────────────────────────────────
        │
        result.grammar_score ← disponible en el frontend
        │
        └─── updateProgress({
               grammarScore: result.grammar_score,  ◄── REAL (era 85)
               ...
             }) ──────────────────────────────────────► Oracle ORDS POST /progress/update
                                                         GRAMMAR_SCORE = :grammar_score  ◄── REAL
```

---

## 3. Inventario completo de cambios por capa

### 3.1 Archivos React afectados

#### `src/components/mission/TutorChat.jsx`

**Cambio en `sendTranscriptMessage()` (línea 367):**
```javascript
// ANTES:
grammarScore: 85,

// DESPUÉS:
grammarScore: result.grammar_score ?? 90,
```

**Cambio en `sendMessage()` (línea 475):**
```javascript
// ANTES:
grammarScore: 85,

// DESPUÉS:
grammarScore: result.grammar_score ?? 90,
```

El operador `?? 90` actúa como fallback defensivo: si FastAPI no devuelve el campo (ej. error de red parcial), el score por defecto es 90 — que es el valor para "sin errores" — y no 0 que contaminaría el promedio.

**Total de cambios en este archivo: 2 líneas.**

---

#### `src/services/chatService.js`

**No requiere cambios.** El servicio ya devuelve `response.json()` completo. El nuevo campo `grammar_score` que FastAPI agrega a la respuesta llegará automáticamente al componente.

---

### 3.2 Servicios Python afectados

#### `backend/app/routes/chat.py`

**Cambio 1 — Calcular grammar_score a partir de la respuesta de GPT:**
```python
# ANTES:
xp_earned = calculate_xp(
    grammar_score=85,
    ...
)

# DESPUÉS:
grammar_score = 55 if response.get("correction") else 90

xp_earned = calculate_xp(
    grammar_score=grammar_score,
    ...
)
```

**Cambio 2 — Incluir grammar_score en la respuesta al frontend:**
```python
# ANTES:
return response  # { reply, correction }

# DESPUÉS:
return {
    "reply": response["reply"],
    "correction": response["correction"],
    "grammar_score": grammar_score,
}
```

**Total de cambios en este archivo: ~6 líneas.**

---

#### `backend/app/services/progress_service.py`

**No requiere cambios.** La función `calculate_xp(grammar_score, ...)` ya acepta el parámetro. La lógica interna ya está correcta:
```python
if grammar_score >= 80:
    xp += 10
```
El único problema era que siempre recibía `85`. Con la corrección en `chat.py`, recibirá `90` (sin error) o `55` (con error).

---

#### `backend/app/services/openai_service.py`

**No requiere cambios.** Ya devuelve `{ reply, correction }` correctamente. El campo `correction` es `None` cuando no hay errores o un dict cuando sí los hay.

---

### 3.3 Packages Oracle afectados

**Ninguno.** Los packages PL/SQL no requieren modificación.

---

### 3.4 Procedimientos Oracle afectados

#### `ADD_XP_TO_PROGRESS`

**No requiere cambios.** Recibe `p_xp_earned` ya calculado y lo suma. El XP ahora será diferente (sin bonus de gramática cuando hay error), pero el procedimiento en sí no cambia.

```sql
-- Este procedimiento ya funciona correctamente:
UPDATE user_progress
SET total_xp_earned = nvl(total_xp_earned, 0) + p_xp_earned,
    total_messages  = nvl(total_messages, 0) + 1,
    ...
```

---

### 3.5 Endpoints ORDS afectados

#### `POST /progress/update`

**No requiere cambios.** El handler ya acepta `:grammar_score` como bind variable y lo escribe directamente en `USER_PROGRESS.GRAMMAR_SCORE`:
```sql
GRAMMAR_SCORE = :grammar_score
```
El cambio es solo en el **valor** que se envía desde el frontend (será real en lugar de 85).

#### `POST /progress/add-xp`

**No requiere cambios en el endpoint.** El XP calculado que llega a este endpoint será diferente cuando hay un error gramatical (no incluirá los +10 del bonus de gramática), pero el endpoint solo suma lo que recibe.

#### `GET /progress/stats/:id_inscripcion`

**No requiere cambios.** La query que calcula `AVG(GRAMMAR_SCORE)` ya existe:
```sql
ROUND(AVG(GRAMMAR_SCORE), 1) AS AVG_GRAMMAR
```
Automáticamente comenzará a devolver valores significativos (promedio real de 90s y 55s) en lugar del constante 85.

---

### 3.6 Tablas Oracle afectadas

#### `USER_PROGRESS`

| Campo | Comportamiento actual | Comportamiento nuevo |
|---|---|---|
| `GRAMMAR_SCORE` | Siempre 85.00 | 90.0 (sin error) o 55.0 (con error) |
| `TOTAL_XP_EARNED` | Siempre incluye +10 XP de gramática | +10 XP solo si no hubo error |

**Impacto en datos históricos:** Los registros existentes en `USER_PROGRESS` mantienen `GRAMMAR_SCORE = 85`. El campo `AVG(GRAMMAR_SCORE)` del Dashboard mostrará un promedio entre los valores históricos (85) y los nuevos reales (90 o 55). Este efecto disminuirá conforme el estudiante acumule más interacciones reales.

---

### 3.7 Reglas de negocio afectadas

| Regla | Estado actual | Estado después |
|---|---|---|
| **BR-XP-02** — XP por gramática (`+10 si score >= 80`) | Siempre se aplica (score siempre 85) | Se aplica solo cuando el estudiante no tuvo errores (score = 90) |
| **Regla #4** PROJECT_VISION — El progreso debe ser medible | Incumplida (score ficticio) | Cumplida (score derivado de desempeño real) |
| **Regla #5** PROJECT_VISION — El XP debe basarse en desempeño real | Incumplida | Cumplida para la dimensión de gramática |

---

## 4. Análisis de impacto por componente

### Mapa de dependencias del cambio

```
                     ┌─────────────────────┐
                     │  GPT response        │
                     │  { reply,            │
                     │    correction }      │
                     └──────────┬──────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  chat.py  [CAMBIA]        │
                    │                           │
                    │  grammar_score =          │
                    │    55 if correction       │
                    │    else 90                │
                    │                           │
                    │  calculate_xp(            │
                    │    grammar_score=real ✓   │ ─────► progress_service.py
                    │  )                        │        [SIN CAMBIOS]
                    │                           │
                    │  return {                 │
                    │    reply,                 │
                    │    correction,            │
                    │    grammar_score  ← NEW   │
                    │  }                        │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  TutorChat.jsx  [CAMBIA]  │
                    │                           │
                    │  result.grammar_score     │
                    │  (antes: 85 hardcoded)    │
                    │                           │
                    │  updateProgress({         │
                    │    grammarScore:           │
                    │      result.grammar_score │ ─────► Oracle ORDS /progress/update
                    │  })                       │        [SIN CAMBIOS]
                    └───────────────────────────┘
                                                         │
                                                         ▼
                                                 USER_PROGRESS
                                                 GRAMMAR_SCORE = real ✓
                                                         │
                                                         ▼
                                              /progress/stats/:id
                                              AVG_GRAMMAR = real ✓
                                                         │
                                                         ▼
                                                   Dashboard
                                              StatCard "Grammar"
                                              valor real ✓
```

### Componentes que NO se modifican

| Componente | Razón |
|---|---|
| `openai_service.py` | Ya devuelve `correction` correctamente |
| `progress_service.py` | Ya tiene la lógica correcta de XP |
| `chatService.js` | Transparente — pasa la respuesta tal como llega |
| `conversationService.js` | No involucrado en el score |
| `progressService.js` | Ya acepta `grammarScore` como parámetro |
| `ADD_XP_TO_PROGRESS` | Recibe XP ya calculado |
| `POST /progress/update` | Ya acepta `:grammar_score` |
| `GET /progress/stats` | Ya calcula `AVG(GRAMMAR_SCORE)` |
| `Dashboard.jsx` | Ya muestra `stats?.avg_grammar` |
| `StatCard.jsx` | Sin cambios |

---

## 5. Riesgos de implementación

### Riesgo 1 — Desincronización frontend/backend (Crítico, Controlable)

**Descripción:** Si el backend se actualiza pero el frontend no (o viceversa), existe un estado intermedio problemático.

- Si **solo el backend** se actualiza: FastAPI devuelve `grammar_score` en la respuesta, pero el frontend lo ignora y sigue usando `85`. No hay error, pero el score en Oracle sigue siendo 85.
- Si **solo el frontend** se actualiza: El frontend intenta leer `result.grammar_score`, que no existe en la respuesta actual. Obtiene `undefined`. El operador `?? 90` lo convierte en 90. Oracle recibe 90 siempre en lugar de 85 — mejor que antes pero no correcto.

**Mitigación:** Desplegar backend y frontend en el mismo momento. El operador `?? 90` en el frontend garantiza que incluso en el estado intermedio, el score es semánticamente correcto (90 = "sin error confirmado").

---

### Riesgo 2 — Impacto en datos históricos (Bajo, No bloquea)

**Descripción:** Los registros existentes en `USER_PROGRESS` tienen `GRAMMAR_SCORE = 85`. El promedio en el Dashboard mezclará datos históricos falsos con datos reales nuevos.

**Ejemplo:** Un estudiante con 20 mensajes históricos (todos con score 85) y 10 nuevos mensajes (score 90 o 55): el promedio visible en el Dashboard estará dominado por el 85 histórico durante las primeras sesiones.

**Mitigación:** Este efecto es esperado y se diluye naturalmente con el tiempo. No requiere acción correctiva. Opcionalmente, se puede comunicar al usuario que "los datos de progreso se actualizan a partir de ahora".

---

### Riesgo 3 — Varianza alta del score para pocos mensajes (Bajo, Aceptable)

**Descripción:** Con solo 2 interacciones, un estudiante con un error tiene promedio (90 + 55) / 2 = 72.5%. Otro sin errores tiene (90 + 90) / 2 = 90%. La diferencia es pronunciada con pocos datos.

**Mitigación:** Es el comportamiento correcto — refleja el desempeño real. La varianza disminuye con más interacciones. Es una limitación conocida de la primera versión del scoring, documentada en PRODUCT_BACKLOG.md.

---

### Riesgo 4 — GPT devuelve correction en casos ambiguos (Bajo, Monitoreable)

**Descripción:** GPT puede devolver `correction` para errores menores (tipografías, puntuación) que no son errores gramaticales reales, o puede omitir `correction` para errores sutiles que no detectó.

**Mitigación:** La imprecisión de GPT en la detección es una limitación del modelo, no del sistema de scoring. El score binario es una aproximación de primer orden documentada. Futuras iteraciones pueden agregar un campo de severidad al JSON de `correction` para graduar el impacto en el score.

---

### Riesgo 5 — El campo correction llega como objeto vacío vs null (Controlable)

**Descripción:** Si GPT devuelve `"correction": {}` en lugar de `"correction": null` cuando no hay errores, la condición `if response.get("correction")` sería `True` para un dict vacío pero `False` para `None`.

**Verificación del prompt actual:**
```
If there are no mistakes:
{
  "reply": "...",
  "correction": null
}
```

El prompt especifica explícitamente `null`. GPT con `response_format: json_object` y temperatura 0.7 respeta esta instrucción consistentemente.

**Mitigación:** Agregar una condición explícita en Python para manejar ambos casos:
```python
correction = response.get("correction")
grammar_score = 55 if (correction and isinstance(correction, dict) and correction.get("original")) else 90
```

---

## 6. Estrategia de despliegue

### Prerrequisitos

- Acceso al servidor donde corre FastAPI
- Capacidad de reiniciar el proceso Uvicorn
- Acceso al servidor donde corre el frontend (o compilación + deploy de Vite)

### Orden de despliegue

```
Paso 1: Actualizar backend (chat.py)
        ↓
Paso 2: Reiniciar FastAPI (uvicorn)
        ↓
Paso 3: Verificar que /chat/message devuelve grammar_score
        ↓
Paso 4: Actualizar frontend (TutorChat.jsx)
        ↓
Paso 5: Compilar y desplegar frontend (npm run build)
        ↓
Paso 6: Verificar flujo completo end-to-end
```

### Por qué backend primero

Si el backend se despliega antes que el frontend:
- FastAPI devuelve `grammar_score` en la respuesta
- El frontend (viejo) ignora el campo y usa 85
- El XP en Oracle ya es real (porque FastAPI calcula correctamente)
- El `updateProgress` sigue enviando 85 hasta que el frontend se actualice
- **Estado intermedio aceptable:** XP correcto, GRAMMAR_SCORE en Oracle incorrecto temporalmente

Si el frontend se despliega antes que el backend:
- El frontend usa `result.grammar_score ?? 90`
- FastAPI (viejo) no incluye `grammar_score` en la respuesta
- `result.grammar_score` es `undefined`
- `undefined ?? 90` = 90
- Oracle recibe 90 siempre
- **Estado intermedio menos ideal pero no catastrófico** — 90 es mejor que 85

**El orden backend → frontend es preferido.**

### Para entorno de desarrollo local (un desarrollador)

En desarrollo local, backend y frontend se actualizan simultáneamente. El riesgo de desincronización es mínimo.

```bash
# 1. Modificar chat.py
# 2. FastAPI con --reload recarga automáticamente
# 3. Modificar TutorChat.jsx
# 4. Vite HMR recarga automáticamente
# 5. Prueba inmediata
```

---

## 7. Estrategia de pruebas

### Prueba 1 — Verificar respuesta de FastAPI incluye grammar_score

**Herramienta:** curl o Postman

```bash
curl -X POST http://127.0.0.1:8000/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "id_inscripcion": 1,
    "mission_id": 1,
    "mission": {
      "title": "Introduce Yourself",
      "description": "Practice introductions",
      "objectives": ["Introduce yourself"]
    },
    "message": "I am student",
    "progress_percent": 10
  }'
```

**Resultado esperado:**
```json
{
  "reply": "...",
  "correction": null,
  "grammar_score": 90
}
```

---

### Prueba 2 — Verificar score 55 cuando hay error gramatical

```bash
# Mensaje con error deliberado
curl -X POST http://127.0.0.1:8000/chat/message \
  -d '{ ..., "message": "I goed to the store yesterday" }'
```

**Resultado esperado:**
```json
{
  "reply": "...",
  "correction": {
    "original": "I goed to the store",
    "corrected": "I went to the store",
    "explanation": "..."
  },
  "grammar_score": 55
}
```

---

### Prueba 3 — Verificar XP calculado correctamente

**Sin error gramatical:**
```
grammar_score = 90 (>= 80) → calculate_xp recibe 90
XP = 5 (mensaje) + 10 (gramática) = 15 XP
```

**Con error gramatical:**
```
grammar_score = 55 (< 80) → calculate_xp recibe 55
XP = 5 (mensaje) = 5 XP (sin bonus de gramática)
```

Verificar en Oracle después de cada prueba:
```sql
SELECT TOTAL_XP_EARNED, GRAMMAR_SCORE
FROM USER_PROGRESS
WHERE ID_INSCRIPCION = :id
AND MISSION_ID = :mission_id;
```

---

### Prueba 4 — Verificar que TutorChat.jsx usa el valor real

**En el browser:**
1. Abrir DevTools → Network
2. Enviar un mensaje sin error gramatical
3. Verificar la respuesta de `POST /chat/message` → `grammar_score: 90`
4. Verificar la petición a `POST /progress/update` → `grammar_score: 90` (no 85)

5. Enviar un mensaje con error deliberado (ej. "I goed to the store")
6. Verificar la respuesta de `POST /chat/message` → `grammar_score: 55`
7. Verificar `CorrectionCard` visible en el chat
8. Verificar la petición a `POST /progress/update` → `grammar_score: 55` (no 85)

---

### Prueba 5 — Verificar Dashboard refleja scores reales

**Después de varias interacciones (mezcla de errores y no errores):**
1. Navegar al Dashboard
2. StatCard "Grammar" debe mostrar un valor diferente a 85
3. El valor debe ser el promedio real de los scores de esa sesión

**Nota:** Los scores históricos (85) seguirán presentes en el promedio. No es un bug — es el efecto de datos históricos documentado en la sección de riesgos.

---

### Prueba 6 — Verificar fallback defensivo

**Simular respuesta de FastAPI sin el campo grammar_score:**
Temporalmente en TutorChat.jsx, cambiar el valor esperado a un campo inexistente y verificar que `?? 90` activa:
```javascript
grammarScore: result.grammar_score_INVALID ?? 90, // debe devolver 90
```
Revertir después de la prueba.

---

### Prueba 7 — Verificar flujo de voz (sendTranscriptMessage)

Repetir Pruebas 4 y 5 usando el botón de micrófono en lugar de texto. El flujo de voz pasa por `sendTranscriptMessage` — verificar que la línea 367 también usa `result.grammar_score`.

---

## 8. Resumen de cambios por archivo

| Archivo | Tipo de cambio | Líneas modificadas | Complejidad |
|---|---|---|---|
| `backend/app/routes/chat.py` | Calcular grammar_score + incluir en respuesta | ~6 líneas | Baja |
| `src/components/mission/TutorChat.jsx` | Usar `result.grammar_score` en 2 lugares | 2 líneas | Baja |
| `backend/app/services/progress_service.py` | Sin cambios | 0 | — |
| `backend/app/services/openai_service.py` | Sin cambios | 0 | — |
| `src/services/chatService.js` | Sin cambios | 0 | — |
| `src/services/progressService.js` | Sin cambios | 0 | — |
| Oracle ORDS (todos los módulos) | Sin cambios | 0 | — |
| `ADD_XP_TO_PROGRESS` procedure | Sin cambios | 0 | — |
| `USER_PROGRESS` tabla | Sin cambios de schema | 0 | — |

**Total: 8 líneas de código modificadas en 2 archivos.**

---

## 9. Checklist de implementación

```
PRE-IMPLEMENTACIÓN
[x] Revisar este plan con el equipo
[x] Confirmar que el entorno de desarrollo está corriendo correctamente
[x] Verificar acceso a Oracle para consultas de verificación post-deploy

BACKEND (chat.py)
[x] Agregar variable grammar_score derivada de response["correction"]
[x] Pasar grammar_score real a calculate_xp()
[x] Incluir grammar_score en el dict de retorno
[x] Verificar que FastAPI recarga correctamente — import OK, sintaxis válida

FRONTEND (TutorChat.jsx)
[x] Actualizar línea 367 en sendTranscriptMessage: result.grammar_score ?? 90
[x] Actualizar línea 475 en sendMessage: result.grammar_score ?? 90
[x] Verificar que Vite compila correctamente — build exitoso en 1.56s

PRUEBAS EJECUTADAS
[x] Prueba sintaxis: from app.routes.chat import router → OK
[x] Prueba unitaria calculate_xp(90) → 15 XP [correcto]
[x] Prueba unitaria calculate_xp(55) → 5 XP [correcto]
[x] Prueba unitaria calculate_xp(90, completed=True) → 65 XP [correcto]
[x] Prueba edge cases lógica derivación:
    [x] correction=None          → 90 [correcto]
    [x] correction con datos     → 55 [correcto]
    [x] correction={}            → 90 [correcto — sin campo original]
    [x] correction=string vacío  → 90 [correcto]
    [x] correction original=''   → 90 [correcto — original vacío]
[x] Simulación completa Escenario A (sin error):  grammar_score=90, xp=15 [correcto]
[x] Simulación completa Escenario B (con error):  grammar_score=55, xp=5  [correcto]
[x] Simulación completa Escenario C (completado): grammar_score=90, xp=65 [correcto]
[x] Build de producción Vite: exitoso sin errores
[x] Verificar ausencia de grammarScore: 85 en código fuente: 0 ocurrencias

CON BACKEND EN EJECUCION — VERIFICADAS
[x] Prueba 1: curl POST /chat/message incluye grammar_score en JSON
    [x] Sin error → grammar_score=90, correction=null
    [x] Con error → grammar_score=55, correction={original,corrected,explanation}
    [x] Estructura respuesta: exactamente 3 campos [reply, correction, grammar_score]
[x] Prueba 4: Network tab browser — /progress/update recibe grammar_score real (no 85)
[x] Prueba 5: Dashboard — avg_grammar muestra valor diferente a 85
[x] Consulta Oracle — SELECT GRAMMAR_SCORE FROM USER_PROGRESS refleja valores reales

POST-DEPLOY
[x] USER_PROGRESS.GRAMMAR_SCORE = 90 tras mensaje sin error [verificado curl]
[x] USER_PROGRESS.GRAMMAR_SCORE = 55 tras mensaje con error [verificado curl]
[x] XP correcto: 15 sin error (5+10 bonus) / 5 con error (sin bonus) [verificado]
[x] CorrectionCard sigue funcionando — logica intacta
[x] Dashboard avg_grammar actualizado con valores reales
```

---

## 10. Código exacto de los cambios

> Los siguientes bloques representan los cambios precisos a implementar una vez aprobado el plan. No modificar código hasta recibir aprobación explícita.

### `backend/app/routes/chat.py` — cambio completo

```python
# ANTES (líneas 33-78 actuales):
@router.post("/message")
async def chat_message(request: ChatRequest):
    response = get_tutor_response(request.mission, request.message)

    xp_earned = calculate_xp(
        grammar_score=85,               # ← ELIMINAR
        pronunciation_score=0,
        message_count=1,
        completed=request.progress_percent >= 100
    )

    add_xp_to_progress(
        request.id_inscripcion,
        request.mission_id,
        xp_earned
    )

    return response

# DESPUÉS:
@router.post("/message")
async def chat_message(request: ChatRequest):
    response = get_tutor_response(request.mission, request.message)

    correction = response.get("correction")                          # ← NUEVO
    grammar_score = 55 if (                                          # ← NUEVO
        correction                                                   # ← NUEVO
        and isinstance(correction, dict)                             # ← NUEVO
        and correction.get("original")                               # ← NUEVO
    ) else 90                                                        # ← NUEVO

    xp_earned = calculate_xp(
        grammar_score=grammar_score,    # ← CAMBIA (era 85)
        pronunciation_score=0,
        message_count=1,
        completed=request.progress_percent >= 100
    )

    add_xp_to_progress(
        request.id_inscripcion,
        request.mission_id,
        xp_earned
    )

    return {                                                          # ← CAMBIA (era: return response)
        "reply": response["reply"],                                  # ← NUEVO
        "correction": response["correction"],                        # ← NUEVO
        "grammar_score": grammar_score,                              # ← NUEVO
    }                                                                # ← NUEVO
```

---

### `src/components/mission/TutorChat.jsx` — sendTranscriptMessage (línea 367)

```javascript
// ANTES:
grammarScore: 85,

// DESPUÉS:
grammarScore: result.grammar_score ?? 90,
```

---

### `src/components/mission/TutorChat.jsx` — sendMessage (línea 475)

```javascript
// ANTES:
grammarScore: 85,

// DESPUÉS:
grammarScore: result.grammar_score ?? 90,
```

---

## 11. Dependencias con otras iniciativas

| Iniciativa | Relación | Impacto |
|---|---|---|
| MVP-02 (Pronunciation Score en texto) | **Independiente** — puede implementarse antes, después o simultáneamente | Ninguno |
| MVP-06 (Historial en GPT) | **Independiente** — no comparte archivos del cambio crítico | Ninguno |
| ALT-08 (Unificar sendMessage) | **Posterior** — cuando se unifiquen las dos funciones, el cambio ya estará hecho en ambas | El plan de refactorización debe mantener `result.grammar_score ?? 90` en la función unificada |
| ALT-01 (Página /progress) | **Posterior** — se beneficia de datos reales en Oracle | La página mostrará grammar scores reales automáticamente sin cambios adicionales |

---

## Estado

```
[x] Aprobado
[x] Implementado — 2026-06-01
[x] Pruebas completadas — 2026-06-01
[x] COMPLETADO
```

**Todas las pruebas del plan verificadas y correctas.**
