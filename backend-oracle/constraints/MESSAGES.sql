--------------------------------------------------------
--  Ref Constraints for Table MESSAGES
--------------------------------------------------------

  ALTER TABLE "LUALARCON"."MESSAGES" ADD CONSTRAINT "FK_MESSAGES_CONV" FOREIGN KEY ("CONVERSATION_ID")
	  REFERENCES "LUALARCON"."CONVERSATIONS" ("CONVERSATION_ID") ENABLE;
