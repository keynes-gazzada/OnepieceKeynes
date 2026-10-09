export const schoolEmailPart = (value: string) =>
  value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

export const adminSchoolEmail = (first: string, last: string) =>
  `${schoolEmailPart(first)}.${schoolEmailPart(last)}@isiskeynes.it`;

export const studentSchoolEmail = (first: string, last: string) =>
  `s-${schoolEmailPart(last)}.${schoolEmailPart(first)}@isiskeynes.it`;

// The roster may contain one full-name column without an explicit surname boundary.
// Resolve that boundary from the school email, retaining all original name tokens.
export function studentIdentityForEmail(first: string, last: string, email: string) {
  if (studentSchoolEmail(first, last) === email) return { first, last };
  const parts = `${last} ${first}`.trim().split(/\s+/);
  for (let boundary = 1; boundary < parts.length; boundary++) {
    const candidateLast = parts.slice(0, boundary).join(' ');
    const candidateFirst = parts.slice(boundary).join(' ');
    if (studentSchoolEmail(candidateFirst, candidateLast) === email)
      return { first: candidateFirst, last: candidateLast };
  }
  return null;
}
