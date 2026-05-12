import { Status } from '@prisma/client';

// Status hex values from the prototype's tokens.css.
// Exposed via the API so clients can mirror server-driven theming.
export const STATUS_COLORS: Record<Status, { label: string; hex: string; ring: 'solid' | 'dashed' | 'check' }> = {
  BACKLOG:     { label: 'Backlog',            hex: '#6a6a6e', ring: 'dashed' },
  ESTIMATE:    { label: 'Estimate',           hex: '#e07b3e', ring: 'solid' },
  APPROVED:    { label: 'Approved',           hex: '#e5b341', ring: 'solid' },
  RETURN:      { label: 'Return',             hex: '#e54336', ring: 'solid' },
  IN_PROGRESS: { label: 'In progress',        hex: '#4a7eff', ring: 'solid' },
  IN_REVIEW:   { label: 'In review',          hex: '#a464d9', ring: 'solid' },
  WAITING:     { label: 'Waiting for client', hex: '#8f6e57', ring: 'solid' },
  HOLD:        { label: 'On hold',            hex: '#6a6a6e', ring: 'solid' },
  DONE:        { label: 'Done',               hex: '#34c270', ring: 'check' },
  INVOICED:    { label: 'Invoiced',           hex: '#1f8a5b', ring: 'check' },
};

export const CLOSED_STATUSES: Status[] = ['DONE', 'INVOICED'];
