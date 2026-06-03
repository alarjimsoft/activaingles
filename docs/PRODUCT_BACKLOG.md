# PRODUCT_BACKLOG.md
# Activa Inglés — Product Backlog Oficial

> **Roles:** Product Owner · Arquitecto de Software · Líder Técnico
> **Fecha:** 2026-06-01
> **Fuentes:** PROJECT_VISION.md · PROJECT_CONTEXT.md · ARCHITECTURE.md · DATABASE_MAP.md · BUSINESS_RULES.md · GAP_ANALYSIS.md · TECHNICAL_DEBT.md · CLAUDE.md · análisis completo de backend-oracle/
> **Estado del proyecto al generar este documento:** ~44% de la visión total · ~72% de Fase 1
> **Última actualización:** 2026-06-03 — MVP-10 COMPLETADO (MVP-01 al MVP-10 completados)

---

## Convenciones

| Campo | Opciones |
|---|---|
| Complejidad técnica | Baja · Media · Alta |
| Estimación | Pequeña (1-3 días) · Mediana (1-2 semanas) · Grande (2-4 semanas) · Muy Grande (+1 mes) |
| Prioridad | MVP Crítico · Alta · Media · Baja |

---

---

# SECCIÓN 1 — MVP CRÍTICO

> Iniciativas que corrigen datos corruptos, bugs de funcionamiento activo o inconsistencias que invalidan la integridad pedagógica del sistema.
> El producto no debe presentarse a usuarios reales sin estas correcciones.

---

## ✅ MVP-01 — Corrección del Grammar Score real — COMPLETADO 2026-06-01

### Descripción
`grammarScore: 85` está hardcodeado en tres lugares del sistema: `TutorChat.jsx:367`, `TutorChat.jsx:475` y `backend/app/routes/chat.py:53`. Oracle recibe este valor ficticio en cada mensaje y lo almacena en `USER_PROGRESS.GRAMMAR_SCORE`. GPT ya devuelve `correction != null` cuando detecta errores gramaticales — ese dato existe pero no se aprovecha.

**Lógica propuesta:**
- GPT devuelve `correction: null` → score = 90 (buen uso gramatical)
- GPT devuelve `correction` con datos → score = 55 (error detectado y corregido)
- Esta escala puede refinarse iterativamente

### Problema que resuelve
USER_PROGRESS contiene datos pedagógicos inválidos. El Dashboard muestra `avg_grammar = 85` para todos los estudiantes. El XP asigna el bonus de gramática a todos siempre (`+10 XP si grammar_score >= 80`), eliminando cualquier diferenciación por desempeño real. Viola directamente las Reglas #4 y #5 de PROJECT_VISION.md.

### Valor para el usuario
El estudiante ve un score de gramática que refleja su desempeño real. El XP tiene significado pedagógico. Los errores frecuentes pueden identificarse en futuras analíticas.

### Valor para el negocio
Las instituciones que contrataron la plataforma reciben datos de calidad. El Dashboard pedagógico muestra métricas reales. La credibilidad del producto como herramienta educativa depende de esto.

### Complejidad técnica
**Baja** — El dato necesario ya existe en la respuesta de GPT. Es un cambio de lógica en dos archivos.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `TutorChat.jsx` (funciones `sendMessage` y `sendTranscriptMessage`) |
| **Servicios Python** | `backend/app/routes/chat.py` (función `chat_message`) |
| **Servicios Python** | `backend/app/services/progress_service.py` (función `calculate_xp`) |
| **Tablas afectadas** | `USER_PROGRESS.GRAMMAR_SCORE` |
| **Endpoints ORDS** | `POST /progress/update` (recibe el campo `grammar_score`) |

### Riesgos
- El score binario (90/55) puede generar varianza alta en el promedio del Dashboard para estudiantes con pocas interacciones.
- Requiere cambio coordinado frontend + backend en el mismo deploy. Si solo se cambia uno de los dos, el sistema queda inconsistente.
- Los datos históricos en Oracle tendrán `GRAMMAR_SCORE = 85`. El promedio del Dashboard mejorará gradualmente conforme el estudiante interactúe.

### Estimación
**Pequeña** (3-4 horas de implementación + pruebas)

---

## ✅ MVP-02 — Corrección del Pronunciation Score en mensajes de texto — COMPLETADO 2026-06-01

### Descripción
En `TutorChat.jsx:477`, la línea que pasa el score real de pronunciación está comentada:
```javascript
// pronunciationScore: pronunciationResult?.pronunciation_score || 0,
pronunciationScore: 0,
```
Oracle recibe `0` en cada mensaje de texto y lo procesa con su fórmula de promedio acumulativo: `(PRONUNCIATION_SCORE + :nuevo) / 2`. Cada mensaje escrito arrastra el promedio hacia cero. Un estudiante que escribe 10 mensajes y habla 1 termina con un promedio de pronunciación de ~0.8% del score real.

### Problema que resuelve
`USER_PROGRESS.PRONUNCIATION_SCORE` y, por extensión, `avg_pronunciation` en el Dashboard son estadísticamente inválidos para cualquier estudiante que use texto. Viola la Regla #3 de PROJECT_VISION.md (toda interacción relevante debe persistirse correctamente).

### Valor para el usuario
El score de pronunciación reflejará únicamente las evaluaciones reales de voz, sin ser contaminado por mensajes de texto.

### Valor para el negocio
El indicador de pronunciación en el Dashboard tiene significado real. Es una de las métricas diferenciadores del producto.

### Complejidad técnica
**Baja** — La corrección más simple: no enviar el campo cuando no hay pronunciación disponible, o enviar el valor previo del estudiante.

**Estrategia recomendada:** al enviar texto, omitir `pronunciation_score` del payload. Modificar el endpoint ORDS `/progress/update` para que el campo solo se actualice si `:pronunciation_score IS NOT NULL`.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `TutorChat.jsx` (función `sendMessage`) |
| **Packages Oracle** | Módulo ORDS `progress` |
| **Endpoints ORDS** | `POST /progress/update` (modificar lógica del campo `PRONUNCIATION_SCORE`) |
| **Tablas afectadas** | `USER_PROGRESS.PRONUNCIATION_SCORE` |

### Riesgos
- Modificar el endpoint ORDS requiere acceso a Oracle ADB para redeploy del módulo.
- Alternativa sin tocar Oracle: cargar `getMissionProgress` al inicio y reutilizar ese score como valor "sin cambio" cuando no hay evaluación de voz.

### Estimación
**Pequeña** (2 horas frontend · 1 hora adicional si se modifica Oracle)

---

## ✅ MVP-03 — Eliminación del speech_router duplicado en FastAPI — COMPLETADO 2026-06-01

### Descripción
`backend/app/main.py` importa el router de speech dos veces (líneas 8 y 11) y lo registra dos veces (líneas 25 y 28):
```python
from app.routes.speech import router as speech_router  # línea 8
from app.routes.speech import router as speech_router  # línea 11 ← duplicada
app.include_router(speech_router)  # línea 25
app.include_router(speech_router)  # línea 28 ← duplicada
```
FastAPI no lanza excepción pero registra las rutas `/speech/to-text` y `/speech/pronunciation-score` internamente dos veces.

### Problema que resuelve
Comportamiento de routing impredecible. Puede causar doble procesamiento de peticiones de audio. Genera confusión en logs y depuración.

