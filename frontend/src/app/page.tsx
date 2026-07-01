'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Spinner from '@/components/Spinner';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) router.replace(user ? '/dashboard' : '/login');
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size={32} />
    </div>
  );
}
