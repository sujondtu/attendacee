'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import { useAppState } from '@/hooks/useAppState';
import type { Student, Session } from '@/types';

function displayName(s: Student) {
  return s.name.trim() || `Student #${s.sid}`;
}

function initials(s: Student) {
  const n = s.name.trim();
  if (!n) return s.sid.slice(-2);
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function pctColor(pct: number) {
  return pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500';
}

function studentStats(sid: string, sessions: Session[]) {
  let present = 0, absent = 0;
  for (const s of sessions) {
    const m = s.attendance[sid];
    if (m === 'P') present++;
    else if (m === 'A') absent++;
  }
  const pct = present + absent > 0 ? Math.round(present / (present + absent) * 100) : null;
  return { present, absent, pct };
}

function sessionPct(s: Session) {
  const vals = Object.values(s.attendance);
  const p = vals.filter(v => v === 'P').length;
  const a = vals.filter(v => v === 'A').length;
  return { present: p, absent: a, pct: p + a > 0 ? Math.round(p / (p + a) * 100) : null };
}

function ClassContent({ classId }: { classId: string }) {
  const { state, loading } = useAppState();
  const [tab, setTab] = useState<'roster' | 'sessions'>('roster');

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner size={32} /></div>;

  const cls = state?.classes[classId];
  if (!cls) return <div className="flex-1 flex items-center justify-center text-gray-400">Class not found.</div>;

  const students = [...cls.students].sort((a, b) => a.roll - b.roll);
  const sessions = [...cls.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.slot.localeCompare(a.slot));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Back + header */}
      <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
        ← Dashboard
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{cls.name}</h1>
          <p className="text-gray-500 text-sm">{cls.fullName}</p>
        </div>
        <Link
          href={`/class/${classId}/session/new`}
          className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 active:scale-95 transition"
        >
          + New session
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['roster', 'sessions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition ${
              tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t} {t === 'roster' ? `(${students.length})` : `(${sessions.length})`}
          </button>
        ))}
      </div>

      {/* Roster */}
      {tab === 'roster' && (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {students.map(s => {
            const { present, absent, pct } = studentStats(s.sid, cls.sessions);
            return (
              <Link key={s.sid} href={`/student/${classId}/${s.sid}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                  {initials(s)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{displayName(s)}</div>
                  <div className="text-xs text-gray-400">Roll {s.roll} · {s.sid}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-bold text-sm ${pct !== null ? pctColor(pct) : 'text-gray-200'}`}>
                    {pct !== null ? `${pct}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-400">{present}P {absent}A</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Sessions */}
      {tab === 'sessions' && (
        <div className="space-y-2">
          {sessions.length === 0 && (
            <div className="text-center text-gray-400 py-16 bg-white rounded-2xl border border-gray-100">
              No sessions yet — tap <strong>+ New session</strong> to start.
            </div>
          )}
          {sessions.map((sess, i) => {
            const { present, absent, pct } = sessionPct(sess);
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{sess.date} · {sess.slot}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{present} present · {absent} absent · {students.length} total</div>
                </div>
                <div className={`text-xl font-bold ${pct !== null ? pctColor(pct) : 'text-gray-200'}`}>
                  {pct !== null ? `${pct}%` : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ClassPage() {
  const params = useParams();
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <ClassContent classId={params.id as string} />
      </div>
    </AuthGuard>
  );
}