### Valor para el usuario
Comportamiento predecible y correcto del backend de procesamiento de voz.

### Valor para el negocio
Elimina un bug silencioso que podría causar doble consumo de cuota en Google STT o Azure en el futuro.

### Complejidad técnica
**Baja** — Eliminar 2 líneas.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Servicios Python** | `backend/app/main.py` |

### Riesgos
Ninguno. Cambio de 2 líneas con impacto completamente aislado.

### Estimación
**Pequeña** (15 minutos)

---

## ✅ MVP-04 — Cierre del stream de micrófono y liberación de blob URLs de audio — COMPLETADO 2026-06-01

### Descripción
Dos memory leaks activos en `TutorChat.jsx`:

**Leak 1 — Stream de micrófono:** `getUserMedia()` crea un stream. Los tracks de audio nunca se detienen. El indicador de micrófono del browser permanece activo después de cada grabación. En sesiones largas, múltiples streams quedan abiertos simultáneamente.

**Leak 2 — Blob URLs de TTS:** `URL.createObjectURL(audioBlob)` en `playTutorVoice()` crea un URL en memoria que nunca se libera. Cada respuesta del tutor agrega un blob URL que permanece hasta que se cierra el tab.

**Correcciones:**
```javascript
// Leak 1: en mediaRecorder.onstop
stream.getTracks().forEach(track => track.stop());

// Leak 2: en playTutorVoice
const audio = new Audio(audioUrl);
audio.onended = () => URL.revokeObjectURL(audioUrl);
audio.play();
```

### Problema que resuelve
Degradación progresiva de memoria durante sesiones de aprendizaje. En dispositivos con RAM limitada (tablets, chromebooks universitarios), el impacto puede ser perceptible en sesiones de 20+ minutos. El indicador de micrófono activo genera confusión y desconfianza en el usuario.

### Valor para el usuario
El indicador de micrófono se apaga correctamente. La aplicación mantiene rendimiento estable durante sesiones largas.

### Valor para el negocio
Evita reportes de bugs de rendimiento y privacidad (micrófono activo) que afectan la confianza institucional en el producto.

### Complejidad técnica
**Baja** — Dos adiciones de código de 1 línea cada una.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `TutorChat.jsx` (funciones `startListening` y `playTutorVoice`) |

### Riesgos
Ninguno. Cambios aditivos que no modifican la lógica existente.

### Estimación
**Pequeña** (30 minutos)

---

## ✅ MVP-05 — Medición real del tiempo de estudio — COMPLETADO 2026-06-02

### Descripción
`TutorChat.jsx` enviaba `totalTimeMinutes: 5` hardcodeado en cada llamada a `updateProgress` (flujo de texto y flujo de voz), sin importar cuánto tiempo real hubiera transcurrido.

**Solución implementada (Opción B — acumulativa entre sesiones + cap 180 min):**
```javascript
// Refs declarados en el componente
const sessionStartRef = useRef(null);  // inicializado en useEffect([])
const previousTimeRef = useRef(0);     // cargado desde Oracle en loadProgress

// useEffect de inicialización (evita llamada impura en render)
useEffect(() => { sessionStartRef.current = Date.now(); }, []);

// loadProgress: guarda el tiempo previo acumulado
previousTimeRef.current = data.total_time_minutes || 0;

// En ambas funciones de envío
const sessionElapsedMinutes = Math.round(
  (Date.now() - (sessionStartRef.current || Date.now())) / 60000,
);
totalTimeMinutes: previousTimeRef.current + Math.min(180, Math.max(1, sessionElapsedMinutes)),
```

### Problema que resuelve
`USER_PROGRESS.TOTAL_TIME_MINUTES` y el "Study Time" del Dashboard eran estadísticamente inválidos. Viola la Regla #4 de PROJECT_VISION.md (el progreso debe ser medible).

### Valor para el usuario
El tiempo de estudio en el Dashboard refleja el tiempo real invertido, acumulado entre sesiones. Las estadísticas tienen credibilidad.

### Valor para el negocio
Las instituciones pueden reportar horas de práctica reales a sus estudiantes y organismos académicos.

### Complejidad técnica
**Baja** — Un `useRef` al montar el componente y el cálculo de diferencia de timestamps.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `TutorChat.jsx` (ambas funciones de envío) |
| **Tablas afectadas** | `USER_PROGRESS.TOTAL_TIME_MINUTES` |
| **Endpoints ORDS** | `POST /progress/update` |

### Decisiones de implementación
- **Opción B** seleccionada: acumula tiempo previo de Oracle + tiempo de sesión actual.
- **Cap de 180 minutos** por sesión para evitar outliers por app abierta en segundo plano.
- `sessionStartRef` inicializado en `useEffect([])` en lugar de `useRef(Date.now())` para satisfacer la regla del React Compiler que prohíbe funciones impuras en el render.

### Estimación
**Pequeña** (completado en ~45 minutos)

---

## ✅ MVP-06 — Historial de conversación enviado al tutor IA — COMPLETADO 2026-06-02

### Descripción
`openai_service.py` enviaba a GPT únicamente `[{ role: system }, { role: user, content: mensaje_actual }]`. El tutor no tenía memoria de ningún mensaje anterior.

**Solución implementada — `conversationHistoryRef` independiente del store:**

El historial se gestiona con un `useRef` local en `TutorChat` poblado exclusivamente desde Oracle, evitando la contaminación de `initialConversation`. Esto hace MVP-06 completamente independiente de MVP-07.

```python
# chat.py — ChatRequest (backwards-compatible)
history: list[dict[str, Any]] = []

# openai_service.py — get_tutor_response
def get_tutor_response(mission, user_message, history=None):
    if history is None:
        history = []
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-10:]:
        role = "user" if msg["sender"] == "student" else "assistant"
        messages.append({"role": role, "content": msg["text"]})
    messages.append({"role": "user", "content": user_message})
```

### Problema que resuelve
El tutor ahora tiene contexto de la conversación activa. Puede hacer seguimiento, recordar errores y construir una conversación coherente.

### Complejidad técnica
**Media** — Cambio coordinado en 3 archivos (TutorChat.jsx, chat.py, openai_service.py).

### Dependencias resueltas

| Tipo | Elemento |
|---|---|
| **Componentes React** | `TutorChat.jsx` — `conversationHistoryRef`, poblado en `loadHistory`, actualizado tras cada respuesta en ambas funciones |
| **Servicios Python** | `backend/app/routes/chat.py` — `history: list[dict[str, Any]] = []` en `ChatRequest` |
| **Servicios Python** | `backend/app/services/openai_service.py` — construcción dinámica del array `messages` |
| **Sin cambios** | `chatService.js`, `useAppStore.js`, Oracle ORDS, Oracle DDL |

### Decisiones de implementación
- **`conversationHistoryRef`** en lugar del store: evita completamente la contaminación de `initialConversation` de misiones 1, 2, 3.
- **`history=None` + guard `if history is None: history = []`**: evita el antipatrón de mutable default en Python.
- **Límite `history[-10:]`**: últimos 10 mensajes (5 pares) — balance entre contexto pedagógico y costo de tokens.
- **Actualización del ref después de recibir respuesta**: el mensaje actual va como `message`, no como historial.
- **Backwards-compatible**: `default=[]` en Pydantic — el backend acepta peticiones sin el campo `history`.

