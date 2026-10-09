import 'server-only';
import { all } from './database';
import { studentIdentityForEmail } from './school-email';

export const NOT_STUDENT_ERROR = 'Non risulti nell’elenco degli studenti.';
export async function registrationStudent(email: string) {
  if (!/^s-[a-z0-9]+\.[a-z0-9]+@isiskeynes\.it$/.test(email))
    return { error: 'Usa la mail scolastica s-cognome.nome@isiskeynes.it.', status: 400 } as const;
  const students = await all<{
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    class_code: string;
  }>("SELECT id,email,first_name,last_name,class_code FROM users WHERE role='student'");
  const matches = students.flatMap((student) => {
    const identity = studentIdentityForEmail(student.first_name, student.last_name, email);
    return identity ? [{ ...student, first_name: identity.first, last_name: identity.last }] : [];
  });
  if (!matches.length) return { error: NOT_STUDENT_ERROR, status: 403 } as const;
  if (matches.length > 1)
    return {
      error: 'La mail corrisponde a più studenti. Contatta il narratore.',
      status: 409,
    } as const;
  const student = matches[0];
  if (!student.email.endsWith('@studenti.invalid'))
    return {
      error: 'Studente già registrato. Accedi oppure recupera la password.',
      status: 409,
    } as const;
  return { student } as const;
}
