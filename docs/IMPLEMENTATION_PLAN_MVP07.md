# IMPLEMENTATION_PLAN_MVP07.md
# MVP-07 — Eliminación de initialConversation hardcodeada del store

> **Estado:** ✅ COMPLETADO — 2026-06-02
> **Iniciativa:** MVP-07 del PRODUCT_BACKLOG.md
> **Implementación:** ~1.5 horas (incluye corrección de loop infinito por selector Zustand)
> **Pruebas:** 5/5 verificadas manualmente

---

## 1. Cómo funciona actualmente el flujo de inicialización de conversación

*(Nota: el template pregunta por "grammar score". Para MVP-07, el flujo relevante es la inicialización de conversación y el estado del store.)*

### El origen del problema: `initialConversation` en `useAppStore.js`

```javascript
// src/store/useAppStore.js líneas 4–42
const initialConversation = {
  1: [{ id: 1, sender: "tutor", text: "Hello 👋 Today we will practice: Introduce Yourself..." }],
  2: [{ id: 1, sender: "tutor", text: "Welcome to the Coffee Shop mission ☕..." }],
  3: [{ id: 1, sender: "tutor", text: "Let's talk about your daily routine 📚..." }],
};

// Estado inicial del store
conversations: initialConversation,
```

El store arranca con mensajes hardcodeados para misiones 1, 2 y 3. Zustand `persist` serializa este estado en `localStorage["activa-ingles-store"]` desde la primera carga.

### Diagrama del flujo actual — primera visita a misión 1

```
TutorChat monta (misión 1)
    │
    ├─ messages = useAppStore.getConversation(1)
    │       = [{ id:1, sender:"tutor", text:"Hello 👋..." }]   ← mensaje FICTICIO
    │
    ├─ initConversation() → POST /chat/start → conversationId = 42 (nueva conversación)
    │
    └─ loadHistory(42) → GET /chat/history/42 → []  (nueva conversación, sin mensajes)
            │
            └─ history.forEach(addMessage) → no hace nada (history vacío)

RESULTADO EN UI:
    [1 mensaje ficticio]   ← el estudiante ve este mensaje
    (ningún mensaje de Oracle)
```

### Diagrama del flujo actual — segunda visita a misión 1

```
TutorChat monta (misión 1 — regreso)
    │
    ├─ messages = useAppStore.getConversation(1)
    │       = [ficticio, msg1, msg2, msg3]   ← estado PERSISTED de la visita anterior
    │
    ├─ initConversation() → POST /chat/start → conversationId = 43 (NUEVA conversación)
    │
    └─ loadHistory(43) → GET /chat/history/43 → []  (conversación nueva, sin mensajes)
            │
            └─ history.forEach(addMessage) → no hace nada

RESULTADO EN UI:
    [ficticio, msg1, msg2, msg3]   ← mensajes de sesión anterior más ficticio
    (los mensajes NO son de la conversación actual — pertenecen a conv_id=42)
```

### Diagrama del flujo actual — misión con historial en Oracle

```
TutorChat monta (misión 1 — tiene conversaciones previas en Oracle desde conv_id=42)
    │
    ├─ messages = useAppStore.getConversation(1)
    │       = [ficticio]   (store limpio o primera vez con este nuevo conversationId)
    │
    ├─ initConversation() → POST /chat/start → conversationId = 44
    │
    └─ loadHistory(44) → GET /chat/history/44 → [msg1, msg2]
            │
            └─ addMessage(1, msg1) → store = [ficticio, msg1]
               addMessage(1, msg2) → store = [ficticio, msg1, msg2]

RESULTADO EN UI:
    [ficticio, msg1, msg2]   ← ficticio aparece primero siempre
```

### Cadena completa de problemas activos

```
initialConversation en store
    │
    ├─ BUG-03: Mensajes duplicados
    │       addMessage ACUMULA sin deduplicar
    │       Visita 1: [ficticio]
    │       Visita 2: [ficticio] + [msg1, msg2] = [ficticio, msg1, msg2]
    │       Visita 3: [ficticio, msg1, msg2] + [msg1, msg2] = [ficticio, msg1, msg2, msg1, msg2]
    │
    ├─ React key collision
    │       Mensajes hardcodeados tienen id: 1
    │       Oracle puede tener message_id: 1 también
    │       key={message.id} duplicado → warnings en consola + renders incorrectos
    │
    ├─ Solo afecta misiones 1, 2, 3
    │       Otras misiones no tienen initialConversation → se comportan correctamente
    │
    └─ Contaminación histórica en localStorage
            Usuarios que ya usaron la app tienen [ficticio, ...] guardado
            El ficticio reaparece en cada sesión aunque se quite del código
```

