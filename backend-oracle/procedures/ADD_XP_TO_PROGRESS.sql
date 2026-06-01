--------------------------------------------------------
--  DDL for Procedure ADD_XP_TO_PROGRESS
--------------------------------------------------------
set define off;

  CREATE OR REPLACE EDITIONABLE PROCEDURE "LUALARCON"."ADD_XP_TO_PROGRESS" (
    p_id_inscripcion IN NUMBER,
    p_mission_id     IN NUMBER,
    p_xp_earned      IN NUMBER
) IS
BEGIN
    UPDATE user_progress
    SET
        total_xp_earned = nvl(total_xp_earned, 0) + p_xp_earned,
        total_messages = nvl(total_messages, 0) + 1,
        last_activity = systimestamp,
        updated_at = systimestamp
    WHERE
            id_inscripcion = p_id_inscripcion
        AND mission_id = p_mission_id;

    COMMIT;
END;

/
