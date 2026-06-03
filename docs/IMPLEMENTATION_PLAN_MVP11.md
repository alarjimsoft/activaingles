# IMPLEMENTATION_PLAN_MVP11.md
# MVP-11 — Revocación de API keys expuestas en PKG_SERVICIOS_IA.sql

> **Estado:** COMPLETADO — 2026-06-03. PKG_SERVICIOS_IA.sql eliminado del repositorio (commit eba6718).
> **Fecha de análisis:** 2026-06-03
> **Complejidad real (revisada):** Baja — el backlog sobreestimó el riesgo en git
> **Estimación revisada:** 1-2 horas (sin contar tiempo operacional de rotación de claves)
> **Dependencias bloqueantes:** Ninguna.

---

## 1. HALLAZGO CRÍTICO — El backlog describe una situación incorrecta

Antes de diseñar cualquier cambio, el análisis técnico revela que **el riesgo descrito en el backlog es parcialmente incorrecto**:

### Lo que el backlog dice

> "`backend-oracle/PACKAGE_BODIES/PKG_SERVICIOS_IA.sql` contiene en texto plano las mismas API keys de producción [...] Este archivo está en el repositorio git."

### Lo que realmente existe

| Superficie | Estado | Evidencia |
|---|---|---|
| `PKG_SERVICIOS_IA.sql` en git (commit `258beb0`) | **PLACEHOLDERS** — nunca tuvo claves reales | `git show 258beb0:backend-oracle/PACKAGE_BODIES/PKG_SERVICIOS_IA.sql` → `'<AZURE_SPEECH_KEY>'`, `'GOOGLE_KEY'`, `'<OPENAI_API_KEY>'` |
| `backend/.env` en git | **NUNCA COMMITEADO** | `git ls-files backend/.env` → vacío |
| `backend/credentials/google-speech.json` en git | **NUNCA COMMITEADO** | `git ls-files backend/credentials/` → vacío |
| Repositorio GitHub (`alarjimsoft/activaingles`) | **HISTORIAL LIMPIO** | Ningún commit contiene claves reales |

### Lo que SÍ es un riesgo real

| Superficie | Estado real | Riesgo |
|---|---|---|
| **Oracle ADB — paquete vivo `PKG_SERVICIOS_IA`** | Posiblemente tiene claves reales hardcodeadas como constantes PL/SQL | Medio — cualquier usuario Oracle ADB con acceso al schema puede leer las constantes |
| **`.gitignore` incompleto** | Solo cubre `.env` genérico; no cubre `backend/credentials/` explícitamente | Bajo — un `git add -A` accidental podría incluir credenciales |
| **`PKG_SERVICIOS_IA` es dead code** | El paquete APEX no es llamado por ninguna parte del sistema actual | Riesgo residual sin uso real |

**Conclusión del hallazgo:** No hay exposición en GitHub. El riesgo principal es en Oracle ADB (paquete vivo con posibles claves reales en un sistema heredado no usado) y la resiliencia del `.gitignore`.

---

## 2. Contexto Arquitectónico — Dos sistemas con claves distintas

El sistema tiene una arquitectura dual de credenciales de IA que es importante entender:

### Sistema A — FastAPI (arquitectura activa)

```
Frontend React
    ↓
FastAPI (localhost:8000)
    ├── openai_service.py    → OPENAI_API_KEY  (lee desde backend/.env)
    ├── azure_pronunciation.py → AZURE_SPEECH_KEY + AZURE_SPEECH_REGION  (lee desde backend/.env)
    ├── google_speech.py     → Credencial JSON  (lee desde backend/credentials/google-speech.json)
    └── google_tts.py        → Credencial JSON  (lee desde backend/credentials/google-speech.json)
```

**Cómo carga las claves:**
- `python-dotenv` carga `backend/.env` al iniciar uvicorn
- `os.environ["GOOGLE_APPLICATION_CREDENTIALS"]` apunta a `credentials/google-speech.json` en `main.py`
- Google STT y TTS usan la librería cliente que lee automáticamente `GOOGLE_APPLICATION_CREDENTIALS`
- Azure usa `os.getenv("AZURE_SPEECH_KEY")` y `os.getenv("AZURE_SPEECH_REGION")`
- OpenAI usa `os.getenv("OPENAI_API_KEY")`

