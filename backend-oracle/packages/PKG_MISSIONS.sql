--------------------------------------------------------
--  DDL for Package PKG_MISSIONS
--------------------------------------------------------

  CREATE OR REPLACE EDITIONABLE PACKAGE "LUALARCON"."PKG_MISSIONS" AS

    PROCEDURE GET_MISSIONS_BY_COURSE(
        p_id_curso IN VARCHAR2,
        p_id_inscripcion IN NUMBER
    );

END PKG_MISSIONS;

/
