# IMPLEMENTATION_PLAN_MVP06.md
# MVP-06 — Historial de conversación enviado al tutor IA

> **Estado:** ✅ COMPLETADO — 2026-06-02
> **Iniciativa:** MVP-06 del PRODUCT_BACKLOG.md
> **Implementación:** ~1.5 horas
> **Pruebas:** 7/7 verificadas manualmente

---

## 1. Cómo funciona actualmente el flujo de envío de mensajes al tutor IA

### Diagrama del flujo actual — sin historial

```
TutorChat.jsx
    │
    ├─ sendMessage() / sendTranscriptMessage()
    │       │
    │       └─ sendChatMessage({
    │               id_inscripcion,
    │               mission_id,
    │               mission,
    │               message: "texto del usuario",   ← solo el mensaje actual
    │               progress_percent
    │             })
    │                   │
    │                   └─ POST http://127.0.0.1:8000/chat/message
    │
    │   FastAPI — chat.py
    │       │
    │       ├─ ChatRequest {
    │       │     id_inscripcion, mission_id,
    │       │     mission, message, progress_percent   ← sin campo history
    │       │  }
    │       │
    │       └─ get_tutor_response(mission, user_message)
    │
    │   openai_service.py — get_tutor_response()
    │       │
    │       └─ client.chat.completions.create(
    │               model="gpt-4.1-mini",
    │               messages=[
    │                 { role: "system", content: system_prompt },
    │                 { role: "user",   content: user_message }   ← solo este mensaje
    │               ]
    │             )
    │
    GPT-4.1-mini
        │
        └─ Procesa sin ningún contexto de mensajes anteriores
           → responde como si fuera el primer mensaje siempre
```

### El punto exacto del problema

**`backend/app/services/openai_service.py` líneas 91–102:**
```python
messages=[
    {
        "role": "system",
        "content": system_prompt
    },
    {
        "role": "user",
        "content": user_message      # ← solo el mensaje actual
    }
]
```

**`backend/app/routes/chat.py` líneas 20–32:**
```python
class ChatRequest(BaseModel):
    id_inscripcion: int
    mission_id: int
    mission: dict
    message: str
    progress_percent: int
    # ← no hay campo history
```

### Consecuencias pedagógicas del comportamiento actual

Cada llamada a GPT es independiente y sin memoria. Esto significa:

- El tutor no puede hacer seguimiento pedagógico ("Como mencionaste antes...")
- El tutor no recuerda los errores cometidos por el estudiante en esa sesión
- El tutor no puede hacer preguntas de seguimiento coherentes
- Si el estudiante dice "I go to school yesterday", el tutor lo corrige. Si el estudiante repite el mismo error 3 mensajes después, el tutor lo trata como un error nuevo sin señalar el patrón
- El tutor puede contradecirse entre mensajes (saludar dos veces, presentarse de nuevo, etc.)
- La experiencia se siente como un chatbot genérico, no como un tutor que conoce al estudiante

---

## 2. Análisis de impacto arquitectónico completo

### Archivos React afectados

| Archivo | Cambio |
|---|---|
| `src/components/mission/TutorChat.jsx` | Agregar `conversationHistoryRef`, poblar desde Oracle, pasar a `sendChatMessage` en ambas funciones de envío |

`chatService.js` — **no requiere cambios**. La función `sendChatMessage(data)` ya serializa todo el objeto `data` que recibe. Solo hay que incluir `history` en el objeto que TutorChat le pasa.

### Servicios Python afectados

| Archivo | Cambio |
|---|---|
| `backend/app/routes/chat.py` | Agregar `history: list[dict] = []` a `ChatRequest`; pasar `history` a `get_tutor_response()` |
| `backend/app/services/openai_service.py` | Agregar parámetro `history=[]`; construir array `messages` con historial antes del mensaje actual |

### Packages Oracle afectados

**Ninguno.** Oracle ya almacena el historial en `CONVERSATION_MESSAGES` y lo expone via `GET /chat/history/:conversation_id`. No se requiere ningún cambio en ORDS ni en la base de datos.

