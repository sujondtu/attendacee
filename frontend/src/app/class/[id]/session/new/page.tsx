'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import { useAppState } from '@/hooks/useAppState';
import type { Student, AttendanceMark } from '@/types';

const SLOTS = ['C1', 'C2', 'C3', 'C4', 'C5'];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function displayName(s: Student) {
  return s.name.trim() || `Student #${s.sid}`;
}

function NewSessionContent({ classId }: { classId: string }) {
  const { state, loading, syncing, updateState } = useAppState();
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState('C1');
  const [attendance, setAttendance] = useState<Record<string, AttendanceMark>>({});
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner size={32} /></div>;

  const cls = state?.classes[classId];
  if (!cls) return <div className="flex-1 flex items-center justify-center text-gray-400">Class not found.</div>;

  const students = [...cls.students].sort((a, b) => a.roll - b.roll);

  function toggle(sid: string) {
    setAttendance(prev => {
      const cur = prev[sid] ?? '';
      const next: AttendanceMark = cur === '' ? 'P' : cur === 'P' ? 'A' : '';
      return { ...prev, [sid]: next };
    });
  }

  function markAll(mark: AttendanceMark) {
    const all: Record<string, AttendanceMark> = {};
    students.forEach(s => { all[s.sid] = mark; });
    setAttendance(all);
  }

  async function handleSave() {
    if (!state) return;
    setSaving(true);
    try {
      await updateState({
        ...state,
        classes: {
          ...state.classes,
          [classId]: {
            ...cls,
            sessions: [...cls.sessions, { date, slot, attendance, savedAt: Date.now() }],
          },
        },
      });
      router.push(`/class/${classId}`);
    } finally {
      setSaving(false);
    }
  }

  const presentCount = students.filter(s => attendance[s.sid] === 'P').length;
  const absentCount = students.filter(s => attendance[s.sid] === 'A').length;
  const markedCount = presentCount + absentCount;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <Link href={`/class/${classId}`} className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
        ← {cls.name}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Session</h1>
        <span className="text-sm text-gray-400">{cls.name}</span>
      </div>

      {/* Date & slot */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Slot</label>
          <select
            value={slot}
            onChange={e => setSlot(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            {SLOTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Quick mark + summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500">{markedCount}/{students.length} marked</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={() => markAll('P')}
            className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg font-medium hover:bg-green-100 transition">
            All P
          </button>
          <button onClick={() => markAll('A')}
            className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition">
            All A
          </button>
          <button onClick={() => markAll('')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition">
            Clear
          </button>
        </div>
      </div>

      {/* Student list */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {students.map(s => {
          const mark = attendance[s.sid] ?? '';
          return (
            <button key={s.sid} onClick={() => toggle(s.sid)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition text-left active:scale-[0.99]">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                mark === 'P' ? 'bg-green-100 text-green-700' :
                mark === 'A' ? 'bg-red-100 text-red-600' :
                'bg-gray-100 text-gray-500'
              }`}>
                {mark || s.roll}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{displayName(s)}</div>
                <div className="text-xs text-gray-400">{s.sid} · Roll {s.roll}</div>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                mark === 'P' ? 'bg-green-50 text-green-700' :
                mark === 'A' ? 'bg-red-50 text-red-600' :
                'text-gray-200'
              }`}>
                {mark || '·'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || syncing || markedCount === 0}
        className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-700 active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving || syncing
          ? 'Saving…'
          : `Save session · ${presentCount}P / ${absentCount}A`}
      </button>
    </div>
  );
}

export default function NewSessionPage() {
  const params = useParams();
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <NewSessionContent classId={params.id as string} />
      </div>
    </AuthGuard>
  );
}