### Estimación
**Media** (completado en ~1.5 horas)

---

## ✅ MVP-07 — Eliminación de initialConversation hardcodeada del store — COMPLETADO 2026-06-02

### Descripción
`useAppStore.js` tenía mensajes de bienvenida hardcodeados para misiones 1, 2 y 3 que provocaban tres bugs simultáneos: mensaje ficticio visible, duplicación de mensajes en cada re-entrada, y colisión de `key` en React (`id: 1` hardcodeado vs `message_id: 1` de Oracle).

**Solución implementada:**

1. Eliminado completamente el objeto `initialConversation` (38 líneas).
2. `conversations: {}` como estado inicial limpio.
3. Agregada acción `setConversation(missionId, messages)` que REEMPLAZA (en lugar de acumular como `addMessage`).
4. `loadHistory` en TutorChat usa `setConversation` para reemplazar la conversación en cada carga, eliminando duplicados.
5. Si Oracle devuelve historial vacío: bienvenida dinámica generada desde `mission.title` y `mission.description`.
6. Migración Zustand: `version: 1` + `migrate` que limpia `conversations: {}` para usuarios con localStorage versión 0.

### Decisiones de implementación
- **`version: 1` en lugar de `version: 2`**: el store nunca tuvo versión explícita, por lo que Zustand lo trataba como versión 0. Ir de 0 → 1 es correcto.
- **`id: \`welcome-${mission.id}\``** (string) para el mensaje de bienvenida: evita colisión con `message_id` numérico de Oracle.
- **`conversationHistoryRef` sin cambios**: el welcome dinámico NO entra en el historial de GPT (MVP-06 preservado íntegramente).
- **`addMessage` intacto**: sigue siendo la acción para mensajes nuevos durante la sesión activa.

### Dependencias resueltas

| Tipo | Elemento |
|---|---|
| **Store** | `src/store/useAppStore.js` — 4 cambios |
| **Componentes React** | `TutorChat.jsx` — import `setConversation`, reescritura de `loadHistory` |

### Estimación
**Media** (completado en ~45 minutos)

---

## ✅ MVP-08 — Persistencia de correcciones gramaticales en Oracle — COMPLETADO 2026-06-02

### Descripción
`CONVERSATION_MESSAGES.CORRECTION CLOB` existía en Oracle pero nunca se escribía. Las correcciones de GPT solo vivían en la sesión activa y desaparecían al cerrar.

**Implementación:**
1. `conversationService.js`: `saveMessage` ahora acepta `correction = null` y lo serializa como `JSON.stringify(correction)` en el payload.
2. `TutorChat.jsx`: ambas funciones de envío pasan `correction: result.correction` al `saveMessage` del tutor. Los mensajes del estudiante no llevan corrección (default null).
3. Oracle ORDS `POST /chat/message`: INSERT ampliado con `CORRECTION, :correction`. Redesplegado exitosamente en Oracle ADB.
4. `backend-oracle/ords/chat.sql`: documentación local actualizada.

### Decisiones de implementación
- **Serialización JSON string**: `JSON.stringify(correction)` en el frontend antes de enviar. Oracle recibe un escalar string → CLOB sin parsing.
- **Default null en `saveMessage`**: backwards-compatible — llamadas existentes sin `correction` siguen funcionando.
- **Solo mensajes del tutor llevan corrección**: mensajes del estudiante siempre `correction = null`.
- **`GET /chat/history` sin cambios**: ya retornaba el campo `CORRECTION` desde el inicio.

### Dependencias resueltas

| Tipo | Elemento |
|---|---|
| **Servicios Frontend** | `src/services/conversationService.js` |
| **Componentes React** | `TutorChat.jsx` (×2 funciones de envío) |
| **Oracle ORDS** | Handler `POST /chat/message` redesplegado |
| **Tabla Oracle** | `CONVERSATION_MESSAGES.CORRECTION` ahora recibe datos reales |

### Estimación
**Media** (completado en ~1 hora incluyendo redeploy Oracle)

---

## ✅ MVP-09 — Streak real desde Oracle en el Dashboard — COMPLETADO 2026-06-02

### Descripción
`Dashboard.jsx` muestra "7 Days" hardcodeado en el `StatCard` de Current Streak. `ESTUDIANTES.STREAK_DAYS` es un campo real en Oracle. Más importante: `PKG_AUTH.LOGIN_ESTUDIANTE` ya devuelve `streakDays` en el objeto `student` de la respuesta de login. El dato ya está disponible en `authStore.student.streakDays` sin ninguna llamada adicional.

### Problema que resuelve
Una de las métricas de gamificación más motivadoras para el estudiante es ficticia. El dato real ya existe en el sistema y no se usa.

### Valor para el usuario
La racha de días tiene significado real. Motiva la práctica diaria consistente — uno de los comportamientos clave que el sistema quiere incentivar.

### Valor para el negocio
La gamificación efectiva aumenta la retención y el uso diario, métricas clave para la renovación de contratos institucionales.

### Complejidad técnica
**Baja** — Leer `student.streakDays` del store en lugar del valor hardcodeado.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `src/pages/Dashboard.jsx` (StatCard de streak) |
| **Store** | `src/store/authStore.js` (campo `student.streakDays`) |
| **Packages Oracle** | `PKG_AUTH.LOGIN_ESTUDIANTE` (ya devuelve `streakDays`) |

### Riesgos
- `ESTUDIANTES.STREAK_DAYS` puede estar en 0 para todos los usuarios si no hay lógica en Oracle que lo actualice. La corrección de la UI es inmediata; la lógica de actualización del streak es un item separado (ver ALT-02 en Media Prioridad).

### Estimación
**Pequeña** (30 minutos)

---

## ✅ MVP-10 — Manejo de error de período académico vencido en el login — COMPLETADO 2026-06-03

### Descripción
`PKG_AUTH.LOGIN_ESTUDIANTE` devuelve `{ success: false, message: "Invalid credentials or inactive enrollment." }` cuando la fecha de `PERIODOS` está vencida. `LoginPage.jsx` muestra el mismo mensaje genérico "Login error" tanto para contraseña incorrecta como para período vencido. El estudiante no puede distinguir la causa ni tomar acción.

**Solución:**
```javascript
if (!result.success) {
  setError(result.message || "Credenciales inválidas.");
  return;
}
```

### Problema que resuelve
Experiencia frustrante para estudiantes con período vencido que no pueden autenticarse. El soporte institucional recibe tickets de "la app no funciona" cuando en realidad es una restricción de negocio esperada.

### Valor para el usuario
Mensaje de error específico que explica por qué no puede ingresar y permite actuar (contactar al académico, esperar el nuevo período).

### Valor para el negocio
Reduce carga de soporte. Mejora la percepción de profesionalismo del producto ante las instituciones.

### Complejidad técnica
**Baja** — Una línea de código.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `src/pages/LoginPage.jsx` |
| **Packages Oracle** | `PKG_AUTH.LOGIN_ESTUDIANTE` (ya devuelve el mensaje) |

### Riesgos
Ninguno. Cambio aditivo puramente cosmético.

### Estimación
**Pequeña** (30 minutos)

---

## MVP-11 — Revocación de API keys expuestas en PKG_SERVICIOS_IA.sql

