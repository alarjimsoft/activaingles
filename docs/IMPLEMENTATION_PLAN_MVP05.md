# IMPLEMENTATION_PLAN_MVP05.md
# MVP-05 — Medición real del tiempo de estudio

> **Estado:** ✅ COMPLETADO — 2026-06-02
> **Iniciativa:** MVP-05 del PRODUCT_BACKLOG.md
> **Implementación:** ~45 minutos
> **Pruebas:** 5/5 verificadas manualmente

---

## 1. Cómo funciona actualmente el flujo de tiempo de estudio

### Diagrama del flujo actual

```
FLUJO DE TEXTO (sendMessage)
────────────────────────────
Usuario escribe → sendChatMessage() → FastAPI → GPT → respuesta
                                                        │
                                              updateProgress({
                                                totalTimeMinutes: 5   ← HARDCODED
                                              })
                                                        │
                                              Oracle POST /progress/update
                                              SET TOTAL_TIME_MINUTES = 5
                                                        │
                                              Oracle reemplaza con 5 siempre


FLUJO DE VOZ (sendTranscriptMessage)
─────────────────────────────────────
Usuario graba → STT → transcript → sendChatMessage() → FastAPI → GPT → respuesta
                                                        │
                                              updateProgress({
                                                totalTimeMinutes: 5   ← HARDCODED (igual)
                                              })
                                                        │
                                              Oracle POST /progress/update
                                              SET TOTAL_TIME_MINUTES = 5
                                                        │
                                              Oracle reemplaza con 5 siempre
```

### Los puntos exactos del problema

**`src/components/mission/TutorChat.jsx` línea 369 — `sendTranscriptMessage`:**
```javascript
totalTimeMinutes: 5,
```

**`src/components/mission/TutorChat.jsx` línea 479 — `sendMessage`:**
```javascript
totalTimeMinutes: 5,
```

Ambas funciones envían el mismo valor constante independientemente del tiempo real transcurrido.

### Comportamiento de Oracle ante este dato

El handler `POST /progress/update` en Oracle ejecuta un simple SET:

```sql
TOTAL_TIME_MINUTES = :total_time_minutes,
```

Oracle **reemplaza** el valor cada vez que se envía una actualización. No acumula. Esto significa que la última llamada a `updateProgress` de la sesión determina el valor final almacenado. Con el hardcode de 5, `USER_PROGRESS.TOTAL_TIME_MINUTES` siempre queda en 5 para cada misión, independientemente de cuántos mensajes se enviaron o cuánto tiempo duró la sesión.

### Cómo el Dashboard refleja el dato corrupto

El endpoint `GET /progress/stats/:id_inscripcion` hace:

```sql
SUM(TOTAL_TIME_MINUTES) AS TOTAL_TIME
```

Suma `TOTAL_TIME_MINUTES` a través de todas las misiones del estudiante. Si un estudiante ha practicado 5 misiones, el Dashboard muestra 25 minutos (5 misiones × 5 minutos), sin importar si tardó 3 horas o 15 minutos en cada una.

---

## 2. Análisis de impacto arquitectónico completo

### Archivos React afectados

| Archivo | Líneas | Cambio |
|---|---|---|
| `src/components/mission/TutorChat.jsx` | 35–68 (estado/refs), 369, 479 | Agregar `sessionStartRef`, calcular tiempo real |

No se requieren cambios en ningún otro componente ni servicio del frontend.

### Servicios Python afectados

**Ninguno.** El backend FastAPI (`chat.py`, `progress_service.py`) no participa en el cálculo ni el envío de `totalTimeMinutes`. El dato va directamente del frontend a Oracle vía `progressService.js`.

### Packages Oracle afectados

**Ninguno.** El handler ORDS `progress/update` ya recibe `:total_time_minutes` y lo aplica correctamente con `SET TOTAL_TIME_MINUTES = :total_time_minutes`. El endpoint no necesita cambios.

### Procedimientos afectados

**Ninguno.** `ADD_XP_TO_PROGRESS` no usa `TOTAL_TIME_MINUTES`.

### Endpoints ORDS afectados

| Endpoint | Rol | Cambio |
|---|---|---|
| `POST /progress/update` | Recibe y almacena el valor | **Ninguno** — ya funciona correctamente |
| `GET /progress/stats/:id_inscripcion` | Suma `TOTAL_TIME_MINUTES` para el Dashboard | **Ninguno** — funciona correctamente, recibirá datos reales |
| `GET /progress/mission/:id_inscripcion/:mission_id` | Retorna `TOTAL_TIME_MINUTES` del registro | **Usado en Opción B** para cargar tiempo previo |