### Procedimientos afectados

**Ninguno.** `ADD_XP_TO_PROGRESS` no participa en el flujo de historial.

### Endpoints ORDS afectados

| Endpoint | Rol | Cambio |
|---|---|---|
| `GET /chat/history/:conversation_id` | Fuente del historial real | **Ninguno** — ya devuelve `{ items: [{ message_id, sender, message_text, ... }] }` |
| `POST /chat/message` | Guarda mensajes | **Ninguno** |

### Tablas Oracle afectadas

**Ninguna.** `CONVERSATION_MESSAGES` ya existe y tiene todos los datos necesarios. La implementación solo lee datos ya guardados, no escribe datos nuevos.

### Reglas de negocio afectadas

| Regla | Estado actual | Estado después del fix |
|---|---|---|
| BR-TUTOR-04: El tutor NO tiene historial | Violada por diseño — se enumera como limitación | Corregida — GPT recibe los últimos 10 mensajes |
| PROJECT_VISION Regla #6: Aprendizaje orientado a objetivos | Parcialmente violada — el tutor no puede hacer seguimiento de objetivos entre mensajes | Mejorada — el tutor puede recordar el progreso de la conversación |
| PROJECT_VISION Regla #8: IA como primer nivel de atención | El tutor sin memoria no puede dar atención personalizada real | Mejorada significativamente |

---

## 3. El riesgo crítico: `initialConversation` en `useAppStore`

### El problema

`useAppStore.js` líneas 4–42 contiene mensajes de bienvenida hardcodeados para misiones 1, 2 y 3:

```javascript
const initialConversation = {
  1: [{ id: 1, sender: "tutor", text: "Hello 👋 Today we will practice..." }],
  2: [{ id: 1, sender: "tutor", text: "Welcome to the Coffee Shop mission ☕..." }],
  3: [{ id: 1, sender: "tutor", text: "Let's talk about your daily routine 📚..." }],
};
```

Estos mensajes **no existen en Oracle** — son ficticios. Cuando `TutorChat` carga la misión:
1. `messages` del store ya contiene el mensaje hardcodeado de bienvenida
2. `loadHistory` descarga el historial real de Oracle y lo agrega al store
3. El store termina con mensajes duplicados o fuera de orden

Si construimos el historial para GPT desde `messages` (el store), enviaremos estos mensajes falsos como si fueran conversación real:
```
GPT recibe:
  system: [prompt del tutor]
  assistant: "Hello 👋 Today we will practice: Introduce Yourself..."  ← FICTICIO
  user: "Hello, my name is Carlos"   ← real
  assistant: "Nice to meet you Carlos..."   ← real
  user: "I have 22 years old"   ← real (mensaje actual)
```

El mensaje ficticio contamina el contexto del tutor. GPT puede basar respuestas en ese "primer mensaje" que nunca existió en la conversación real.

### La solución: `conversationHistoryRef` — historial limpio independiente del store

En lugar de leer el historial desde `useAppStore`, se mantiene un `useRef` local en `TutorChat` que se puebla **exclusivamente** desde Oracle y los mensajes reales de la sesión:

```
TutorChat monta
    │
    ├─ conversationHistoryRef = useRef([])   ← vacío inicialmente
    │
    └─ loadHistory (cuando conversationId está disponible)
            │
            └─ Oracle GET /chat/history/:id → [msg1, msg2, msg3, ...]
                    │
                    └─ conversationHistoryRef.current = history.map(msg => ({
                           sender: msg.sender,
                           text: msg.message_text,
                         }))
                       → historial limpio, sin initialConversation


Estudiante envía mensaje
    │
    ├─ GPT recibe: conversationHistoryRef.current.slice(-10)  ← limpio
    │
    └─ GPT responde
            │
            ├─ conversationHistoryRef.current.push({ sender: "student", text })
            └─ conversationHistoryRef.current.push({ sender: "tutor", text: reply })
               → historial actualizado para el próximo mensaje
```