### Descripción
`backend-oracle/PACKAGE_BODIES/PKG_SERVICIOS_IA.sql` contiene en texto plano las mismas API keys de producción que `backend/.env`:
- `AZURE_SPEECH_KEY`: `FAqvjRCSgA1nBg...`
- Google API Key: `AIzaSyAKzdmqfT1Zr...`
- `OPENAI_API_KEY`: `sk-proj-tL8dqCBPe1y...`

Este archivo está en el repositorio git. Si el repositorio ha sido compartido, subido a GitHub o enviado por correo, las claves están comprometidas.

### Problema que resuelve
Exposición triple de credenciales de producción: en `.env` (disco local), en `PKG_SERVICIOS_IA.sql` (repositorio), y posiblemente como constantes activas en Oracle ADB. Un atacante con acceso al repositorio tiene acceso completo a todos los servicios de IA.

### Valor para el usuario
No aplica directamente. Es una medida de protección del sistema.

### Valor para el negocio
Protege los costos operacionales. Una fuga de la OpenAI key puede generar miles de dólares en cargos no autorizados. Protege la reputación del producto ante instituciones que exigen estándares de seguridad.

### Complejidad técnica
**Baja** (el cambio en el archivo es trivial) + coordinación operacional para rotar claves.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Archivo** | `backend-oracle/PACKAGE_BODIES/PKG_SERVICIOS_IA.sql` |
| **Servicios Python** | `backend/.env` (actualizar con claves nuevas) |
| **Packages Oracle** | `PKG_SERVICIOS_IA` en Oracle ADB (actualizar constantes) |

### Riesgos
- Revocar sin actualizar en todos los puntos rompe el sistema. El orden correcto es: generar nuevas claves → actualizar `.env` → actualizar Oracle ADB → actualizar el archivo SQL → revocar las viejas.
- La arquitectura APEX (`PKG_SERVICIOS_IA`) no se usa en el flujo actual. Las claves ahí son residuales de la arquitectura anterior pero igualmente válidas si no se han rotado.

### Estimación
**Pequeña** (1 hora técnica + coordinación operacional)

---

---

# SECCIÓN 2 — ALTA PRIORIDAD

> Funcionalidades con alto impacto educativo, comercial o técnico. Completan la Fase 1 del roadmap oficial o eliminan deuda técnica que bloquea el crecimiento del sistema.

---

## ALT-01 — Implementación de la página /progress

### Descripción
La página `/progress` existe en el router pero solo renderiza `<h1>Progress</h1>`. Es la página de analítica pedagógica personal del estudiante — una de las más importantes del producto y completamente vacía.

**Contenido propuesto:**
- Progreso por misión (barra individual con porcentaje, status y grammar/pronunciation scores)
- XP total y nivel con la fórmula real: `LEVEL = FLOOR(XP / 200) + 1`
- Tiempo de estudio acumulado por misión
- Scores de pronunciación y gramática con su evolución
- Misiones completadas vs pendientes por topic

**Datos disponibles en Oracle:**
- `GET /progress/stats/:id_inscripcion` — estadísticas globales (ya usado por Dashboard)
- `GET /progress/student/:id_inscripcion` — endpoint ORDS existente que no se usa en ningún lugar
- `GET /progress/mission/:id_inscripcion/:mission_id` — progreso por misión individual

### Problema que resuelve
El estudiante no tiene visibilidad de su evolución real. Sin esta página, la gamificación (XP, niveles, scores) no tiene un espacio donde el estudiante pueda ver su progreso acumulado y sentir avance.

### Valor para el usuario
El estudiante puede ver claramente dónde está, cuánto ha avanzado, en qué áreas está mejorando y qué misiones le quedan. Es el motor de motivación del sistema.

### Valor para el negocio
Las instituciones necesitan evidencia de que el sistema funciona. Una página de progreso es la primera pantalla que mostraría un académico a sus directivos.

### Complejidad técnica
**Media** — Los datos existen en Oracle. La complejidad está en el diseño de la visualización y en hacer las múltiples llamadas necesarias para mostrar el progreso por misión.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `src/pages/Progress.jsx` (implementación completa), posiblemente `MissionProgressRow.jsx` |
| **Servicios Frontend** | `src/services/progressService.js` (agregar `getStudentProgress`) |
| **Endpoints ORDS** | `GET /progress/stats/:id_inscripcion`, `GET /progress/student/:id_inscripcion` |
| **Tablas afectadas** | `USER_PROGRESS` (lectura) |
| **Dependencia crítica** | MVP-01 y MVP-02 deben estar implementados para que los datos mostrados sean válidos |

### Riesgos
- Si se implementa antes de MVP-01 y MVP-02, la página mostrará datos incorrectos (grammar = 85, pronunciation = 0 en texto). Puede generar más confusión que valor.
- El diseño de visualización requiere criterio UX para ser útil sin ser complejo.

### Estimación
**Mediana** (1 semana incluyendo diseño y pruebas con datos reales)

---

## ALT-02 — Implementación de la página /profile

### Descripción
La página `/profile` solo tiene un título. Debe mostrar la información personal del estudiante y sus métricas acumuladas.

**Contenido propuesto:**
- Nombre completo, matrícula, carrera, nivel de inglés (`NIVEL_INGLES`)
- Avatar placeholder (la foto de perfil requiere infraestructura adicional)
- XP total y nivel actual
- Streak de días (desde `ESTUDIANTES.STREAK_DAYS`)
- Estadísticas personales: misiones completadas, tiempo total, score promedio de pronunciación y gramática

**Los datos básicos ya están disponibles en `authStore`** sin necesidad de llamadas adicionales.

### Problema que resuelve
El estudiante no puede ver su información personal ni su progreso global desde una vista dedicada. Una aplicación educativa sin página de perfil carece de sentido de identidad para el usuario.

### Valor para el usuario
El estudiante tiene un espacio propio dentro de la app. Ve su nombre, su nivel, sus logros acumulados. Refuerza la identidad del aprendiz.

### Valor para el negocio
La página de perfil es un requisito mínimo de cualquier aplicación educativa. Su ausencia afecta la percepción de completitud del producto.

### Complejidad técnica
**Baja** — Los datos del perfil básico ya están en `authStore.student`. No se necesitan nuevas llamadas de red para la primera versión.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `src/pages/Profile.jsx` (implementación completa) |
| **Store** | `src/store/authStore.js` (datos del estudiante) |
| **Store** | Estadísticas de `dashboardService` (reutilizar del Dashboard) |

### Riesgos
- La foto de perfil (`FOTO BLOB`) requiere un endpoint ORDS de lectura de binarios que no existe. Se puede diferir con un avatar placeholder.
- La lógica de actualización del streak requiere un proceso en Oracle que registre el acceso diario. No existe actualmente — el campo existe pero nunca se actualiza.

### Estimación
**Pequeña** (2-3 días)

---

## ALT-03 — Centralización de URLs en variables de entorno del frontend

### Descripción
Las URLs de Oracle ORDS y de FastAPI están hardcodeadas en texto plano en 10 archivos de servicios del frontend. No existe ningún archivo `.env` en el proyecto frontend.

**Crear `.env.local`:**
```
VITE_API_URL=http://127.0.0.1:8000
VITE_ORACLE_URL=https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api
```

Reemplazar todas las ocurrencias en los 10 archivos de servicios con `import.meta.env.VITE_*`.

