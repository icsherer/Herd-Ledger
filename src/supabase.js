import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ugjtrdnqrlanrenhsddf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnanRyZG5xcmxhbnJlbmhzZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODEzMzksImV4cCI6MjA4NzM1NzMzOX0.68rqV5wW0SQLHCIBslx_l-iflhO_qWKBBEqLLY-aTUk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)