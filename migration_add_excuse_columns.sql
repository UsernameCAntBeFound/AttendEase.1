# Run this SQL in your Supabase Dashboard → SQL Editor

ALTER TABLE attendease_sessions
  ADD COLUMN IF NOT EXISTS excuse_remarks text,
  ADD COLUMN IF NOT EXISTS excuse_status  text DEFAULT 'pending';
