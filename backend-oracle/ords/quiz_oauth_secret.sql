-- Genera un client_secret NUEVO para el cliente OAuth "activa_backend" y lo muestra una vez.
--
-- Usalo:
--   - despues de quiz_oauth_client.sql si el secreto salio vacio, o
--   - si el secreto se filtro (revoca el anterior: el backend dejara de funcionar hasta que
--     actualices ORDS_QUIZ_CLIENT_SECRET en Secret Manager y en backend/.env).
--
-- Copia el valor directo a Secret Manager y a backend/.env. NUNCA lo pegues en un archivo
-- del repositorio ni en un chat.

SET SERVEROUTPUT ON;

DECLARE
    l_secret ORDS_TYPES.T_CLIENT_SECRET;
BEGIN
    l_secret := ORDS_SECURITY.ROTATE_CLIENT_SECRET(
        p_client_name     => 'activa_backend',
        p_revoke_existing => TRUE);
    COMMIT;

    DBMS_OUTPUT.PUT_LINE('ORDS_QUIZ_CLIENT_SECRET=' || l_secret.secret);
END;
/

-- Revision: el cliente debe tener el rol quiz_backend_role y el privilegio quiz_backend_priv
SELECT C.NAME AS CLIENT, C.CLIENT_ID, C.GRANT_TYPE, R.ROLE_NAME
  FROM USER_ORDS_CLIENTS C
  LEFT JOIN USER_ORDS_CLIENT_ROLES R ON R.CLIENT_NAME = C.NAME
 WHERE C.NAME = 'activa_backend';

SELECT CLIENT_NAME, NAME AS PRIVILEGE_NAME
  FROM USER_ORDS_CLIENT_PRIVILEGES
 WHERE CLIENT_NAME = 'activa_backend';
