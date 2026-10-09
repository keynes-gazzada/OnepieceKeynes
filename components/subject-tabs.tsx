import Link from 'next/link';
import { subjectLabel, subjectsForClass } from '@/lib/subjects';

export function SubjectTabs({
  path,
  classCode,
  subject,
  year = 0,
  route = 0,
}: {
  path: string;
  classCode: string;
  subject: string;
  year?: number;
  route?: number;
}) {
  const subjects = subjectsForClass(classCode);
  if (!subjects.length) return null;
  return (
    <nav className="filter-bar" aria-label="Materie">
      {subjects.map((name) => {
        const params = new URLSearchParams({ classe: classCode, materia: name || 'storico' });
        if (year) params.set('anno', String(year));
        if (route) params.set('rotta', String(route));
        return (
          <Link
            key={name}
            href={`${path}?${params}`}
            className={subject === name ? 'active' : ''}
            aria-current={subject === name ? 'page' : undefined}
          >
            {subjectLabel(name) || 'Registro precedente'}
          </Link>
        );
      })}
    </nav>
  );
}