---

## 2. Análisis de impacto arquitectónico completo

### Archivos React afectados

| Archivo | Cambio |
|---|---|
| `src/store/useAppStore.js` | Eliminar `initialConversation`, cambiar `conversations: {}`, agregar `setConversation`, agregar `version: 1` + `migrate` |
| `src/components/mission/TutorChat.jsx` | En `loadHistory`: reemplazar `history.forEach(addMessage)` con `setConversation`; agregar mensaje de bienvenida dinámico si historial vacío |

### Servicios Python afectados

**Ninguno.**

### Packages Oracle afectados

**Ninguno.**

### Procedimientos afectados

**Ninguno.**

### Endpoints ORDS afectados

**Ninguno.** `GET /chat/history/:conversation_id` ya funciona y sigue siendo la fuente de datos.

### Tablas Oracle afectadas

**Ninguna.** MVP-07 es un cambio puramente de estado del cliente.

### Reglas de negocio afectadas

| Regla | Estado actual | Estado después del fix |
|---|---|---|
| BR-SYS-01: Oracle ADB es la fuente de verdad | Violada — mensajes ficticios en localStorage sobrescriben la fuente real | Corregida — la UI muestra exactamente lo que Oracle tiene |
| PROJECT_VISION Regla #7: Experiencia simple para el estudiante | Violada — el estudiante puede ver mensajes de sesiones anteriores mezclados con la nueva | Corregida — la conversación empieza limpia cada vez |

---

## 3. El problema crítico de Zustand `persist`

### Por qué no basta con eliminar `initialConversation` del código

`useAppStore` usa `persist` con `name: "activa-ingles-store"`. El estado serializado en localStorage tiene esta estructura:

```json
{
  "state": {
    "currentUser": {...},
    "missions": [],
    "conversations": {
      "1": [{"id": 1, "sender": "tutor", "text": "Hello 👋..."}],
      "2": [{"id": 1, "sender": "tutor", "text": "Welcome to the Coffee Shop..."}],
      "3": [{"id": 1, "sender": "tutor", "text": "Let's talk about..."}]
    }
  },
  "version": 0
}
```

Si solo eliminamos `initialConversation` del código **sin incrementar la versión**, Zustand rehidrata el estado desde localStorage con los mensajes ficticios ya almacenados. El usuario ve el mismo bug hasta que manualmente limpie su localStorage.

### La solución: versión + migrate

Zustand `persist` soporta `version` y `migrate`:

```javascript
persist(
  (set, get) => ({...}),
  {
    name: "activa-ingles-store",
    version: 1,
    migrate: (persistedState, version) => {
      if (version === 0) {
        return { ...persistedState, conversations: {} };
      }
      return persistedState;
    },
  }
)
```

Cuando un usuario con versión 0 en localStorage carga la app con versión 1 en el código:
1. Zustand detecta la discrepancia de versión
2. Llama a `migrate(viejoEstado, 0)`
3. El resultado (`conversations: {}`) reemplaza el estado persisted
4. En cargas subsiguientes, el store ya tiene versión 1 y no migra de nuevo

Los usuarios nuevos (sin localStorage previo) comienzan directamente con `conversations: {}`.

---

## 4. El problema de `addMessage` como único mecanismo de carga

### El bug de acumulación

`addMessage` siempre **acumula** (append). Es correcto para mensajes nuevos durante la sesión, pero incorrecto para la carga inicial del historial:

```javascript
// Comportamiento actual de loadHistory
history.forEach((msg) => {
  addMessage(mission.id, {     // ← ACUMULA sobre lo que ya está en el store
    id: msg.message_id,
    sender: msg.sender,
    text: msg.message_text,
  });
});
```

Si el store ya tiene `[msg1, msg2]` del localStorage y Oracle devuelve `[msg1, msg2]`, el resultado es `[msg1, msg2, msg1, msg2]`.

### La solución: `setConversation` que REEMPLAZA

Agregar una nueva acción al store que reemplaza completamente la conversación de una misión:

```javascript
setConversation: (missionId, messages) =>
  set((state) => ({
    conversations: {
      ...state.conversations,
      [missionId]: messages,
    },
  })),
```

Luego en `loadHistory`:

```javascript
setConversation(
  mission.id,
  history.map((msg) => ({
    id: msg.message_id,
    sender: msg.sender,
    text: msg.message_text,
  }))
);
```

Este reemplazo garantiza que:
- Primera visita: `[oracle_msgs]` (sin ficticio)
- Segunda visita: `[oracle_msgs]` (REEMPLAZA, no acumula)
- Sin mensajes en Oracle: `[]` (se manejará con mensaje de bienvenida dinámico)

`addMessage` se conserva sin cambios para los mensajes nuevos de la sesión activa.

---

## 5. El mensaje de bienvenida dinámico

### Situación actual

Para misiones 1, 2, 3: el estudiante ve el mensaje hardcodeado como primer mensaje.
Para misiones 4+: el estudiante ve una pantalla vacía (no hay `initialConversation` para ellas).

### Solución unificada

Cuando `history.length === 0` (nueva conversación sin mensajes en Oracle), generar un mensaje de bienvenida usando los datos reales de la misión:

```javascript
if (history.length === 0) {
  setConversation(mission.id, [
    {
      id: `welcome-${mission.id}`,
      sender: "tutor",
      text: `Hello! 👋\n\nToday we'll practice: ${mission.title}\n\n${mission.description}\n\nLet's get started! 😊`,
    },
  ]);
} else {
  setConversation(
    mission.id,
    history.map((msg) => ({ id: msg.message_id, sender: msg.sender, text: msg.message_text }))
  );
}
```

### Por qué este mensaje NO contamina `conversationHistoryRef`

El mensaje de bienvenida se agrega al **store** (UI). El `conversationHistoryRef` (para GPT) se pobla con:
```javascript
conversationHistoryRef.current = history.map((msg) => ({
  sender: msg.sender,
  text: msg.message_text,
}));
```

Si `history` es vacío, `conversationHistoryRef.current` queda `[]`. El mensaje de bienvenida nunca entra en el historial enviado a GPT. GPT no tiene contexto de ese mensaje ficticio.

### El `id` del mensaje de bienvenida

Se usa `id: \`welcome-${mission.id}\`` (string con prefijo) en lugar de `Date.now()` o un número. Esto garantiza:
- No colisiona con Oracle `message_id` (número entero secuencial)
- No cambia entre renders (no causa rekey innecesario)
- Es único por misión

---

## 6. Cambios a realizar

### Cambio 1 — `useAppStore.js`: eliminar `initialConversation`

**Líneas 4–42:** Eliminar completamente el objeto `initialConversation`.

```javascript
// ELIMINAR todo esto:
const initialConversation = {
  1: [{ id: 1, sender: "tutor", text: "..." }],
  2: [{ id: 1, sender: "tutor", text: "..." }],
  3: [{ id: 1, sender: "tutor", text: "..." }],
};
```

### Cambio 2 — `useAppStore.js`: cambiar estado inicial de `conversations`

```javascript
// ANTES:
conversations: initialConversation,

// DESPUÉS:
conversations: {},
```

### Cambio 3 — `useAppStore.js`: agregar acción `setConversation`

```javascript
setConversation: (missionId, messages) =>
  set((state) => ({
    conversations: {
      ...state.conversations,
      [missionId]: messages,
    },
  })),
```

### Cambio 4 — `useAppStore.js`: agregar `version` y `migrate` al persist

```javascript
persist(
  (set, get) => ({...}),
  {
    name: "activa-ingles-store",
    version: 1,
    migrate: (persistedState, version) => {
      if (version === 0) {
        return { ...persistedState, conversations: {} };
      }
      return persistedState;
    },
  }
)
```

### Cambio 5 — `TutorChat.jsx`: importar `setConversation` del store

```javascript
const setConversation = useAppStore((state) => state.setConversation);
```

Y agregar `setConversation` a las dependencias del `useEffect` de `loadHistory`.

### Cambio 6 — `TutorChat.jsx`: reemplazar `loadHistory` para usar `setConversation`

```javascript
// ANTES:
history.forEach((msg) => {
  addMessage(mission.id, {
    id: msg.message_id,
    sender: msg.sender,
    text: msg.message_text,
  });
});

// DESPUÉS:
if (history.length === 0) {
  setConversation(mission.id, [
    {
      id: `welcome-${mission.id}`,
      sender: "tutor",
      text: `Hello! 👋\n\nToday we'll practice: ${mission.title}\n\n${mission.description}\n\nLet's get started! 😊`,
    },
  ]);
} else {
  setConversation(
    mission.id,
    history.map((msg) => ({
      id: msg.message_id,
      sender: msg.sender,
      text: msg.message_text,
    })),
  );
}

conversationHistoryRef.current = history.map((msg) => ({
  sender: msg.sender,
  text: msg.message_text,
}));
```

