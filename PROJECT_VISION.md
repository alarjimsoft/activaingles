# PROJECT_VISION.md

# Activa Inglés

## 1. Objetivo General

Activa Inglés es una plataforma educativa impulsada por inteligencia artificial cuyo objetivo es ayudar a estudiantes universitarios a desarrollar habilidades reales de comunicación en inglés mediante misiones, tutoría conversacional, evaluación de pronunciación, gamificación y seguimiento continuo del progreso.

La plataforma busca convertirse en un ecosistema de aprendizaje personalizado que combine IA, voz, analítica educativa y acompañamiento humano.

---

# 2. Visión del Producto

Convertirse en la plataforma líder de aprendizaje de inglés para instituciones educativas de Latinoamérica, combinando:

- Aprendizaje basado en misiones.
- Tutor conversacional impulsado por IA.
- Evaluación automática de pronunciación.
- Gamificación mediante XP y niveles.
- Analítica educativa.
- Integración con WhatsApp.
- Tutor humano cuando sea necesario.

La experiencia debe sentirse más cercana a un videojuego educativo que a un curso tradicional.

---

# 3. Arquitectura Actual

## Frontend

- React
- Vite
- Zustand
- Tailwind CSS
- Framer Motion

## Backend

- FastAPI
- Python

## Base de Datos

- Oracle Autonomous Database
- ORDS REST APIs

## IA

- OpenAI GPT

## Voz

- Google Speech-to-Text
- Azure Pronunciation Assessment
- Google Text-to-Speech

---

# 4. Arquitectura Objetivo

Frontend React
↓
API Gateway
↓
FastAPI
↓
Servicios IA
↓
Oracle ADB

Servicios especializados:

- Tutor IA
- Pronunciation Engine
- Adaptive Learning Engine
- Recommendation Engine
- WhatsApp Service
- Human Tutor Module

---

# 5. Frontend React

Responsabilidades:

- Dashboard
- Misiones
- Tutor Conversacional
- Pronunciation Assessment
- Exportación PDF
- Gestión de progreso
- Gamificación
- Visualización de métricas

Componentes principales:

- Dashboard
- TutorChat
- MissionCard
- ProgressCard
- StatCard
- CorrectionCard

---

# 6. Backend Python

Responsabilidades:

- Comunicación con GPT
- Speech-to-Text
- Pronunciation Assessment
- XP Engine
- Progress Tracking
- Integración con Oracle
- Integración WhatsApp

Módulos principales:

- chat.py
- speech.py
- openai_service.py
- progress_service.py
- azure_pronunciation.py

---

# 7. Oracle Database

Oracle ADB es la fuente oficial de verdad.

Tablas principales:

## ESTUDIANTES

Información del estudiante.

## INSCRIPCIONES

Relación estudiante-curso.

## TOPICS

Temas académicos.

## MISSIONS

Misiones pedagógicas.

## USER_PROGRESS

Núcleo pedagógico.

Contiene:

- progreso
- XP
- tiempo
- grammar score
- pronunciation score
- estado
- fecha de completado

## CONVERSATIONS

Conversaciones.

## CONVERSATION_MESSAGES

Mensajes históricos.

---

# 8. Sistema de Misiones

Las misiones representan actividades pedagógicas estructuradas.

Cada misión:

- pertenece a un tema
- tiene objetivos específicos
- genera XP
- puede desbloquear otras misiones

Estados:

- LOCKED
- ACTIVE
- COMPLETED

Las misiones constituyen la columna vertebral del aprendizaje.

---

# 9. Sistema de XP

Objetivo:

Gamificar el aprendizaje.

Fuentes de XP:

- participación
- gramática
- pronunciación
- finalización de misión

Niveles:

Level = función del XP acumulado.

El XP debe reflejar desempeño real y no únicamente actividad.

---

# 10. Tutor IA

Motor conversacional basado en GPT.

Responsabilidades:

- conversar en inglés
- corregir errores
- generar retroalimentación
- adaptar dificultad
- mantener contexto de misión

El tutor es el principal punto de interacción del estudiante.

---

# 11. Evaluación de Pronunciación

Motor actual:

Azure Pronunciation Assessment.

Métricas:

- Pronunciation Score
- Accuracy Score
- Fluency Score
- Completeness Score

Resultados almacenados en USER_PROGRESS.

La evaluación debe ser persistente y acumulativa.

---

# 12. Integración WhatsApp

Objetivo:

Permitir que el estudiante interactúe con Activa Inglés desde WhatsApp.

Capacidades previstas:

- conversación con tutor IA
- envío de ejercicios
- práctica diaria
- recordatorios
- consultas rápidas

Arquitectura prevista:

WhatsApp
↓
Webhook
↓
FastAPI
↓
GPT
↓
Oracle

---

# 13. Tutor Humano

Objetivo:

Escalar soporte pedagógico.

Funciones:

- supervisión de estudiantes
- revisión manual
- intervención cuando IA detecte problemas
- seguimiento académico

La IA debe ser el primer nivel de atención.
El tutor humano es el segundo nivel.

---

# 14. Roadmap de los Próximos 12 Meses

## Fase 1 – Consolidación del Core

- Mission Completion Real
- Dynamic Leveling
- Mission Unlocking
- Dashboard Pedagógico
- Analytics de Pronunciación

## Fase 2 – Experiencia Premium

- Azure Speech completo
- Avatar Conversacional
- Ejercicios Dinámicos IA
- Speaking Challenges

## Fase 3 – Inteligencia Educativa

- Adaptive Learning Engine
- Recommendation Engine
- Predicción de Riesgo Académico
- Teacher Dashboard

## Fase 4 – Escalabilidad

- OCI Deployment
- Multiinstitución
- Facturación
- Administración centralizada

---

# 15. Reglas que Nunca Deben Romperse

1. Oracle ADB es la fuente oficial de verdad.
2. USER_PROGRESS es el núcleo pedagógico.
3. Toda interacción relevante debe persistirse.
4. El progreso debe ser medible.
5. El XP debe basarse en desempeño real.
6. El aprendizaje debe ser orientado a objetivos.
7. La experiencia debe mantenerse simple para el estudiante.
8. La IA nunca sustituye completamente al tutor humano.

---

# 16. Decisiones Arquitectónicas Importantes

## React + FastAPI + Oracle

Elegido por:

- escalabilidad
- productividad
- integración con OCI

## Oracle como sistema transaccional

Toda la información académica reside en Oracle.

## ORDS como capa REST

Permite desacoplar frontend y base de datos.

## GPT como motor pedagógico

La IA es un servicio, no la fuente de verdad.

## USER_PROGRESS como núcleo educativo

Todas las métricas pedagógicas convergen en esta entidad.

## Arquitectura orientada a servicios

Cada capacidad principal debe evolucionar como servicio independiente:

- Tutor IA
- Pronunciation
- Analytics
- WhatsApp
- Adaptive Learning
- Human Tutor