**Estado de seguridad:** `backend/.env` y `backend/credentials/` nunca han sido commiteados. ✅

### Sistema B — Oracle APEX / PKG_SERVICIOS_IA (arquitectura heredada, INACTIVA)

```
Oracle APEX (arquitectura anterior, no usada actualmente)
    └── PKG_SERVICIOS_IA
         ├── c_azure_key   CONSTANT → hardcodeada en el Package Body de Oracle ADB
         ├── c_google_key  CONSTANT → hardcodeada en el Package Body de Oracle ADB
         └── c_openai_key  CONSTANT → hardcodeada en el Package Body de Oracle ADB
```

**Estado de seguridad:** Claves posiblemente hardcodeadas en Oracle ADB live. El paquete NO es llamado por ningún endpoint ORDS ni por FastAPI. ⚠️

---

## 3. Análisis de Impacto Arquitectónico

### 3.1 Cómo funciona actualmente el flujo de credenciales de IA

> **Nota:** El análisis de MVP anteriores preguntaba sobre "grammar score". Para MVP-11, la pregunta relevante es el flujo de credenciales. Se documenta a continuación.

**Flujo de credencial OpenAI (activo):**
```
uvicorn inicia → python-dotenv carga backend/.env
    → os.getenv("OPENAI_API_KEY") → client = OpenAI(api_key=...)
    → openai_service.get_tutor_response() → client.chat.completions.create(model="gpt-4.1-mini")
    → FastAPI responde al frontend
```

**Flujo de credencial Azure (activo):**
```
uvicorn inicia → python-dotenv carga backend/.env
    → os.getenv("AZURE_SPEECH_KEY") + os.getenv("AZURE_SPEECH_REGION")
    → speechsdk.SpeechConfig(subscription=speech_key, region=service_region)
    → azure_pronunciation.evaluate_pronunciation()
    → FastAPI responde al frontend
```

**Flujo de credencial Google (activo):**
```
main.py línea 3 → os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "credentials/google-speech.json"
    → google.cloud.speech.SpeechClient() (usa automáticamente el JSON)
    → google.cloud.texttospeech.TextToSpeechClient() (igual)
    → google_speech.transcribe_audio() / google_tts.generate_speech()
```

**Flujo de PKG_SERVICIOS_IA (inactivo — APEX legacy):**
```
[No hay llamada activa desde ningún endpoint ORDS ni desde FastAPI]
    Las funciones get_azure_token(), get_google_key(), get_openai_key() existen
    pero no son invocadas en el flujo actual del sistema.
    El PROCEDURE get_token_ajax() fue el entry point de la arquitectura APEX,
    que ya no está en uso.
```

### 3.2 Archivos React afectados

**Ninguno.** Las credenciales de IA son internas al backend Python y Oracle. El frontend no conoce ni maneja ninguna clave de API.

### 3.3 Servicios Python afectados

