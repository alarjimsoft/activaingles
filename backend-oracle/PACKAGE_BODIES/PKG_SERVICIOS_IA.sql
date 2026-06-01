--------------------------------------------------------
--  DDL for Package Body PKG_SERVICIOS_IA
--------------------------------------------------------

  CREATE OR REPLACE EDITIONABLE PACKAGE BODY "LUALARCON"."PKG_SERVICIOS_IA" AS

    -- Constantes privadas (No visibles fuera del paquete)
    c_azure_key   CONSTANT VARCHAR2(100) := '<AZURE_SPEECH_KEY>';
    c_azure_reg   CONSTANT VARCHAR2(50)  := 'eastus';
    c_google_key  CONSTANT VARCHAR2(100) := 'GOOGLE_KEY';
    c_openai_key  CONSTANT VARCHAR2(200) := '<OPENAI_API_KEY>';

    ----------------------------------------------------------------------------
    FUNCTION get_azure_token RETURN VARCHAR2 AS
        l_token VARCHAR2;
    BEGIN
        -- Header 1: Tu Key
    apex_web_service.g_request_headers(1).name  := 'Ocp-Apim-Subscription-Key';
    apex_web_service.g_request_headers(1).value := c_azure_key;
    
    -- Header 2: FORZAR Content-Length a 0 (Esto mata el error 411)
    apex_web_service.g_request_headers(2).name  := 'Content-Length';
    apex_web_service.g_request_headers(2).value := '0';

    -- Header 3: Asegurar que aceptamos texto
    apex_web_service.g_request_headers(3).name  := 'Accept';
    apex_web_service.g_request_headers(3).value := '*/*';

    l_token := apex_web_service.make_rest_request(
        p_url         => 'https://' || c_azure_reg || '.api.cognitive.microsoft.com/sts/v1.0/issueToken',
        p_http_method => 'POST',
        p_body        => NULL -- Probamos con NULL ahora que forzamos el header
    );
        RETURN l_token;
    END get_azure_token;

    ----------------------------------------------------------------------------
    FUNCTION get_google_key RETURN VARCHAR2 AS
    BEGIN
        RETURN c_google_key;
    END get_google_key;

    ----------------------------------------------------------------------------
    FUNCTION get_openai_key RETURN VARCHAR2 AS
    BEGIN
        RETURN c_openai_key;
    END get_openai_key;

    ----------------------------------------------------------------------------
    --funci�n para recibir audio y convertirlo a texto google TTS----------------
    FUNCTION texto_a_voz(p_texto IN CLOB) RETURN CLOB AS
    l_body  CLOB;
    l_res   CLOB;
