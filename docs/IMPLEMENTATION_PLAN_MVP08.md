# IMPLEMENTATION_PLAN_MVP08.md
# MVP-08 — Persistencia de correcciones gramaticales en Oracle

> **Estado:** ✅ COMPLETADO — 2026-06-02
> **Iniciativa:** MVP-08 del PRODUCT_BACKLOG.md
> **Implementación:** ~1 hora (frontend + Oracle redeploy)
> **Pruebas:** 5/5 verificadas manualmente

---

## 1. Cómo funciona actualmente el flujo de correcciones gramaticales

### Recorrido completo del dato hoy

```
Estudiante envía mensaje
    │
    ├─ TutorChat → POST localhost:8000/chat/message
    │       │
    │       └─ FastAPI → GPT-4.1-mini
    │               │
    │               └─ Devuelve:
    │                   {
    │                     "reply": "Great! ...",
    │                     "correction": {              ← dato pedagógico clave
    │                       "original": "I go yesterday",
    │                       "corrected": "I went yesterday",
    │                       "explanation": "Use past tense..."
    │                     },
    │                     "grammar_score": 55
    │                   }
    │
    ├─ TutorChat → setCorrection(result.correction)
    │       └─ CorrectionCard renderiza la corrección en pantalla ← visible solo esta sesión
    │
    ├─ TutorChat → saveMessage({ conversationId, sender:"tutor", messageText })
    │       │        ← correction NO se incluye aquí
    │       └─ Oracle ORDS POST /chat/message
    │               INSERT INTO CONVERSATION_MESSAGES (
    │                   CONVERSATION_ID, SENDER, MESSAGE_TEXT, CREATED_AT
    │               )   ← CORRECTION queda NULL siempre
    │
    └─ Estudiante cierra la sesión → la corrección DESAPARECE para siempre
```

### El campo ya existe — simplemente nunca se escribe

`CONVERSATION_MESSAGES.CORRECTION` es un `CLOB` existente en la tabla Oracle:

```sql
"CORRECTION" CLOB COLLATE "USING_NLS_COMP"
```

El endpoint `GET /chat/history/:conversation_id` ya lo incluye en el SELECT:
```sql
SELECT MESSAGE_ID, CONVERSATION_ID, SENDER, MESSAGE_TEXT,
       CORRECTION, SCORE, CREATED_AT
FROM CONVERSATION_MESSAGES
WHERE CONVERSATION_ID = :conversation_id
ORDER BY CREATED_AT
```

Oracle ya lee el campo. El problema es que el INSERT nunca lo escribe.

### El punto exacto del problema — tres omisiones en cadena

**Omisión 1 — `TutorChat.jsx` `sendTranscriptMessage` (línea ~381):**
```javascript
await saveMessage({
  conversationId,
  sender: "tutor",
  messageText: tutorMessage.text,
  // ← correction: result.correction  FALTA
});
```

**Omisión 2 — `TutorChat.jsx` `sendMessage` (línea ~504):**
```javascript
await saveMessage({
  conversationId,
  sender: "tutor",
  messageText: tutorMessage.text,
  // ← correction: result.correction  FALTA
});
```

**Omisión 3 — `conversationService.js` `saveMessage`:**
```javascript
export async function saveMessage({ conversationId, sender, messageText }) {
  const response = await axios.post(`${API}/message`, {
    conversation_id: conversationId,
    sender,
    message_text: messageText,
    // ← correction  FALTA en el payload
  });
  return response.data;
}
```

**Omisión 4 — Oracle ORDS `POST /chat/message` INSERT:**
```sql
INSERT INTO CONVERSATION_MESSAGES (
    CONVERSATION_ID,
    SENDER,
    MESSAGE_TEXT,
    CREATED_AT       -- ← CORRECTION falta en el INSERT
)
```

---

## 2. Análisis de impacto arquitectónico completo

### Archivos React afectados

| Archivo | Cambio |
|---|---|
| `src/services/conversationService.js` | +parámetro `correction` en `saveMessage`; incluirlo serializado en el payload |
| `src/components/mission/TutorChat.jsx` | Pasar `correction: result.correction` al `saveMessage` del tutor en ambas funciones de envío |

