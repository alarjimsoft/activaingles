# BUSINESS_RULES.md
# Activa Inglés — Reglas de Negocio

---

## 1. Reglas de Autenticación

### BR-AUTH-01: Credenciales
El estudiante se autentica con matrícula universitaria y contraseña. No hay registro propio — las cuentas son creadas administrativamente en Oracle.

### BR-AUTH-02: Sesión persistente
La sesión se persiste en `localStorage` indefinidamente. No hay expiración de sesión implementada. La sesión termina únicamente cuando el estudiante hace logout explícito.

### BR-AUTH-03: Inscripción como contexto pedagógico
El objeto `inscripcion` (con `idInscripcion` e `idCurso`) es el identificador de contexto pedagógico. Todo el progreso, XP y conversaciones se registran bajo `id_inscripcion`, no bajo `id_estudiante` directamente. Un estudiante puede tener múltiples inscripciones a diferentes cursos.

### BR-AUTH-04: Protección de rutas
Todas las rutas excepto `/` requieren autenticación. Un usuario no autenticado es redirigido a `/` automáticamente.

---

## 2. Reglas del Sistema de Misiones

### BR-MISSION-01: Estados de misión
Las misiones tienen tres estados controlados por Oracle:
- `LOCKED` — No accesible. El botón está deshabilitado.
- `ACTIVE` — Disponible para practicar.
- `COMPLETED` — Finalizada. Se puede re-entrar para revisar.

### BR-MISSION-02: Agrupación por topic
Las misiones se organizan en topics (temas). Cada topic contiene una o más misiones. La vista del Dashboard agrupa y ordena por `topicSortOrder` y `sortOrder` de misión.

### BR-MISSION-03: Desbloqueo secuencial
La lógica de desbloqueo de misiones reside en Oracle (se infiere por el campo `status` que Oracle devuelve calculado). El frontend únicamente refleja el estado. No hay lógica de desbloqueo en el cliente.

### BR-MISSION-04: Misión completada = 10 mensajes
**Estado actual (no es la regla de negocio correcta):** el progreso se calcula como `Math.min(totalMessages * 10, 100)`. Una misión se considera completada cuando el usuario envía 10 mensajes. Esta es una aproximación temporal, no una regla pedagógica real.

### BR-MISSION-05: Conversación nueva por sesión
Cada vez que el estudiante entra a una misión, se crea una nueva conversación en Oracle. No hay reutilización de conversación entre sesiones.

---

## 3. Reglas del Sistema de XP

### BR-XP-01: XP por participación
- +5 XP por cada mensaje enviado (texto o voz).

### BR-XP-02: XP por gramática
- +10 XP si `grammar_score >= 80`.
- **Estado actual:** `grammar_score` es siempre 85 (hardcodeado), por lo que este bonus se aplica a TODOS los mensajes sin excepción.

### BR-XP-03: XP por pronunciación
- +5 XP si `pronunciation_score >= 70`.
- +10 XP adicionales si `pronunciation_score >= 80`.
- +20 XP adicionales si `pronunciation_score >= 90`.
- (El +10 y +20 son acumulativos con el +5 del nivel inferior.)
- **Estado actual:** Solo aplica en mensajes de voz. En mensajes de texto, `pronunciation_score = 0`, por lo que nunca se otorgan estos bonuses por texto.

### BR-XP-04: XP por completar misión
- +50 XP cuando `progress_percent >= 100`.
- **Estado actual:** Este bono sí se calcula en `calculate_xp()` solo cuando `completed=True` se pasa en la llamada.

### BR-XP-05: XP acumulado en Oracle
El XP se acumula en Oracle vía `POST /progress/add-xp`. El nivel del estudiante es calculado por Oracle en base al XP total acumulado. El frontend no calcula el nivel — lo consume de `GET /progress/stats`.

### BR-XP-06: XP debe reflejar desempeño real (REGLA OFICIAL)
Según `PROJECT_VISION.md` Regla #5: *"El XP debe basarse en desempeño real."*
**Esta regla está actualmente incumplida** porque grammar_score es ficticio y pronunciation_score es 0 para texto.

---

## 4. Reglas de Progreso

### BR-PROG-01: Inicio de progreso
Al entrar a una misión, se llama `POST /progress/start`. Si ya existe un registro en `USER_PROGRESS`, se reanuda; si no, se crea.

### BR-PROG-02: Actualización de progreso
Tras cada mensaje enviado (texto o voz), se llama `POST /progress/update` con:
- `progress_percent` — calculado como `min(totalMessages * 10, 100)`.
- `total_xp_earned` — calculado como `totalMessages * 5`.
- `total_messages` — contador acumulativo.
- `total_time_minutes` — siempre 5 (hardcodeado).
- `grammar_score` — siempre 85 (hardcodeado).
- `pronunciation_score` — real en voz, 0 en texto.

