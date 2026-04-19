-- Create partial unique index: normalizedAddress must be unique when NOT NULL
-- This allows multiple NULL values (no-address leads) while preventing duplicate addresses
CREATE UNIQUE INDEX IF NOT EXISTS "unique_normalized_address_when_not_null"
ON "Property" ("normalizedAddress")
WHERE "normalizedAddress" IS NOT NULL;