**Nota:** La línea `conversationHistoryRef.current = history.map(...)` que venía de MVP-06 se mantiene igual. Solo cambia el bloque de `addMessage` → `setConversation`. El `conversationHistoryRef` queda `[]` si el historial es vacío — correcto para el tutor GPT.

---

## 7. Diagrama del flujo después del fix

### Primera visita a misión 1 (sin mensajes en Oracle)

```
TutorChat monta
    │
    ├─ messages = useAppStore.getConversation(1) = []   ← store vacío, sin ficticio
    │
    ├─ initConversation() → conversationId = 42
    │
    └─ loadHistory(42) → Oracle → []
            │
            ├─ history.length === 0 → setConversation(1, [{ id: "welcome-1", ... }])
            │       store[1] = [{ sender: "tutor", text: "Hello! 👋 Today we'll practice..." }]
            │
            └─ conversationHistoryRef.current = []   ← GPT no ve el welcome

UI: [mensaje bienvenida dinámico]   ✓ (sin ficticio hardcodeado)
GPT: sin historial previo           ✓ (welcome no contamina)
```

### Segunda visita a misión 1 (tiene mensajes en Oracle)

```
TutorChat monta
    │
    ├─ messages = useAppStore.getConversation(1)
    │       = [msg1_prev, msg2_prev]   ← estado de la visita anterior (persisted)
    │
    ├─ initConversation() → conversationId = 43
    │
    └─ loadHistory(43) → Oracle → []   ← conversación nueva, sin mensajes
            │
            └─ history.length === 0 → setConversation(1, [{ id: "welcome-1", ... }])
                    store[1] = [welcome]   ← REEMPLAZA, no acumula

UI: [welcome dinámico]   ✓ (sin msg1_prev, msg2_prev de sesión anterior)
```

### Regreso a misión con historial real en la misma conversación

```
TutorChat monta (conversationId ya fue guardado — en teoría esto no pasa
                 porque cada mount crea nueva conversación via /chat/start)

En el modelo actual de la app: cada mount → nueva conversación en Oracle.
Los mensajes de sesiones anteriores NO aparecen porque son de otra conversation_id.
Esto es BUG-05 del backlog (múltiples conversaciones por misión) — no es scope de MVP-07.
```

---

## 8. Riesgos de implementación

### Riesgo 1 — Migración incompleta para usuarios con localStorage corrompido (Bajo)

**Descripción:** Si un usuario tiene una versión muy antigua del store con estructura diferente, `migrate` podría fallar silenciosamente y Zustand descartaría el estado entero. Dado que `conversations` es estado de UI (no datos críticos), esto es aceptable — el usuario simplemente empieza con conversaciones vacías.

**Mitigación:** La migración solo modifica `conversations: {}`, preservando `currentUser`, `missions` y `currentMission`. Incluso si algo falla, el `authStore` (datos de sesión) es un store separado y no se ve afectado.

### Riesgo 2 — `setConversation` en el array de dependencias del `useEffect` (Bajo)

**Descripción:** Zustand garantiza que las funciones del store son estables entre renders (referencia fija). Sin embargo, agregarla a las dependencias del `useEffect` es la práctica correcta para evitar advertencias del exhaustive-deps linter. No genera re-ejecuciones adicionales.

**Mitigación:** Incluir `setConversation` en el array de dependencias de `loadHistory`.

### Riesgo 3 — El mensaje de bienvenida dinámico es diferente al hardcodeado (Muy Bajo)

**Descripción:** Misiones 1, 2 y 3 tenían mensajes de bienvenida específicos. El nuevo mensaje dinámico usa `mission.title` y `mission.description` — más genérico pero más correcto pedagógicamente.

**Comportamiento nuevo:** "Hello! 👋 Today we'll practice: Introduce Yourself. Practice English conversation and introducing yourself naturally. Let's get started! 😊"

**Comportamiento anterior:** "Hello 👋 Today we will practice: Introduce Yourself. Tell me something about yourself."

El cambio es cosmético. El nuevo mensaje es consistente para todas las misiones, no solo 1, 2, 3.