### Tablas Oracle afectadas

| Tabla | Campo | Impacto |
|---|---|---|
| `USER_PROGRESS` | `TOTAL_TIME_MINUTES NUMBER DEFAULT 0` | Recibirá valores reales (minutos enteros) en lugar de siempre 5 |

Los registros históricos ya existentes en Oracle conservarán su valor de 5. No hay migración de datos necesaria ni posible — el tiempo real de sesiones pasadas no es recuperable.

### Reglas de negocio afectadas

| Regla | Estado actual | Estado después del fix |
|---|---|---|
| BR-PROG-02: `total_time_minutes` siempre 5 | Violada — hardcodeado | Corregida — tiempo real desde `Date.now()` |
| BR-PROG-04: El progreso debe ser medible | Violada — métrica ficticia | Corregida — tiempo real medible |
| PROJECT_VISION Regla #4: El progreso debe ser medible | Violada | Cumplida |

---

## 3. Diagnóstico técnico detallado del bug

### Cadena de corrupción de datos

```
TutorChat monta
    │
    │  (ningún registro de timestamp al montar)
    │
Usuario envía mensaje #1 después de 3 minutos reales
    │
    ├─ sendMessage() / sendTranscriptMessage()
    │       totalTimeMinutes: 5   ← ignora los 3 minutos reales
    │
    └─ updateProgress({ totalTimeMinutes: 5 })
            │
            └─ Oracle: SET TOTAL_TIME_MINUTES = 5

Usuario envía mensaje #2 después de 8 minutos reales
    │
    ├─ sendMessage()
    │       totalTimeMinutes: 5   ← ignora los 8 minutos reales
    │
    └─ updateProgress({ totalTimeMinutes: 5 })
            │
            └─ Oracle: SET TOTAL_TIME_MINUTES = 5  (sobrescribe el anterior 5)

Sesión de 20 mensajes en 45 minutos reales:
    → Oracle almacena TOTAL_TIME_MINUTES = 5
    → Dashboard muestra 5 minutos para esta misión
```

### Por qué el valor 5 específicamente

No hay ninguna lógica detrás del número 5. Es un placeholder que quedó en el código desde las primeras iteraciones de desarrollo cuando se priorizó el flujo conversacional sobre la precisión de las métricas.

---

## 4. Cambios a realizar

### Estrategia recomendada: Opción B — Tiempo acumulativo entre sesiones

La opción del PRODUCT_BACKLOG (Opción A) mide únicamente el tiempo de la sesión actual, perdiendo el tiempo de sesiones anteriores si el usuario recargó la página.

La **Opción B** carga el tiempo previo desde Oracle al iniciar la misión y lo acumula con el tiempo de la sesión actual. El costo de implementación es mínimo — `loadProgress` ya carga `data.total_time_minutes` — y la calidad del dato pedagógico es significativamente mejor.

```
Sesión 1: estudiante estudia 15 minutos → Oracle: TOTAL_TIME_MINUTES = 15
Estudiante cierra y vuelve
Sesión 2: estudiante estudia 10 minutos → Oracle: TOTAL_TIME_MINUTES = 25 (15 + 10)
```

Si se prefiere la Opción A por simplicidad, la implementación es un subconjunto de la Opción B (sin el paso de carga del tiempo previo).

### Cambio 1 — Agregar dos refs al estado de TutorChat

**Ubicación:** `src/components/mission/TutorChat.jsx`, bloque de declaración de refs (líneas 60–65)

```javascript
// Tiempo de inicio de sesión (para calcular el tiempo real transcurrido)
const sessionStartRef = useRef(Date.now());

// Tiempo previo acumulado (cargado desde Oracle al iniciar la misión)
const previousTimeRef = useRef(0);
```

### Cambio 2 — Capturar el tiempo previo al cargar el progreso

**Ubicación:** `src/components/mission/TutorChat.jsx`, dentro del `useEffect` `loadProgress` (línea 114–137)

