import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const adminClaim = !!idTokenResult.claims.admin;
          setIsAdmin(adminClaim);
          
          if (!adminClaim) {
            addToast('Warning: Your account does not have admin privileges.', 'warning');
          }
        } catch (error) {
          console.error("Error fetching token claims:", error);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [addToast]);

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      addToast('Login successful', 'success');
    } catch (error) {
      addToast(`Login failed: ${error.message}`, 'error');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      addToast('Logged out successfully', 'info');
    } catch (error) {
      addToast('Logout failed', 'error');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
