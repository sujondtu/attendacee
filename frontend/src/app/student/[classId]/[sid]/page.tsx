'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import { useAppState } from '@/hooks/useAppState';
import type { Student } from '@/types';

function initials(s: Student) {
  const n = s.name.trim();
  if (!n) return s.sid.slice(-2);
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function pctColor(pct: number) {
  return pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500';
}

function StudentContent({ classId, sid }: { classId: string; sid: string }) {
  const { state, loading } = useAppState();

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner size={32} /></div>;

  const cls = state?.classes[classId];
  const student = cls?.students.find(s => s.sid === sid);

  if (!cls || !student) return (
    <div className="flex-1 flex items-center justify-center text-gray-400">Student not found.</div>
  );

  const sessions = [...cls.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.slot.localeCompare(a.slot));

  let present = 0, absent = 0;
  for (const sess of sessions) {
    const m = sess.attendance[sid];
    if (m === 'P') present++;
    else if (m === 'A') absent++;
  }
  const total = present + absent;
  const pct = total > 0 ? Math.round(present / total * 100) : null;
  const name = student.name.trim() || `Student #${student.sid}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <Link href={`/class/${classId}`} className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
        ← {cls.name}
      </Link>

      {/* Student card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-600 shrink-0">
          {initials(student)}
        </div>
        <div>
          <h1 className="text-xl font-bold">{name}</h1>
          <p className="text-sm text-gray-500">{student.sid} · Roll {student.roll}</p>
          {student.email && <p className="text-xs text-gray-400 mt-0.5">{student.email}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{present}</div>
          <div className="text-xs text-gray-400 mt-0.5">Present</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{absent}</div>
          <div className="text-xs text-gray-400 mt-0.5">Absent</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <div className={`text-2xl font-bold ${pct !== null ? pctColor(pct) : 'text-gray-200'}`}>
            {pct !== null ? `${pct}%` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">Rate</div>
        </div>
      </div>

      {/* Low attendance warning */}
      {pct !== null && pct < 75 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-3 text-sm text-red-700">
          ⚠ Attendance below 75% — {75 - pct}% gap to meet the requirement.
        </div>
      )}

      {/* Session history */}
      <div>
        <h2 className="font-semibold mb-3">Session history ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <div className="text-center text-gray-400 py-12 bg-white rounded-2xl border border-gray-100">
            No sessions recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {sessions.map((sess, i) => {
              const m = sess.attendance[sid];
              return (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{sess.date}</div>
                    <div className="text-xs text-gray-400">{sess.slot}</div>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    m === 'P' ? 'bg-green-50 text-green-700' :
                    m === 'A' ? 'bg-red-50 text-red-600' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {m || '·'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentPage() {
  const params = useParams();
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <StudentContent classId={params.classId as string} sid={params.sid as string} />
      </div>
    </AuthGuard>
  );
}
