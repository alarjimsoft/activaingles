# IMPLEMENTATION_PLAN_ALT-06
# Sistema de notificaciones in-app — Reemplazo de alert()

**Iniciativa:** ALT-06  
**Fecha de análisis:** 2026-06-03  
**Estado:** Pendiente de aprobación  
**Autor del análisis:** Claude Code (claude-sonnet-4-6)

---

## 1. Resumen ejecutivo

ALT-06 reemplaza los tres `alert()` nativos del navegador presentes en `TutorChat.jsx` por un sistema de notificaciones toast in-app, consistente con la estética de videojuego educativo del producto. El cambio es **exclusivamente frontend** — cero impacto en backend, Oracle ORDS, PL/SQL, tablas o endpoints.

---

## 2. Diagnóstico del estado actual

### 2.1 Usos de alert() identificados

| Línea | Contexto | Tipo de evento | Función que lo contiene |
|---|---|---|---|
| 278 | Falla del flujo de reconocimiento de voz (STT) | Error | `startListening()` → `onstop` handler |
| 428 | Misión completada (progressPercent >= 100) | Éxito | `sendTranscriptMessage()` — flujo de voz |
| 551 | Misión completada (progressPercent >= 100) | Éxito | `sendMessage()` — flujo de texto |

### 2.2 Por qué alert() es un problema crítico aquí

1. **Bloquea el hilo principal del navegador** — el usuario no puede interactuar con ningún elemento mientras el `alert()` está activo. Esto incluye el chat, el botón de micrófono y el PDF export.
2. **Ruptura estética total** — el diálogo nativo del navegador es completamente ajeno al tema oscuro premium del producto.
3. **Sin contexto pedagógico** — "Mission Completed! 🎉" no comunica XP ganado, siguiente misión, ni siguiente paso.
4. **Incompatible con la visión de videojuego educativo** — PROJECT_VISION.md especifica que la experiencia debe "sentirse más cercana a un videojuego educativo que a un curso tradicional." Un `alert()` nativo es la antítesis de eso.
5. **Código duplicado** — el `alert("Mission Completed! 🎉")` aparece en dos funciones casi idénticas (`sendMessage` y `sendTranscriptMessage`) por la deuda técnica TD-A05.

---

## 3. Análisis de impacto por capa

### 3.1 Archivos React afectados

| Archivo | Tipo de cambio | Descripción |
|---|---|---|
| `src/store/useNotificationStore.js` | **NUEVO** | Zustand store efímero para notificaciones activas |
| `src/components/ui/Toast.jsx` | **NUEVO** | Componente visual de notificación individual |
| `src/components/ui/ToastContainer.jsx` | **NUEVO** | Contenedor fijo que renderiza todos los toasts activos |
| `src/router/AppRouter.jsx` | **MODIFICAR** | Montar `<ToastContainer />` dentro de `<BrowserRouter>` |
| `src/components/mission/TutorChat.jsx` | **MODIFICAR** | Reemplazar 3 llamadas a `alert()` por `addNotification()` |

### 3.2 Servicios Python afectados

**Ninguno.** El sistema de notificaciones es puramente frontend. No se modifica ningún archivo en `backend/`.

### 3.3 Packages Oracle afectados

**Ninguno.**

### 3.4 Procedimientos Oracle afectados

**Ninguno.**

### 3.5 Endpoints ORDS afectados

**Ninguno.** No se añaden ni modifican llamadas a Oracle ORDS.

### 3.6 Tablas Oracle afectadas

**Ninguna.** Las notificaciones son estado efímero de UI, no datos académicos.

### 3.7 Reglas de negocio afectadas

| Regla | Relación con ALT-06 |
|---|---|
| BR-PROG-03 | La misión completada actualmente dispara un `alert()`. ALT-06 lo reemplaza por un toast. La lógica de completar misión en Oracle (`completeMission()`) sigue sin llamarse — eso es BUG-01, separado. |
| BR-SYS-01 | No aplica — las notificaciones no son datos académicos persistibles. |
| Regla Vision #7 | "La experiencia debe mantenerse simple para el estudiante." — ALT-06 mejora directamente esta regla al eliminar interrupciones del flujo de la UI. |

