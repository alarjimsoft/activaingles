# TECHNICAL_DEBT.md
# Activa Inglés — Deuda Técnica

---

## Prioridad Alta

### TD-A01 — Backend sin autenticación
**Tipo:** Seguridad / Arquitectura
**Ubicación:** `backend/app/main.py`, todos los routes.
**Descripción:** FastAPI no tiene ningún middleware de autenticación. Los endpoints `/chat/message`, `/speech/to-text`, `/tts/speak` y `/speech/pronunciation-score` son públicos. Cualquier persona que descubra la URL del servidor puede consumir los servicios de IA (OpenAI, Google, Azure) con cargo al proyecto.
**Impacto:** Exposición económica directa. Un script automatizado puede vaciar la cuota de OpenAI o Azure sin restricción.

---

### TD-A02 — Oracle ORDS accesible directamente desde el browser
**Tipo:** Seguridad / Arquitectura
**Ubicación:** `src/services/authService.js`, `conversationService.js`, `dashboardService.js`, `missionService.js`, `progressService.js`.
**Descripción:** Seis servicios del frontend llaman directamente a Oracle ORDS sin pasar por FastAPI. Cualquier usuario con DevTools puede inspeccionar las URLs, parámetros y estructura de datos, o hacer llamadas directas manipulando `id_inscripcion` o `mission_id`.
**Impacto:** Exposición del schema de Oracle, posible manipulación de datos pedagógicos de otros estudiantes si Oracle no tiene row-level security.

---

### TD-A03 — API Keys en archivo `.env` de texto plano
**Tipo:** Seguridad
**Ubicación:** `backend/.env`.
**Descripción:** El archivo contiene claves reales de producción de OpenAI (`sk-proj-...`) y Azure. Aunque está en `.gitignore`, existe en disco y es legible por cualquier proceso con acceso al filesystem.
**Impacto:** Si el servidor es comprometido, las tres claves quedan expuestas inmediatamente.

---

### TD-A04 — `TutorChat.jsx` con 785 líneas y 7 responsabilidades
**Tipo:** Mantenibilidad / Arquitectura
**Ubicación:** `src/components/mission/TutorChat.jsx`.
**Descripción:** Un único componente orquesta: grabación de audio, Speech-to-Text, evaluación de pronunciación, mensajes de chat, TTS, inicio de conversación, carga de historial, progreso, y renderización completa del chat. Cualquier cambio en cualquiera de estas responsabilidades toca el mismo archivo de 785 líneas.
**Impacto:** Alto riesgo de regresión, baja testabilidad, imposibilidad de reutilizar lógica de audio o chat en otros contextos.

---

### TD-A05 — `sendMessage` y `sendTranscriptMessage` duplicados (~150 líneas)
**Tipo:** Código duplicado / Mantenibilidad
**Ubicación:** `src/components/mission/TutorChat.jsx:282` y `:389`.
**Descripción:** Ambas funciones hacen exactamente lo mismo: guardan el mensaje del usuario en Oracle, llaman a GPT, guardan la respuesta del tutor, actualizan el progreso, reproducen TTS. La única diferencia es que `sendTranscriptMessage` recibe `pronunciationData`. El cálculo de `progressPercent`, `xpEarned`, y todas las llamadas a servicios están duplicadas byte-a-byte.
**Impacto:** Un bug corregido en una función no se corrige en la otra. Ya ocurre: `pronunciationScore: 0` está comentado en `sendMessage` pero activo en `sendTranscriptMessage`.

---

### TD-A06 — `speech_router` registrado dos veces en FastAPI
**Tipo:** Bug / Arquitectura
**Ubicación:** `backend/app/main.py:8,11,25,28`.
```python
from app.routes.speech import router as speech_router  # línea 8
from app.routes.speech import router as speech_router  # línea 11 (duplicada)
app.include_router(speech_router)  # línea 25
app.include_router(speech_router)  # línea 28 (duplicada)
```
**Descripción:** El router de speech se importa dos veces y se registra dos veces. FastAPI registra las rutas `/speech/to-text` y `/speech/pronunciation-score` duplicadas.
**Impacto:** Comportamiento de routing impredecible, potencial doble procesamiento de peticiones, warning silencioso que podría ocultar errores reales.

---

