import { NextResponse } from 'next/server';
import { all, one, run, transaction, type User, type Grade, type Route } from './database';
import { isISODate } from './dates';
import { scoringSettings, saveScoringSettings, validScoring } from './scoring-settings';
import { planningSheet } from './planning';

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export async function manageAdmin(action: string, body: Record<string, unknown>, actor: User) {
  if (action === 'clue-award') {
    const userId = body.user_id;
    const date = typeof body.date === 'string' ? body.date : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const points = body.points;
    if (
      !positiveId(userId) ||
      !isISODate(date) ||
      !description ||
      description.length > 200 ||
      typeof points !== 'number' ||
      !Number.isSafeInteger(points) ||
      points < 0 ||
      points > 1000000
    )
      return fail('Indica una data, una descrizione e punti validi.');
    const student = await one<{ crew_id: number | null }>(
      "SELECT crew_id FROM users WHERE id=? AND role='student'",
      userId,
    );
    if (!student?.crew_id) return fail('Assegna prima lo studente a una ciurma.');
    const members = await all<{ id: number }>(
      "SELECT id FROM users WHERE crew_id=? AND role='student'",
      student.crew_id,
    );
    const source = `clue:${crypto.randomUUID()}`;
    await transaction(async () => {
      for (const member of members)
        await run(
          'INSERT INTO point_events(user_id,date,type,points,source,source_row) VALUES(?,?,?,?,?,?)',
          member.id,
          date,
          `Indizio · ${description}`,
          points,
          source,
          member.id,
        );
    });
    return NextResponse.json({ ok: true, count: members.length });
  }
  if (action === 'multiverse-entry') {
    if (
      !positiveId(body.user_id) ||
      !(await one("SELECT id FROM users WHERE id=? AND role='student'", body.user_id))
    )
      return fail('Studente non valido.');
    const id = body.id;
    if (body.operation === 'delete') {
      if (!positiveId(id)) return fail('Multiverso non valido.');
      const result = await run(
        "DELETE FROM point_events WHERE id=? AND user_id=? AND source LIKE 'multiverse:%'",
        id,
        body.user_id,
      );
      return result.changes
        ? NextResponse.json({ ok: true })
        : fail('Multiverso non trovato.', 404);
    }
    const date = typeof body.date === 'string' ? body.date : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!isISODate(date) || !description || description.length > 200)
      return fail('Indica una data e una descrizione valida.');
    if (body.operation === 'update') {
      if (!positiveId(id)) return fail('Multiverso non valido.');
      const result = await run(
        "UPDATE point_events SET date=?,type=? WHERE id=? AND user_id=? AND source LIKE 'multiverse:%'",
        date,
        `Multiverso · ${description}`,
        id,
        body.user_id,
      );
      return result.changes
        ? NextResponse.json({ ok: true })
        : fail('Multiverso non trovato.', 404);
    }
    if (body.operation !== 'create') return fail('Operazione non valida.');
    const { daily: rules } = await scoringSettings();
    await run(
      'INSERT INTO point_events(user_id,date,type,points,source,source_row) VALUES(?,?,?,?,?,?)',
      body.user_id,
      date,
      `Multiverso · ${description}`,
      rules.multiverse,
      `multiverse:${crypto.randomUUID()}`,
      1,
    );
    return NextResponse.json({ ok: true });
  }
  if (action === 'grade-weapon') {
    if (
      !positiveId(body.id) ||
      !positiveId(body.user_id) ||
      !['', 'Pluton'].includes(String(body.weapon))
    )
      return fail('Voto o arma non validi.');
    const gradeId = body.id,
      userId = body.user_id;
    return transaction(async () => {
      await run('UPDATE grades SET points=points WHERE id=? AND user_id=?', gradeId, userId);
      const grade = await one<Grade>(
        'SELECT * FROM grades WHERE id=? AND user_id=?',
        gradeId,
        userId,
      );
      if (!grade) return fail('Voto non trovato.', 404);
      const sheet = `__weapon:grade:${grade.id}`;
      const previous = await one<{ data: string }>(
        'SELECT data FROM imported_rows WHERE sheet=? ORDER BY id DESC LIMIT 1',
        sheet,
      );
      let base = Number(grade.points);
      if (previous) {
        try {
          const value = JSON.parse(previous.data);
          if (
            value.weapon === 'Pluton' &&
            value.user_id === userId &&
            Number.isSafeInteger(value.base)
          )
            base = value.base;
          else return fail('Collegamento arma non valido.', 409);
        } catch {
          return fail('Collegamento arma non valido.', 409);
        }
      }
      if (!Number.isSafeInteger(base) || Math.abs(base) > 1_000_000_000)
        return fail('Punti del voto non validi.');
      await run(
        'UPDATE grades SET points=? WHERE id=? AND user_id=?',
        body.weapon === 'Pluton' ? base * 2 : base,
        grade.id,
        body.user_id as number,
      );
      await run('DELETE FROM imported_rows WHERE sheet=?', sheet);
      if (body.weapon === 'Pluton')
        await run(
          'INSERT INTO imported_rows(sheet,data) VALUES(?,?)',
          sheet,
          JSON.stringify({ weapon: 'Pluton', base, user_id: userId }),
        );
      return NextResponse.json({ ok: true });
    });
  }
  if (action === 'movement-update' || action === 'movement-delete') {
    const match =
      typeof body.movement === 'string' ? /^([eds])(\d+)(?::([0-7]))?$/.exec(body.movement) : null;
    const userId = body.user_id;
    if (!match || !positiveId(userId)) return fail('Movimento non valido.');
    const id = Number(match[2]);
    if (!positiveId(id)) return fail('Movimento non valido.');
    const removing = action === 'movement-delete';
    const points = removing ? 0 : body.points;
    if (
      typeof points !== 'number' ||
      !Number.isSafeInteger(points) ||
      Math.abs(points) > 2_000_000_000
    )
      return fail('Inserisci un numero intero di punti valido.');
    if (match[1] === 'e' || match[1] === 's') {
      if (match[3] !== undefined) return fail('Movimento non valido.');
      const table = match[1] === 'e' ? 'point_events' : 'dreams';
      if (!(await one(`SELECT id FROM ${table} WHERE id=? AND user_id=?`, id, userId)))
        return fail('Movimento non trovato.', 404);
      if (removing) await run(`DELETE FROM ${table} WHERE id=? AND user_id=?`, id, userId);
      else {
        const date = typeof body.date === 'string' ? body.date : '';
        if (!isISODate(date)) return fail('Data non valida.');
        if (match[1] === 'e') {
          const description = typeof body.description === 'string' ? body.description.trim() : '';
          if (!description || description.length > 250)
            return fail('Inserisci una descrizione valida.');
          await run(
            'UPDATE point_events SET date=?,type=?,points=? WHERE id=? AND user_id=?',
            date,
            description,
            points,
            id,
            userId,
          );
        } else {
          if (![0, 2, 4].includes(points))
            return fail('I punti storici di questa voce possono essere 0, 2 o 4.');
          await run(
            'UPDATE dreams SET date=?,points=? WHERE id=? AND user_id=?',
            date,
            points,
            id,
            userId,
          );
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (
      match[3] === undefined ||
      !(await one('SELECT id FROM daily WHERE id=? AND user_id=?', id, userId))
    )
      return fail('Movimento non trovato.', 404);
    const index = Number(match[3]);
    const { daily: rules } = await scoringSettings();
    let column: string;
    let value: string | number;
    const count = (unit: number) =>
      unit && points % unit === 0 && points / unit >= 0 && points / unit <= 1_000_000
        ? points / unit
        : null;
    if (index === 0) {
      column = 'presence';
      value =
        points === 0
          ? 'P'
          : points === rules.absence
            ? 'A'
            : points === rules.absencePlus
              ? 'A+'
              : '?';
    } else if (index === 1) {
      column = 'phone';
      value = points === 0 ? '' : points === rules.phone ? '+' : '?';
    } else if (index === 2 || index === 3) {
      column = index === 2 ? 'bug' : 'anxiety';
      value = count(index === 2 ? rules.bug : rules.anxiety) ?? -1;
    } else if (index === 4) {
      column = 'mystery';
      value = points === 0 ? 0 : points === rules.mystery ? 1 : -1;
    } else if (index === 5 || index === 6) {
      column = index === 5 ? 'multiverse_points' : 'fruit_points';
      value = points >= 0 ? points : -1;
    } else {
      column = 'imported_points_offset';
      value = -points;
    }
    if (value === '?' || (typeof value === 'number' && value < 0 && index !== 7))
      return fail('Questa voce usa i punteggi configurati: inserisci un valore compatibile.');
    await run(`UPDATE daily SET ${column}=? WHERE id=? AND user_id=?`, value, id, userId);
    return NextResponse.json({ ok: true });
  }
  if (action === 'point-rules') {
    if (!validScoring(body.settings))
      return fail(
        'Punteggi non validi: usa numeri interi; moltiplicatori e multiverso devono essere positivi.',
      );
    await saveScoringSettings(body.settings);
    return NextResponse.json({ ok: true, settings: body.settings });
  }
  if (['grade', 'grade-bulk', 'grade-update'].includes(action)) {
    const entries =
      action === 'grade-bulk'
        ? body.entries
        : [{ user_id: body.user_id, grade: body.grade, id: body.id }];
    const date = typeof body.date === 'string' ? body.date : '';
    const type = body.type;
    if (
      !isISODate(date) ||
      (type !== 'verifica' && type !== 'progetto') ||
      !Array.isArray(entries) ||
      !entries.length ||
      entries.length > 500
    )
      return fail('Data, tipologia o elenco voti non validi.');
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length > 250) return fail('Descrizione troppo lunga.');
    const ids = new Set<number>();
    for (const entry of entries) {
      if (
        !entry ||
        !positiveId(entry.user_id) ||
        typeof entry.grade !== 'number' ||
        !Number.isFinite(entry.grade) ||
        entry.grade < 2 ||
        entry.grade > 10 ||
        ids.has(entry.user_id)
      )
        return fail('Inserisci voti da 2 a 10, una volta per studente.');
      ids.add(entry.user_id);
      if (!(await one("SELECT id FROM users WHERE id=? AND role='student'", entry.user_id)))
        return fail('Studente non valido.');
    }
    if (
      action === 'grade-update' &&
      (!positiveId(body.id) ||
        !(await one('SELECT id FROM grades WHERE id=? AND user_id=?', body.id, entries[0].user_id)))
    )
      return fail('Voto non trovato.', 404);
    const settings = await scoringSettings();
    const grades: Grade[] = [];
    await transaction(async () => {
      for (const entry of entries) {
        const base = Math.round(entry.grade * settings.grades[type]);
        const weaponSheet = action === 'grade-update' ? `__weapon:grade:${body.id}` : '';
        if (weaponSheet)
          await run(
            'UPDATE grades SET points=points WHERE id=? AND user_id=?',
            Number(body.id),
            entry.user_id,
          );
        const weapon = weaponSheet
          ? await one('SELECT id FROM imported_rows WHERE sheet=?', weaponSheet)
          : undefined;
        const points = weapon ? base * 2 : base;
        let id: number;
        if (action === 'grade-update') {
          id = Number(body.id);
          await run(
            'UPDATE grades SET date=?,type=?,grade=?,points=? WHERE id=?',
            date,
            type,
            entry.grade,
            points,
            id,
          );
          if (weapon)
            await run(
              'UPDATE imported_rows SET data=? WHERE sheet=?',
              JSON.stringify({ weapon: 'Pluton', base, user_id: entry.user_id }),
              weaponSheet,
            );
        } else {
          const result = await run(
            'INSERT INTO grades(user_id,date,type,grade,points) VALUES(?,?,?,?,?)',
            entry.user_id,
            date,
            type,
            entry.grade,
            points,
          );
          id = Number(result.lastInsertRowid);
        }
        if (action === 'grade-bulk' && description) await run('INSERT INTO imported_rows(sheet,data) VALUES(?,?)', `__grade:description:${id}`, JSON.stringify({ description }));
        grades.push({ id, user_id: entry.user_id, date, type, grade: entry.grade, points });
      }
    });
    return NextResponse.json({ ok: true, grades, grade: grades[0], points: grades[0].points });
  }
  if (action === 'grade-delete-bulk') {
    const ids = body.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 500 ||
      ids.some((id) => !positiveId(id)) ||
      new Set(ids).size !== ids.length
    )
      return fail('Seleziona voti validi.');
    return transaction(async () => {
      for (const id of ids) {
        if (!(await one('SELECT id FROM grades WHERE id=?', id)))
          return fail('Un voto non è più disponibile. Aggiorna e riprova.', 409);
      }
      for (const id of ids) {
        await run('DELETE FROM grades WHERE id=?', id);
        await run('DELETE FROM imported_rows WHERE sheet=?', `__weapon:grade:${id}`);
        await run('DELETE FROM imported_rows WHERE sheet=?', `__grade:description:${id}`);
      }
      return NextResponse.json({ ok: true, count: ids.length });
    });
  }
  if (action === 'grade-delete') {
    if (!positiveId(body.id)) return fail('Voto non valido.');
    let result = { changes: 0 };
    await transaction(async () => {
      result = await run('DELETE FROM grades WHERE id=?', body.id as number);
      if (result.changes) {
        await run('DELETE FROM imported_rows WHERE sheet=?', `__weapon:grade:${body.id}`);
        await run('DELETE FROM imported_rows WHERE sheet=?', `__grade:description:${body.id}`);
      }
    });
    return result.changes ? NextResponse.json({ ok: true }) : fail('Voto non trovato.', 404);
  }
  if (action === 'route-create') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const cls = typeof body.class_code === 'string' ? body.class_code.trim() : '';
    const start = typeof body.start_date === 'string' ? body.start_date : '';
    const end = typeof body.end_date === 'string' ? body.end_date : '';
    if (
      !name ||
      name.length > 120 ||
      !cls ||
      cls.length > 20 ||
      !positiveId(body.year) ||
      Number(body.year) > 10 ||
      !positiveId(body.ordinal) ||
      Number(body.ordinal) > 100 ||
      !isISODate(start) ||
      !isISODate(end) ||
      start > end
    )
      return fail('Compila nome, classe, anno, numero e date valide della rotta.');
    const result = await run(
      'INSERT INTO routes(class_code,year,year_name,ordinal,name,start_date,end_date) VALUES(?,?,?,?,?,?,?) ON CONFLICT(class_code,year,ordinal) DO NOTHING',
      cls,
      Number(body.year),
      `${body.year}° anno`,
      Number(body.ordinal),
      name,
      start,
      end,
    );
    if (!result.changes) return fail('Esiste già una rotta con questa classe, anno e numero.', 409);
    const route = await one<Route>(
      'SELECT * FROM routes WHERE id=?',
      Number(result.lastInsertRowid),
    );
    return NextResponse.json({ ok: true, route }, { status: 201 });
  }
  if (action === 'user-update' || action === 'user-delete') {
    if (!positiveId(body.id)) return fail('Utente non valido.');
    const target = await one<User>(
      'SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE id=?',
      body.id,
    );
    if (!target) return fail('Utente non trovato.', 404);
    if (action === 'user-delete') {
      if (actor.id === target.id) return fail('Non puoi eliminare il tuo account.');
      await transaction(async () => {
        // Lock the actor too, so simultaneous narrator deletions cannot remove each other.
        await run('UPDATE users SET roles=roles WHERE id=?', actor.id);
        if (!(await one('SELECT id FROM users WHERE id=?', actor.id)))
          throw new Error('Sessione non più valida.');
        const grades = await all<{ id: number }>(
          'SELECT id FROM grades WHERE user_id=?',
          target.id,
        );
        for (const grade of grades)
          await run('DELETE FROM imported_rows WHERE sheet=?', `__weapon:grade:${grade.id}`);
        if (target.role === 'student') {
          const planningRows = await all<{ id: number; data: string }>(
            'SELECT id,data FROM imported_rows WHERE sheet=?',
            planningSheet('students'),
          );
          for (const row of planningRows) {
            let linked = false;
            try {
              linked = String(JSON.parse(row.data)._studentId || '') === String(target.id);
            } catch {
              /* Ignore malformed legacy rows. */
            }
            if (linked)
              await run(
                'DELETE FROM imported_rows WHERE id=? AND sheet=?',
                row.id,
                planningSheet('students'),
              );
          }
        }
        await run('DELETE FROM users WHERE id=?', target.id);
      });
      return NextResponse.json({ ok: true });
    }
    const first = typeof body.first_name === 'string' ? body.first_name.trim() : '';
    const last = typeof body.last_name === 'string' ? body.last_name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const cls =
      target.role === 'admin'
        ? ''
        : typeof body.class_code === 'string'
          ? body.class_code.trim()
          : '';
    const roles = typeof body.roles === 'string' ? body.roles.trim() : target.roles;
    const crewId = target.role === 'admin' || body.crew_id === null ? null : body.crew_id;
    if (
      !first ||
      !last ||
      first.length > 100 ||
      last.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      (target.role === 'student' && !cls) ||
      cls.length > 20 ||
      roles.length > 120
    )
      return fail('Compila correttamente nome, cognome, email e classe.');
    if (
      crewId !== null &&
      (!positiveId(crewId) ||
        !(await one('SELECT id FROM crews WHERE id=? AND class_code=?', crewId, cls)))
    )
      return fail('La ciurma deve appartenere alla classe scelta.');
    if (await one('SELECT id FROM users WHERE email=? AND id<>?', email, target.id))
      return fail('Email già utilizzata.', 409);
    await run(
      'UPDATE users SET first_name=?,last_name=?,email=?,class_code=?,crew_id=?,roles=? WHERE id=?',
      first,
      last,
      email,
      cls,
      crewId as number | null,
      roles,
      target.id,
    );
    return NextResponse.json({
      ok: true,
      user: {
        ...target,
        first_name: first,
        last_name: last,
        email,
        class_code: cls,
        crew_id: crewId,
        roles,
      },
    });
  }
  if (action === 'extra-points') {
    const date = typeof body.date === 'string' ? body.date : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (
      !positiveId(body.user_id) ||
      !(await one("SELECT id FROM users WHERE id=? AND role='student'", body.user_id)) ||
      !isISODate(date) ||
      !reason ||
      reason.length > 250 ||
      typeof body.points !== 'number' ||
      !Number.isSafeInteger(body.points) ||
      Math.abs(body.points) > 1000000 ||
      body.points === 0
    )
      return fail('Indica studente, data, motivazione e punti extra interi diversi da zero.');
    const result = await run(
      'INSERT INTO point_events(user_id,date,type,points,source,source_row) VALUES(?,?,?,?,?,?)',
      body.user_id,
      date,
      `Extra · ${reason}`,
      body.points,
      `manual:${crypto.randomUUID()}`,
      1,
    );
    return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) }, { status: 201 });
  }
  return null;
}