---

## 4. Cómo funciona actualmente el flujo de grammar score

> **Nota:** El flujo de grammar score no es modificado por ALT-06. Se documenta aquí porque forma parte del análisis solicitado y porque el CLAUDE.md registra deuda técnica relacionada (TD-A07).

### Flujo actual (por código — puede diferir de CLAUDE.md que documenta estado anterior)

```
TutorChat.jsx (sendMessage | sendTranscriptMessage)
  │
  ├─ sendChatMessage({ message, mission, progress_percent, history })
  │     ↓
  │   chatService.js → POST http://127.0.0.1:8000/chat/message
  │     ↓
  │   backend/app/routes/chat.py
  │     ├── openai_service.get_reply(message, mission, history)
  │     │     → GPT-4.1-mini con response_format: json_object
  │     │     → JSON: { reply, correction, grammar_score? }
  │     └── progress_service.calculate_xp(grammar_score, pronunciation_score, completed)
  │           → agrega XP a Oracle vía POST /progress/add-xp
  │
  └─ result.grammar_score → TutorChat.jsx
        → updateProgress({ grammarScore: result.grammar_score ?? 90 })
              → progressService.js → POST /ords/api/progress/update
                    → Oracle USER_PROGRESS.grammar_score
```

### Estado real (al momento del análisis)

- El system prompt de GPT en `openai_service.py` instruye a GPT a devolver un campo `grammar_score` en el JSON de respuesta.
- El frontend usa `result.grammar_score ?? 90` — si GPT no devuelve el campo, el fallback es `90` (no `85` como documenta CLAUDE.md — el código fue actualizado).
- El valor de Oracle `USER_PROGRESS.grammar_score` refleja lo que GPT decida, no un valor hardcodeado, siempre que GPT lo incluya en su respuesta JSON.
- La deuda TD-A07 sigue siendo relevante si GPT omite el campo o retorna valores inconsistentes, pero ya no es `85` fijo.

**Conclusión para ALT-06:** El flujo de grammar score no es modificado por esta iniciativa. No hay riesgo de regresión.

---

## 5. Qué cambios deben realizarse

### 5.1 Nuevo: `src/store/useNotificationStore.js`

Zustand store **sin `persist`** (las notificaciones son efímeras — no deben sobrevivir una recarga).

```js
// Estructura de una notificación
{
  id: number,          // Date.now() — identificador único
  type: 'success' | 'error' | 'info' | 'warning',
  title: string,       // Título corto (ej. "Mission Completed!")
  message: string,     // Cuerpo descriptivo (ej. "+50 XP earned")
  duration: number,    // ms hasta auto-dismiss (default: 4000)
}
```

Acciones:
- `addNotification({ type, title, message, duration })` — agrega y programa auto-dismiss
- `removeNotification(id)` — elimina por ID (dismiss manual o auto)

### 5.2 Nuevo: `src/components/ui/Toast.jsx`

Componente que renderiza una notificación individual.

**Variantes visuales por tipo:**

| Tipo | Color borde | Icono (Lucide) | Color icono |
|---|---|---|---|
| `success` | `cyan-500` | `CheckCircle` | `cyan-400` |
| `error` | `red-500` | `XCircle` | `red-400` |
| `info` | `blue-500` | `Info` | `blue-400` |
| `warning` | `yellow-500` | `AlertTriangle` | `yellow-400` |

**Anatomía visual:**
```
┌─────────────────────────────────────────────┐
│ [Icon]  Title                          [X]  │
│         Message body                        │
└─────────────────────────────────────────────┘
  bg-zinc-900, border-l-4, rounded-2xl, shadow-xl
```

**Animación:** Framer Motion `initial={{ x: 100, opacity: 0 }}` → `animate={{ x: 0, opacity: 1 }}` → `exit={{ x: 100, opacity: 0 }}`. Librería ya instalada.