| Archivo | Tipo de afectación | Descripción |
|---|---|---|
| `backend/.env` | Actualización (si hay rotación de claves) | Nuevos valores de `OPENAI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| `backend/credentials/google-speech.json` | Reemplazo (si hay rotación de claves Google) | Nuevo JSON de cuenta de servicio descargado de Google Cloud Console |
| `backend/app/main.py` | Sin cambio | La ruta `credentials/google-speech.json` no cambia |

**No se modifica código Python.** Solo los valores de configuración.

### 3.4 Packages Oracle afectados

| Package | Cambio requerido | Prioridad |
|---|---|---|
| `PKG_SERVICIOS_IA` (Package Body vivo en Oracle ADB) | Reemplazar constantes con valores vacíos o comentarlos — el paquete es dead code | Alta |
| `PKG_AUTH`, `PKG_MISSIONS` | Sin cambio | — |

### 3.5 Procedimientos afectados

| Procedimiento/Función | Cambio | Razón |
|---|---|---|
| `PKG_SERVICIOS_IA.get_azure_token` | Sin cambio funcional — los headers usarán `c_azure_key` vacío | Dead code |
| `PKG_SERVICIOS_IA.get_google_key` | Sin cambio funcional | Dead code |
| `PKG_SERVICIOS_IA.get_openai_key` | Sin cambio funcional | Dead code |
| `PKG_SERVICIOS_IA.texto_a_voz` | Sin cambio funcional | Dead code |
| `PKG_SERVICIOS_IA.voz_a_texto` | Sin cambio funcional | Dead code |
| `PKG_SERVICIOS_IA.llamar_openai_chat` | Sin cambio funcional | Dead code |

### 3.6 Endpoints ORDS afectados

**Ninguno.** Ningún endpoint ORDS llama a `PKG_SERVICIOS_IA`. El handler `get_token_ajax` era un procedure APEX que no está expuesto como endpoint ORDS en el sistema actual.

### 3.7 Tablas Oracle afectadas

**Ninguna.** Esta iniciativa no toca datos pedagógicos ni estructura de tablas.

### 3.8 Reglas de negocio afectadas

| Regla | Afectación |
|---|---|
| BR-SYS-01 (Oracle es fuente de verdad) | Indirecta — Oracle ADB es donde vive el riesgo residual |
| BR-AUTH-03 (inscripción como contexto) | Sin afectación |
| Todas las demás | Sin afectación |

---

## 4. Qué Cambios Deben Realizarse

La implementación tiene **dos componentes independientes**. El Componente A (`.gitignore`) es puramente preventivo. El Componente B (Oracle) elimina el riesgo residual.

### Componente A — Hardening del `.gitignore` (prevención)

El `.gitignore` actual tiene solo:
```
.env
```

Problema: la regla `.env` cubre archivos literalmente llamados `.env`, pero no cubre variantes comunes como `.env.local`, `.env.production`, ni tampoco protege explícitamente el directorio `backend/credentials/`.

**Cambio propuesto:**

Agregar al final de `.gitignore`:
```gitignore
# Secrets — never commit
backend/.env
backend/credentials/
*.env.local
*.env.production
*.env.staging
```

> **Nota:** La regla `.env` existente ya cubre `backend/.env` genéricamente. Las reglas adicionales son defensivas en profundidad.

### Componente B — Sanitizar PKG_SERVICIOS_IA en Oracle ADB

El objetivo es que las constantes del Package Body en Oracle no contengan claves reales, independientemente de si el paquete es dead code o no.

**SQL a ejecutar en Oracle ADB:**

```sql
CREATE OR REPLACE EDITIONABLE PACKAGE BODY "LUALARCON"."PKG_SERVICIOS_IA" AS

    -- Constantes de claves de IA
    -- NOTA: PKG_SERVICIOS_IA es arquitectura APEX legacy.
    -- El sistema actual usa FastAPI con claves en backend/.env
    -- Estas constantes se mantienen vacías intencionalmente.
    c_azure_key   CONSTANT VARCHAR2(100) := '';
    c_azure_reg   CONSTANT VARCHAR2(50)  := 'eastus';
    c_google_key  CONSTANT VARCHAR2(100) := '';
    c_openai_key  CONSTANT VARCHAR2(200) := '';

    -- ... resto de las funciones sin cambio ...