### Servicios Python afectados

**Ninguno.** La corrección ya viaja `GPT → FastAPI → TutorChat (JavaScript)`. La persistencia va `TutorChat → Oracle ORDS` directamente, sin pasar por FastAPI.

### Packages Oracle afectados

| Package / Módulo | Cambio |
|---|---|
| Módulo ORDS `chat` — handler `POST /chat/message` | Agregar `:correction` al INSERT de `CONVERSATION_MESSAGES` |

### Procedimientos afectados

**Ninguno.** El INSERT es inline en el handler ORDS, no llama a procedimientos almacenados.

### Endpoints ORDS afectados

| Endpoint | Cambio |
|---|---|
| `POST /chat/message` | INSERT ampliado con campo `CORRECTION` |
| `GET /chat/history/:conversation_id` | **Sin cambios** — ya retorna `CORRECTION` en el SELECT |

### Tablas Oracle afectadas

| Tabla | Campo | Cambio |
|---|---|---|
| `CONVERSATION_MESSAGES` | `CORRECTION CLOB` | Pasará de siempre NULL a recibir el JSON de la corrección cuando GPT detectó un error |

### Reglas de negocio afectadas

| Regla | Estado actual | Estado después del fix |
|---|---|---|
| PROJECT_VISION Regla #3: Toda interacción relevante debe persistirse | Violada — el dato pedagógico más valioso se pierde al cerrar la sesión | Corregida |
| PROJECT_VISION Regla #4: El progreso debe ser medible | Parcialmente violada — no se pueden medir patrones de errores históricos | Mejorada — las correcciones son consultables por misión |

---

## 3. Formato del dato: serialización como JSON string

### Por qué serializar a JSON string

Oracle ORDS con `response_format: json` recibe el body del POST como JSON. Los bind variables (`:correction`) solo pueden ser escalares — Oracle no puede deserializar automáticamente un objeto JSON anidado a un CLOB.

Si enviamos `{ "correction": { "original": "...", "corrected": "...", "explanation": "..." } }`, Oracle recibiría el objeto anidado con comportamiento impredecible según la versión de ORDS.

La solución robusta: serializar la corrección a string en el frontend antes de enviar:
```javascript
correction: correction ? JSON.stringify(correction) : null
```

Oracle recibe un string (o NULL) → lo inserta directamente en el CLOB → sin parsing en Oracle.

### Formato almacenado en Oracle

```
CORRECTION CLOB valor cuando hay error:
'{"original":"I go yesterday","corrected":"I went yesterday","explanation":"Use past simple..."}'

CORRECTION CLOB valor cuando no hay error:
NULL
```

### Impacto en estudiante vs tutor

| Mensaje | Tiene correction | Comportamiento |
|---|---|---|
| Estudiante (`sender: "student"`) | Nunca | `correction: null` → Oracle inserta NULL |
| Tutor sin error detectado | No | `correction: null` → Oracle inserta NULL |
| Tutor con error detectado | Sí | `correction: JSON.stringify({original, corrected, explanation})` → Oracle inserta el JSON |

---

## 4. Cambios a realizar

### Cambio 1 — `conversationService.js`: agregar `correction` al payload

```javascript
export async function saveMessage({
  conversationId,
  sender,
  messageText,
  correction = null,    // ← nuevo parámetro con default null
}) {
  const response = await axios.post(
    `${API}/message`,
    {
      conversation_id: conversationId,
      sender,
      message_text: messageText,
      correction: correction ? JSON.stringify(correction) : null,   // ← serializado
    },
  );

  return response.data;
}
```

`correction = null` como default garantiza que las llamadas existentes para mensajes del estudiante (`saveMessage({ conversationId, sender:"student", messageText })`) siguen funcionando sin cambio.

### Cambio 2 — `TutorChat.jsx` `sendTranscriptMessage`: pasar correction al saveMessage del tutor