### TD-A07 — `grammarScore` hardcodeado a 85 en 3 ubicaciones
**Tipo:** Datos corruptos / Lógica de negocio
**Ubicación:** `src/components/mission/TutorChat.jsx:367`, `:475`, `backend/app/routes/chat.py:53`.
**Descripción:** Oracle siempre recibe `grammar_score = 85` independientemente del desempeño real del estudiante. GPT sí devuelve correcciones gramaticales, pero ese resultado nunca se convierte en score.
**Impacto:** Los datos en `USER_PROGRESS.grammar_score` son inválidos. Las analíticas del Dashboard muestran métricas ficticias. Viola la Regla #5 de PROJECT_VISION.md.

---

### TD-A08 — `pronunciationScore: 0` en mensajes de texto
**Tipo:** Datos corruptos / Lógica de negocio
**Ubicación:** `src/components/mission/TutorChat.jsx:477` (línea comentada).
**Descripción:** En el flujo de texto, `pronunciationScore` se envía como `0` a Oracle. La línea con el valor real está comentada. Esto corrompe el promedio de pronunciación en el Dashboard para estudiantes que usan principalmente texto.
**Impacto:** `avg_pronunciation` en el Dashboard refleja 0 para todos los mensajes escritos. Viola la Regla #3 de PROJECT_VISION.md.

---

### TD-A09 — Stream de micrófono nunca se cierra
**Tipo:** Memory Leak / Rendimiento
**Ubicación:** `src/components/mission/TutorChat.jsx:176` (`startListening`).
**Descripción:** `navigator.mediaDevices.getUserMedia()` crea un stream con tracks de audio. Los tracks nunca se detienen (`stream.getTracks().forEach(t => t.stop())`). El icono de micrófono activo permanece en el browser. En sesiones largas con múltiples grabaciones, múltiples streams quedan activos.
**Impacto:** Indicador de micrófono activo confunde al usuario. Leak de recursos del sistema operativo. Posible impacto en batería y privacidad.

---

### TD-A10 — `URL.createObjectURL` sin `revokeObjectURL`
**Tipo:** Memory Leak
**Ubicación:** `src/components/mission/TutorChat.jsx:269` (`playTutorVoice`).
**Descripción:** Cada respuesta del tutor crea un blob URL en memoria con `URL.createObjectURL(audioBlob)`. Nunca se llama `URL.revokeObjectURL()`. En una misión de 20 mensajes, 20 blob URLs de audio permanecen en memoria durante toda la sesión.
**Impacto:** Crecimiento progresivo de memoria durante sesiones largas. En dispositivos con RAM limitada, puede causar degradación del rendimiento.

---

### TD-A11 — `getDashboardStats` llamado dos veces por render
**Tipo:** Rendimiento / Redundancia
**Ubicación:** `src/pages/Dashboard.jsx:40` y `src/components/layout/Sidebar.jsx:62`.
**Descripción:** `Sidebar` y `Dashboard` llaman a `getDashboardStats(inscripcion.idInscripcion)` de forma independiente en sus respectivos `useEffect`. Dado que `Sidebar` está en `MainLayout` y `MainLayout` envuelve a `Dashboard`, ambas llamadas se ejecutan simultáneamente en cada render.
**Impacto:** Doble carga a Oracle ORDS en cada navegación al Dashboard. Cuando la app escale a cientos de usuarios, este patrón duplica el tráfico innecesariamente.

---

## Prioridad Media

### TD-M01 — `completeMission()` definida pero nunca invocada
**Tipo:** Bug funcional
**Ubicación:** `src/services/progressService.js:66`, referenciada desde ningún lugar del flujo de chat.
**Descripción:** La función que debería marcar una misión como `COMPLETED` en Oracle existe pero no se llama. El flujo actual usa `alert()` como único indicador de completado.
**Impacto:** El estado `COMPLETED` en Oracle puede no actualizarse. Las misiones siguientes pueden no desbloquearse. La lógica de desbloqueo de Oracle espera que `POST /progress/complete` sea llamado.

---

### TD-M02 — Mezcla de `fetch` y `axios` sin criterio
**Tipo:** Inconsistencia / Mantenibilidad
**Ubicación:** Todos los archivos en `src/services/`.
**Descripción:** `chatService`, `speechService`, `pronunciationService`, `ttsService`, `authService`, `missionService` usan `fetch` nativo. `conversationService`, `dashboardService`, `progressService` (start/update/complete) usan `axios`. `progressService.getMissionProgress` mezcla ambos.
**Impacto:** Sin cliente HTTP centralizado, la configuración de headers, timeouts, manejo de errores e interceptores es inconsistente. Un cambio de configuración global (ej. añadir auth header) requiere editar múltiples archivos.

---

