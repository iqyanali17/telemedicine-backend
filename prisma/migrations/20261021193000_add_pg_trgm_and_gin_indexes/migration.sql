-- Enable PostgreSQL trigram extension for accelerated substring/wildcard searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes on doctor_profiles text fields for fast ILIKE/contains searches
CREATE INDEX IF NOT EXISTS "doctor_profiles_specialization_trgm_idx" ON "doctor_profiles" USING gin ("specialization" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "doctor_profiles_qualification_trgm_idx" ON "doctor_profiles" USING gin ("qualification" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "doctor_profiles_bio_trgm_idx" ON "doctor_profiles" USING gin ("bio" gin_trgm_ops);

-- Create GIN trigram indexes on profiles names for fast doctor/patient name searches
CREATE INDEX IF NOT EXISTS "profiles_firstName_trgm_idx" ON "profiles" USING gin ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "profiles_lastName_trgm_idx" ON "profiles" USING gin ("lastName" gin_trgm_ops);
