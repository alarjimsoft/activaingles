--------------------------------------------------------
--  DDL for Package Body PKG_AUTH
--------------------------------------------------------

  CREATE OR REPLACE EDITIONABLE PACKAGE BODY "LUALARCON"."PKG_AUTH" AS

PROCEDURE LOGIN_ESTUDIANTE(
    p_matricula IN VARCHAR2,
    p_password  IN VARCHAR2)
IS

    V_COUNT       NUMBER;
    V_PERIOD_EXP  NUMBER;

BEGIN

    -- Paso 1: Validar que el estudiante existe con credenciales correctas
    SELECT COUNT(*)
    INTO V_COUNT
    FROM ESTUDIANTES E
    WHERE E.MATRICULA = p_matricula
    AND E.PASSWORD    = p_password
    AND E.ESTADO      = 'ACTIVO';

    IF V_COUNT = 0 THEN

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success',   FALSE);
        APEX_JSON.WRITE('message',   'Credenciales incorrectas. Verifica tu matrícula y contraseña.');
        APEX_JSON.WRITE('errorCode', 'INVALID_CREDENTIALS');
        APEX_JSON.CLOSE_OBJECT;

        RETURN;

    END IF;

    -- Paso 2: Validar inscripción activa en período vigente
    SELECT COUNT(*)
    INTO V_COUNT
    FROM INSCRIPCIONES I
    JOIN PERIODOS P
        ON P.ID_PERIODO = I.ID_PERIODO
    WHERE I.MATRICULA = p_matricula
    AND I.ESTADO      = 'ACTIVA'
    AND SYSDATE BETWEEN P.FECHA_INICIO AND P.FECHA_FIN;

    IF V_COUNT = 0 THEN

        -- Paso 3: Determinar causa — ¿el período venció?
        SELECT COUNT(*)
        INTO V_PERIOD_EXP
        FROM INSCRIPCIONES I
        JOIN PERIODOS P
            ON P.ID_PERIODO = I.ID_PERIODO
        WHERE I.MATRICULA = p_matricula
        AND SYSDATE > P.FECHA_FIN;

        IF V_PERIOD_EXP > 0 THEN

            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success',   FALSE);
            APEX_JSON.WRITE('message',   'Tu período académico ha vencido. Contacta a tu coordinador para inscribirte al próximo período.');
            APEX_JSON.WRITE('errorCode', 'PERIOD_EXPIRED');
            APEX_JSON.CLOSE_OBJECT;

        ELSE

            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success',   FALSE);
            APEX_JSON.WRITE('message',   'Tu inscripción no está activa. Contacta a tu institución para más información.');
            APEX_JSON.WRITE('errorCode', 'INACTIVE_ENROLLMENT');
            APEX_JSON.CLOSE_OBJECT;

        END IF;

        RETURN;

    END IF;

    -- Respuesta login exitoso

    FOR R IN (

        SELECT

            E.MATRICULA,

            E.NOMBRE,

            E.APELLIDOPATERNO,

            E.APELLIDOMATERNO,

            E.NIVEL_INGLES,

            E.XP,

            E.STREAK_DAYS,

            I.ID_INSCRIPCION,

            I.ID_CURSO,

            I.ID_PERIODO

        FROM ESTUDIANTES E

        JOIN INSCRIPCIONES I
            ON I.MATRICULA = E.MATRICULA

        JOIN PERIODOS P
            ON P.ID_PERIODO = I.ID_PERIODO

        WHERE E.MATRICULA = p_matricula

        AND I.ESTADO = 'ACTIVA'

        AND SYSDATE BETWEEN
            P.FECHA_INICIO
            AND P.FECHA_FIN

    )
    LOOP

        APEX_JSON.OPEN_OBJECT;

        APEX_JSON.WRITE(
            'success',
            TRUE
        );

        APEX_JSON.OPEN_OBJECT(
            'student'
        );

        APEX_JSON.WRITE(
            'matricula',
            R.MATRICULA
        );

        APEX_JSON.WRITE(
            'nombre',
            R.NOMBRE
        );

        APEX_JSON.WRITE(
            'apellidoPaterno',
            R.APELLIDOPATERNO
        );

        APEX_JSON.WRITE(
            'apellidoMaterno',
            R.APELLIDOMATERNO
        );

        APEX_JSON.WRITE(
            'nivel',
            R.NIVEL_INGLES
        );

        APEX_JSON.WRITE(
            'xp',
            R.XP
        );

        APEX_JSON.WRITE(
            'streakDays',
            R.STREAK_DAYS
        );

        APEX_JSON.CLOSE_OBJECT;

        APEX_JSON.OPEN_OBJECT(
            'inscripcion'
        );

        APEX_JSON.WRITE(
            'idInscripcion',
            R.ID_INSCRIPCION
        );

        APEX_JSON.WRITE(
            'idCurso',
            R.ID_CURSO
        );

        APEX_JSON.WRITE(
            'idPeriodo',
            R.ID_PERIODO
        );

        APEX_JSON.CLOSE_OBJECT;

        APEX_JSON.CLOSE_OBJECT;

    END LOOP;

END LOGIN_ESTUDIANTE;

END PKG_AUTH;

/