```javascript
// ANTES:
if (conversationId) {
  await saveMessage({
    conversationId,
    sender: "tutor",
    messageText: tutorMessage.text,
  });
}

// DESPUÉS:
if (conversationId) {
  await saveMessage({
    conversationId,
    sender: "tutor",
    messageText: tutorMessage.text,
    correction: result.correction,   // ← agregar
  });
}
```

### Cambio 3 — `TutorChat.jsx` `sendMessage`: ídem (paridad de flujos)

```javascript
// ANTES:
if (conversationId) {
  await saveMessage({
    conversationId,
    sender: "tutor",
    messageText: tutorMessage.text,
  });
}

// DESPUÉS:
if (conversationId) {
  await saveMessage({
    conversationId,
    sender: "tutor",
    messageText: tutorMessage.text,
    correction: result.correction,   // ← agregar
  });
}
```

### Cambio 4 — Oracle ORDS `POST /chat/message`: agregar CORRECTION al INSERT

**En `backend-oracle/ords/chat.sql`** (documentación del estado de Oracle):

```sql
-- ANTES:
INSERT INTO CONVERSATION_MESSAGES (
    CONVERSATION_ID,
    SENDER,
    MESSAGE_TEXT,
    CREATED_AT
)
VALUES (
    :conversation_id,
    :sender,
    :message_text,
    SYSTIMESTAMP
);

-- DESPUÉS:
INSERT INTO CONVERSATION_MESSAGES (
    CONVERSATION_ID,
    SENDER,
    MESSAGE_TEXT,
    CORRECTION,
    CREATED_AT
)
VALUES (
    :conversation_id,
    :sender,
    :message_text,
    :correction,
    SYSTIMESTAMP
);
```

Este cambio debe aplicarse en el archivo SQL local **y** redesplegarse en Oracle ADB para que tenga efecto real.

---

## 5. Diagrama del flujo después del fix

```
Estudiante envía mensaje
    │
    └─ TutorChat → FastAPI → GPT
            │
            └─ result.correction = {
                 original: "I go yesterday",
                 corrected: "I went yesterday",
                 explanation: "Use past tense..."
               }
    │
    ├─ setCorrection(result.correction) → CorrectionCard (UI)
    │
    └─ saveMessage({
           conversationId,
           sender: "tutor",
           messageText: "Good try! ...",
           correction: result.correction   ← ahora se pasa
         })
              │
              └─ conversationService.js
                      │
                      └─ POST /ords/api/chat/message
                              body: {
                                conversation_id: 42,
                                sender: "tutor",
                                message_text: "Good try! ...",
                                correction: '{"original":"I go yesterday",...}'
                              }
                              │
                              └─ Oracle INSERT CONVERSATION_MESSAGES (
                                     ..., CORRECTION = '{"original":"I go yesterday",...}'
                                 )
                                 ← dato persistido permanentemente ✓

Sesión siguiente / Teacher Dashboard / Analíticas:
    GET /chat/history/:conversationId
    → retorna { ..., correction: '{"original":"...","corrected":"...","explanation":"..."}' }
    → dato recuperable para análisis de patrones de error
```

---

## 6. Riesgos de implementación

### Riesgo 1 — Oracle ORDS redeploy en producción (Alto)

**Descripción:** El cambio más arriesgado. Modificar el handler `POST /chat/message` en Oracle ADB requiere ejecutar el script ORDS en la instancia de producción. Si el script tiene un error de sintaxis, el endpoint podría quedar caído hasta corregirlo.

**Mitigación:**
- Probar el script ORDS en una sesión de SQL Developer antes del deploy
- Verificar el endpoint con Postman inmediatamente después del redeploy
- El cambio es aditivo — agrega un campo opcional al INSERT. Si `:correction` es NULL (enviado desde frontend antiguo), Oracle lo acepta sin error

**Plan de rollback:** Si el deploy falla, ejecutar el INSERT original (sin `CORRECTION`) para restaurar el comportamiento previo.

### Riesgo 2 — ORDS y bind variable NULL (Bajo-Medio)

**Descripción:** Algunas versiones de ORDS tienen comportamiento inconsistente con bind variables que reciben `null` explícito en el JSON body. Si `:correction` null no se binding correctamente, el INSERT podría fallar.