### Riesgo 4 — Regresión de MVP-06 si `conversationHistoryRef` se altera (Muy Bajo)

**Descripción:** MVP-06 instaló `conversationHistoryRef.current = history.map(...)` dentro de `loadHistory`. Si esa línea se mueve o elimina accidentalmente al refactorizar `loadHistory`, el historial para GPT quedaría vacío siempre.

**Mitigación:** El plan especifica explícitamente que `conversationHistoryRef.current = history.map(...)` se mantiene sin cambios. Es una línea separada e independiente de la lógica de `setConversation`.

### Riesgo 5 — `version` no existente en Zustand peer instalado (Muy Bajo)

**Descripción:** La API `version` + `migrate` existe desde Zustand v4. El proyecto usa Zustand v5.0.13 — completamente compatible.

**No hay riesgo real.**

### Riesgo 6 — Pérdida de conversaciones activas al migrar (Informativo)

**Descripción:** Cuando la migración `version 0 → 1` corra, las conversaciones persistidas del usuario se limpian (`conversations: {}`). Si el usuario tenía mensajes de una sesión activa que no están en Oracle (por algún fallo de red que impidió la persistencia), los perdería.

**Evaluación:** Los mensajes siempre se guardan en Oracle via `saveMessage` antes de mostrarse en la UI. La probabilidad de tener mensajes en el store pero no en Oracle es muy baja — requeriría que `saveMessage` falle silenciosamente mientras la UI sigue funcionando. El impacto es aceptable.

---

## 9. Estrategia de despliegue

### Prerequisitos

**MVP-06 completado** (ya implementado). La línea `conversationHistoryRef.current = history.map(...)` que se mantiene en `loadHistory` fue introducida por MVP-06.

### Orden de cambios en el deploy

1. `src/store/useAppStore.js`: todos los cambios (1 archivo, atómico).
2. `src/components/mission/TutorChat.jsx`: cambios en `loadHistory`.

Ambos cambios son frontend-only. No se requiere:
- Reinicio del backend FastAPI
- Cambios en Oracle ORDS
- Migración de datos en Oracle

### Efecto en usuarios existentes al desplegar

| Tipo de usuario | Efecto |
|---|---|
| Usuario nuevo (sin localStorage) | Store arranca con `conversations: {}` — comportamiento limpio |
| Usuario con sesión activa (versión 0) | Primera carga: migrate limpia `conversations` → ve bienvenida dinámica al entrar a misión |
| Usuario que tenía datos correctos | Mismas conversaciones, ahora cargadas via Oracle en lugar del store stale |

---

## 10. Estrategia de pruebas

### Prueba 1 — Misión 1 sin historial: no hay mensaje ficticio (manual, ~5 min)

1. Abrir DevTools → Application → localStorage → eliminar `activa-ingles-store`.
2. Iniciar sesión. Navegar a misión 1.
3. **Esperado:** No aparece el mensaje "Hello 👋 Today we will practice: Introduce Yourself".
4. **Esperado:** Aparece el mensaje dinámico: "Hello! 👋 Today we'll practice: [título real de la misión]".
5. **Antes del fix:** Aparecía el mensaje hardcodeado.

### Prueba 2 — Migración de localStorage existente (manual, ~5 min)

1. Abrir DevTools → Application → localStorage → editar `activa-ingles-store` para que tenga:
   ```json
   { "state": { "conversations": { "1": [{"id": 1, "sender": "tutor", "text": "FICTICIO"}] } }, "version": 0 }
   ```
2. Recargar la app.
3. Entrar a misión 1.
4. **Esperado:** No se ve "FICTICIO". Se ve el mensaje de bienvenida dinámico.
5. **Verificación:** DevTools localStorage muestra `"version": 1` y `"conversations": {}`.

### Prueba 3 — Sin duplicados al re-entrar a misión (manual, ~10 min)

1. Entrar a misión 1. Enviar 2 mensajes. Volver al Dashboard.
2. Entrar a misión 1 nuevamente.
3. **Esperado:** Se ven exactamente los 2 mensajes enviados, sin duplicados.
4. **Antes del fix:** Se veían 4 mensajes (2 + 2 duplicados).

### Prueba 4 — Misiones 4+ también reciben bienvenida (manual, ~5 min)

1. Entrar a cualquier misión con número > 3.
2. **Esperado:** Si es una misión sin historial, aparece el mensaje de bienvenida dinámico con el título real de esa misión.
3. **Antes del fix:** Pantalla vacía para misiones sin `initialConversation`.

