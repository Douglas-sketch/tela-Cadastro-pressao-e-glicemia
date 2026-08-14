import { createClient } from '@supabase/supabase-js';

// 🔑 Substitua pelos seus dados do Supabase
// Obtenha em: Supabase Dashboard → Settings → API
const SUPABASE_URL = 'https://nngeqkjdjhdpkvbuymcg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uZ2Vxa2pkamhkcGt2YnV5bWNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NTc2NzAsImV4cCI6MjEwMTUzMzY3MH0.303xFrggH7dOWJ-TehyjEYiyyuBA4yvUDBU75-pN2Tw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
