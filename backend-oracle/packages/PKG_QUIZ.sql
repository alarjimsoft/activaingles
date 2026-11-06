--------------------------------------------------------
--  DDL for Package PKG_QUIZ
--  Lógica de los quizzes. Lo usa el módulo ORDS "quiz", que solo puede llamar FastAPI
--  (protegido con OAuth). Todas las respuestas salen como JSON con APEX_JSON.
--------------------------------------------------------

CREATE OR REPLACE EDITIONABLE PACKAGE PKG_QUIZ AS

    -- Académicos
    PROCEDURE ADMIN_LIST;
    PROCEDURE GET_QUIZ(p_quiz_id IN NUMBER);
    PROCEDURE GET_VERSION(p_version_id IN NUMBER);
    PROCEDURE CREATE_VERSION(p_body IN CLOB);
    PROCEDURE SAVE_MEDIA(p_body IN CLOB);
    PROCEDURE PUBLISH_VERSION(p_version_id IN NUMBER);
    PROCEDURE GET_STATS(p_quiz_id IN NUMBER, p_version_id IN NUMBER DEFAULT NULL);

    -- Estudiantes
    PROCEDURE GET_AVAILABLE(p_id_inscripcion IN NUMBER);
    PROCEDURE START_ATTEMPT(p_quiz_id IN NUMBER, p_id_inscripcion IN NUMBER);
    PROCEDURE GET_ATTEMPT(p_attempt_id IN NUMBER);
    PROCEDURE FINISH_ATTEMPT(p_body IN CLOB);

    -- 'Y' cuando el estudiante completó todas las misiones hasta el tema del quiz
    FUNCTION IS_UNLOCKED(p_quiz_id IN NUMBER, p_id_inscripcion IN NUMBER) RETURN VARCHAR2;

    -- Manejo de errores en los handlers ORDS
    FUNCTION ERROR_STATUS(p_sqlcode IN NUMBER) RETURN NUMBER;
    PROCEDURE WRITE_ERROR(p_sqlcode IN NUMBER, p_sqlerrm IN VARCHAR2);

END PKG_QUIZ;
/
