'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function NavBar({ syncing }: { syncing?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut(auth);
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <Link href="/dashboard" className="font-bold text-gray-900 text-lg shrink-0">
          Attendance
        </Link>
        <nav className="flex items-center gap-1">
          {syncing && (
            <span className="text-xs text-gray-400 mr-2">Syncing…</span>
          )}
          <Link
            href="/dashboard"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              pathname === '/dashboard' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Dashboard
          </Link>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