Esta estrategia hace MVP-06 **completamente independiente de MVP-07**. No necesita tocar el store, no necesita eliminar `initialConversation`. El historial que GPT recibe es siempre limpio y correcto.

---

## 4. Cambios a realizar

### Cambio 1 — `TutorChat.jsx`: agregar `conversationHistoryRef`

**Ubicación:** bloque de refs, junto a los otros refs (después de línea 68)

```javascript
const conversationHistoryRef = useRef([]);
```

### Cambio 2 — `TutorChat.jsx`: poblar el historial desde Oracle en `loadHistory`

**Ubicación:** `useEffect` de `loadHistory` (actualmente líneas 151–178)

```javascript
// Después de history.forEach(addMessage):
conversationHistoryRef.current = history.map((msg) => ({
  sender: msg.sender,
  text: msg.message_text,
}));
```

El `useEffect` de `loadHistory` ya recibe el historial de Oracle. Solo hay que mapear el formato y guardarlo en el ref.

### Cambio 3 — `TutorChat.jsx`: pasar historial en `sendTranscriptMessage`

**Ubicación:** llamada a `sendChatMessage` en `sendTranscriptMessage`

```javascript
const result = await sendChatMessage({
  id_inscripcion: inscripcion.idInscripcion,
  mission_id: mission.id,
  mission,
  message: transcript,
  progress_percent: progressPercent,
  history: conversationHistoryRef.current.slice(-10),   // ← agregar
});
```

**Después de recibir la respuesta**, actualizar el historial:

```javascript
// Después de setCorrection(result.correction):
conversationHistoryRef.current.push({ sender: "student", text: transcript });
conversationHistoryRef.current.push({ sender: "tutor",   text: result.reply });
```

### Cambio 4 — `TutorChat.jsx`: pasar historial en `sendMessage`

**Ubicación:** llamada a `sendChatMessage` en `sendMessage` (idéntico al Cambio 3 pero con `input` en lugar de `transcript`)

```javascript
const result = await sendChatMessage({
  id_inscripcion: inscripcion.idInscripcion,
  mission_id: mission.id,
  mission,
  message: input,
  progress_percent: progressPercent,
  history: conversationHistoryRef.current.slice(-10),   // ← agregar
});
```

**Después de recibir la respuesta:**

```javascript
conversationHistoryRef.current.push({ sender: "student", text: input });
conversationHistoryRef.current.push({ sender: "tutor",   text: result.reply });
```

**Nota sobre el orden:** El historial se actualiza DESPUÉS de recibir la respuesta, no antes. Esto garantiza que el mensaje actual no está en la lista de `history` enviada a GPT — el mensaje actual se envía por separado como `message`. GPT recibe `[historial previo] + [mensaje actual]` en el orden correcto.

### Cambio 5 — `chat.py`: agregar campo `history` al modelo Pydantic

**Ubicación:** `ChatRequest` en `backend/app/routes/chat.py`

```python
from typing import Optional

class ChatRequest(BaseModel):
    id_inscripcion: int
    mission_id: int
    mission: dict
    message: str
    progress_percent: int
    history: list[dict] = []    # ← agregar con default vacío
```

El default `[]` garantiza compatibilidad hacia atrás — si el frontend envía una petición sin `history`, el campo simplemente queda vacío y GPT responde como antes.

**Pasar `history` a `get_tutor_response`:**

```python
response = get_tutor_response(
    request.mission,
    request.message,
    request.history         # ← agregar
)
```

### Cambio 6 — `openai_service.py`: construir el array `messages` con historial

**Ubicación:** función `get_tutor_response`

```python
def get_tutor_response(mission, user_message, history=[]):

    # ... system_prompt sin cambios ...

    messages = [{"role": "system", "content": system_prompt}]

    for msg in history[-10:]:
        role = "user" if msg["sender"] == "student" else "assistant"
        messages.append({"role": role, "content": msg["text"]})

    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        response_format={"type": "json_object"},
        messages=messages,
        temperature=0.7
    )
```

