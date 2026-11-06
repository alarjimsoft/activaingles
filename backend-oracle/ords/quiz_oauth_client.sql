-- Cliente OAuth "activa_backend" para que FastAPI llame al módulo ORDS "quiz".
-- Ejecutar UNA SOLA VEZ, después de ords/quiz.sql (que crea el rol quiz_backend_role).
--
-- Muestra el client_id y el client_secret en la salida (DBMS_OUTPUT). El secreto se ve
-- solo esta vez: cópialo directo a Secret Manager (ORDS_QUIZ_CLIENT_ID y
-- ORDS_QUIZ_CLIENT_SECRET) y a backend/.env. NUNCA lo pegues en un archivo del repositorio.
--
-- Si ORDS_SECURITY no existe en tu versión de ORDS o marca error, crea el cliente desde
-- Database Actions → REST → Security → OAuth Clients: nombre activa_backend, grant type
-- client_credentials, rol quiz_backend_role.
--
-- Para generar un secreto nuevo más adelante (si se filtra):
--   ORDS_SECURITY.ROTATE_CLIENT_SECRET(p_client_name => 'activa_backend', ...)

SET SERVEROUTPUT ON;

DECLARE
    l_client ORDS_TYPES.T_CLIENT_CREDENTIALS;
BEGIN
    l_client := ORDS_SECURITY.REGISTER_CLIENT(
        p_name          => 'activa_backend',
        p_grant_type    => 'client_credentials',
        p_description   => 'Backend FastAPI de Activa Ingles (modulo quiz)',
        p_support_email => 'lualarconuv@gmail.com',
        p_privilege_names => 'quiz_backend_priv');

    ORDS_SECURITY.GRANT_CLIENT_ROLE(
        p_client_name => 'activa_backend',
        p_role_name   => 'quiz_backend_role');

    COMMIT;

    DBMS_OUTPUT.PUT_LINE('ORDS_QUIZ_CLIENT_ID=' || l_client.client_key.client_id);
    DBMS_OUTPUT.PUT_LINE('ORDS_QUIZ_CLIENT_SECRET=' || l_client.client_secret.secret);
END;
/