### Problema que resuelve
El proyecto no puede pasar de desarrollo a staging o producción sin editar 10 archivos manualmente. Alto riesgo de olvidar una URL en el proceso.

### Valor para el usuario
No aplica directamente. Habilita entornos de staging donde los usuarios pueden probar nuevas funcionalidades antes de producción.

### Valor para el negocio
Hace el producto deployable en cualquier entorno. Es un prerequisito para cualquier demo en servidor, piloto institucional o lanzamiento en producción.

### Complejidad técnica
**Baja** — Cambio mecánico en 10 archivos más la creación de los archivos `.env`.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Servicios Frontend** | Todos los archivos en `src/services/` (10 archivos) |

### Riesgos
- `import.meta.env.VITE_*` solo funciona en tiempo de build. No cambia en runtime. Para entornos que necesitan runtime config, se necesita una estrategia diferente.
- El archivo `.env.local` no debe commitearse si contiene valores sensibles.

### Estimación
**Pequeña** (2-3 horas)

---

## ALT-04 — Autenticación en el backend FastAPI

### Descripción
FastAPI no tiene ningún middleware de autenticación. Los endpoints `/chat/message`, `/speech/to-text`, `/tts/speak` y `/speech/pronunciation-score` son completamente públicos.

**MVP de seguridad:** API key estático enviado en header `X-API-Key`. El frontend lo incluye en cada llamada. FastAPI lo valida en un middleware antes de procesar.

**Solución robusta (siguiente iteración):** propagar el token de sesión de Oracle a FastAPI, que lo valida contra Oracle para identificar al estudiante en cada petición.

### Problema que resuelve
Exposición económica directa. Cualquier persona que descubra la URL del servidor puede generar miles de llamadas a OpenAI, Azure y Google con cargo al proyecto sin restricción.

### Valor para el usuario
No aplica directamente. Protege la disponibilidad del servicio.

### Valor para el negocio
Protege el presupuesto operacional. En producción con múltiples instituciones, un abuso del API puede generar costos impredecibles.

### Complejidad técnica
**Media** (API key estático) · **Alta** (token Oracle propagado)

### Dependencias

| Tipo | Elemento |
|---|---|
| **Servicios Python** | `backend/app/main.py` (middleware de validación) |
| **Servicios Frontend** | `chatService.js`, `speechService.js`, `ttsService.js`, `pronunciationService.js` (agregar header) |
| **Dependencia** | ALT-03 (variables de entorno para no hardcodear el API key) |

### Riesgos
- Si el middleware se activa sin actualizar el frontend simultáneamente, todos los servicios de IA dejan de funcionar hasta sincronizar.
- El API key estático no protege contra un atacante que haya visto el código del frontend (el key estaría visible en el bundle).

### Estimación
**Pequeña** (API key estático: 3-4 horas) · **Mediana** (token Oracle: 1 semana)

---

## ALT-05 — Recuperación de misión por URL param (navegación directa)

### Descripción
`MissionPage` obtiene la misión exclusivamente de `location.state?.mission`. Si el usuario recarga la página en `/missions/3`, navega directamente por URL, o regresa desde el browser, ve "Mission not found" aunque la ruta `/missions/:id` existe y el ID es válido.

**Solución:**
1. Usar `useParams()` para obtener el `missionId`.
2. Si `location.state?.mission` no existe, cargar la misión desde el store de misiones o desde Oracle usando el ID.
3. Mostrar un estado de carga mientras se resuelve.

### Problema que resuelve
Los bookmarks no funcionan. El botón "Atrás" del browser puede romper la navegación. Un estudiante que recarga la página pierde la misión activa y tiene que volver al Dashboard.

### Valor para el usuario
Navegación robusta y predecible. Los links a misiones específicas funcionan correctamente.

### Valor para el negocio
Un producto con navegación rota genera desconfianza. Es un requisito básico de cualquier SPA.

### Complejidad técnica
**Media** — Requiere una estrategia de carga fallback: primero del state, luego del store, luego de Oracle.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `src/pages/MissionPage.jsx` |
| **Servicios Frontend** | `src/services/missionService.js` (posible función `getMissionById`) |
| **Store** | `useAppStore.js` (buscar misión por ID si ya fue cargada) |
| **Endpoints ORDS** | `GET /missions/course/:idCurso/:idInscripcion` (filtrar por ID en cliente) |

### Riesgos
- Oracle no tiene un endpoint de misión individual. Se puede filtrar del endpoint de course en el cliente, pero eso requiere conocer `idCurso` que está en `authStore`.

### Estimación
**Pequeña** (3-4 horas)

---

## ALT-06 — Sistema de notificaciones in-app (reemplazo de alert())

### Descripción
Existen tres instancias de `alert()` nativo en `TutorChat.jsx`:
- `"Speech recognition failed."` (línea 239)
- `"Mission Completed! 🎉"` (líneas 372 y 481)

`alert()` bloquea el hilo principal del browser, no tiene estilos propios del producto y es inconsistente con el sistema de diseño dark/glassmorphism del proyecto.

**Implementar un componente `Toast`** con Framer Motion que aparezca en la esquina superior derecha, soporte diferentes tipos (success, error, info) y se auto-dismiss después de N segundos.

### Problema que resuelve
Experiencia de usuario inconsistente. `alert()` interrumpe el flujo de manera abrupta. En mobile puede tapar contenido importante.

### Valor para el usuario
Las notificaciones se integran visualmente con el producto. El completado de una misión puede celebrarse con una animación dentro de la UI, no con un popup del sistema operativo.

### Valor para el negocio
La coherencia visual es un indicador de calidad del producto para las instituciones evaluadoras.

### Complejidad técnica
**Baja**

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `TutorChat.jsx` (3 puntos de uso), crear `src/components/ui/Toast.jsx` |

### Riesgos
Ninguno. Mejora completamente aislada.

### Estimación
**Pequeña** (3-4 horas)

---

## ALT-07 — Objetivos reales de la misión en MissionSidebar

### Descripción
`MissionSidebar.jsx` muestra tres bullet points genéricos hardcodeados: "Complete the mission conversation", "Practice English expressions", "Improve grammar and vocabulary". No usa los objetivos pedagógicos reales de la misión.

El campo `OBJECTIVES` no está en el DDL actual de `MISSIONS`. Existen dos estrategias:
1. **Sin cambio de DB:** incluir los objetivos en el payload del system prompt de GPT (ya definidos en `openai_service.py`) y devolverlos al frontend.
2. **Con cambio de DB:** agregar columna `OBJECTIVES CLOB` en `MISSIONS` y exponerla en el endpoint ORDS.

### Problema que resuelve
La Regla #6 de PROJECT_VISION.md exige aprendizaje orientado a objetivos. La sidebar de misión es el único lugar donde se muestran esos objetivos — actualmente son texto ficticio.

### Valor para el usuario
El estudiante sabe exactamente qué debe lograr antes de empezar la conversación. Los objetivos guían la práctica.

### Valor para el negocio
Los currículos estructurados con objetivos claros son un requisito académico institucional. Las misiones con objetivos definidos son vendibles a coordinadores de inglés.