**Verificación necesaria:** Probar con Postman un POST con `"correction": null` explícito antes del deploy en producción.

**Si ORDS no maneja NULL limpiamente**, alternativa segura: usar `NVL` o `CASE` en el INSERT:
```sql
CORRECTION = CASE WHEN :correction IS NOT NULL THEN :correction ELSE NULL END
```

O simplemente omitir el campo del INSERT cuando es NULL y usar un endpoint diferente para mensajes con corrección (más complejo, no recomendado).

### Riesgo 3 — Mensajes históricos sin `CORRECTION` (Informativo, sin acción)

**Descripción:** Todos los mensajes ya guardados en `CONVERSATION_MESSAGES` tienen `CORRECTION = NULL`. No se pueden recuperar retroactivamente — GPT ya no tiene acceso a esas conversaciones pasadas.

**Evaluación:** Comportamiento esperado y aceptable. El dato comienza a capturarse desde el deploy. Los datos históricos null no afectan el funcionamiento del sistema.

### Riesgo 4 — Divergencia entre sendMessage y sendTranscriptMessage (Bajo)

**Descripción:** El patrón típico de TutorChat: cambio que debe replicarse en ambas funciones. Si se aplica solo en una, el flujo de texto guarda correcciones pero el de voz no (o viceversa).

**Mitigación:** El plan especifica explícitamente los Cambios 2 y 3 en ambas funciones.

### Riesgo 5 — Tamaño del JSON serializado (Muy Bajo)

**Descripción:** La corrección serializada tiene estructura fija: `original`, `corrected`, `explanation`. Estimado: ~200-500 caracteres. Oracle CLOB soporta hasta 4GB. No hay riesgo de overflow.

---

## 7. Estrategia de despliegue

### Orden de cambios

**Paso A — Frontend (sin riesgo):**
1. `conversationService.js`: agregar parámetro `correction`.
2. `TutorChat.jsx`: pasar `correction` en ambas funciones.

Estos cambios son backwards-compatible con Oracle viejo: el frontend envía `correction` en el payload pero si Oracle no lo procesa (porque aún no se redesplegó), simplemente lo ignora. **No rompe nada**.

**Paso B — Oracle ORDS (con coordinación):**
1. Actualizar `backend-oracle/ords/chat.sql` localmente.
2. Ejecutar el script en Oracle ADB (SQL Developer / SQL Workshop en OCI Console).
3. Verificar con Postman que `POST /chat/message` con `correction` funciona.
4. Verificar que `POST /chat/message` sin `correction` (o con null) también funciona.

**Ventaja del orden A → B:** El frontend puede desplegarse primero sin riesgo. Oracle se actualiza cuando haya ventana de mantenimiento.

### Verificación post-deploy

```sql
-- Verificar que el campo se está guardando
SELECT MESSAGE_ID, SENDER, SUBSTR(MESSAGE_TEXT, 1, 50), CORRECTION
FROM CONVERSATION_MESSAGES
WHERE CONVERSATION_ID = :id
ORDER BY CREATED_AT;
```

---

## 8. Estrategia de pruebas

### Prueba 1 — Corrección se persiste en Oracle (manual, ~10 min)

1. Entrar a misión. Enviar un mensaje con error gramatical deliberado (ej: *"I go to school yesterday"*).
2. Verificar que `CorrectionCard` muestra la corrección en pantalla.
3. Consultar Oracle:
   ```sql
   SELECT CORRECTION
   FROM CONVERSATION_MESSAGES
   WHERE CONVERSATION_ID = :conv_id
   AND SENDER = 'tutor'
   ORDER BY CREATED_AT DESC
   FETCH FIRST 1 ROW ONLY;
   ```
4. **Esperado:** `CORRECTION = '{"original":"I go...","corrected":"I went...","explanation":"..."}'`
5. **Antes del fix:** `CORRECTION = NULL`.

### Prueba 2 — Mensaje sin error: CORRECTION es NULL (manual, ~5 min)