El límite de `-10` en `history[-10:]` toma los últimos 10 mensajes (5 pares intercambio). Esto es suficiente para dar contexto sin consumir tokens innecesarios.

---

## 5. Diagrama del flujo después del fix

```
TutorChat monta
    │
    ├─ conversationHistoryRef = useRef([])
    │
    └─ loadHistory() → Oracle GET /chat/history/:id
            └─ conversationHistoryRef.current = [
                 { sender: "student", text: "Hello, I am Maria" },
                 { sender: "tutor",   text: "Nice to meet you Maria!" },
                 { sender: "student", text: "I live in Mexico" },
                 { sender: "tutor",   text: "Great! Tell me more..." },
               ]

Estudiante escribe: "I have 22 years"
    │
    └─ sendChatMessage({
           message: "I have 22 years",
           history: [
             { sender: "student", text: "Hello, I am Maria" },
             { sender: "tutor",   text: "Nice to meet you Maria!" },
             { sender: "student", text: "I live in Mexico" },
             { sender: "tutor",   text: "Great! Tell me more..." },
           ]
         })
    │
    FastAPI — chat.py
    │
    └─ get_tutor_response(mission, "I have 22 years", history=[...])
            │
            └─ messages=[
                 { role: "system",    content: system_prompt },
                 { role: "user",      content: "Hello, I am Maria" },
                 { role: "assistant", content: "Nice to meet you Maria!" },
                 { role: "user",      content: "I live in Mexico" },
                 { role: "assistant", content: "Great! Tell me more..." },
                 { role: "user",      content: "I have 22 years" },    ← mensaje actual
               ]
    │
    GPT: ve el contexto completo, puede responder coherentemente
         puede notar: "Maria ya se presentó, vive en México, ahora dijo edad incorrectamente"
         responde: { reply: "...", correction: { original: "I have 22 years",
                                                 corrected: "I am 22 years old", ...} }
    │
    └─ conversationHistoryRef.current.push(
           { sender: "student", text: "I have 22 years" },
           { sender: "tutor",   text: "..." }
         )
       → historial actualizado para el próximo mensaje
```

---

## 6. Riesgos de implementación

### Riesgo 1 — Aumento de costo de tokens OpenAI (Medio)

**Descripción:** Cada mensaje ahora envía hasta 10 mensajes adicionales de contexto. Asumiendo ~50 tokens por mensaje, son ~500 tokens adicionales de input por llamada. Con GPT-4.1-mini el costo de input es ~$0.15/1M tokens. Para 1,000 mensajes de chat: incremento de ~$0.075 (7.5 centavos).

**Mitigación:** El límite `history[-10:]` es el control de costo. Con 10 mensajes de contexto el incremento es manageable para el volumen actual (plataforma en fase piloto). Si escala, el límite se puede reducir a 6 u 8 mensajes.

**Por qué vale la pena:** La diferencia pedagógica entre un tutor sin memoria y uno con contexto de 10 mensajes es el argumento de venta más importante del producto.

### Riesgo 2 — `response_format: json_object` con historial más largo (Bajo)

**Descripción:** GPT con `response_format: { type: "json_object" }` a veces falla cuando el contexto es muy largo o contradictorio. El historial adicional podría en casos extremos provocar respuestas malformadas que rompen el `json.loads()` en `openai_service.py`.

**Mitigación:** El `json.loads()` ya existe. Si falla, la excepción se propaga a FastAPI que retorna un 500. `TutorChat` ya tiene un `try/catch` que maneja el error. No hay crash del componente, solo un mensaje en consola. Riesgo de UX aceptable.

**Mitigación adicional recomendada (opcional):** Envolver `json.loads` en un try/except con fallback:
```python
try:
    return json.loads(response.choices[0].message.content)
except json.JSONDecodeError:
    return {"reply": "I'm sorry, could you repeat that?", "correction": None}
```

### Riesgo 3 — Historial vacío en el primer mensaje de la sesión (Muy Bajo)