### Complejidad técnica
**Media** — Requiere decisión sobre la estrategia (con o sin cambio de DB) y coordinar el pipeline de datos.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `src/components/mission/MissionSidebar.jsx` |
| **Servicios Frontend** | `src/services/missionService.js` (mapear nuevos campos) |
| **Packages Oracle** | `PKG_MISSIONS.GET_MISSIONS_BY_COURSE` (agregar `OBJECTIVES` si existe) |
| **Tablas afectadas** | `MISSIONS` (posible nueva columna) |

### Riesgos
- Cambiar el schema de Oracle requiere coordinación con el DBA/administrador de la instancia.
- Alternativa sin DB: extraer objetivos desde el system prompt de `openai_service.py` y devolverlos en la respuesta de chat (agrega complejidad al contrato de la API).

### Estimación
**Pequeña** (2 horas si datos disponibles) · **Mediana** (1 semana si requiere cambio de schema)

---

## ALT-08 — Unificación de sendMessage y sendTranscriptMessage

### Descripción
`TutorChat.jsx` tiene dos funciones que hacen exactamente lo mismo con ~150 líneas duplicadas. La única diferencia real es que `sendTranscriptMessage` recibe `pronunciationData`. Las dos funciones ya han divergido: `pronunciationScore: 0` está comentado en `sendMessage` pero activo en `sendTranscriptMessage`. Cada bug debe corregirse en ambas funciones.

**Solución:**
```javascript
async function handleSendMessage(text, pronunciationData = null) {
  // lógica unificada
  const pronunciationScore = pronunciationData?.pronunciation_score ?? null;
  // ...
}
```

### Problema que resuelve
Deuda técnica activa. Cualquier mejora al flujo de mensajes (MVP-01, MVP-05, MVP-06) debe implementarse dos veces. Los bugs ya han demostrado que las dos funciones divergen silenciosamente.

### Valor para el usuario
Indirecto: reduce el riesgo de bugs donde voz y texto se comportan diferente sin razón.

### Valor para el negocio
Mantenibilidad del código principal del producto. Reducción de tiempo de desarrollo en futuras features.

### Complejidad técnica
**Media** — La lógica es clara pero la refactorización del componente más crítico del sistema requiere pruebas exhaustivas de ambos flujos.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `TutorChat.jsx` (ambas funciones) |
| **Prerequisito** | MVP-01, MVP-02, MVP-05 implementados (para que la función unificada tenga la lógica correcta desde el inicio) |

### Riesgos
- Riesgo de regresión alto. La función unificada debe probarse en el flujo de texto Y en el flujo de voz.
- No hacer junto con otras refactorizaciones paralelas del componente.

### Estimación
**Pequeña** (4-5 horas + pruebas)

---

## ALT-09 — Eliminación de la doble llamada a getDashboardStats

### Descripción
`Sidebar.jsx` y `Dashboard.jsx` llaman a `getDashboardStats(inscripcion.idInscripcion)` de forma independiente en sus `useEffect`. Dado que `Sidebar` está siempre presente en todas las páginas protegidas, la llamada se ejecuta en cada navegación. En `/dashboard`, se ejecutan dos llamadas simultáneas idénticas a Oracle.

**Solución:** elevar el resultado de `getDashboardStats` a un store compartido (o a `authStore`). Solo uno de los dos componentes dispara la carga; el otro lee del store.

### Problema que resuelve
Doble tráfico innecesario a Oracle en cada navegación al Dashboard. A escala de cientos de usuarios, duplica el volumen de peticiones de estadísticas.

### Valor para el usuario
Carga más rápida del Dashboard. Solo una petición de red en lugar de dos.

### Valor para el negocio
Eficiencia operacional. Reduce la carga en Oracle ADB.

### Complejidad técnica
**Media** — Requiere refactorizar el estado de las estadísticas del Dashboard hacia un store centralizado.

### Dependencias

| Tipo | Elemento |
|---|---|
| **Componentes React** | `src/pages/Dashboard.jsx`, `src/components/layout/Sidebar.jsx` |
| **Store** | `src/store/authStore.js` o nuevo `src/store/dashboardStore.js` |
| **Servicios Frontend** | `src/services/dashboardService.js` |

### Riesgos
Bajo. Refactorización de estado aislada del flujo de misiones.

### Estimación
**Pequeña** (3 horas)

---

---

# SECCIÓN 3 — MEDIA PRIORIDAD

> Mejoras que aumentan la calidad pedagógica, la experiencia de usuario o reducen deuda técnica importante, sin bloquear el funcionamiento básico.

---

## MED-01 — Implementación de la página /library

### Descripción
La página `/library` solo tiene un título. Debe ser el repositorio de recursos gramaticales del curso, organizados por topic. El contenido base ya está disponible en Oracle (`MISSIONS.GRAMMAR_TITLE`, `MISSIONS.GRAMMAR_EXAMPLE`, `TOPICS.TITLE`).

**Contenido propuesto:**
- Lista de topics con sus gramáticas
- Fichas de gramática con ejemplo por misión
- Posibilidad de marcar temas como repasados

### Complejidad técnica
**Baja** — Los datos existen en Oracle. Es una vista de lectura sin lógica compleja.

### Dependencias
`src/pages/Library.jsx`, `missionService.js`, endpoint ORDS `GET /missions/course/:c/:i`

### Estimación
**Mediana** (1 semana)

---

## MED-02 — Speaking Challenges con texto de referencia predefinido

### Descripción
Actualmente la evaluación de pronunciación usa la propia transcripción del estudiante como `reference_text`. Esto significa que Azure evalúa qué tan bien el estudiante pronunció lo que él mismo dijo, no una frase objetivo.

Un Speaking Challenge muestra al estudiante una frase específica que debe repetir. Azure evalúa contra esa frase exacta, dando un score real de pronunciación de una expresión pedagógica predefinida.

Requiere nueva estructura en Oracle: frases de referencia asociadas a cada misión.

### Complejidad técnica
**Alta** — Requiere nuevo schema en Oracle, nuevo endpoint ORDS, nuevo modo de grabación en el frontend y cambio en el flujo de evaluación.

### Dependencias
`TutorChat.jsx`, `pronunciationService.js`, nueva tabla `MISSION_CHALLENGES` en Oracle, nuevo endpoint ORDS, `azure_pronunciation.py`

### Estimación
**Grande** (2-3 semanas)

---

## MED-03 — Rate limiting en el backend FastAPI

### Descripción
Sin throttling, un usuario puede enviar peticiones ilimitadas a `/chat/message` en bucle, consumiendo cuota de OpenAI indefinidamente. Implementar `slowapi` con límites por IP o por `id_inscripcion`.

### Complejidad técnica
**Baja**

### Dependencias
`backend/app/main.py`, `requirements.txt`, ALT-04 (autenticación para rate limiting por usuario)

### Estimación
**Pequeña** (3 horas)

---

## MED-04 — Refactorización de TutorChat.jsx en custom hooks

### Descripción
785 líneas con 7 responsabilidades en un único componente. Extraer:
- `useAudioRecorder()` — grabación, MediaRecorder, stream management
- `useTutorChat(mission, conversationId)` — mensajes, GPT, TTS, persistencia Oracle
- `useMissionProgress(mission)` — progreso, XP, completado, carga inicial

El componente `TutorChat` quedaría como composición de hooks + JSX de renderización.

### Complejidad técnica
**Alta** — El componente más crítico del sistema. Alto riesgo de regresión.

### Dependencias
ALT-08 (unificar sendMessage primero), MVP-01 a MVP-07 implementados (para refactorizar código ya correcto)