```javascript
useEffect(() => {
  async function loadProgress() {
    try {
      if (!inscripcion || !mission) return;
      const data = await getMissionProgress(
        inscripcion.idInscripcion,
        mission.id,
      );
      setProgress(data.progress_percent || 0);
      if (data.is_completed === "Y") {
        setMissionCompleted(true);
      }
      // Guardar el tiempo previo acumulado en Oracle
      previousTimeRef.current = data.total_time_minutes || 0;
      console.log("Loaded progress:", data);
    } catch (error) {
      console.error(error);
    }
  }
  loadProgress();
}, [inscripcion, mission]);
```

### Cambio 3 — Calcular tiempo real en sendTranscriptMessage

**Ubicación:** `src/components/mission/TutorChat.jsx`, función `sendTranscriptMessage`, línea 369

```javascript
// ANTES:
totalTimeMinutes: 5,

// DESPUÉS:
totalTimeMinutes: previousTimeRef.current + Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 60000)),
```

### Cambio 4 — Calcular tiempo real en sendMessage

**Ubicación:** `src/components/mission/TutorChat.jsx`, función `sendMessage`, línea 479

```javascript
// ANTES:
totalTimeMinutes: 5,

// DESPUÉS:
totalTimeMinutes: previousTimeRef.current + Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 60000)),
```

### Lógica del cálculo explicada

```javascript
// Date.now() - sessionStartRef.current  = milisegundos desde que el componente montó
// / 60000                               = convertir a minutos (60 seg × 1000 ms)
// Math.round(...)                       = redondear al minuto más cercano
// Math.max(1, ...)                      = mínimo 1 minuto (evita enviar 0 si el mensaje
//                                         llega antes de completar el primer minuto)
// previousTimeRef.current + ...         = acumular el tiempo de sesiones anteriores
```

### No se requieren cambios en `progressService.js`

La función `updateProgress` ya acepta `totalTimeMinutes` como parámetro y lo incluye en el payload a Oracle sin modificación. El campo `total_time_minutes` ya está en el payload de la línea 50 de `progressService.js`.

---

## 5. Riesgos de implementación

### Riesgo 1 — Pérdida de tiempo entre `loadProgress` y el primer mensaje (Bajo)

**Descripción:** `loadProgress` corre en un `useEffect` asíncrono. Si el usuario envía un mensaje antes de que `loadProgress` complete (improbable pero posible), `previousTimeRef.current` todavía es 0 y el tiempo previo no se acumula.

**Mitigación:** El cálculo de tiempo de sesión (`sessionStartRef.current`) funciona correctamente en cualquier caso. Solo el acumulado de sesiones previas podría ser 0 en lugar del valor real. El impacto es mínimo y el dato sigue siendo mucho mejor que el hardcode de 5.

**Escenario real:** La carga del progreso desde Oracle tarda ~200-500ms. Un mensaje enviado antes de eso implicaría que el estudiante escribió y envió un mensaje en menos de medio segundo desde que abrió la misión — prácticamente imposible.

### Riesgo 2 — El tiempo se reinicia si la pestaña se recarga (Bajo, conocido)

**Descripción:** Si el estudiante recarga la página en `/missions/:id` durante una sesión activa, `sessionStartRef.current` se reinicia a `Date.now()`. El tiempo de la sesión anterior (desde el último mensaje hasta el reload) se pierde. Sin embargo, `previousTimeRef.current` sí capturará el tiempo del último `updateProgress` exitoso.

**Mitigación:** Documentado y aceptado en el PRODUCT_BACKLOG: *"El tiempo se reinicia si el usuario recarga la página durante la misión. Comportamiento aceptable para la primera iteración."*

**Nota:** El BUG-04 (MissionPage no recupera misión por URL param) haría que el reload muestre "Mission not found" antes de que el tiempo siquiera importara. El reset de tiempo es un problema secundario al BUG-04.

### Riesgo 3 — Sesiones extremadamente largas (Muy Bajo)

**Descripción:** Un estudiante que deja la app abierta toda la noche sin enviar mensajes y luego envía un mensaje al día siguiente registraría ~480 minutos de estudio. Oracle almacena `NUMBER(sin límite específico)`.

**Mitigación:** El campo `TOTAL_TIME_MINUTES NUMBER` en Oracle no tiene restricción de escala que cause error. Un valor de 480 es técnicamente correcto (la app estuvo abierta 8 horas). Si se desea un cap, se puede aplicar: `Math.min(totalTimeMinutes, 180)` para limitar a 3 horas por sesión. El PRODUCT_BACKLOG no especifica cap — se puede decidir en implementación.

### Riesgo 4 — Regresión por doble función de envío (Bajo)

