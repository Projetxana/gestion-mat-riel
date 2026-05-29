import { createClient } from '@supabase/supabase-js'

// J'ai conservé import.meta.env car vous utilisez Vite (process.env ferait planter l'app React).
// Vos paramètres d'auth ont bien été ajoutés !
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  }
)
