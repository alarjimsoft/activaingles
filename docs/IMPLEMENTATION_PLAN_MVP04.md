# IMPLEMENTATION_PLAN_MVP04.md
# MVP-04 — Cierre del stream de micrófono y liberación de blob URLs de audio

> **Estado:** Pendiente de aprobación
> **Fecha:** 2026-06-01
> **Iniciativa:** MVP-04 del PRODUCT_BACKLOG.md
> **Estimación:** 30 minutos de implementación + pruebas
> **Riesgo de implementación:** Ninguno — cambios aditivos que no modifican lógica existente

---

## 1. Cómo funcionan actualmente los dos leaks

### Leak 1 — Stream de micrófono nunca se cierra

En `startListening()`, `navigator.mediaDevices.getUserMedia()` crea un `MediaStream` con un track de audio activo. Cuando `MediaRecorder` para de grabar (`.stop()` al cabo de 4 segundos), se dispara `mediaRecorder.onstop`. En ese punto los chunks de audio ya están en `audioChunksRef.current` — el stream ha cumplido su propósito.

**Pero el stream nunca se cierra:**

```javascript
const startListening = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  //                    ↑ crea un MediaStream con 1 AudioTrack activo

  const mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.onstop = async () => {
    // ← aquí el stream ya no es necesario
    // ← pero stream.getTracks().forEach(t => t.stop()) NUNCA se llama

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    // ... procesa el audio ...
  };

  mediaRecorder.start();
  setTimeout(() => mediaRecorder.stop(), 4000);
};
// → el AudioTrack permanece activo indefinidamente
// → el indicador de micrófono del browser sigue encendido
// → la memoria del track sigue ocupada
```

**Consecuencia por grabación acumulada:**
- 1 grabación → 1 track activo
- 5 grabaciones → 5 tracks activos (confirmado por simulación)
- 20 grabaciones en una sesión → 20 tracks activos

El `stream` está disponible dentro de `onstop` por **clausura de JavaScript** — la variable está en el scope de `startListening` y es accesible desde la función interna.

---

### Leak 2 — Blob URL de TTS nunca se revoca

En `playTutorVoice()`, `URL.createObjectURL(audioBlob)` crea una URL de objeto (`blob:http://...`) que es una referencia en memoria al contenido del audio. Esta referencia debe liberarse explícitamente con `URL.revokeObjectURL()` cuando ya no se necesita.

```javascript
const playTutorVoice = async (text) => {
  const audioBlob = await speakText(text);

  const audioUrl = URL.createObjectURL(audioBlob);
  //                   ↑ crea referencia en memoria (~30KB por respuesta)

  const audio = new Audio(audioUrl);
  audio.play();
  // ← URL.revokeObjectURL(audioUrl) NUNCA se llama
  // ← la referencia permanece en memoria hasta cerrar el tab
};
```

**Impacto acumulado estimado:**

| Escenario | Blob URLs en memoria | Tamaño estimado |
|---|---|---|
| 10 mensajes con TTS | 10 URLs | ~300 KB |
| 20 mensajes con TTS | 20 URLs | ~600 KB |
| 3 misiones completas (60 mensajes) | 60 URLs | ~1.8 MB |

El `audioUrl` está disponible dentro de `onended` por clausura de JavaScript — la variable está en el scope de `playTutorVoice`.

---

## 2. Qué cambios deben realizarse

### Cambio 1 — Cerrar stream en `mediaRecorder.onstop`

**Ubicación:** `src/components/mission/TutorChat.jsx`, función `startListening()`, dentro de `mediaRecorder.onstop`.

**Momento correcto:** La primera línea de `onstop`, antes del procesamiento del audio. El audio ya está en `audioChunksRef.current` — el stream no es necesario desde ese momento. Cerrarlo inmediatamente apaga el indicador de micrófono lo antes posible.

```javascript
// ANTES:
mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
  // ...

// DESPUÉS:
mediaRecorder.onstop = async () => {
  stream.getTracks().forEach((track) => track.stop());  // ← AGREGAR esta línea

  const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
  // ...
```

**Por qué `stream` está disponible:** clausura de JavaScript. `stream` está declarada en el scope de `startListening` con `const`, y `onstop` es una función anidada que tiene acceso a todo el scope externo. No se necesita ningún cambio en la firma de la función ni en referencias.

---

### Cambio 2 — Revocar blob URL en `audio.onended`

**Ubicación:** `src/components/mission/TutorChat.jsx`, función `playTutorVoice()`.

**Momento correcto:** Revocar la URL cuando el audio termina de reproducirse (`onended`). Es el momento más seguro — el objeto `Audio` ya usó la URL y no la necesita más.

