export interface Student {
  roll: number;
  sid: string;
  name: string;
  email: string;
}

export type AttendanceMark = 'P' | 'A' | '';

export interface Session {
  date: string;
  slot: string;
  attendance: Record<string, AttendanceMark>;
  savedAt?: number;
}

export interface ClassData {
  name: string;
  fullName: string;
  students: Student[];
  sessions: Session[];
}

export interface AppState {
  classes: Record<string, ClassData>;
  meta: {
    updatedAt: number;
    deviceId?: string;
  };
}
