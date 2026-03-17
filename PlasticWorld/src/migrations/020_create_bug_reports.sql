CREATE TABLE IF NOT EXISTS bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_name VARCHAR(100),
    reporter_email VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    screenshot_url TEXT,
    device_info JSONB,
    status VARCHAR(50) DEFAULT 'pending', -- pending, resolved, dismissed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
