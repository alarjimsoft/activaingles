# IMPLEMENTATION_PLAN_BUG-02
# speech_router registrado dos veces en backend/app/main.py

**Bug ID:** BUG-02  
**Fecha de análisis:** 2026-06-03  
**Referencia:** CLAUDE.md — Sección 8 Bugs Conocidos / TD-A06  
**Estado:** ✅ YA RESUELTO — No requiere implementación  
**Autor del análisis:** Claude Code (claude-sonnet-4-6)

---

## 1. Resumen ejecutivo

El análisis del código fuente actual revela que **BUG-02 fue corregido en el commit `146da72`**, con el mensaje:

> *"MV03 eliminacion speech router duplicado y MVP04 cierre del microfono y liberacion de url"*

El archivo `backend/app/main.py` actualmente registra exactamente tres routers, uno por dominio, sin duplicados. No se requiere ninguna acción.

---

## 2. Estado actual verificado

### `backend/app/main.py` — estado real (26 líneas)

```python
import os
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "credentials/google-speech.json"
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.speech import router as speech_router
from app.routes.tts    import router as tts_router
from app.routes.chat   import router as chat_router

app = FastAPI()

app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(speech_router)   # ← una sola vez ✅
app.include_router(tts_router)
app.include_router(chat_router)
```

### Historial de git

```
146da72  MV03 eliminacion speech router duplicado y
         MVP04 cierre del microfono y liberacion de url
```

El commit también corrigió TD-A09 (stream de micrófono no cerrado) y TD-A10 (URL.createObjectURL sin revokeObjectURL), ambos documentados como deuda técnica en CLAUDE.md.

---

## 3. Análisis de impacto

### Archivos React afectados
**Ninguno.** No se requieren cambios en el frontend.

### Servicios Python afectados
**Ninguno.** El bug ya está corregido.

### Packages Oracle / Procedimientos / Endpoints ORDS / Tablas Oracle afectadas
**Ninguno.** BUG-02 era exclusivamente de configuración del servidor FastAPI.

### Reglas de negocio afectadas
Ninguna regla de negocio de `PROJECT_VISION.md` o `BUSINESS_RULES.md` estaba directamente vinculada a este bug.

---

## 4. Flujo de grammar score (referencia)

Sin cambios respecto al análisis de BUG-01. El grammar score es calculado en `chat.py` basado en la presencia o ausencia de correcciones GPT:
- `90` si no hay corrección (sin errores del estudiante)
- `55` si hay corrección (error detectado)

Este flujo no estaba relacionado con BUG-02.

---

## 5. Qué cambios deben realizarse

**Ninguno.** El bug ya fue corregido.

---

## 6. Acción recomendada

Actualizar la documentación del proyecto para reflejar el estado real:

1. **CLAUDE.md — Sección 8 (Bugs Conocidos Activos):** Eliminar BUG-02 de la lista de bugs activos.
2. **CLAUDE.md — Sección 7 (Deuda Técnica — Alta):** Marcar TD-A06 como resuelto.

La documentación en CLAUDE.md estaba desactualizada respecto al estado real del código. Esto es un patrón a tener en cuenta: antes de implementar cualquier item del backlog, verificar el estado actual del código, ya que puede haber sido corregido en commits intermedios.

---

## 7. Conclusión

| Item | Estado |
|---|---|
| `speech_router` duplicado en `main.py` | ✅ Corregido en commit `146da72` |
| TD-A09 — Stream de micrófono no cerrado | ✅ Corregido en el mismo commit |
| TD-A10 — `revokeObjectURL` faltante | ✅ Corregido en el mismo commit |

**Acción para esta sesión:** Ninguna implementación requerida. Proceder al siguiente item: **BUG-04**.

---

*Análisis completado — sin implementación necesaria.*