**Descripción:** `conversationHistoryRef.current` empieza vacío. Si el estudiante envía un mensaje antes de que `loadHistory` complete (raro — requiere enviar mensaje en <500ms desde que monta el componente), GPT no tendrá historial de sesiones anteriores en ese primer mensaje.

**Comportamiento real:** GPT responde normalmente sin historial, exactamente como hace ahora. No hay error, solo se pierde el contexto de mensajes anteriores en ese primer mensaje específico. El historial se sincronizará correctamente para todos los mensajes subsiguientes.

**No se requiere mitigación** — el comportamiento degradado es idéntico al estado actual.

### Riesgo 4 — Divergencia entre los dos flujos de envío (Bajo)

**Descripción:** `TutorChat.jsx` tiene `sendMessage` y `sendTranscriptMessage` con lógica casi idéntica. El historial debe actualizarse en ambos (`push` tras recibir respuesta). Si se implementa solo en uno, el historial del ref se desincroniza: mensajes de texto no se registran en el historial que ve GPT cuando el siguiente mensaje es de voz, y viceversa.

**Mitigación:** El plan especifica explícitamente los cambios en ambas funciones (Cambios 3 y 4). El code review debe verificar ambas.

### Riesgo 5 — Mutable default argument en Python `history=[]` (Bajo)

**Descripción:** En Python, `def f(x=[])` es un antipatrón — la lista default se comparte entre todas las llamadas si se muta. En nuestro caso, `get_tutor_response(mission, user_message, history=[])`, el parámetro se usa como lectura en `for msg in history[-10:]` y nunca se muta. La operación `.slice` de Python crea una nueva lista, no modifica `history`. No hay riesgo real.

**Alternativa más idiomática (opcional):**
```python
def get_tutor_response(mission, user_message, history=None):
    if history is None:
        history = []
```

Se puede usar cualquiera de las dos. La diferencia es cosmética dado que `history` nunca se muta en esta función.

### Riesgo 6 — `initialConversation` del store (Mitigado por diseño)

**Descripción:** `useAppStore` tiene mensajes hardcodeados para misiones 1, 2, 3 que contaminarían el historial si se usara el store como fuente.

**Mitigación:** **El diseño del plan evita completamente este problema** usando `conversationHistoryRef` (poblado desde Oracle) en lugar de `messages` (del store). Los mensajes del store nunca llegan a GPT. MVP-06 es independiente de MVP-07.

---

## 7. Estrategia de despliegue

### Prerequisitos

**Técnicos:** Ninguno. MVP-06 no depende de ningún MVP previo. MVP-07 no es prerequisito gracias a la estrategia de `conversationHistoryRef`.

**Recomendados (no bloqueantes):** MVP-01 y MVP-02 ya están completados — los mensajes guardados en Oracle tienen `grammar_score` real. Aunque esto no afecta a MVP-06 directamente, el historial que GPT recibirá será de conversaciones con scores reales.

### Orden de deploy

El cambio es **frontend + backend simultáneo**, ambos en el mismo deploy:

1. **Backend primero (o simultáneo):** Actualizar `chat.py` y `openai_service.py`. El endpoint ahora acepta `history` pero con `default=[]` — sigue funcionando con el frontend viejo que no envía historial.
2. **Frontend:** Actualizar `TutorChat.jsx`. El frontend ahora envía `history` al backend ya preparado.

**Ventaja del default `[]`:** El backend es backwards-compatible. Se puede desplegar el backend antes que el frontend sin romper nada.

### No se requiere:
- Cambios en Oracle ADB
- Redeploy de módulos ORDS
- Migración de datos
- Cambios en el store de Zustand (no se rompe la versión persistida)

---

## 8. Estrategia de pruebas

### Prueba 1 — Coherencia conversacional básica (manual, ~10 minutos)

