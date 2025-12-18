import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const supabase = createClient(
    
  environment.supabaseUrl,
  environment.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,

      // 👇 VIKTIGT: unik key så dev/prod/projekt inte krockar
      storageKey: 'sb-stryktipstabellen-auth',

      // browser
      storage: typeof window !== 'undefined'
        ? window.localStorage
        : undefined,
    },
  }
);
