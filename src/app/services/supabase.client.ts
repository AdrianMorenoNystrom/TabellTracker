import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { InjectionToken } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE = new InjectionToken<SupabaseClient>('Supabase client', {
  providedIn: 'root',
  factory: () => createClient(
    
  environment.supabaseUrl,
  environment.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,

      // Keep development and production sessions separate, also when testing both locally.
      storageKey: `sb-stryktipstabellen-${new URL(environment.supabaseUrl).hostname}-auth`,

      storage: typeof window !== 'undefined'
        ? window.localStorage
        : undefined,
    },
  }
  ),
});
