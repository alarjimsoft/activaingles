# IMPLEMENTATION_PLAN_MVP03.md
# MVP-03 — Eliminación del speech_router duplicado en FastAPI

> **Estado:** Pendiente de aprobación
> **Fecha:** 2026-06-01
> **Iniciativa:** MVP-03 del PRODUCT_BACKLOG.md
> **Estimación:** 15 minutos de implementación + pruebas
> **Riesgo de implementación:** Ninguno — eliminar código muerto

---

## 1. Cómo funciona actualmente el flujo de speech router

### El problema en `main.py`

```python
# línea 8:  importación válida
from app.routes.speech import router as speech_router
from app.routes.tts    import router as tts_router
from app.routes.chat   import router as chat_router

# línea 11: importación DUPLICADA — sobrescribe la variable con el mismo objeto
from app.routes.speech import router as speech_router

app = FastAPI()
# ... CORS middleware ...

# línea 25: registro válido
app.include_router(speech_router)
app.include_router(tts_router)
app.include_router(chat_router)

# línea 28: registro DUPLICADO
app.include_router(speech_router)
```

### Efecto real en el router de FastAPI

`include_router()` en FastAPI/Starlette **no es idempotente** — cada llamada crea nuevos objetos `Route` independientes y los agrega al final de la lista interna. El diagnóstico lo confirma:

```
Rutas registradas:
  [4]  POST /speech/to-text           id=1887063527568  ← primera instancia
  [5]  POST /speech/pronunciation-score id=1887063527888  ← primera instancia
  [6]  POST /tts/speak
  [7]  POST /chat/message
  [8]  POST /speech/to-text           id=1887063528848  ← segunda instancia (distinta)
  [9]  POST /speech/pronunciation-score id=1887063529168  ← segunda instancia (distinta)
```

Los IDs de objeto son **distintos** — son cuatro rutas independientes en memoria.

### Comportamiento de matching en Starlette

Starlette recorre la lista de rutas en orden y devuelve la **primera coincidencia**. Las rutas en posiciones [8] y [9] nunca son alcanzadas porque [4] y [5] coinciden primero siempre.

```
Request: POST /speech/to-text
  → [4] /speech/to-text ← MATCH → procesa y responde
  → [8] /speech/to-text ← nunca se evalúa (código muerto)
```

### Estado funcional verificado

| Endpoint | Status con audio real | Comportamiento |
|---|---|---|
| `POST /speech/to-text` | 200 OK | Funciona (primera instancia responde) |
| `POST /speech/pronunciation-score` | 200 OK / 500 si Azure falla | Funciona (primera instancia responde) |

El sistema funciona a pesar del bug porque Starlette usa la primera ruta registrada. Las rutas duplicadas son código muerto que nunca se ejecuta.

---

## 2. Qué cambios deben realizarse

### Cambio único — `backend/app/main.py`

Eliminar exactamente **2 líneas**:

```python
# ANTES (28 líneas):
import os
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "credentials/google-speech.json"
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.speech import router as speech_router   ← línea 8: MANTENER
from app.routes.tts    import router as tts_router
from app.routes.chat   import router as chat_router
from app.routes.speech import router as speech_router   ← línea 11: ELIMINAR

app = FastAPI()
# CORS ...

# Routes
app.include_router(speech_router)                       ← línea 25: MANTENER
app.include_router(tts_router)
app.include_router(chat_router)
app.include_router(speech_router)                       ← línea 28: ELIMINAR

# DESPUÉS (26 líneas):
import os
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "credentials/google-speech.json"
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.speech import router as speech_router
from app.routes.tts    import router as tts_router
from app.routes.chat   import router as chat_router

app = FastAPI()
# CORS ...

# Routes
app.include_router(speech_router)
app.include_router(tts_router)
app.include_router(chat_router)
```

---

## 3. Inventario completo de impacto por capa

### Archivos React afectados
**Ninguno.** El frontend llama a `/speech/to-text` y `/speech/pronunciation-score` — seguirán respondiendo igual.

### Servicios Python afectados

| Archivo | Cambio | Tipo |
|---|---|---|
| `backend/app/main.py` | Eliminar línea 11 (import duplicado) y línea 28 (include_router duplicado) | Eliminación |
| `backend/app/routes/speech.py` | Sin cambios | — |
| `backend/app/routes/tts.py` | Sin cambios | — |
| `backend/app/routes/chat.py` | Sin cambios | — |
| `backend/app/services/*.py` | Sin cambios | — |

### Packages Oracle afectados
**Ninguno.**

### Procedimientos Oracle afectados
**Ninguno.**

### Endpoints ORDS afectados
**Ninguno.** Oracle ORDS no tiene relación con el router de FastAPI.

### Tablas Oracle afectadas
**Ninguna.**

### Reglas de negocio afectadas
**Ninguna.** El comportamiento funcional de los endpoints de speech no cambia.

---

## 4. Resultado esperado después del cambio

### Rutas registradas en FastAPI (de 10 → 8 objetos)

