# Database Schema for LURKER

## Tables

### signals
- id (uuid, primary key)
- hash (text)
- from (text)
- to (text)
- value (numeric)
- blockNumber (bigint)
- timestamp (timestamptz)
- type (text)
- created_at (timestamptz)

### patterns
- id (uuid, primary key)
- type (text) - accumulation, distribution, whale_buy, whale_sell
- wallet (text)
- confidence (float)
- details (jsonb)
- alerted (boolean)
- alerted_at (timestamptz)
- created_at (timestamptz)

### subscribers
- id (uuid, primary key)
- telegram_id (text)
- tier (text) - free, paid, enterprise
- active (boolean)
- created_at (timestamptz)