1. Abrir una misión. Enviar: *"Hello, my name is Carlos and I live in Mexico City."*
2. Tutor responde y hace una pregunta de seguimiento.
3. Responder: *"I am 25 years old."*
4. **Esperado:** El tutor puede referirse a Carlos, a México, o continuar la conversación coherentemente.
5. **Antes del fix:** Cada mensaje se procesa en aislamiento — el tutor puede presentarse de nuevo o ignorar el contexto.

### Prueba 2 — Corrección de error recurrente (manual, ~15 minutos)

1. Enviar: *"I go to school yesterday."* — error: "go" debería ser "went"
2. El tutor corrige.
3. En el mensaje siguiente enviar el mismo error: *"Yesterday I go to the park."*
4. **Esperado:** El tutor puede notar que es un error recurrente en esa sesión y enfatizarlo.
5. **Antes del fix:** El tutor trata el segundo error como uno completamente nuevo sin contexto.

### Prueba 3 — Historial de sesión anterior (manual, ~15 minutos)

1. Abrir misión. Enviar 3-4 mensajes. Cerrar la sesión.
2. Volver a abrir la misión (se crea nueva conversación en Oracle, pero el historial previo no está en la nueva conversación).
3. **Resultado esperado:** El historial de la sesión nueva empieza vacío (cada `POST /chat/start` crea nueva conversación). No hay error.

> **Nota:** El historial entre sesiones distintas no se preserva actualmente (BUG-05 del BACKLOG: múltiples conversaciones por misión). MVP-06 solo transmite el historial de la conversación actual. Esto es comportamiento correcto y esperado.

### Prueba 4 — Flujo de voz con historial (manual, ~10 minutos)

1. Enviar 2 mensajes de texto.
2. Enviar 1 mensaje de voz.
3. **Esperado:** El mensaje de voz también envía el historial de los mensajes anteriores.
4. **Verificación:** En los logs de FastAPI, el payload del request debe mostrar `history` con los mensajes previos.

### Prueba 5 — Backend backwards compatibility (manual/automatizable, ~5 minutos)

1. Enviar un POST directo a `http://127.0.0.1:8000/chat/message` sin el campo `history`:
```json
{
  "id_inscripcion": 1,
  "mission_id": 1,
  "mission": {"title": "Test", "description": "Test"},
  "message": "Hello",
  "progress_percent": 0
}
```
2. **Esperado:** Respuesta 200 con `{ reply, correction, grammar_score }`.
3. **No esperado:** Error 422 (Unprocessable Entity) por campo faltante.

### Prueba 6 — Límite de 10 mensajes (manual, ~20 minutos)

1. Enviar 15 mensajes consecutivos.
2. **Esperado:** FastAPI recibe `history` con máximo 10 mensajes (los últimos 10).
3. **Verificación:** Loggear `len(history)` en `get_tutor_response` durante la prueba.
4. **Verificación adicional:** GPT responde correctamente — no hay errores de tokens ni respuestas malformadas.

### Prueba 7 — No-regresión del grammar score (manual, ~5 minutos)

1. Enviar un mensaje con error gramatical. Verificar que `grammar_score` sigue calculándose correctamente (55 si hay corrección, 90 si no).
2. **Esperado:** El campo `grammar_score` sigue presente en la respuesta. `USER_PROGRESS.GRAMMAR_SCORE` se actualiza correctamente.
3. **Verificación:** Este test protege la integridad de MVP-01.

---

## 9. Resumen de artefactos afectados

### Archivos a modificar (4 cambios en 3 archivos)

| Archivo | Cambios |
|---|---|
| `src/components/mission/TutorChat.jsx` | +1 ref (`conversationHistoryRef`), +mapa en `loadHistory`, +`history` en ambos `sendChatMessage`, +`push` tras recibir respuesta en ambas funciones |
| `backend/app/routes/chat.py` | +`history: list[dict] = []` en `ChatRequest`, pasar `history` a `get_tutor_response` |
| `backend/app/services/openai_service.py` | +parámetro `history=[]`, construir `messages` con historial |

### No se modifica nada de esto

