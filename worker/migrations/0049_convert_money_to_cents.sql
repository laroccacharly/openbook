-- Migration 0047 changed the application contract from whole dollars to cents,
-- but only renamed the catalog column. Assign the intended defaults directly so
-- locally adjusted values are not treated as dollar amounts and multiplied.
UPDATE job_catalog
SET estimated_price_cents = 50000
WHERE name = 'Replacing/fixing sinks';

UPDATE job_catalog
SET estimated_price_cents = 100000
WHERE name = 'Fixing hot water heaters';

UPDATE job_catalog
SET estimated_price_cents = 200000
WHERE name = 'Replacing a bathtub';

UPDATE configuration
SET deposit_amount = 5000
WHERE id = 1;
