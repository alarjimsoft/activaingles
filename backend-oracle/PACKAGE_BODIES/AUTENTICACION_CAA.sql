--------------------------------------------------------
--  DDL for Package Body AUTENTICACION_CAA
--------------------------------------------------------

  CREATE OR REPLACE EDITIONABLE PACKAGE BODY "LUALARCON"."AUTENTICACION_CAA" AS
/**
* Constants
*/

c_from_email constant varchar2(100) := 'no-reply@my.email';
c_website    constant varchar2(100) := 'my site';
c_hostname   constant varchar2(100) := 'my hostname';

  /** CREA EL HASH DE LA CONTRASEÑA DEL USUARIO

function custom_hash(
    p_username in varchar2,
    p_password in varchar2)
  return raw
is
  l_username varchar2(100);
  l_password varchar2(100);
  l_salt     varchar2(100) := 'my secret';
begin
  apex_debug.message(p_message => 'Begin custom_hash', p_level => 3) ;
  -- This function should be wrapped, as the hash algorhythm is exposed here.
  -- You can change the value of l_salt, but you much reset all of your passwords if you choose to do this.
  l_username := upper(p_username);
  l_password := upper(p_password);
  l_password := sha256.ENCRYPT(l_salt || l_username || l_password);
  apex_debug.message(p_message => 'End custom_hash', p_level => 3) ;
  return l_password;
end custom_hash;
  */
  
  FUNCTION crearCuenta(mat IN varchar2)
        return BOOLEAN AS
        l_workspace_id      number;
        res BOOLEAN;
        cuentaExiste1 number;
  BEGIN
       cuentaExiste1:=cuentaExiste(MAT);
       IF cuentaExiste1=0 THEN
       l_workspace_id := apex_util.find_security_group_id (p_workspace => 'lualarcon');
       apex_util.set_security_group_id (p_security_group_id => l_workspace_id);    
       APEX_UTIL.CREATE_USER(
              p_user_name    => MAT,
              p_web_password => 'caa',
              p_email_address=>'z'||MAT||'@estudiantes.uv.mx',
              p_change_password_on_first_use=>'Y');
             --res:=SQL%ROWCOUNT;
       COMMIT;
       -- DBMS_OUTPUT.PUT_LINE('cuenta apex creada');
       --DBMS_OUTPUT.PUT_LINE('Se creo:'|| res);
              res:=TRUE;
       ELSE
             DBMS_OUTPUT.PUT_LINE('La cuenta ya existe');
             res:=FALSE;
       END IF;
    RETURN res;
  END crearCuenta;

  FUNCTION cuentaExiste(mat IN VARCHAR2)
     RETURN NUMBER AS 
     cursor c1
     is select USER_NAME from APEX_WORKSPACE_APEX_USERS where USER_NAME=mat;
     matCR varchar2(10);
     respuesta number;
     BEGIN
        respuesta:=NULL;
        open c1;
        fetch c1 into matCR;
        if c1%notfound then
           respuesta:= 0;
        else
           respuesta:=1;    
        end if;
        CLOSE c1;   
        RETURN respuesta;
     
  END cuentaExiste;
  
  /* Procedimiento para iniciar el restableceimiento de contraseña de la app de estudiantes*/
  /* La llamada a este procemiento se realiza desde la pagina P3:RestablecerPassword de la app de estudiantes */
  PROCEDURE solicitudRestablecerPassword(matricula in varchar2)
  IS
  l_id                varchar2(100);
  l_verification_code varchar2(100);
  l_url               varchar2(200);
  v_mat               VARCHAR2(11);
  l_email             varchar2(30);
  BEGIN
  -- Primero checamos si el usuario existe en la base de datos
     
     select USER_NAME INTO l_id
     from APEX_WORKSPACE_APEX_USERS
     where upper(USER_NAME)=upper(matricula);
 /* select id
    into l_id
    from mtl_user
   where upper(email)    = upper(p_email); */

  dbms_random.initialize(to_char(sysdate, 'YYMMDDDSS')) ;
  l_verification_code := dbms_random.string('A', 20);

  l_url := apex_util.prepare_url(p_url => c_hostname||'f?p='||v('APP_ID')||':Reset-password:0::::P2_USUARIO,P2_CODE:' || l_id || ',' || l_verification_code, p_checksum_type => 1);
  
  insert into cambio_password(usuario,codigo)
  values(l_id,'RESET_' || l_verification_code);
   
     l_email:='z'||matricula||'@estudiantes.uv.mx';
    --correoT:='lualarconuv@gmail.com';
      
  /*
  update cambio_password
    set codigo = 'RESET_' || l_verification_code
  where user_name = l_id; */

  mail_reset_password(p_email => l_email, p_url => l_url);

exception
when no_data_found then
  raise_application_error( - 20001, 'Email address not registered.') ;
end solicitudRestablecerPassword;

/* Procedimiento que envía el correo de cambio de contraseña al email del estudiante */
procedure mail_reset_password(
  p_email    in varchar2,
  p_url      in varchar2)
is
  l_body     clob;  
begin
  apex_debug.message(p_message => 'Reset password Multiplication Table account', p_level => 3) ;  
  l_body := '<p>Hola,</p>
             <p>Recibimos una solicitud para restablecer tu contraseña de la app del CAA.</p>
             <p><a href="'||p_url||'">Reset Now.</a></p>
             <p>Si no hiciste tu la solicitud, simplemente ignora este correo.</p>
             <p>Saludos,<br/>
             El equipo del CAA</p>';

  apex_mail.send (
    p_to        => p_email,
    p_from      => c_from_email,
    p_body      => l_body,
    p_body_html => l_body,
    p_subj      => 'Solicitud de restablecimiento de contraseña APP CAA');

  apex_mail.push_queue;    

exception
when others 
then
  raise_application_error( - 20002, 'Issue sending reset password email.') ;
end mail_reset_password;

/* Función para verificar que el código es válido para el usuario
   se manda a llamar desde la página P2:Reset-password, si el código es valido se devuelve
   la matricula del estudiante, en caso contrario, devuelve que la solicitud no es válida
*/
FUNCTION verificar_codigo_restablecer(
    p_id in VARCHAR2,
    p_verification_code in varchar2)
  return VARCHAR2
is
  l_id number;
begin
  select u.usuario
    into l_id
    from cambio_password u
   where u.codigo = 'RESET_'||p_verification_code
     and u.usuario = p_id;

  return l_id;
exception
  when no_data_found
  then
    raise_application_error( - 20001, 'Invalid password request url.') ;
    return null;
end verificar_codigo_restablecer;

/** Procedimiento que realiza la actualización del password
 se ejecuta cuando se da click en el boton ENVIAR de la página P2:reset-password de la APP de estudiante
*/
PROCEDURE resetear_password(
    p_id       in VARCHAR2,
    p_password in varchar2)
is
  l_username        varchar2(100) ;
  l_hashed_password varchar2(100) ;
begin
  /*
  select USER_NAME
    into l_username
    from APEX_WORKSPACE_APEX_USERS
   where USER_NAME = p_id;

 l_hashed_password := custom_hash(l_username, p_password) ;
                                                          */
 /* EXEC APEX_UTIL.SET_PASSWORD(
        p_user_name => p_id,
        p_new_password => p_password); */
        
      APEX_UTIL.SET_PASSWORD(p_user_name=>p_id,
                               p_new_password=>p_password);
       
    UPDATE cambio_password
    SET codigo=null;
        
    
/*
  update mtl_user
    set password = l_hashed_password,
        verification_code = null
  where id = p_id; */
end resetear_password;

  
END AUTENTICACION_CAA;

/