**Descripción:** TutorChat.jsx tiene `sendMessage` y `sendTranscriptMessage` con lógica casi idéntica. El cambio debe aplicarse en ambas funciones. Si se aplica en una sola, el flujo de texto y el flujo de voz registrarán tiempos inconsistentes.

**Mitigación:** El plan especifica explícitamente ambas líneas (369 y 479). El code review debe verificar ambas.

### Riesgo 5 — Datos históricos en Oracle (Informativo, sin acción)

**Descripción:** Todos los registros existentes en `USER_PROGRESS` tienen `TOTAL_TIME_MINUTES = 5` (o 0 si nunca se envió un mensaje). Estos no se pueden corregir retroactivamente.

**Efecto:** El Dashboard de estudiantes existentes mostrará una combinación de datos viejos (5 por misión) y datos nuevos (tiempo real). El promedio irá mejorando conforme el estudiante use la plataforma después del fix. No hay acción necesaria.

---

## 6. Estrategia de despliegue

### Prerequisitos

Ninguno técnico. MVP-05 es completamente independiente.

Sin embargo, desde el punto de vista de integridad pedagógica, este fix es más valioso después de MVP-01 (grammar score real) y MVP-02 (pronunciation score en texto), ya que todos los MVPs de integridad atacan el mismo problema en `USER_PROGRESS`. Deployar en cualquier orden es técnicamente válido.

### Orden de cambios en el deploy

1. Modificar `TutorChat.jsx` (4 cambios, todos en el mismo archivo).
2. Verificar que `progressService.js` no requiere cambios (confirmado).
3. No se requiere deploy del backend ni de Oracle.
4. No se requiere incremento de versión en Zustand store.

### Coordinación necesaria

Ninguna. Este fix vive completamente en el frontend y no tiene dependencias externas.

---

## 7. Estrategia de pruebas

### Prueba 1 — Tiempo básico (manual, 5 minutos)

1. Abrir `/missions/:id` con una misión activa.
2. Esperar 2 minutos sin enviar ningún mensaje.
3. Enviar un mensaje de texto.
4. Consultar en Oracle: `SELECT TOTAL_TIME_MINUTES FROM USER_PROGRESS WHERE ID_INSCRIPCION = X AND MISSION_ID = Y`.
5. **Esperado:** valor entre 2 y 3 (tiempo real transcurrido).
6. **Antes del fix:** valor = 5.

### Prueba 2 — Tiempo acumulativo entre sesiones (manual, 10 minutos)

1. Abrir la misión. Esperar 3 minutos. Enviar un mensaje. Cerrar la misión.
2. Oracle muestra `TOTAL_TIME_MINUTES = 3`.
3. Abrir la misión nuevamente. Esperar 2 minutos. Enviar un mensaje.
4. Oracle muestra `TOTAL_TIME_MINUTES = 5` (3 previos + 2 nuevos).
5. **Esperado con Opción B:** acumulación correcta.

### Prueba 3 — Primer mensaje inmediato (manual, 1 minuto)

1. Abrir la misión. Enviar un mensaje en los primeros segundos.
2. **Esperado:** `TOTAL_TIME_MINUTES = 1` (mínimo por `Math.max(1, ...)`).
3. **No esperado:** `TOTAL_TIME_MINUTES = 0`.

### Prueba 4 — Flujo de voz (manual, 5 minutos)

1. Abrir la misión. Esperar 3 minutos. Usar el micrófono y enviar mensaje por voz.
2. Oracle muestra `TOTAL_TIME_MINUTES = 3`.
3. **Verificación:** el fix aplica igualmente en el flujo de voz (`sendTranscriptMessage`).

### Prueba 5 — Dashboard (manual, 1 minuto)

1. Después de una sesión con tiempo real, navegar al Dashboard.
2. Verificar que "Study Time" en las estadísticas refleja el tiempo real acumulado entre misiones.
3. **Esperado:** tiempo coherente con el tiempo real de práctica, no múltiplos de 5.

### Verificación de no-regresión

- El flujo de texto debe seguir enviando mensajes correctamente.
- El flujo de voz debe seguir evaluando pronunciación y enviando mensajes.
- El cálculo de `grammarScore` (MVP-01) y `pronunciationScore` (MVP-02) no se ven afectados.

---

## 8. Resumen de artefactos afectados

### Sólo se modifica un archivo

| Artefacto | Tipo | Cambio |
|---|---|---|
| `src/components/mission/TutorChat.jsx` | Componente React | +2 refs, +1 línea en `loadProgress`, reemplazar `totalTimeMinutes: 5` en líneas 369 y 479 |

