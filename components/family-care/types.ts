import type { SectionId } from '@/lib/demo-data';

export type Notice = { tone: 'success' | 'info' | 'warning'; text: string } | null;
export type Navigate = (section: SectionId) => void;
export type Notify = (text: string, tone?: NonNullable<Notice>['tone']) => void;
