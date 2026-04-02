-- The UNIQUE constraint on patients.phone already creates a B-tree index.
-- This explicit index is redundant and wastes storage.
DROP INDEX IF EXISTS public.idx_patients_phone;