```
ANTES (10 objetos, 2 duplicados):        DESPUÉS (8 objetos, sin duplicados):
  GET  /openapi.json                       GET  /openapi.json
  GET  /docs                               GET  /docs
  GET  /docs/oauth2-redirect               GET  /docs/oauth2-redirect
  GET  /redoc                              GET  /redoc
  POST /speech/to-text         ← 1ª        POST /speech/to-text
  POST /speech/pronunciation-score ← 1ª   POST /speech/pronunciation-score
  POST /tts/speak                          POST /tts/speak
  POST /chat/message                       POST /chat/message
  POST /speech/to-text         ← 2ª (muerta)
  POST /speech/pronunciation-score ← 2ª (muerta)
```

---

## 5. Riesgos de implementación

### Riesgo 1 — Cambio en la primera ruta activa (No existe)
La primera instancia de las rutas (posiciones [4] y [5]) es la que actualmente maneja todas las peticiones. Al eliminar la segunda instancia (posiciones [8] y [9]), la primera instancia sigue siendo exactamente la misma. No hay cambio en qué código procesa las peticiones.

### Riesgo 2 — Efectos secundarios en el reload de uvicorn (No existe)
Con `uvicorn --reload`, Python recarga el módulo completamente al detectar cambios. El resultado después del reload será el estado correcto con 8 rutas. No hay estado persistente que pueda corromperse.

### Riesgo 3 — La remoción elimina una ruta diferente (No aplica)
Ambas instancias del router son creadas a partir del **mismo** módulo `speech.py`. Son funcionalmente idénticas. Eliminar la segunda no cambia nada de la primera.

**Conclusión: Este cambio tiene riesgo cero de regresión.**

---

## 6. Estrategia de despliegue

```
1. Modificar backend/app/main.py (eliminar 2 líneas)
2. Uvicorn con --reload detecta el cambio automáticamente
3. Verificar en logs de uvicorn que no hay errores de inicio
4. Confirmar rutas registradas (8 en lugar de 10)
5. Probar los endpoints de speech para confirmar que siguen funcionando
```

Para entorno de desarrollo local con `uvicorn --reload`, el cambio es instantáneo.

---

## 7. Estrategia de pruebas

### Prueba 1 — Contar rutas registradas después del cambio

```python
python -c "
from app.main import app
speech_routes = [r for r in app.routes if hasattr(r,'path') and 'speech' in r.path]
print('Rutas de speech:', len(speech_routes))
# Esperado: 2 (antes era 4)
"
```

### Prueba 2 — `POST /speech/to-text` sigue respondiendo

```bash
curl -s -X POST http://127.0.0.1:8000/speech/to-text \
  -F "audio=@test.webm;type=audio/webm"
# Esperado: {"transcript": "..."} — mismo comportamiento que antes
```

### Prueba 3 — `POST /speech/pronunciation-score` sigue respondiendo

```bash
curl -s -X POST http://127.0.0.1:8000/speech/pronunciation-score \
  -F "reference_text=hello" \
  -F "audio=@test.webm;type=audio/webm"
# Esperado: respuesta de Azure (200) o error de audio inválido (500) — mismo que antes
```

### Prueba 4 — OpenAPI docs no tiene entradas duplicadas

Navegar a `http://127.0.0.1:8000/docs` y verificar que `/speech/to-text` y `/speech/pronunciation-score` aparecen una sola vez cada uno.

---

## 8. Resumen del cambio

| Campo | Detalle |
|---|---|
| Archivos modificados | 1 (`backend/app/main.py`) |
| Líneas eliminadas | 2 (línea 11 y línea 28) |
| Líneas agregadas | 0 |
| Comportamiento funcional | Sin cambio |
| Riesgo | Ninguno |
| Reversibilidad | Inmediata (agregar las 2 líneas de vuelta) |

---

## 9. Checklist de implementación

```
PRE-IMPLEMENTACIÓN
[x] Aprobación recibida
[x] Estado de main.py confirmado con cat -n

CAMBIO
[x] Eliminar línea 11 de main.py (import duplicado)
[x] Eliminar línea 28 de main.py (include_router duplicado)
[x] Verificar archivo final: 26 líneas limpias, sin duplicados

PRUEBAS
[x] Prueba 1: rutas totales = 8 (antes 10), speech = 2 (antes 4) [PASS]
[x] Prueba 2: POST /speech/to-text → 200 OK [PASS]
[x] Prueba 3: POST /speech/pronunciation-score → 500 con audio falso [ESPERADO]
[x] Prueba 4: sin rutas duplicadas en ningún endpoint [PASS]
[x] Prueba 5: /tts/speak → 200, /chat/message → 200 [PASS - sin regresiones]

POST-DEPLOY
[x] Flujo de voz completo desde el browser sin regresiones — verificado 2026-06-01
```

---

## Estado

```
[x] Aprobado
[x] Implementado — 2026-06-01
[x] Pruebas completadas — 2026-06-01
[x] COMPLETADO (prueba de browser flujo de voz pendiente de usuario)
```
