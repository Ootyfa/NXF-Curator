import { createClient } from '@supabase/supabase-js';

// Safely access env, defaulting to empty object if undefined to prevent crashes
const env = (import.meta as any).env || {};

// The URL you provided
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://fofklhmzfvutcqoogcay.supabase.co';

// You must provide the anon key in your .env file
// We provide a non-empty fallback to prevent the application from crashing at startup
// if the environment variable is missing. API calls will fail gracefully with auth errors.
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || 'missing-anon-key-placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);