| Artefacto | Razón |
|---|---|
| `src/services/chatService.js` | Ya serializa todo el objeto recibido — `history` se incluye automáticamente |
| `src/store/useAppStore.js` | `conversationHistoryRef` evita cualquier dependencia del store para GPT |
| `backend/app/services/progress_service.py` | XP y progreso no cambian |
| `backend-oracle/ords/chat.sql` | `GET /chat/history` ya funciona, `POST /chat/message` no cambia |
| Cualquier tabla Oracle | Solo lectura de datos ya existentes |

---

## 10. Formato de datos del historial

### En el frontend → backend

```javascript
history: [
  { sender: "student", text: "Hello, my name is Maria" },
  { sender: "tutor",   text: "Nice to meet you Maria! How are you?" },
  { sender: "student", text: "I am fine, thank you" },
  { sender: "tutor",   text: "Great! Tell me more about yourself." },
]
```

### En el backend → OpenAI

```python
[
  { "role": "system",    "content": "You are an English tutor..." },
  { "role": "user",      "content": "Hello, my name is Maria" },
  { "role": "assistant", "content": "Nice to meet you Maria! How are you?" },
  { "role": "user",      "content": "I am fine, thank you" },
  { "role": "assistant", "content": "Great! Tell me more about yourself." },
  { "role": "user",      "content": "I have 22 years" },   # ← mensaje actual
]
```

**Mapping de sender:**
- `"student"` → `"user"` (role de OpenAI)
- `"tutor"` → `"assistant"` (role de OpenAI)

---

## 11. Decisiones tomadas por diseño

| Decisión | Elección | Razón |
|---|---|---|
| Fuente del historial | `conversationHistoryRef` (ref local) | Evita contaminación de `initialConversation` del store. Independiente de MVP-07. |
| Límite de mensajes | 10 mensajes (5 pares) | Balance entre contexto pedagógico y costo de tokens |
| Cuándo actualizar el ref | Después de recibir la respuesta de GPT | El mensaje actual va como `message`, no como historia |
| Default del campo `history` | `list[dict] = []` | Compatibilidad hacia atrás — el backend acepta peticiones sin historial |
| Sin cambios en Oracle | — | No necesario — el historial se gestiona en memoria de la sesión |

---

## 12. Dependencia con MVP-07

MVP-07 (eliminar `initialConversation` del store) sigue siendo una mejora necesaria para:
- Limpiar los mensajes duplicados que el estudiante ve en la UI
- Garantizar que `key={message.id}` de React no tenga colisiones con IDs ficticios
- Mantener coherencia entre el store local y Oracle

**MVP-06 no bloquea ni es bloqueado por MVP-07.** Son mejoras ortogonales que pueden implementarse en cualquier orden. La estrategia de `conversationHistoryRef` de este plan hace que la calidad del historial enviado a GPT sea independiente del estado del store.

---

---

## 13. Resultados de pruebas — 2026-06-02

Todas las pruebas verificadas manualmente:

| # | Acción | Resultado esperado | Estado |
|---|---|---|---|
| 1 | Presentarse y enviar 2-3 mensajes más | El tutor hace referencia al nombre/ciudad en mensajes posteriores | ✅ |
| 2 | Cometer el mismo error gramatical dos veces | El tutor señala el error recurrente | ✅ |
| 3 | POST directo sin campo `history` via Postman | Respuesta 200 — no 422 | ✅ |
| 4 | Enviar 15 mensajes y verificar logs del backend | `enviado a GPT` nunca supera 10 | ✅ |
| 5 | Flujo de voz con historial | Historial incluido; grammar_score y pronunciationScore intactos | ✅ |
| 6 | No-regresión grammar score (MVP-01) | `grammar_score` sigue siendo 90 o 55 según corrección | ✅ |
| 7 | Coherencia conversacional en sesión larga | El tutor mantiene hilo de la conversación | ✅ |

**No se detectaron regresiones** en MVP-01 (grammar score), MVP-02 (pronunciation score), MVP-05 (tiempo de estudio) ni en el flujo de voz.

---

*Implementado y verificado el 2026-06-02.*
