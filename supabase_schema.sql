
-- Leads table for storing user information
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  first_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- New leads table for initial outreach
CREATE TABLE "new leads" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  first_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Full conversation log table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Prompts table for system and initial prompts
CREATE TABLE prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  type TEXT CHECK (type IN ('system', 'initial')),
  created_at TIMESTAMP DEFAULT NOW()
);
