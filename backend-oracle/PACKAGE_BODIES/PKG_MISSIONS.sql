--------------------------------------------------------
--  DDL for Package Body PKG_MISSIONS
--------------------------------------------------------

  CREATE OR REPLACE EDITIONABLE PACKAGE BODY "LUALARCON"."PKG_MISSIONS" AS

PROCEDURE GET_MISSIONS_BY_COURSE(
    p_id_curso       IN VARCHAR2,
    p_id_inscripcion IN NUMBER
)
IS

    v_next_active_found BOOLEAN := FALSE;

BEGIN

    APEX_JSON.OPEN_ARRAY;

    FOR R IN (

        SELECT

            M.MISSION_ID,

            M.TITLE,

            M.DESCRIPTION,

            M.LEVEL_CODE,

            M.DURATION_MINUTES,

            NVL(UP.PROGRESS_PERCENT, 0) AS PROGRESS_PERCENT,

            CASE

                WHEN NVL(UP.PROGRESS_PERCENT, 0) >= 100
                THEN 'COMPLETED'

                ELSE 'PENDING'

            END AS PROGRESS_STATUS,

            M.GRAMMAR_TITLE,

            M.GRAMMAR_EXAMPLE,

            M.SORT_ORDER,

            M.TOPIC_ID,

            T.TITLE AS TOPIC_TITLE,

            T.SORT_ORDER AS TOPIC_SORT_ORDER

        FROM MISSIONS M

        LEFT JOIN USER_PROGRESS UP
            ON UP.MISSION_ID = M.MISSION_ID
           AND UP.ID_INSCRIPCION = p_id_inscripcion

        JOIN TOPICS T
            ON T.TOPIC_ID = M.TOPIC_ID

        WHERE M.ID_CURSO = p_id_curso

        ORDER BY
            T.SORT_ORDER,
            M.SORT_ORDER

    )
    LOOP

        DECLARE

            v_status VARCHAR2(20);

        BEGIN

            /*
              COMPLETED
            */
            IF R.PROGRESS_STATUS = 'COMPLETED' THEN

                v_status := 'COMPLETED';

            /*
              FIRST NON-COMPLETED MISSION = ACTIVE
            */
            ELSIF v_next_active_found = FALSE THEN

                v_status := 'ACTIVE';

                v_next_active_found := TRUE;

            /*
              REMAINING MISSIONS = LOCKED
            */
            ELSE

                v_status := 'LOCKED';

            END IF;

            APEX_JSON.OPEN_OBJECT;

            APEX_JSON.WRITE(
                'missionId',
                R.MISSION_ID
            );

            APEX_JSON.WRITE(
                'title',
                R.TITLE
            );

            APEX_JSON.WRITE(
                'description',
                R.DESCRIPTION
            );

            APEX_JSON.WRITE(
                'levelCode',
                R.LEVEL_CODE
            );

            APEX_JSON.WRITE(
                'durationMinutes',
                R.DURATION_MINUTES
            );

            APEX_JSON.WRITE(
                'progressPercent',
                R.PROGRESS_PERCENT
            );

            APEX_JSON.WRITE(
                'status',
                v_status
            );

            APEX_JSON.WRITE(
                'grammarTitle',
                R.GRAMMAR_TITLE
            );

            APEX_JSON.WRITE(
                'grammarExample',
                R.GRAMMAR_EXAMPLE
            );

            APEX_JSON.WRITE(
                'sortOrder',
                R.SORT_ORDER
            );

            APEX_JSON.WRITE(
                'topicId',
                R.TOPIC_ID
            );

            APEX_JSON.WRITE(
                'topicTitle',
                R.TOPIC_TITLE
            );

            APEX_JSON.WRITE(
                'topicSortOrder',
                R.TOPIC_SORT_ORDER
            );

            APEX_JSON.CLOSE_OBJECT;

        END;

    END LOOP;

    APEX_JSON.CLOSE_ARRAY;

END GET_MISSIONS_BY_COURSE;

END PKG_MISSIONS;

/
