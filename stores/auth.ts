import { create } from 'zustand';
import { api, getToken, removeToken } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  branchId: string;
  branch?: {
    id: string;
    name: string;
    nameAr: string;
  };
  shelf?: {
    id: string;
    name: string;
    nameAr: string;
    code: string;
  } | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    try {
      const result = await api.auth.login(email, password);
      set({ user: result.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore errors
    } finally {
      await removeToken();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  checkAuth: async () => {
    try {
      const token = await getToken();
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth check timeout')), 3000)
      );
      
      const result = await Promise.race([
        api.auth.me(),
        timeoutPromise,
      ]) as any;
      
      // Handle both wrapped { user } and direct user object formats
      const user = result?.user || result;
      
      // Validate that we actually got user data
      if (!user || !user.id) {
        console.log('Invalid user data received:', result);
        await removeToken();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.log('Auth check failed:', error);
      await removeToken();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