```javascript
// ANTES:
const audio = new Audio(audioUrl);
audio.play();

// DESPUÉS:
const audio = new Audio(audioUrl);
audio.onended = () => URL.revokeObjectURL(audioUrl);  // ← AGREGAR esta línea
audio.play();
```

**Por qué `audioUrl` está disponible en `onended`:** clausura de JavaScript. `audioUrl` está declarada en el scope de `playTutorVoice` con `const`, y `onended` es una función anidada que tiene acceso a ella.

**Por qué `onended` y no inmediatamente después de `play()`:** `audio.play()` es asíncrono — devuelve una Promise y el audio se reproduce en background. Revocar la URL inmediatamente después de `play()` podría interrumpir la reproducción en algunos browsers si el audio aún no terminó de decodificarse. `onended` garantiza que el audio terminó completamente antes de liberar el recurso.

---

## 3. Inventario completo de impacto por capa

### Archivos React afectados

| Archivo | Función | Cambio | Líneas |
|---|---|---|---|
| `src/components/mission/TutorChat.jsx` | `startListening()` → `mediaRecorder.onstop` | Agregar `stream.getTracks().forEach((track) => track.stop())` | +1 |
| `src/components/mission/TutorChat.jsx` | `playTutorVoice()` | Agregar `audio.onended = () => URL.revokeObjectURL(audioUrl)` | +1 |

**Total: 2 líneas añadidas en 1 archivo.**

### Servicios Python afectados
**Ninguno.** Los leaks son exclusivamente del lado del browser.

### Packages Oracle afectados
**Ninguno.**

### Procedimientos Oracle afectados
**Ninguno.**

### Endpoints ORDS afectados
**Ninguno.**

### Tablas Oracle afectadas
**Ninguna.**

### Reglas de negocio afectadas
**Ninguna.** Los cambios son de gestión de recursos del browser — no afectan datos pedagógicos, XP, progreso ni ninguna regla de negocio.

---

## 4. Análisis de clausuras JavaScript (garantía técnica)

Ambos fixes dependen de que las variables estén accesibles en las funciones callback. Verificación:

```
startListening() {
  const stream = ...      ← declarada con const en scope externo
  const mediaRecorder = ...
  
  mediaRecorder.onstop = async () => {
    stream.getTracks()... ← ACCEDE A stream POR CLAUSURA ✓
    //   ↑ JavaScript garantiza que el closure captura stream
    //     aunque startListening() haya "terminado" en apariencia
  }
}

playTutorVoice() {
  const audioUrl = ...    ← declarada con const en scope externo
  const audio = new Audio(audioUrl)
  
  audio.onended = () => {
    URL.revokeObjectURL(audioUrl)  ← ACCEDE A audioUrl POR CLAUSURA ✓
  }
}
```

Ambas clausuras son patrones estándar de JavaScript. No hay riesgo de que las variables sean `undefined` o `null` cuando los callbacks se ejecuten.

---

## 5. Riesgos de implementación

### Riesgo 1 — `stream.stop()` interrumpe el audio ya grabado (No existe)

**Análisis:** `stream.getTracks().forEach(t => t.stop())` detiene la captura de nuevos datos del micrófono. Para ese momento, `audioChunksRef.current` ya contiene todos los datos — `mediaRecorder.stop()` fue llamado antes de `onstop`, y `onstop` se dispara cuando el buffer final ya fue entregado. El `audioBlob` se construye desde `audioChunksRef.current` que ya está completo.

**Conclusión:** Ningún riesgo de corrupción del audio grabado.

---

### Riesgo 2 — `revokeObjectURL` interrumpe la reproducción en curso (No existe)

**Análisis:** La revocación ocurre en `audio.onended`, que solo se dispara cuando el audio **terminó completamente** de reproducirse. En ese momento, el objeto `Audio` ya no necesita la URL. El browser puede haber cacheado el audio decodificado internamente.

**Conclusión:** Ningún riesgo de cortar el audio del tutor.

---

### Riesgo 3 — El indicador de micrófono no se apaga inmediatamente en todos los browsers (Bajo, cosmético)

**Análisis:** En la mayoría de browsers (Chrome, Firefox, Edge), `track.stop()` apaga el indicador de micrófono inmediatamente. En algunos casos puede haber un delay de unos millisegundos por la implementación del browser. No es un bug del código.

**Conclusión:** Riesgo cosmético mínimo, no funcional.

---

### Riesgo 4 — Caso edge: usuario graba nuevamente antes de que `onstop` termine (No existe)

**Análisis:** El botón del micrófono muestra `isListening = true` durante la grabación y `isListening = false` al completar `onstop`. El usuario solo puede iniciar una nueva grabación cuando `isListening` vuelve a ser `false`. Esto ocurre al final de `onstop`, después del cierre del stream. No hay condición de carrera posible.

