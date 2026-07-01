'use client';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import { useAppState } from '@/hooks/useAppState';
import type { ClassData, Session } from '@/types';

function pctColor(pct: number) {
  return pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500';
}

function classStats(cls: ClassData) {
  let present = 0, marked = 0;
  for (const s of cls.students) {
    for (const sess of cls.sessions) {
      const m = sess.attendance[s.sid];
      if (m === 'P') { present++; marked++; }
      else if (m === 'A') marked++;
    }
  }
  return {
    sessions: cls.sessions.length,
    avgPct: marked > 0 ? Math.round(present / marked * 100) : null,
  };
}

function ClassCard({ id, cls }: { id: string; cls: ClassData }) {
  const { sessions, avgPct } = classStats(cls);
  return (
    <Link href={`/class/${id}`} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold">{cls.name}</h2>
          <p className="text-gray-500 text-sm mt-0.5">{cls.fullName}</p>
        </div>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
          {cls.students.length} students
        </span>
      </div>
      <div className="flex gap-6">
        <div>
          <div className="text-3xl font-bold">{sessions}</div>
          <div className="text-xs text-gray-400 mt-0.5">Sessions</div>
        </div>
        <div>
          <div className={`text-3xl font-bold ${avgPct !== null ? pctColor(avgPct) : 'text-gray-200'}`}>
            {avgPct !== null ? `${avgPct}%` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">Avg. attendance</div>
        </div>
      </div>
    </Link>
  );
}

function sessionPct(sess: Session) {
  const vals = Object.values(sess.attendance);
  const p = vals.filter(v => v === 'P').length;
  const a = vals.filter(v => v === 'A').length;
  return { present: p, absent: a, pct: p + a > 0 ? Math.round(p / (p + a) * 100) : null };
}

function DashboardContent() {
  const { state, loading } = useAppState();

  if (loading) return (
    <div className="flex-1 flex items-center justify-center"><Spinner size={32} /></div>
  );

  if (!state) return (
    <div className="flex-1 flex items-center justify-center flex-col gap-2">
      <p className="text-gray-400 font-medium">No data yet</p>
      <p className="text-sm text-gray-400">Open the mobile app and sync to see data here.</p>
    </div>
  );

  const classes = Object.entries(state.classes);
  const totalStudents = classes.reduce((a, [, c]) => a + c.students.length, 0);
  const totalSessions = classes.reduce((a, [, c]) => a + c.sessions.length, 0);

  const recent = classes
    .flatMap(([id, cls]) => cls.sessions.map(s => ({ classId: id, className: cls.name, ...s })))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.savedAt ?? 0) - (a.savedAt ?? 0))
    .slice(0, 6);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-3xl font-bold">{totalStudents}</div>
          <div className="text-sm text-gray-400 mt-0.5">Total students</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-3xl font-bold">{totalSessions}</div>
          <div className="text-sm text-gray-400 mt-0.5">Total sessions</div>
        </div>
      </div>

      {/* Class cards */}
      <div>
        <h2 className="text-base font-semibold mb-3">Classes</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {classes.map(([id, cls]) => <ClassCard key={id} id={id} cls={cls} />)}
        </div>
      </div>

      {/* Recent sessions */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Recent sessions</h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {recent.map((s, i) => {
              const { present, absent, pct } = sessionPct(s);
              return (
                <Link key={i} href={`/class/${s.classId}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition">
                  <div>
                    <div className="font-medium text-sm">{s.className} · {s.slot}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.date}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-sm ${pct !== null ? pctColor(pct) : 'text-gray-300'}`}>
                      {pct !== null ? `${pct}%` : '—'}
                    </div>
                    <div className="text-xs text-gray-400">{present}P / {absent}A</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <DashboardContent />
      </div>
    </AuthGuard>
  );
}
