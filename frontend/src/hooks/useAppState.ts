'use client';
import { useState, useEffect } from 'react';
import { subscribeToState, saveState } from '@/lib/firestore';
import type { AppState } from '@/types';

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    return subscribeToState((s) => {
      setState(s);
      setLoading(false);
    });
  }, []);

  async function updateState(newState: AppState) {
    const next = { ...newState, meta: { ...newState.meta, updatedAt: Date.now() } };
    setState(next);
    setSyncing(true);
    try {
      await saveState(next);
    } finally {
      setSyncing(false);
    }
  }

  return { state, loading, syncing, updateState };
}
