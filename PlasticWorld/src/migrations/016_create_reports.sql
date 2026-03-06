-- Migration: 016_create_reports.sql
-- Description: Create reports table for user reporting functionality
-- Created: 2026-03-06

CREATE TYPE report_status AS ENUM ('pending', 'resolved', 'dismissed');

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status report_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent self-report
    CONSTRAINT no_self_report CHECK (reporter_id != reported_id)
);

-- Indexes for performance
CREATE INDEX idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX idx_reports_reported_id ON reports(reported_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_at ON reports(created_at);

-- Trigger to update updated_at timestamp
CREATE TRIGGER trigger_update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Comments
COMMENT ON TABLE reports IS 'Stores user reports for administrative review';
COMMENT ON COLUMN reports.reporter_id IS 'User who filed the report';
COMMENT ON COLUMN reports.reported_id IS 'User who was reported';
COMMENT ON COLUMN reports.status IS 'Current status of the report review';
