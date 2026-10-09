export const classSubjects: Record<string, string[]> = {
  '3CI': ['TePi', 'SER'],
  '4CI': ['TePi', 'SER'],
  '5CI': ['TPSIT'],
};

export function subjectsForClass(classCode: string) {
  return classSubjects[classCode.trim().toUpperCase()] || [];
}

// Keep the existing storage key so changing the label preserves previous scores.
export function subjectLabel(subject: string) {
  return subject === 'TePi' ? 'TPSIT' : subject;
}

export function normalizeSubject(classCode: string, subject: string) {
  const subjects = subjectsForClass(classCode);
  if (subject === 'TPSIT' && subjects.includes('TePi')) return 'TePi';
  if (subject === 'TePi' && subjects.includes('TPSIT')) return 'TPSIT';
  return subject;
}

export class SubjectImportError extends Error {}

export function subjectForImport(classCode: string, rawSubject: string, location: string) {
  const subject = normalizeSubject(classCode, rawSubject);
  const allowed = subjectsForClass(classCode);
  if (!subject || !allowed.includes(subject))
    throw new SubjectImportError(
      `${location}: compila Materia con ${allowed.map(subjectLabel).join(' o ') || 'una materia valida per la classe'}.`,
    );
  return subject;
}

export function selectedSubject(classCode: string, requested: unknown): string {
  const subjects = subjectsForClass(classCode);
  const normalized = typeof requested === 'string' ? normalizeSubject(classCode, requested) : '';
  return subjects.includes(normalized)
    ? normalized
    : subjects[0] || '';
}