### TD-M03 — URLs de Oracle y localhost hardcodeadas en 10 archivos
**Tipo:** Configuración / Mantenibilidad
**Ubicación:** `src/services/authService.js`, `chatService.js`, `conversationService.js`, `dashboardService.js`, `missionService.js`, `progressService.js` (x2), `pronunciationService.js`, `speechService.js`, `ttsService.js`.
**Descripción:** La URL base de Oracle ORDS y la URL de FastAPI están literales en el código. No se usa `import.meta.env` ni archivo `.env` del frontend.
**Impacto:** Un cambio de entorno (dev → staging → prod) requiere editar manualmente 10 archivos. Riesgo alto de olvidar una URL en el proceso.

---

### TD-M04 — `useAppStore` con `initialConversation` hardcodeada
**Tipo:** Estado inconsistente / Bug potencial
**Ubicación:** `src/store/useAppStore.js:4-42`.
**Descripción:** El store tiene mensajes iniciales hardcodeados para misiones 1, 2 y 3. Cuando el historial real de Oracle se carga via `getHistory`, esos mensajes hardcodeados ya están en el store. No hay mecanismo de deduplicación.
**Impacto:** Al entrar a misión 1, 2 o 3, el estudiante ve mensajes del tutor previos al historial real de Oracle. Si el historial de Oracle tiene los mismos IDs, pueden aparecer mensajes duplicados.

---

### TD-M05 — `totalTimeMinutes` hardcodeado a 5 en 2 ubicaciones
**Tipo:** Datos corruptos
**Ubicación:** `src/components/mission/TutorChat.jsx:365` y `:473`.
**Descripción:** Cada llamada a `updateProgress` registra exactamente 5 minutos de estudio, independientemente del tiempo real. Un estudiante que envía 20 mensajes aparece con 100 minutos de estudio, pero si tardó 3 minutos, el dato es incorrecto.
**Impacto:** Estadística de "Study Time" en el Dashboard es ficticia.

---

### TD-M06 — `azure_pronunciation.py` bloquea el event loop de FastAPI
**Tipo:** Rendimiento / Escalabilidad
**Ubicación:** `backend/app/services/azure_pronunciation.py:122`.
**Descripción:** `speech_recognizer.recognize_once()` es una operación síncrona y bloqueante dentro de un endpoint `async` de FastAPI. Durante la evaluación de pronunciación (~2-5 segundos), el servidor no puede procesar ninguna otra petición.
**Impacto:** Con más de 1 usuario simultáneo, las peticiones de chat, TTS y STT se bloquean mientras alguien evalúa pronunciación.

---

### TD-M07 — `ffmpeg` como dependencia no declarada
**Tipo:** Dependencia peligrosa / DevOps
**Ubicación:** `backend/app/services/azure_pronunciation.py:9` (`import ffmpeg`).
**Descripción:** `ffmpeg` es una dependencia binaria del sistema operativo que no está en `requirements.txt`. Debe instalarse manualmente en el servidor. Si no está presente, el endpoint de pronunciación falla con un error de importación o de subprocess.
**Impacto:** La instalación en un nuevo entorno o en producción fallará silenciosamente sin instrucciones claras.

---

### TD-M08 — Sin rate limiting en el backend
**Tipo:** Seguridad / Costos
**Ubicación:** `backend/app/main.py`.
**Descripción:** No hay middleware de rate limiting. Un usuario (o script) puede enviar peticiones ilimitadas a `/chat/message`, consumiendo tokens de OpenAI sin restricción. Con `gpt-4.1-mini`, el costo por token es bajo pero acumulable.
**Impacto:** Riesgo de costo excesivo por abuso. En producción con múltiples instituciones, el abuso puede ser significativo.

---

### TD-M09 — `alert()` nativo como sistema de feedback
**Tipo:** UX / Deuda de UI
**Ubicación:** `src/components/mission/TutorChat.jsx:239`, `:372`, `:481`.
**Descripción:** Tres instancias de `alert()` nativo del browser: "Speech recognition failed", "Mission Completed! 🎉" (x2). `alert()` bloquea el hilo del browser, no forma parte del sistema de diseño y tiene estilos que dependen del OS.
**Impacto:** Experiencia de usuario inconsistente. En mobile, el `alert()` puede cubrir el contenido y confundir al usuario.

---

### TD-M10 — Prompt injection en `/chat/message`
**Tipo:** Seguridad
**Ubicación:** `backend/app/services/openai_service.py:30-81`.
**Descripción:** El `mission` dict del request se embebe directamente en el system prompt sin sanitización: `{mission["title"]}`, `{mission["description"]}`. Un cliente malicioso puede enviar un `mission.title` con instrucciones adversariales que anulen el comportamiento del tutor.
**Impacto:** El tutor podría responder de formas no pedagógicas o revelar el system prompt.

