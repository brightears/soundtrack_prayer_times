-- Fix Aladhan calculation-method ids, which were off by one for ids >= 7.
--
-- The CALCULATION_METHODS map labelled e.g. 16 as "JAKIM (Malaysia)", but Aladhan's
-- real id 16 is Dubai (JAKIM is 17). Operators chose methods BY LABEL, so the stored
-- number must be remapped to the id Aladhan actually uses for that label — otherwise a
-- Malaysian zone keeps computing with Dubai's parameters. Ids 0-5 were already correct.
--
-- One UPDATE with a CASE: every row is remapped from its ORIGINAL value in a single
-- pass, so nothing can be shifted twice. Old 14 (Tehran) -> 7; old 15 (Shia Qum) -> 0.
UPDATE zone_configs
SET method = CASE method
  WHEN 7  THEN 8    -- Gulf Region
  WHEN 8  THEN 9    -- Kuwait
  WHEN 9  THEN 10   -- Qatar
  WHEN 10 THEN 11   -- Majlis Ugama Islam Singapura
  WHEN 11 THEN 12   -- Union Organization Islamic de France
  WHEN 12 THEN 13   -- Diyanet, Turkey
  WHEN 13 THEN 14   -- Spiritual Administration of Muslims of Russia
  WHEN 14 THEN 7    -- Institute of Geophysics, Tehran
  WHEN 15 THEN 0    -- Shia Ithna-Ashari / Leva Institute, Qum
  WHEN 16 THEN 17   -- JAKIM (Malaysia)
  WHEN 17 THEN 18   -- Tunisia
  WHEN 18 THEN 19   -- Algeria
  WHEN 19 THEN 20   -- KEMENAG (Indonesia)
  WHEN 20 THEN 21   -- Morocco
  WHEN 21 THEN 22   -- Comunidade Islamica de Lisboa
  WHEN 22 THEN 23   -- Ministry of Awqaf, Jordan
  ELSE method
END
WHERE method BETWEEN 7 AND 22;
