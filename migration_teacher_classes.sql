-- Migration: Create or update attendease_teacher_classes table
-- Run this once in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS attendease_teacher_classes (
    id                BIGSERIAL PRIMARY KEY,
    teacher_id        TEXT NOT NULL,
    code              TEXT NOT NULL,
    name              TEXT NOT NULL,
    schedule          TEXT DEFAULT '',
    schedule_start    TEXT DEFAULT '',
    schedule_end      TEXT DEFAULT '',
    enrolled          INTEGER DEFAULT 0,
    enrolled_students JSONB DEFAULT '[]',
    weekly            JSONB DEFAULT '[0,0,0,0,0,0,0]',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (teacher_id, code)
);

-- Index for fast teacher lookups
CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher_id ON attendease_teacher_classes (teacher_id);

-- Enable RLS (optional but recommended)
ALTER TABLE attendease_teacher_classes ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write their own rows (adjust as needed)
CREATE POLICY IF NOT EXISTS "teacher_classes_policy" ON attendease_teacher_classes
    FOR ALL USING (true) WITH CHECK (true);