---

### TD-M11 — Historial de conversación sin paginación
**Tipo:** Escalabilidad
**Ubicación:** `src/services/conversationService.js:46` (`getHistory`).
**Descripción:** `GET /chat/history/:conversationId` retorna todos los mensajes de una conversación sin límite. Un estudiante que practica 30 minutos puede generar 40-60 mensajes en una sola conversación.
**Impacto:** Payloads grandes en conversaciones largas. Sin paginación, el tiempo de carga al reanudar una misión crece linealmente con el número de mensajes.

---

### TD-M12 — Sesión sin expiración
**Tipo:** Seguridad
**Ubicación:** `src/store/authStore.js`.
**Descripción:** La sesión persiste en localStorage indefinidamente. No hay JWT con expiración, no hay refresh token, no hay TTL configurable.
**Impacto:** Un dispositivo compartido o robado mantiene acceso permanente a la cuenta del estudiante.

---

### TD-M13 — `BR-TUTOR-04`: GPT sin historial de conversación
**Tipo:** Lógica de negocio / UX
**Ubicación:** `backend/app/services/openai_service.py:83-110`.
**Descripción:** El endpoint de chat solo envía `[{ role: system }, { role: user, content: user_message }]`. No se pasa el historial previo. GPT no recuerda nada de la conversación anterior en el mismo endpoint call.
**Impacto:** El tutor no puede hacer seguimiento de lo que el estudiante dijo antes. Respuestas como "¿recuerdas que antes dijiste...?" son imposibles. La conversación pierde coherencia en misiones largas.

---

## Prioridad Baja

### TD-B01 — 19 `console.log` / `console.error` en producción
**Tipo:** Mantenibilidad / Seguridad
**Ubicación:** `Dashboard.jsx`, `MissionPage.jsx`, `TutorChat.jsx`, `Sidebar.jsx`, `missionService.js`.
**Descripción:** Logs que exponen estructuras internas, IDs de Oracle, datos de conversación y respuestas de APIs en la consola del browser.
**Impacto:** Bajo en dev, medio en producción — cualquier usuario puede inspeccionar los datos en DevTools.

---

### TD-B02 — Sin TypeScript ni PropTypes
**Tipo:** Mantenibilidad
**Ubicación:** Todo el frontend.
**Descripción:** No hay validación de tipos en ningún componente ni servicio. Los errores de contrato entre componentes (ej. pasar `mission` con campos faltantes) solo se detectan en runtime.
**Impacto:** A medida que el equipo crece o el código evoluciona, los errores de tipo son más difíciles de detectar.

---

### TD-B03 — `Loader.jsx` sin uso
**Tipo:** Código muerto
**Ubicación:** `src/components/ui/Loader.jsx`.
**Descripción:** El componente existe pero no se usa en ninguna página. Las páginas muestran el contenido principal directamente sin indicador de carga mientras esperan datos de Oracle.
**Impacto:** Menor. Pero hay escenarios donde el usuario ve un dashboard vacío mientras carga.

---

### TD-B04 — `useParams()` comentado en `MissionPage`
**Tipo:** Funcionalidad incompleta / Bug potencial
**Ubicación:** `src/pages/MissionPage.jsx:3` (`//useParams()`).
**Descripción:** La ruta es `/missions/:id` pero el ID nunca se usa para cargar la misión. La misión llega solo via `location.state`. Si el usuario navega directamente a `/missions/1` (ej. desde un bookmark o recargando), la página muestra "Mission not found".
**Impacto:** El enlace directo a una misión no funciona. Rompe el comportamiento esperado de URLs en una SPA.

---

### TD-B05 — `completeMission` en `progressService.js` mezcla `fetch` y `axios`
**Tipo:** Inconsistencia
**Ubicación:** `src/services/progressService.js`.
**Descripción:** `start`, `update` y `complete` usan `axios`, pero `getMissionProgress` usa `fetch` nativo en el mismo archivo.
**Impacto:** Menor, pero representa la inconsistencia general del cliente HTTP que permea toda la capa de servicios.

---

## Resumen de Deuda por Prioridad

| Prioridad | Cantidad | Ítems |
|---|---|---|
| **Alta** | 11 | TD-A01 a TD-A11 |
| **Media** | 13 | TD-M01 a TD-M13 |
| **Baja** | 5 | TD-B01 a TD-B05 |
| **Total** | **29** | |