### 5.3 Nuevo: `src/components/ui/ToastContainer.jsx`

Contenedor fijo en `position: fixed, top: 24px, right: 24px, z-index: 50`.
Lee `notifications` del store y renderiza cada `<Toast />` dentro de `<AnimatePresence>`.

### 5.4 Modificar: `src/router/AppRouter.jsx`

Añadir `<ToastContainer />` como hijo directo de `<BrowserRouter>`, antes de `<AnimatePresence>` del router. Esto garantiza que el contenedor de toasts esté disponible en todas las rutas, incluyendo `/` (LoginPage) y `/missions/:id`.

```jsx
<BrowserRouter>
  <ToastContainer />          {/* ← NUEVO */}
  <AnimatePresence mode="wait">
    <Routes>...</Routes>
  </AnimatePresence>
</BrowserRouter>
```

### 5.5 Modificar: `src/components/mission/TutorChat.jsx`

Reemplazar 3 ocurrencias de `alert()`:

**Línea 278 — Error de reconocimiento de voz:**
```jsx
// ANTES
alert("Speech recognition failed.");

// DESPUÉS
addNotification({
  type: "error",
  title: "Voice Recognition Failed",
  message: "Could not process your audio. Please try again.",
});
```

**Línea 428 — Misión completada (flujo de voz):**
```jsx
// ANTES
alert("Mission Completed! 🎉");

// DESPUÉS
addNotification({
  type: "success",
  title: "Mission Completed!",
  message: `Great work! Keep practicing to reinforce your skills.`,
  duration: 6000,
});
```

**Línea 551 — Misión completada (flujo de texto):**
```jsx
// ANTES
alert("Mission Completed! 🎉");

// DESPUÉS
addNotification({
  type: "success",
  title: "Mission Completed!",
  message: `Great work! Keep practicing to reinforce your skills.`,
  duration: 6000,
});
```

**Nota importante (TD-A05):** Como `sendMessage` y `sendTranscriptMessage` son funciones duplicadas, el cambio de `alert()` debe replicarse en ambas — exactamente como documenta el CLAUDE.md para cualquier modificación a este componente.

---

## 6. Riesgos de implementación

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-ALT06-01 | El z-index del ToastContainer queda por debajo del Sidebar o del TutorChat | Media | Bajo | Usar `z-[9999]` en el contenedor. El Sidebar usa Tailwind sin z-index explícito. |
| R-ALT06-02 | Múltiples misiones completadas en secuencia apilan demasiados toasts | Baja | Bajo | Limitar a N=3 toasts simultáneos en el store (descartar el más antiguo). |
| R-ALT06-03 | El `addNotification` no estabiliza la referencia al llamarlo en closures async | Baja | Bajo | Usar el patrón `get()` de Zustand en el auto-dismiss timeout para evitar stale closures. |
| R-ALT06-04 | AnimatePresence dentro de BrowserRouter interfiere con AnimatePresence del router | Baja | Bajo | Son instancias independientes en ramas diferentes del DOM — no hay conflicto. |
| R-ALT06-05 | El store de notificaciones se confunde con useAppStore y se persiste accidentalmente | Baja | Medio | Crear store separado sin `persist()`. Nombre explícito: `useNotificationStore`. |

---

## 7. Estrategia de despliegue

Este cambio no requiere coordinación con el equipo de backend ni con el equipo de Oracle. Se puede desplegar de forma independiente en cualquier momento.

**Orden de implementación recomendado (en una sola sesión):**

1. Crear `useNotificationStore.js` — sin dependencias externas.
2. Crear `Toast.jsx` — depende solo de Lucide y Framer Motion (ya instalados).
3. Crear `ToastContainer.jsx` — depende de `Toast.jsx` y del store.
4. Modificar `AppRouter.jsx` — añadir `<ToastContainer />`.
5. Modificar `TutorChat.jsx` — reemplazar los 3 `alert()`.