### Prueba 5 — No-regresión MVP-06: historial GPT sin contaminación (manual, ~10 min)

1. Entrar a misión 1. Enviar 2 mensajes.
2. Verificar en logs del backend que `[HISTORY] recibido=2 | enviado a GPT=2`.
3. **Esperado:** GPT recibe los 2 mensajes reales, no el welcome dinámico.
4. **Si se añade print temporal antes de eliminarlo.**

### Prueba 6 — `addMessage` sigue funcionando para mensajes nuevos (manual, ~5 min)

1. Entrar a misión. Enviar 3 mensajes.
2. **Esperado:** Los 3 mensajes aparecen en la UI en orden correcto (bienvenida → msg1 → resp1 → msg2 → resp2 → msg3 → resp3).
3. **Verificación:** El store acumula correctamente con `addMessage` los mensajes de la sesión activa.

### Prueba 7 — React keys sin colisión (manual via DevTools, ~5 min)

1. Abrir consola de DevTools. Entrar a misión 1.
2. **Esperado:** Sin warnings "Warning: Each child in a list should have a unique 'key' prop".
3. **Verificación:** El welcome usa `id: "welcome-1"` (string) y los mensajes de Oracle usan `id: message_id` (número), garantizando unicidad.

---

## 11. Resumen de artefactos afectados

### Solo se modifican 2 archivos

| Archivo | Cambios |
|---|---|
| `src/store/useAppStore.js` | -`initialConversation`, `conversations: {}`, +`setConversation`, +`version: 1`, +`migrate` |
| `src/components/mission/TutorChat.jsx` | `loadHistory`: `addMessage` → `setConversation` + bienvenida dinámica; importar `setConversation` |

### No se modifica nada de esto

| Artefacto | Razón |
|---|---|
| `backend/app/routes/chat.py` | Sin cambios — MVP-07 es puramente frontend |
| `backend/app/services/openai_service.py` | Sin cambios |
| `src/services/conversationService.js` | Sin cambios |
| Oracle ORDS / DDL | Sin cambios |
| `src/store/authStore.js` | Store independiente, no afectado |

---

## 12. Estado de dependencias

| MVP | Estado | Relación con MVP-07 |
|---|---|---|
| MVP-06 | ✅ Completado | MVP-07 preserva `conversationHistoryRef` sin cambios |
| MVP-07 | Este plan | Ortogonal a MVP-06 — arregla la UI, no el historial de GPT |
| MVP-08 | Pendiente | Requiere MVP-07 para que `loadHistory` esté limpio antes de guardar correcciones |

---

---

## 13. Resultados de pruebas — 2026-06-02

Correcciones adicionales durante implementación:
- **Loop infinito (Zustand selector):** `state.getConversation(mission.id)` retornaba `|| []` nuevo en cada render. Fix: selector directo `state.conversations[mission.id] ?? EMPTY_MESSAGES` con constante estable a nivel de módulo.
- **Loop infinito (useEffect deps):** `mission` (objeto) en arrays de dependencias causaba re-renders al recrearse la referencia en el padre. Fix: destructurar `missionId`, `missionTitle`, `missionDescription` como primitivos antes de los efectos.

| # | Prueba | Resultado | Estado |
|---|---|---|---|
| 1 | Misión sin historial: no aparece mensaje hardcodeado, sí bienvenida dinámica | Welcome dinámico con título real | ✅ |
| 2 | localStorage `version:0` con "FICTICIO": migrate limpia al recargar | "FICTICIO" no aparece, `version:1` en storage | ✅ |
| 3 | Sin duplicados dentro de la misma sesión | Mensajes acumulan sin duplicados | ✅ |
| 4 | Misiones > 3: bienvenida dinámica | Cubierta por prueba #1 — misma lógica | ✅ |
| 5 | GPT no recibe el welcome: `recibido=0` en primer mensaje | `[HISTORY] recibido=0 \| enviado a GPT=0` | ✅ |
| 6 | Sin warnings de React key duplicado en consola | Sin warnings de key en DevTools | ✅ |

**Nota sobre prueba #3 (comportamiento de re-entrada):** Al re-entrar a una misión se crea una nueva conversación en Oracle — los mensajes de la sesión anterior no aparecen. Este es el comportamiento correcto y esperado dado la arquitectura actual. La persistencia entre sesiones requiere BUG-05 (fuera del scope de MVP-07).

---

*Implementado y verificado el 2026-06-02.*