```

Esto elimina el riesgo residual de claves legibles en Oracle sin afectar el sistema activo (que no usa este paquete).

**Actualizar también el archivo local de documentación** (`backend-oracle/PACKAGE_BODIES/PKG_SERVICIOS_IA.sql`) para agregar el comentario explicativo y confirmar que el archivo ya tenía placeholders.

### Componente C — Rotación de claves (decisión operacional)

Este componente depende de una evaluación de riesgo:

| Pregunta | Si la respuesta es SÍ | Si la respuesta es NO |
|---|---|---|
| ¿El paquete vivo en Oracle ADB tenía claves reales idénticas a `backend/.env`? | Rotar todas las claves | No es necesario rotar |
| ¿Alguien con acceso Oracle ADB ha visto el Package Body de `PKG_SERVICIOS_IA`? | Rotar todas las claves | No es necesario rotar |
| ¿Se compartió `backend/.env` por algún medio (email, chat, etc.)? | Rotar todas las claves | No es necesario rotar |

**Dado que el historial de git es limpio** y no hay evidencia de que las claves del Package Body hayan sido usadas maliciosamente, la rotación es **precautoria** pero no urgente.

**Si se decide rotar, el orden correcto es:**

```
Paso 1: Generar nuevas claves
  ├── OpenAI: platform.openai.com → API Keys → Create new secret key
  ├── Azure: portal.azure.com → Cognitive Services → Keys and Endpoint → Regenerate Key 1
  └── Google STT/TTS: console.cloud.google.com → IAM → Service Accounts → nueva clave JSON

Paso 2: Actualizar backend/.env con nuevas claves
  (backend/.env no está en git — el cambio es solo en disco)

Paso 3: Reiniciar uvicorn para que python-dotenv cargue los nuevos valores
  cd backend && uvicorn app.main:app --reload

Paso 4: Verificar que los 4 servicios AI funcionan con las nuevas claves
  - Enviar mensaje de texto en una misión (OpenAI)
  - Grabar audio (Google STT + Azure)
  - Escuchar respuesta del tutor (Google TTS)

Paso 5: Actualizar PKG_SERVICIOS_IA en Oracle ADB con constantes vacías (Componente B)

Paso 6: Revocar claves antiguas
  - OpenAI: eliminar la clave anterior en platform.openai.com
  - Azure: regenerar Key 2 también si se usa
  - Google: eliminar la clave JSON anterior en la cuenta de servicio

⚠️ CRÍTICO: No revocar claves antiguas antes de confirmar que las nuevas funcionan.
```

---

## 5. Riesgos de Implementación

| ID | Riesgo | Probabilidad | Severidad | Mitigación |
|---|---|---|---|---|
| R-01 | Revocar clave OpenAI antes de que la nueva cargue en uvicorn → todos los chats fallan | Media | Alta | Siempre reiniciar uvicorn y probar ANTES de revocar la clave anterior |
| R-02 | Nuevo JSON de Google tiene un Service Account diferente sin permisos STT/TTS | Baja | Alta | Verificar en Google Cloud Console que el nuevo SA tiene roles `Cloud Speech-to-Text User` y `Cloud Text-to-Speech User` |
| R-03 | Azure tiene Key 1 y Key 2 — regenerar Key 1 rompe el sistema si Key 2 ya se usa en otro lado | Baja | Media | Confirmar cuál key está en `backend/.env` (`AZURE_SPEECH_KEY`) y regenerar solo esa |
| R-04 | Vaciar las constantes en Oracle rompe algo que depende de `PKG_SERVICIOS_IA` | Muy baja | Media | El paquete es dead code. No hay ningún ORDS handler ni FastAPI route que lo invoque. Verificar con `grep` en el código antes. |
| R-05 | La regla `.env` en `.gitignore` ya cubría `backend/.env` — el cambio es redundante | Ninguna | Ninguna | Redundancia defensiva es buena práctica. No hay riesgo. |

---

## 6. Estrategia de Despliegue

El orden es importante solo si hay rotación de claves (Componente C). Sin rotación, los componentes A y B son independientes y seguros.

```
Sin rotación de claves:
    Componente A → modificar .gitignore → commit
    Componente B → ejecutar SQL en Oracle ADB → actualizar PKG_SERVICIOS_IA.sql local → commit

Con rotación de claves:
    1. Componente A → .gitignore primero (protección antes de cualquier cambio)
    2. Generar nuevas claves en cada proveedor (NO revocar todavía)
    3. Actualizar backend/.env con nuevas claves
    4. Reiniciar uvicorn
    5. Probar los 4 flujos de IA (chat, STT, pronunciación, TTS)
    6. Componente B → sanitizar Oracle ADB
    7. Solo después de confirmar que TODO funciona → revocar claves anteriores
    8. Commit de Componente A + actualización local PKG_SERVICIOS_IA.sql
