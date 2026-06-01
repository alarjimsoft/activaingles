--------------------------------------------------------
--  DDL for Package Body PKG_AUTH
--------------------------------------------------------

  CREATE OR REPLACE EDITIONABLE PACKAGE BODY "LUALARCON"."PKG_AUTH" AS

PROCEDURE LOGIN_ESTUDIANTE(
    p_matricula IN VARCHAR2,
    p_password  IN VARCHAR2)
IS

    --V_MATRICULA VARCHAR2(40);

    --V_PASSWORD VARCHAR2(512);

    V_COUNT NUMBER;

BEGIN

    --V_MATRICULA :=
      --  APEX_APPLICATION.G_X01;

    --V_PASSWORD :=
       -- APEX_APPLICATION.G_X02;

    -- Validar estudiante + inscripción activa

    SELECT COUNT(*)
    INTO V_COUNT
    FROM ESTUDIANTES E
    JOIN INSCRIPCIONES I
        ON I.MATRICULA = E.MATRICULA
    JOIN PERIODOS P
        ON P.ID_PERIODO = I.ID_PERIODO
    WHERE E.MATRICULA = p_matricula
    AND E.PASSWORD = p_password
    AND E.ESTADO = 'ACTIVO'
    AND I.ESTADO = 'ACTIVA'
    AND SYSDATE BETWEEN
        P.FECHA_INICIO
        AND P.FECHA_FIN;

    IF V_COUNT = 0 THEN

        APEX_JSON.OPEN_OBJECT;

        APEX_JSON.WRITE(
            'success',
            FALSE
        );

        APEX_JSON.WRITE(
            'message',
            'Invalid credentials or inactive enrollment.'
        );

        APEX_JSON.CLOSE_OBJECT;

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

        WHERE E.MATRICULA =
            --V_MATRICULA
              p_matricula

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
