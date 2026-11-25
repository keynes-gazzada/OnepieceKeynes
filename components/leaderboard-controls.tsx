'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentPointsDialog } from './admin-management';
import type { User, Route } from '@/lib/db';

export function LeaderboardFilters({
  classes,
  routes,
  cls,
  year,
  route,
  admin,
}: {
  classes: string[];
  routes: Route[];
  cls: string;
  year: number;
  route: number;
  admin: boolean;
}) {
  return (
    <form action="/viaggio" className="inline-filters">
      {admin ? (
        <select
          name="classe"
          defaultValue={cls}
          aria-label="Classe della classifica"
          onChange={(event) => {
            const form = event.currentTarget.form;
            if (!form) return;
            (form.elements.namedItem('anno') as HTMLSelectElement).value = '';
            (form.elements.namedItem('rotta') as HTMLSelectElement).value = '';
            form.requestSubmit();
          }}
        >
          <option value="">Tutte le classi</option>
          {classes.map((classCode) => (
            <option key={classCode}>{classCode}</option>
          ))}
        </select>
      ) : null}
      <select
        name="anno"
        defaultValue={year || ''}
        aria-label="Anno"
        disabled={!cls || !routes.length}
        onChange={(event) => {
          const form = event.currentTarget.form;
          if (!form) return;
          (form.elements.namedItem('rotta') as HTMLSelectElement).value = '';
          form.requestSubmit();
        }}
      >
        <option value="">Tutti gli anni</option>
        {[...new Set(routes.map((item) => item.year))].map((value) => (
          <option key={value} value={value}>
            {value}° anno
          </option>
        ))}
      </select>
      <select name="rotta" defaultValue={route || ''} aria-label="Rotta" disabled={!year}>
        <option value="">Tutte le rotte</option>
        {routes
          .filter((item) => item.year === year)
          .map((item) => (
            <option key={item.id} value={item.ordinal}>
              {item.ordinal}ª · {item.name}
            </option>
          ))}
      </select>
      <button type="submit" className="button small navy">
        Applica
      </button>
    </form>
  );
}

export function LeaderboardStudent({ student }: { student: User }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className="leader-student-link" onClick={() => setOpen(true)}>
        {student.last_name} {student.first_name}
      </button>
      {open ? (
        <StudentPointsDialog
          student={student}
          date={new Date().toLocaleDateString('en-CA')}
          admin
          onClose={() => setOpen(false)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