### Estimación
**Mediana** (1 semana, haciendo un hook por iteración)

---

## MED-05 — Notificación de subida de nivel (Level Up)

### Descripción
Cuando el XP acumulado alcanza un múltiplo de 200, el nivel sube (`LEVEL = FLOOR(XP/200) + 1`). No hay ningún feedback visual de este evento. La gamificación pierde su momento de mayor impacto emocional.

**Implementar:** comparar el nivel antes y después de `updateProgress`. Si aumentó, mostrar una animación de celebración con Framer Motion.

### Complejidad técnica
**Media** — Requiere consultar el nivel antes de cada mensaje para poder comparar.

### Dependencias
ALT-06 (sistema de notificaciones como base), `TutorChat.jsx`, `progressService.js`

### Estimación
**Pequeña** (1 día)

---

## MED-06 — Lógica de actualización del streak diario en Oracle

### Descripción
`ESTUDIANTES.STREAK_DAYS` existe pero nunca se actualiza. Necesita lógica en Oracle que, al hacer login exitoso, compare `ULTIMO_ACCESO` con `SYSDATE`. Si fue ayer, suma 1 al streak. Si fue hace más de un día, resetea a 1. Si fue hoy, no cambia.

### Complejidad técnica
**Media** — Modificar `PKG_AUTH.LOGIN_ESTUDIANTE` para incluir el UPDATE del streak.

### Dependencias
`PKG_AUTH` (Package Body), `ESTUDIANTES.STREAK_DAYS`, `ESTUDIANTES.ULTIMO_ACCESO`, MVP-09 (para mostrar el streak)

### Estimación
**Pequeña** (3-4 horas en Oracle)

---

## MED-07 — Manejo visual de errores de red en el chat

### Descripción
Los `catch` blocks en `TutorChat.jsx` solo hacen `console.error`. Si Oracle o FastAPI no responden, el indicador de "typing" queda infinitamente visible. El usuario no sabe si la app se colgó.

**Implementar:** mensajes de error específicos usando el sistema de notificaciones (ALT-06) para cada tipo de fallo: red, GPT timeout, STT failure.

### Complejidad técnica
**Baja**

### Dependencias
ALT-06 (sistema de notificaciones), `TutorChat.jsx`, `Dashboard.jsx`

### Estimación
**Pequeña** (3-4 horas)

---

## MED-08 — Paginación del historial de conversación

### Descripción
`GET /chat/history/:conversation_id` retorna todos los mensajes sin límite (`p_items_per_page => 0` en el módulo ORDS). Con misiones largas, los payloads crecen indefinidamente. Activar paginación ORDS y cargar más mensajes si se necesita el historial completo.

### Complejidad técnica
**Media** — Requiere modificar el módulo ORDS y adaptar el cliente en el frontend.

### Dependencias
Módulo ORDS `chat` (handler `GET /chat/history`), `conversationService.js`

### Estimación
**Pequeña** (2-3 horas)

---

## MED-09 — Centralización del cliente HTTP y eliminación de mezcla fetch/axios

### Descripción
6 servicios usan `fetch` nativo, 3 usan `axios`, y `progressService.js` mezcla ambos. Crear dos instancias de `axios` configuradas: una para FastAPI, otra para Oracle ORDS. Esto permite configurar timeouts, interceptores de auth y manejo de errores globales.

### Complejidad técnica
**Baja**

### Dependencias
ALT-03 (variables de entorno), todos los archivos en `src/services/`

### Estimación
**Pequeña** (3 horas)

---

## MED-10 — Expiración automática de sesión

### Descripción
La sesión de Zustand persist nunca expira. Un dispositivo compartido o robado mantiene acceso permanente. Agregar `loginTimestamp` al store y verificar al inicio de la app si superó N horas (configurable).

### Complejidad técnica
**Baja**

### Dependencias
`src/store/authStore.js`, `src/router/AppRouter.jsx`

### Estimación
**Pequeña** (2 horas)

---

---

# SECCIÓN 4 — BAJA PRIORIDAD

> Funcionalidades de Fases 2-4 del roadmap, mejoras de mantenibilidad no urgentes o features que requieren infraestructura institucional adicional.

---

## BAJ-01 — Teacher Dashboard (Panel del Académico)

### Descripción
Vista para académicos (`ACADEMICOS` ya tiene tabla en Oracle) que permita supervisar el progreso de sus estudiantes, identificar quiénes tienen bajo rendimiento y exportar reportes académicos. Es el producto B2B más directo del sistema.

### Complejidad técnica
**Alta** — Requiere autenticación diferenciada por rol, nuevos endpoints ORDS de lectura agregada, y un frontend completamente separado o sección protegida por rol.

### Dependencias
ALT-04 (autenticación), `ACADEMICOS`, `INSCRIPCIONES`, `USER_PROGRESS`, nuevos endpoints ORDS

### Estimación
**Muy Grande** (+1 mes)

---

## BAJ-02 — Adaptive Learning Engine

### Descripción
Ajustar dinámicamente la dificultad del tutor basado en el desempeño histórico. Si `grammar_score` es consistentemente bajo, simplificar el lenguaje del tutor. Si es alto, aumentar la complejidad. Requiere análisis del historial de `USER_PROGRESS` antes de cada conversación.

### Complejidad técnica
**Alta**

### Dependencias
MVP-01, MVP-02 (datos reales de gramática y pronunciación), MVP-06 (historial en GPT), ALT-01 (historial de progreso visible)

### Estimación
**Grande** (3-4 semanas)

---

## BAJ-03 — Visualización fonémica de pronunciación (Azure Phoneme Level)

### Descripción
Azure SDK está configurado con `PronunciationAssessmentGranularity.Phoneme` pero solo se devuelven los 4 scores globales. El JSON completo de Azure contiene datos palabra por palabra y fonema por fonema. Mostrar qué palabras específicas tuvo más dificultad de pronunciar.

### Complejidad técnica
**Alta** — Requiere modificar `azure_pronunciation.py`, diseñar un componente de visualización de palabras con colores por score, y posiblemente persistir en `SPEAKING_ANALYSIS` (tabla que ya existe en Oracle).

### Dependencias
MVP-04, `azure_pronunciation.py`, `SPEAKING_ANALYSIS` (tabla Oracle existente), `MESSAGES` (tabla Oracle existente)

### Estimación
**Grande** (2-3 semanas)

---

## BAJ-04 — Integración con WhatsApp

### Descripción
Webhook FastAPI que recibe mensajes de WhatsApp Business API → GPT → respuesta → Oracle. El estudiante puede practicar inglés desde WhatsApp sin abrir la app web.

### Complejidad técnica
**Alta** — Requiere cuenta de WhatsApp Business, webhook verificado por Meta, manejo de sesiones por número de teléfono, y persistencia en Oracle sin el contexto de `id_inscripcion`.

### Dependencias
ALT-04 (autenticación), MVP-06 (tutor con contexto), nuevos endpoints ORDS, tabla de sesiones WhatsApp

### Estimación
**Muy Grande** (+1 mes)

---

## BAJ-05 — Mover Oracle ORDS completamente detrás de FastAPI

### Descripción
El mayor riesgo arquitectónico del sistema: el frontend llama a Oracle ORDS directamente. Crear endpoints en FastAPI que proxy las llamadas a Oracle. El frontend solo conoce la URL de FastAPI.