BEGIN
    -- 1. Construir el JSON usando APEX_JSON para evitar errores de comillas o saltos de l�nea
    apex_json.initialize_clob_output;
    apex_json.open_object;
    apex_json.open_object('input');
    apex_json.write('text', p_texto);
    apex_json.close_object;
    apex_json.open_object('voice');
    apex_json.write('languageCode', 'es-US');
    apex_json.write('name', 'es-US-Chirp-HD-D');
    apex_json.close_object;
    apex_json.open_object('audioConfig');
    apex_json.write('audioEncoding', 'MP3');
    apex_json.close_object;
    apex_json.close_object;
    
    l_body := apex_json.get_clob_output;
    apex_json.free_output;

    -- 2. Configurar Headers
    apex_web_service.g_request_headers.delete;
    apex_web_service.g_request_headers(1).name := 'Content-Type';
    apex_web_service.g_request_headers(1).value := 'application/json';

    -- 3. Petici�n a Google
    l_res := apex_web_service.make_rest_request(
        p_url         => 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' || get_google_key,
        p_http_method => 'POST',
        p_body        => l_body
    );

    RETURN l_res;
    END texto_a_voz;
   /* FUNCTION texto_a_voz(p_texto IN VARCHAR2) RETURN CLOB AS
    l_body  VARCHAR2(32767);
    l_res   CLOB;
    BEGIN
    -- Cuerpo del JSON para Google
    l_body := '{
        "input": {"text": "' || p_texto || '"},
        "voice": {"languageCode": "es-US", "name": "es-US-Chirp-HD-D"},
        "audioConfig": {"audioEncoding": "MP3"}
    }';

    apex_web_service.g_request_headers.delete;
    apex_web_service.g_request_headers(1).name := 'Content-Type';
    apex_web_service.g_request_headers(1).value := 'application/json';

    -- Se concatena la key aqu�, nunca sale al cliente
    l_res := apex_web_service.make_rest_request(
        p_url         => 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' || get_google_key,
        p_http_method => 'POST',
        p_body        => l_body
    );

    RETURN l_res;
    END texto_a_voz; */
    ----------------------------------------------------------------------------
    --Funci�n para convertir voz a texto con google STT
    FUNCTION voz_a_texto(p_audio_base64 IN CLOB) RETURN CLOB AS
    l_body  CLOB;
    l_res   CLOB;
    BEGIN
    -- Construimos el JSON usando CLOB por si el audio es extenso
    l_body := '{"config": {"languageCode":"es-MX"}, "audio": {"content": "' || p_audio_base64 || '"}}';

    apex_web_service.g_request_headers.delete;
    apex_web_service.g_request_headers(1).name := 'Content-Type';
    apex_web_service.g_request_headers(1).value := 'application/json';

    l_res := apex_web_service.make_rest_request(
        p_url         => 'https://speech.googleapis.com/v1/speech:recognize?key=' || get_google_key,
        p_http_method => 'POST',
        p_body        => l_body
    );

    RETURN l_res;
    END voz_a_texto;
    -----------------------------------------------------------------------------
    --funcion para enviar pregunta a la api de openai y devolver respuesta
    
    FUNCTION llamar_openai_chat(p_historial_json IN CLOB) RETURN CLOB AS
    l_body  CLOB;
    l_res   CLOB;
    BEGIN
      -- Construimos el cuerpo de la petici�n. 
      -- p_historial_json ya vendr� formateado como el array 'messages' de JS.
      l_body := '{"model": "gpt-3.5-turbo", "messages": ' || p_historial_json || '}';

      apex_web_service.g_request_headers.delete;
      apex_web_service.g_request_headers(1).name := 'Content-Type';
      apex_web_service.g_request_headers(1).value := 'application/json';
      apex_web_service.g_request_headers(2).name := 'Authorization';
      apex_web_service.g_request_headers(2).value := 'Bearer ' || get_openai_key;

      l_res := apex_web_service.make_rest_request(
         p_url         => 'https://api.openai.com/v1/chat/completions',
         p_http_method => 'POST',
         p_body        => l_body
      );

    RETURN l_res;
END llamar_openai_chat;
    -----------------------------------------------------------------------------
    PROCEDURE get_token_ajax AS
    l_service VARCHAR2(50) := apex_application.g_x01;
    BEGIN
       IF l_service = 'GOOGLE_STT' THEN
            -- Leemos el audio desde el CLOB temporal de APEX
            htp.p(voz_a_texto(apex_application.g_clob_01));
       ELSIF l_service = 'GOOGLE_TTS' THEN
          DECLARE
            l_clob CLOB;
            l_pos  NUMBER := 1;
            l_buff VARCHAR2(32767);
          BEGIN
            l_clob := texto_a_voz(apex_application.g_x02);
        
            -- Imprimir el CLOB en trozos de 8000 caracteres
            WHILE l_pos <= dbms_lob.getlength(l_clob) LOOP
               l_buff := dbms_lob.substr(l_clob, 8000, l_pos);
               htp.prn(l_buff);
               l_pos := l_pos + 8000;
            END LOOP;
          END;     
       --ELSIF l_service = 'GOOGLE_TTS' THEN
         --   htp.p(texto_a_voz(apex_application.g_x02));
       ELSIF l_service = 'OPENAI_CHAT' THEN
          DECLARE
          l_res CLOB;
          l_pos NUMBER := 1;
          BEGIN
             l_res := llamar_openai_chat(apex_application.g_clob_01);
        
             -- Imprimir en trozos para evitar errores de buffer (importante para respuestas largas)
             WHILE l_pos <= dbms_lob.getlength(l_res) LOOP
                  htp.prn(dbms_lob.substr(l_res, 8000, l_pos));
                  l_pos := l_pos + 8000;
             END LOOP;
          END;
       ELSIF l_service = 'AZURE' THEN
            htp.p(get_azure_token);
       END IF;
END get_token_ajax;

END PKG_SERVICIOS_IA;

/
