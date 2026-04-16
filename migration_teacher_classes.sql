-- =========================================================
-- Migration: attendease_teacher_classes
-- Run this ONCE in your Supabase SQL Editor
-- It is safe to run multiple times (uses IF NOT EXISTS)
-- =========================================================

-- Create the table if it does not already exist
CREATE TABLE IF NOT EXISTS attendease_teacher_classes (
    id                BIGSERIAL PRIMARY KEY,
    teacher_id        TEXT NOT NULL,
    code              TEXT NOT NULL,
    name              TEXT NOT NULL DEFAULT '',
    schedule          TEXT DEFAULT '',
    schedule_start    TEXT DEFAULT '',
    schedule_end      TEXT DEFAULT '',
    enrolled          INTEGER DEFAULT 0,
    enrolled_students JSONB DEFAULT '[]'::jsonb,
    weekly            JSONB DEFAULT '[0,0,0,0,0,0,0]'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Add the UNIQUE constraint if it doesn't exist yet
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'attendease_teacher_classes_teacher_id_code_key'
    ) THEN
        ALTER TABLE attendease_teacher_classes
            ADD CONSTRAINT attendease_teacher_classes_teacher_id_code_key
            UNIQUE (teacher_id, code);
    END IF;
END $$;

-- Add any missing columns for old installs
ALTER TABLE attendease_teacher_classes
    ADD COLUMN IF NOT EXISTS enrolled          INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS schedule_start    TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS schedule_end      TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS enrolled_students JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS weekly            JSONB DEFAULT '[0,0,0,0,0,0,0]'::jsonb;

-- Force Supabase to reload its schema cache so the API picks up the new columns immediately
NOTIFY pgrst, 'reload schema';

-- Fast lookup index
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_id
    ON attendease_teacher_classes (teacher_id);

-- Disable RLS so the anon key can read/write freely
ALTER TABLE attendease_teacher_classes DISABLE ROW LEVEL SECURITY;