### No se modifica nada de esto

| Artefacto | Razón |
|---|---|
| `src/services/progressService.js` | Ya acepta y pasa `totalTimeMinutes` correctamente |
| `backend/app/routes/chat.py` | No maneja tiempo de sesión |
| `backend/app/services/progress_service.py` | No maneja tiempo de sesión |
| `backend-oracle/ords/progress.sql` | Handler `update` ya acepta `:total_time_minutes` correctamente |
| `backend-oracle/tables/USER_PROGRESS.sql` | Schema ya correcto para el dato |
| Ningún otro servicio, store ni componente | — |

---

## 9. Diagrama del flujo después del fix

```
TutorChat monta
    │
    ├─ sessionStartRef.current = Date.now()    ← timestamp de inicio
    │
    └─ loadProgress() → Oracle
            │
            └─ previousTimeRef.current = data.total_time_minutes  ← tiempo previo


Usuario envía mensaje #1 después de 3 minutos reales
    │
    ├─ elapsed = Math.round((Date.now() - sessionStartRef.current) / 60000) = 3
    ├─ totalTimeMinutes = previousTimeRef.current + Math.max(1, 3) = 0 + 3 = 3
    │
    └─ updateProgress({ totalTimeMinutes: 3 })
            └─ Oracle: SET TOTAL_TIME_MINUTES = 3

Usuario envía mensaje #2 después de 8 minutos reales desde el inicio
    │
    ├─ elapsed = Math.round((Date.now() - sessionStartRef.current) / 60000) = 8
    ├─ totalTimeMinutes = 0 + Math.max(1, 8) = 8
    │
    └─ updateProgress({ totalTimeMinutes: 8 })
            └─ Oracle: SET TOTAL_TIME_MINUTES = 8

Sesión finaliza a los 20 minutos reales:
    → Oracle almacena TOTAL_TIME_MINUTES = 20
    → Dashboard muestra 20 minutos para esta misión  ✓
```

---

## 10. Decisiones pendientes antes de implementar

**Pregunta 1 — ¿Opción A (simple) u Opción B (acumulativa entre sesiones)?**

- **Opción A:** Solo mide la sesión actual. Si el estudiante recarga, el tiempo previo se pierde desde el punto de vista del `totalTimeMinutes` enviado. El código es mínimo.
- **Opción B (recomendada):** Carga el tiempo previo de Oracle y lo acumula. Requiere leer `data.total_time_minutes` en `loadProgress` y guardar en un ref. Dos líneas adicionales respecto a la Opción A.

**Pregunta 2 — ¿Aplicar un límite máximo de tiempo por sesión?**

- Si un estudiante deja la app abierta horas sin interactuar y luego envía un mensaje, el tiempo registrado podría ser muy alto.
- Propuesta: aplicar `Math.min(totalTimeMinutes, 180)` para cap de 3 horas por sesión.
- Si no se aplica cap, el comportamiento es técnicamente correcto pero puede generar outliers en las estadísticas.

---

## 11. Resultados de pruebas — 2026-06-02

Todas las pruebas verificadas manualmente contra Oracle ADB:

| # | Acción | Resultado esperado | Resultado real | Estado |
|---|---|---|---|---|
| 1 | Abrir misión, esperar 2 min, enviar mensaje | `TOTAL_TIME_MINUTES = 2` | `TOTAL_TIME_MINUTES = 2` | ✅ |
| 2 | Enviar otro mensaje a los 5 min del inicio | `TOTAL_TIME_MINUTES = 5` | `TOTAL_TIME_MINUTES = 5` | ✅ |
| 3 | Cerrar y volver a abrir (tenía 5), esperar 3 min, enviar | `TOTAL_TIME_MINUTES = 8` | `TOTAL_TIME_MINUTES = 8` | ✅ |
| 4 | Enviar mensaje inmediatamente al abrir | `TOTAL_TIME_MINUTES ≥ previo + 1` | `TOTAL_TIME_MINUTES = previo + 1` | ✅ |
| 5 | Dashboard → Study Time | Suma real por misión, no múltiplos de 5 | Suma real correcta | ✅ |

**No se detectaron regresiones** en el flujo de texto, flujo de voz, grammar score (MVP-01) ni pronunciation score (MVP-02).

---

*Implementado y verificado el 2026-06-02.*