No hay migraciones de datos, no hay cambios en `.env`, no hay cambios en `requirements.txt`.

---

## 8. Estrategia de pruebas

### 8.1 Pruebas manuales (obligatorias)

| Escenario | Pasos | Resultado esperado |
|---|---|---|
| Toast de error — voz | 1. Ir a cualquier misión ACTIVE. 2. Simular falla de STT (desconectar internet, modificar temporalmente la URL del servicio). 3. Presionar micrófono. | Toast rojo "Voice Recognition Failed" aparece top-right, sin bloquear UI. Auto-dismiss en 4s. |
| Toast de éxito — texto | 1. Enviar 10 mensajes de texto en una misión. | Toast cyan "Mission Completed!" aparece. No bloquea input ni el chat. Auto-dismiss en 6s. |
| Toast de éxito — voz | 1. Enviar 10 mensajes de voz en una misión. | Igual que el anterior. |
| Dismiss manual | 1. Activar cualquier toast. 2. Clic en X del toast. | Toast desaparece con animación de salida. |
| Toast en login | 1. Abrir `/`. | No hay toast (LoginPage no los dispara — verificar que el contenedor no interfiere). |
| Stack de toasts | 1. Disparar error y luego misión completada rápidamente. | Ambos toasts visibles apilados. No se superponen. |
| Persistencia entre rutas | 1. Disparar toast en `/missions/:id`. 2. Navegar a `/dashboard`. | Toast sigue visible hasta que auto-dismiss o X lo cierra. |

### 8.2 Verificaciones de regresión

- El flujo completo de texto (enviar mensaje → respuesta del tutor → TTS) no se interrumpe.
- El flujo completo de voz (grabar → STT → Azure → sendTranscriptMessage) no se interrumpe.
- El export PDF sigue funcionando.
- Los scores de pronunciación siguen mostrándose en las barras.

### 8.3 No requiere

- Tests de integración con Oracle (cero cambios en servicios ORDS).
- Tests de backend (cero cambios en FastAPI).
- Migración del store de Zustand (store nuevo, no modifica `useAppStore`).

---

## 9. Posibilidad de extensión futura (sin impacto en ALT-06)

El sistema que se construye en ALT-06 estará disponible para notificaciones futuras sin modificación adicional:

| Caso futuro | Notificación sugerida |
|---|---|
| Level Up (Iteración 1) | `type: "success", title: "Level Up!", message: "You reached Level X"` |
| Nueva misión desbloqueada | `type: "info", title: "Mission Unlocked", message: "Daily Routines is now available"` |
| Error de red al guardar mensaje | `type: "error", title: "Connection Error", message: "Message could not be saved to Oracle"` |
| XP ganado por pronunciación excelente | `type: "success", title: "+20 XP", message: "Excellent pronunciation score!"` |

---

## 10. Resumen de archivos y cambios

```
NUEVOS (3 archivos):
  src/store/useNotificationStore.js     — Zustand store efímero, sin persist
  src/components/ui/Toast.jsx           — Componente visual de notificación
  src/components/ui/ToastContainer.jsx  — Contenedor fixed, AnimatePresence

MODIFICADOS (2 archivos):
  src/router/AppRouter.jsx              — +1 línea: <ToastContainer />
  src/components/mission/TutorChat.jsx  — Reemplazar 3 alert() con addNotification()

SIN CAMBIOS:
  Backend Python (todos los archivos)
  Oracle ORDS (todos los endpoints)
  Oracle ADB (todas las tablas y procedimientos)
  Zustand stores existentes (authStore, useAppStore)
  Resto de páginas y componentes React
```

---

## 11. Dependencias externas

**Ninguna nueva.** Todo lo necesario ya está instalado:
- `framer-motion@12.38.0` — animaciones de toast
- `lucide-react` — iconos del toast
- `zustand@5.0.13` — store de notificaciones
- `tailwindcss@4.3.0` — estilos

---

*Listo para implementación. Esperando aprobación.*
