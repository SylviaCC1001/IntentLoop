-- Migration: Add status field to projects table
-- Created: 2026-06-02

ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'reviewed', 'revised'));