### Complejidad técnica
**Alta** — Migración arquitectónica mayor. Requiere crear ~10 endpoints en FastAPI y migrar todos los servicios del frontend.

### Dependencias
ALT-04 (autenticación en FastAPI), ALT-03 (variables de entorno), disponibilidad de tiempo sin features activos en paralelo

### Estimación
**Grande** (2-3 semanas)

---

## BAJ-06 — Avatar conversacional animado

### Descripción
Un avatar SVG o CSS animado que reacciona cuando el tutor "está hablando" (durante TTS). Mejora la percepción del tutor como entidad presente.

### Complejidad técnica
**Media**

### Dependencias
MVP-04 (saber cuándo termina el audio), ALT-06 (notificaciones estables)

### Estimación
**Pequeña** (1-2 días)

---

## BAJ-07 — Migración a TypeScript

### Descripción
Detectar errores de contrato entre componentes y servicios en tiempo de compilación. Mejor autocompletado y documentación implícita.

### Complejidad técnica
**Alta** — Migración de toda la codebase frontend. Mejor hacerla cuando el código esté estable.

### Dependencias
Ninguna técnica. No debe hacerse durante desarrollo activo de features.

### Estimación
**Grande** (2-3 semanas)

---

## BAJ-08 — Declarar ffmpeg en requirements.txt y automatizar setup

### Descripción
`ffmpeg` es dependencia del sistema operativo no declarada. Un nuevo servidor o entorno de CI fallará silenciosamente al ejecutar el servicio de pronunciación.

### Complejidad técnica
**Baja**

### Dependencias
`backend/requirements.txt`, `README.md`

### Estimación
**Pequeña** (30 minutos)

---

## BAJ-09 — Eliminación de console.log de producción

### Descripción
19 `console.log` en 6 archivos del frontend exponen estructura interna del sistema en DevTools. Condicionar con `import.meta.env.DEV` o eliminar.

### Complejidad técnica
**Baja**

### Dependencias
Todos los archivos con logs

### Estimación
**Pequeña** (1 hora)

---

---

# RESULTADO FINAL

---

## 1. Porcentaje de avance actual del proyecto

| Dimensión | Avance |
|---|---|
| Fase 1 — Core funcional | **72%** |
| Visión total del producto | **44%** |
| Integridad de datos pedagógicos | **~30%** (grammar y pronunciation corruptos) |
| Cobertura de páginas implementadas | **50%** (3 de 6 páginas con contenido real) |
| Seguridad production-ready | **15%** (sin auth en FastAPI, ORDS expuesto, keys en repositorio) |

**Avance global estimado: 44% de la visión — 72% de Fase 1**

---

## 2. Los 10 elementos más importantes pendientes

| Rango | ID | Nombre | Por qué es crítico |
|---|---|---|---|
| 1 | MVP-01 | Grammar score real | Dato pedagógico principal corrupto en toda la DB |
| 2 | MVP-06 | Historial en GPT | Sin memoria no hay tutor, hay chatbot genérico |
| 3 | MVP-02 | Pronunciation score en texto | Promedio de pronunciación matemáticamente inválido |
| 4 | MVP-08 | Persistir correcciones en Oracle | El dato más valioso del tutor desaparece al cerrar la sesión |
| 5 | ALT-01 | Página /progress | Página pedagógica central completamente vacía |
| 6 | MVP-11 | Revocar API keys | Claves de producción en texto plano en el repositorio |
| 7 | ALT-04 | Autenticación FastAPI | Backend de IA completamente expuesto en producción |
| 8 | ALT-03 | URLs en variables de entorno | El proyecto no puede deployarse sin editar 10 archivos |
| 9 | MVP-05 | Tiempo de estudio real | Study time ficticio invalida la métrica de uso |
| 10 | MVP-07 | Eliminar initialConversation | Estado corrupto en el historial de misiones clave |

---

## 3. Iniciativa recomendada para desarrollar primero

### **MVP-01 + MVP-02 + MVP-05 + MVP-09 como sprint único de integridad de datos**

Estos cuatro ítems atacan exactamente el mismo problema desde ángulos distintos: **USER_PROGRESS contiene datos pedagógicos inválidos.** Son las correcciones más rápidas de implementar (menos de 1 día en total), las que tienen el impacto más profundo en el sistema, y las que desbloquean el valor real de todas las demás iniciativas.

---

## 4. Justificación técnica y de negocio

**Desde la perspectiva técnica:**

`USER_PROGRESS` es el núcleo pedagógico del sistema según la Regla #2 de PROJECT_VISION.md. Todos los demás módulos leen de ella: el Dashboard lee `avg_grammar` y `avg_pronunciation`, el cálculo de XP la usa, el algoritmo de desbloqueo de misiones (`PKG_MISSIONS`) la consulta, y la futura página de `/progress` la necesitará. Si esta tabla contiene basura, todo lo que se construya encima también la contendrá.

Implementar primero la página `/progress` (ALT-01), el historial en GPT (MVP-06) o el Teacher Dashboard (BAJ-01) sin antes sanear los datos fuente significa construir visualizaciones de datos corruptos, que es más dañino que no tenerlas.

**Desde la perspectiva de negocio:**

El caso de uso para mostrar el producto ante una institución universitaria es: "Mire cómo el sistema registra el desempeño real del estudiante en gramática y pronunciación". Si en ese momento el académico ve que todos los estudiantes tienen exactamente 85% de gramática y 0% de pronunciación, la credibilidad del producto colapsa.

Corregir estos cuatro ítems convierte el sistema de un prototipo con datos de placeholder a una plataforma con métricas pedagógicas reales — el cambio más pequeño con el impacto más grande en la credibilidad y el valor del producto.

**El orden de ejecución recomendado para las primeras dos semanas:**

```
Día 1 (mañana)   → MVP-03: eliminar speech_router duplicado     (15 min)
Día 1 (mañana)   → MVP-04: cerrar stream + revocar blob URLs    (30 min)
Día 1 (tarde)    → MVP-05: tiempo de estudio real               (30 min)
Día 1 (tarde)    → MVP-09: streak desde Oracle                  (30 min)
Día 1 (tarde)    → MVP-10: mensaje de período vencido           (30 min)
Día 2            → MVP-01: grammar score real                   (4 horas)
Día 2            → MVP-02: pronunciation score en texto         (2 horas)
Día 3            → MVP-11: revocar API keys                     (1 hora)
Día 3            → MVP-07: eliminar initialConversation         (3 horas)
Día 4            → MVP-06: historial de conversación en GPT     (5 horas)
Día 5            → MVP-08: persistir correcciones en Oracle     (3 horas)
                                                                ─────────
                                                                ~3 días netos

Semana 2         → ALT-03: variables de entorno                 (2 horas)
Semana 2         → ALT-06: sistema de notificaciones            (3 horas)
Semana 2         → ALT-08: unificar sendMessage                 (5 horas)
Semana 2         → ALT-01: página /progress                     (5 días)
```

Al finalizar estas dos semanas, Activa Inglés pasará de tener datos pedagógicos ficticios y un tutor sin memoria, a tener un sistema con métricas reales, un tutor que recuerda la conversación, y la principal página de analítica pedagógica implementada. Eso es lo que convierte al producto en demostrable ante una institución universitaria.