1. Enviar un mensaje gramaticalmente correcto (ej: *"I went to school yesterday"*).
2. `CorrectionCard` NO debe aparecer.
3. Consultar Oracle: último mensaje del tutor.
4. **Esperado:** `CORRECTION IS NULL`.

### Prueba 3 — Backwards compatibility: mensajes del estudiante sin correction (manual, ~5 min)

1. Verificar en Oracle que los mensajes con `SENDER = 'student'` tienen `CORRECTION IS NULL`.
2. **Esperado:** Solo los mensajes del tutor pueden tener correction.

### Prueba 4 — Flujo de voz también persiste (manual, ~10 min)

1. Usar el micrófono para enviar un mensaje de voz con error gramatical.
2. Verificar en Oracle que el mensaje del tutor correspondiente tiene `CORRECTION` populada.
3. **Verificación de paridad:** flujo texto y flujo voz deben comportarse igual.

### Prueba 5 — GET /chat/history retorna correction (manual, ~5 min)

1. Desde Postman: `GET https://.../ords/api/chat/history/:conversationId`.
2. **Esperado:** Los mensajes del tutor con error detectado retornan `"correction": "{...}"` en el JSON.
3. **Verificación:** el campo ya estaba en el SELECT — solo confirmar que ahora tiene datos reales.

---

## 9. Resumen de artefactos afectados

### Frontend — 2 archivos

| Archivo | Cambio |
|---|---|
| `src/services/conversationService.js` | +`correction = null` en `saveMessage` + serialización JSON en payload |
| `src/components/mission/TutorChat.jsx` | `correction: result.correction` en `saveMessage` del tutor (×2 funciones) |

### Oracle — 1 handler ORDS + redeploy

| Artefacto | Cambio |
|---|---|
| `backend-oracle/ords/chat.sql` | INSERT ampliado con `CORRECTION, :correction` |
| Oracle ADB (producción) | Redeploy del módulo `chat` via ORDS |

### Sin cambios

| Artefacto | Razón |
|---|---|
| Backend FastAPI | La corrección va directamente frontend → Oracle, sin pasar por FastAPI |
| `GET /chat/history` ORDS handler | Ya incluye `CORRECTION` en el SELECT |
| `CorrectionCard.jsx` | Solo muestra la corrección del mensaje actual — sin cambios necesarios |
| `USER_PROGRESS` | No se afecta — `grammar_score` ya se calcula independientemente |

---

## 10. Habilitación futura

Una vez que las correcciones están en Oracle, se habilitan estas capacidades sin cambios adicionales al backend:

| Capacidad | Qué requiere |
|---|---|
| Mostrar correcciones de sesiones anteriores al recargar historial | Mapear `correction` en `loadHistory` → parsear JSON → mostrar en UI |
| Analítica de errores frecuentes por estudiante | Query a `CONVERSATION_MESSAGES.CORRECTION` agrupado por `id_inscripcion` |
| Teacher Dashboard — patrones de error por grupo | Query agregada multi-estudiante sobre `CORRECTION` |
| Detección de errores recurrentes en GPT | Incluir correcciones previas en el historial enviado a GPT |

---

---

## 11. Resultados de pruebas — 2026-06-02

| # | Acción | Resultado esperado | Estado |
|---|---|---|---|
| 1 | Mensaje con error gramatical → Oracle | `CORRECTION` del tutor contiene JSON con `original`, `corrected`, `explanation` | ✅ |
| 2 | Mensaje sin error → Oracle | `CORRECTION` del tutor es `NULL` | ✅ |
| 3 | Mensajes del estudiante → Oracle | `CORRECTION` siempre `NULL` | ✅ |
| 4 | Flujo de voz con error → Oracle | `CORRECTION` populada igual que flujo de texto | ✅ |
| 5 | `GET /chat/history/:id` desde Postman | Campo `correction` con JSON real en mensajes del tutor con error | ✅ |

**No se detectaron regresiones** en el flujo de text, flujo de voz, grammar score (MVP-01) ni en el historial de conversación.

---

*Implementado y verificado el 2026-06-02.*