---

## 6. Estrategia de despliegue

Ambos cambios son en el frontend. Vite HMR (Hot Module Replacement) aplica los cambios instantáneamente en desarrollo al guardar el archivo. No se necesita restart.

```
1. Modificar TutorChat.jsx (2 líneas)
2. Vite HMR recarga el componente automáticamente
3. Verificar en el browser que el indicador de micrófono se apaga
4. Verificar en DevTools Memory que no hay crecimiento de blob URLs
```

---

## 7. Estrategia de pruebas

### Prueba 1 — Build de producción sin errores de sintaxis

```bash
npm run build
# Esperado: ✓ built in ~1s, sin errores
```

### Prueba 2 — Indicador de micrófono se apaga tras cada grabación

1. Abrir una misión en el browser
2. Hacer clic en el botón del micrófono
3. Esperar los 4 segundos
4. Observar el indicador de micrófono en la barra de pestañas del browser
5. **Esperado:** el indicador (punto rojo o ícono de grabación) desaparece después de la grabación

### Prueba 3 — Audio del tutor se reproduce completo

1. Enviar cualquier mensaje de texto o voz
2. Escuchar la respuesta del tutor
3. **Esperado:** el audio se reproduce completo sin cortes ni interrupciones

### Prueba 4 — No hay crecimiento de memoria por blob URLs (DevTools)

1. Abrir DevTools → pestaña **Memory**
2. Tomar un snapshot inicial
3. Enviar 5 mensajes con respuesta del tutor (5 reproducciones de TTS)
4. Tomar un segundo snapshot
5. Comparar: el número de objetos `Blob` o `ObjectURL` no debe haber crecido

### Prueba 5 — Múltiples grabaciones no acumulan streams

1. Usar el micrófono 3 veces en la misma misión
2. En DevTools → pestaña **Application** → sección **Media** (o usar `chrome://media-internals`)
3. **Esperado:** solo 1 stream activo en cada momento, no acumulación de streams previos

---

## 8. Resumen del cambio

| Campo | Detalle |
|---|---|
| Archivos modificados | 1 (`src/components/mission/TutorChat.jsx`) |
| Líneas agregadas | 2 |
| Líneas eliminadas | 0 |
| Comportamiento funcional | Sin cambio (audio funciona igual) |
| Comportamiento de recursos | Streams y blob URLs liberados correctamente |
| Riesgo | Ninguno |
| Reversibilidad | Inmediata (eliminar las 2 líneas) |

---

## 9. Código exacto de los cambios

> No modificar hasta recibir aprobación.

### Cambio 1 — `startListening()` en `TutorChat.jsx`

```javascript
// Contexto: dentro de mediaRecorder.onstop = async () => {

// ANTES — primera línea del callback:
const audioBlob = new Blob(

// DESPUÉS — agregar ANTES de la primera línea:
stream.getTracks().forEach((track) => track.stop());

const audioBlob = new Blob(
```

### Cambio 2 — `playTutorVoice()` en `TutorChat.jsx`

```javascript
// ANTES:
const audio = new Audio(audioUrl);

audio.play();

// DESPUÉS:
const audio = new Audio(audioUrl);

audio.onended = () => URL.revokeObjectURL(audioUrl);

audio.play();
```

---

## 10. Checklist de implementación

```
PRE-IMPLEMENTACIÓN
[x] Aprobación recibida
[x] Estado actual de TutorChat.jsx confirmado (líneas 192-199 y 269-277)

CAMBIOS EN TutorChat.jsx
[x] Agregar stream.getTracks().forEach en onstop (línea 193, primera línea del callback)
[x] Agregar audio.onended antes de audio.play() (línea 275)

PRUEBAS
[x] Prueba 1: npm run build exitoso (1.61s, sin errores)
[x] Prueba 2: análisis estático — clausuras válidas confirmadas
    [x] stream declarado (L176) antes de onstop (L192), getTracks en L193
    [x] audioUrl declarado (L271) antes de onended (L275), play en L277
[x] Prueba 3: simulación ciclo de vida — 0 tracks activos tras 20 grabaciones
[x] Prueba 4: simulación ciclo de vida — 0 blob URLs tras 20 mensajes TTS

BROWSER — VERIFICADAS
[x] Prueba 5: indicador de micrófono se apaga tras cada grabación — 2026-06-01
[x] Prueba 6: audio del tutor se reproduce completo sin cortes — 2026-06-01
[x] Prueba 7: flujo completo de voz en misión real sin regresiones — 2026-06-01
```

---

## Estado

```
[x] Aprobado
[x] Implementado — 2026-06-01
[x] Pruebas completadas — 2026-06-01
[x] COMPLETADO
```
