// TePi is the historical storage name for TPSIT.
export function registrySubject(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const subject = value.trim().toUpperCase();
  if (subject === 'TEPI') return 'TPSIT';
  return ['', 'TPSIT', 'SER'].includes(subject) ? subject : null;
}

export function belongsToLesson(storedSubject: string, subject: string) {
  return registrySubject(storedSubject) === subject;
}
