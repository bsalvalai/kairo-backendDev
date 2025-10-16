const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://jgbddbtwopfwtmktgraw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYmRkYnR3b3Bmd3Rta3RncmF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTM1Njg0MiwiZXhwIjoyMDc0OTMyODQyfQ.vNfQIqA7BSsI9d4Dve75nz2SkvjYFlivZZLSrSiiokk";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = supabase;