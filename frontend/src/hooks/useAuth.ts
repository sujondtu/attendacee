'use client';
import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const ALLOWED_EMAIL = 'abushaidsujondtu@gmail.com';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u && u.email?.toLowerCase() !== ALLOWED_EMAIL) {
        await auth.signOut();
        setUser(null);
      } else {
        setUser(u);
      }
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