```

---

## 7. Estrategia de Pruebas

### 7.1 Pruebas si NO hay rotación de claves

| # | Prueba | Cómo verificar |
|---|---|---|
| TC-01 | El sistema sigue funcionando sin cambios | Iniciar sesión, enviar mensaje de texto en una misión → tutor responde |
| TC-02 | `.gitignore` protege correctamente | `git status` después de crear un archivo `.env.local` de prueba → debe aparecer como "untracked" sin quedar listado para commit |
| TC-03 | Oracle ADB compila PKG_SERVICIOS_IA con constantes vacías | `SELECT status FROM user_objects WHERE object_name='PKG_SERVICIOS_IA'` → `VALID` |

### 7.2 Pruebas adicionales si SÍ hay rotación de claves

| # | Caso | Servicio validado |
|---|---|---|
| TC-04 | Enviar mensaje de texto en misión → tutor responde con corrección | OpenAI GPT |
| TC-05 | Presionar micrófono 4 segundos → texto transcrito aparece | Google STT |
| TC-06 | Respuesta del tutor se reproduce en audio | Google TTS |
| TC-07 | Grabar audio de voz → barras de pronunciación aparecen con scores | Azure Pronunciation |
| TC-08 | `GET /progress/stats/:id` → XP se actualiza después de mensaje | Oracle ORDS (add-xp desde FastAPI) |

TC-04 a TC-08 cubren los cuatro servicios de IA que usan claves.

---

## 8. Resumen de Archivos por Tocar

| Archivo | Tipo | Cambio | Condición |
|---|---|---|---|
| `.gitignore` | Config | Agregar reglas defensivas explícitas | Siempre |
| `backend-oracle/PACKAGE_BODIES/PKG_SERVICIOS_IA.sql` | SQL documentación local | Agregar comentario de dead code | Siempre |
| `backend/.env` | Config (no en git) | Nuevas claves de API | Solo si hay rotación |
| `backend/credentials/google-speech.json` | JSON (no en git) | Nuevo archivo de cuenta de servicio Google | Solo si hay rotación |
| `docs/PRODUCT_BACKLOG.md` | Docs | Marcar MVP-11 como completado | Al finalizar |

**Archivos NO afectados:**
- Todo el código Python (`main.py`, servicios, rutas)
- Todo el código React (frontend)
- Tablas Oracle, otros packages Oracle
- Endpoints ORDS

---

## 9. Acción Previa Recomendada (antes de implementar)

Antes de ejecutar cualquier cambio, responder estas preguntas operacionales:

**Pregunta 1:** ¿El Package Body vivo en Oracle ADB de `PKG_SERVICIOS_IA` tiene las mismas claves que `backend/.env`?
- Si SÍ → incluir rotación en la implementación
- Si NO / No se sabe → proceder solo con Componentes A y B (sin rotación)

**Pregunta 2:** ¿El repositorio GitHub `alarjimsoft/activaingles` es público o privado?
- Si es público → la prioridad de rotación sube (aunque el historial git es limpio, la visibilidad importa)
- Si es privado → menor urgencia de rotación

**Pregunta 3:** ¿Se ha compartido `backend/.env` por algún canal (WhatsApp, email, etc.)?
- Si SÍ → rotar claves
- Si NO → no es necesario rotar

---

## 10. Corrección al PRODUCT_BACKLOG.md

El backlog afirma que `PKG_SERVICIOS_IA.sql` contiene claves reales en el repositorio git. Esto es **incorrecto** según el análisis:

> El archivo en git (commit `258beb0`) siempre tuvo placeholders: `'<AZURE_SPEECH_KEY>'`, `'GOOGLE_KEY'`, `'<OPENAI_API_KEY>'`. El historial de GitHub está limpio.

Al completar MVP-11, se actualizará el backlog para reflejar la situación real: el riesgo era en Oracle ADB (package body vivo), no en git.

---

*Documento generado para aprobación — no se ha modificado ningún código.*
