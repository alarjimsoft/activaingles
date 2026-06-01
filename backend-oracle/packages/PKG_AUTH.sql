--------------------------------------------------------
--  DDL for Package PKG_AUTH
--------------------------------------------------------

  CREATE OR REPLACE EDITIONABLE PACKAGE "LUALARCON"."PKG_AUTH" AS

    PROCEDURE LOGIN_ESTUDIANTE(
        p_matricula IN VARCHAR2,
        p_password  IN VARCHAR2
    );

END PKG_AUTH;

/