### BR-PROG-03: Completar misión (REGLA INCOMPLETA)
La misión debería marcarse como `COMPLETED` en Oracle cuando `progress_percent >= 100`.
**Estado actual:** Se muestra un `alert()` en el frontend, pero `POST /progress/complete` nunca se llama. El estado en Oracle puede no actualizarse a `COMPLETED`.

### BR-PROG-04: El progreso debe ser medible (REGLA OFICIAL)
Según `PROJECT_VISION.md` Regla #4: *"El progreso debe ser medible."*
Las métricas actuales (tiempo, gramática) son ficticias y no reflejan aprendizaje real.

### BR-PROG-05: Toda interacción debe persistirse (REGLA OFICIAL)
Según `PROJECT_VISION.md` Regla #3. Los mensajes sí se persisten. Sin embargo, los scores de pronunciación (en mensajes de texto) y el estado de completado de misión se registran incorrectamente.

---

## 5. Reglas del Tutor IA

### BR-TUTOR-01: El tutor siempre responde en JSON estructurado
El system prompt fuerza `response_format: { type: "json_object" }`. La respuesta siempre tiene la forma:
```json
{
  "reply": "...",
  "correction": { "original": "...", "corrected": "...", "explanation": "..." } | null
}
```

### BR-TUTOR-02: El tutor tiene contexto de misión
El system prompt incluye: título de la misión, descripción y objetivos. El tutor adapta la conversación a la misión activa.

### BR-TUTOR-03: El tutor corrige errores gramaticales
Cuando detecta errores, el tutor devuelve `correction` con el texto original, la versión corregida y una explicación breve en inglés.

### BR-TUTOR-04: El tutor NO tiene historial de conversación
**Limitación actual:** El endpoint `POST /chat/message` solo recibe el mensaje actual del usuario. No se envía el historial previo de la conversación a GPT. Cada mensaje es procesado sin contexto de mensajes anteriores.

### BR-TUTOR-05: La IA nunca sustituye al tutor humano (REGLA OFICIAL)
Según `PROJECT_VISION.md` Regla #8. El módulo de tutor humano no está implementado. La IA es actualmente el único nivel de atención.

### BR-TUTOR-06: Temperatura del modelo
El tutor usa temperatura 0.7 — balance entre creatividad y consistencia.

---

## 6. Reglas de Pronunciación

### BR-PRON-01: Grabación de tiempo fijo
El micrófono graba exactamente 4 segundos (`setTimeout 4000ms` en `startListening`). No hay detección de silencio ni grabación variable.

### BR-PRON-02: Referencia es la propia transcripción
El `reference_text` para Azure es el transcript devuelto por Google STT del mismo audio. Esto significa que Azure evalúa la pronunciación contra lo que el estudiante DIJO, no contra una frase de referencia predefinida.

### BR-PRON-03: Métricas de pronunciación
Azure devuelve cuatro scores (0-100):
- `pronunciation_score` — Score global.
- `accuracy_score` — Precisión fonética.
- `fluency_score` — Fluidez.
- `completeness_score` — Completitud.

### BR-PRON-04: Solo pronunciación en mensajes de voz
Los mensajes escritos no pasan por evaluación de pronunciación. `pronunciationScore = 0` en todos los mensajes de texto enviados a Oracle.

### BR-PRON-05: Persistencia acumulativa (REGLA OFICIAL)
Según `PROJECT_VISION.md`: *"La evaluación debe ser persistente y acumulativa."*
**Estado actual:** Solo el último score de pronunciación se envía a Oracle en `updateProgress`. No hay historial acumulativo de evaluaciones de pronunciación.

---

## 7. Restricciones del Sistema

### BR-SYS-01: Oracle ADB es la fuente de verdad
Todo dato académico relevante debe persistirse en Oracle. Los datos en localStorage (Zustand) son estado de UI, no la fuente canónica.

### BR-SYS-02: Un solo curso por sesión
El objeto `inscripcion` contiene un único `idCurso`. La app no soporta múltiples inscripciones simultáneas en la sesión actual.

### BR-SYS-03: Backend local en desarrollo
Los servicios de IA (chat, speech, TTS, pronunciación) apuntan a `http://127.0.0.1:8000`. No hay configuración de entorno para producción.

### BR-SYS-04: CORS restringido a localhost:5173
El backend FastAPI solo acepta peticiones desde `http://localhost:5173`. En producción, esta configuración debe actualizarse.

### BR-SYS-05: Misiones pasadas como state de navegación
El objeto `mission` completo se pasa via `location.state` al navegar a `/missions/:id`. Si el usuario recarga la página en `/missions/1`, pierde el estado y ve "Mission not found". No hay recuperación por URL params.
