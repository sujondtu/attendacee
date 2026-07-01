import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { AppState } from '@/types';

export function getDocRef() {
  return doc(db, 'attendanceTrackers', 'iut-attendance');
}

export function subscribeToState(callback: (state: AppState) => void): () => void {
  return onSnapshot(getDocRef(), (snap) => {
    if (snap.exists()) {
      callback(snap.data().state as AppState);
    }
  });
}

export async function saveState(state: AppState): Promise<void> {
  await setDoc(getDocRef(), {
    state,
    updatedAt: state.meta.updatedAt,
    updatedBy: 'web',
  }, { merge: true });
}
