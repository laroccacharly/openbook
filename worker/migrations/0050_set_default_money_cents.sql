-- Migration 0049 was deployed once with multiplicative updates before it was
-- corrected. Reconcile that deployment using the intended direct values.
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
