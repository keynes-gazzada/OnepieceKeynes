import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { all, database, hashPassword, one, run, transaction, type User } from '@/lib/database';
import { adminSchoolEmail, schoolEmailPart } from '@/lib/school-email';
import { SubjectImportError, subjectForImport, subjectsForClass } from '@/lib/subjects';
import { isISODate } from '@/lib/dates';
import { isSameOrigin } from '@/lib/security';
import { importPuntiWorkbook } from '@/lib/punti-import';
import { POINT_RULES, GRADE_MULTIPLIERS } from '@/lib/point-rules';
import { importedRegistry } from '@/lib/imported-registry';
export const runtime = 'nodejs';
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const key = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
const val = (r: Record<string, unknown>, ...names: string[]) => {
  for (const name of names) {
    const x = Object.entries(r).find(([k]) => key(k) === key(name));
    if (x && x[1] !== undefined && x[1] !== null) return String(x[1]).trim();
  }
  return '';
};
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const u = await currentUser();
  if (u?.role !== 'admin') return error('Accesso riservato al narratore.', 403);
  if (!isSameOrigin(request)) return error('Richiesta non autorizzata.', 403);
  if (action === 'upload') {
    const form = await request.formData();
    const file = form.get('file');
    const mode = String(form.get('mode') || 'details');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx'))
      return error('Seleziona un file .xlsx.');
    if (file.size > 8_000_000) return error('Il file supera 8 MB.');
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    } catch {
      return error('Impossibile leggere il file Excel.');
    }
    const isPuntiWorkbook = workbook.worksheets.some((sheet) =>
      ['studenti', 'onepiece'].includes(key(sheet.name)),
    );
    if (mode !== 'update' && isPuntiWorkbook) {
      try {
        const imported = await importPuntiWorkbook(database(), workbook, 'Punti.xlsx');
        return NextResponse.json({
          ok: true,
          counts: {
            Studenti: imported.students,
            Ciurme: imported.crews,
            'One Piece': imported.events,
          },
          warning: imported.skippedEvents
            ? `${imported.skippedEvents} movimenti non sono stati associati a uno studente.`
            : '',
        });
      } catch (cause) {
        if (cause instanceof SubjectImportError) return error(cause.message);
        return error('Importazione interrotta: controlla i fogli Studenti e One Piece.');
      }
    }
    const accepted =
      mode === 'update'
        ? ['update']
        : ['rotte', 'ciurme', 'taglie', 'ruoli', 'stagione1', 'stagione2'];
    const counts: Record<string, number> = {};
    try {
      await transaction(async () => {
        for (const sheet of workbook.worksheets) {
          if (!accepted.includes(key(sheet.name))) continue;
          const headers = (sheet.getRow(1).values as unknown[])
            .slice(1)
            .map((x) => String(x ?? ''));
          let count = 0;
          for (let index = 2; index <= sheet.rowCount; index++) {
            const row = sheet.getRow(index);
            const obj: Record<string, unknown> = {};
            headers.forEach((h, i) => {
              const cell = row.getCell(i + 1);
              obj[h] = cell.text || cell.value || '';
            });
            if (!Object.values(obj).some((v) => String(v).trim())) continue;
            await run(
              'INSERT INTO imported_rows(sheet,data) VALUES(?,?)',
              sheet.name,
              JSON.stringify(obj),
            );
            count++;
            const type = key(sheet.name);
            if (type === 'ciurme') {
              const name = val(obj, 'ciurma', 'nome', 'nome ciurma'),
                cls = val(obj, 'classe');
              if (
                name &&
                cls &&
                !(await one('SELECT id FROM crews WHERE name=? AND class_code=?', name, cls))
              )
                await run(
                  'INSERT INTO crews(name,class_code,flag) VALUES(?,?,?)',
                  name,
                  cls,
                  'skull',
                );
            }
            if (type === 'rotte') {
              const cls = val(obj, 'classe'),
                year = Number(val(obj, 'anno') || 0),
                ord = Number(val(obj, 'rotta', 'numero rotta') || 0),
                name = val(obj, 'nome rotta', 'nome');
              if (cls && year && ord && name)
                await run(
                  'INSERT INTO routes(class_code,year,year_name,ordinal,name,start_date,end_date) VALUES(?,?,?,?,?,?,?) ON CONFLICT(class_code,year,ordinal) DO UPDATE SET name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date',
                  cls,
                  year,
                  val(obj, 'nome anno') || `${year}° anno`,
                  ord,
                  name,
                  val(obj, 'dal', 'inizio'),
                  val(obj, 'al', 'fine'),
                );
            }
            if (type === 'ruoli') {
              const email = val(obj, 'mail', 'email'),
                role = val(obj, 'ruolo'),
                name = val(obj, 'pirata', 'nome');
              const pirate = email
                ? await one<User>('SELECT * FROM users WHERE email=?', email)
                : name
                  ? (
                      await all<User>(
                        "SELECT * FROM users WHERE (last_name || ' ' || first_name)=? OR (first_name || ' ' || last_name)=?",
                        name,
                        name,
                      )
                    )[0]
                  : undefined;
              if (pirate && role) await run('UPDATE users SET roles=? WHERE id=?', role, pirate.id);
            }
            if (type === 'update') {
              const email = val(obj, 'mail', 'email'),
                pirateName = val(obj, 'pirata', 'nome'),
                date = val(obj, 'data');
              const pirate = email
                ? await one<User>('SELECT * FROM users WHERE email=?', email)
                : pirateName
                  ? (
                      await all<User>(
                        "SELECT * FROM users WHERE (last_name || ' ' || first_name)=? OR (first_name || ' ' || last_name)=?",
                        pirateName,
                        pirateName,
                      )
                    )[0]
                  : undefined;
              const subject = pirate && isISODate(date)
                ? subjectForImport(pirate.class_code, val(obj, 'materia'), `Update, riga ${index}`)
                : '';
              if (pirate && isISODate(date))
                await run(
                  'INSERT INTO daily(date,user_id,subject,presence,phone,bug,anxiety,mystery,weapon,multiverse,fruit_points,fruit_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(date,user_id,subject) DO UPDATE SET presence=excluded.presence,phone=excluded.phone,bug=excluded.bug,anxiety=excluded.anxiety,mystery=excluded.mystery,fruit_points=excluded.fruit_points,fruit_note=excluded.fruit_note',
                  date,
                  pirate.id,
                  subject,
                  val(obj, 'presenza') || 'P',
                  val(obj, 'telefono') || '',
                  Number(val(obj, 'bug') || 0),
                  Number(val(obj, 'ansia') || 0),
                  Number(val(obj, 'mistero') || 0),
                  '',
                  '',
                  Number(val(obj, 'frutti', 'punti frutti') || 0),
                  val(obj, 'note'),
                );
            }
          }
          counts[sheet.name] = count;
        }
      });
    } catch (cause) {
      if (cause instanceof SubjectImportError) return error(cause.message);
      return error('Importazione interrotta: controlla il formato del file.');
    }
    if (!Object.keys(counts).length)
      return error(`Nessun foglio riconosciuto per ${mode === 'update' ? 'Update' : 'Dettagli'}.`);
    return NextResponse.json({
      ok: true,
      counts,
      warning:
        'Le righe originali sono state conservate. La mappatura dipende dalle intestazioni del file.',
    });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error('Dati non validi.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Dati non validi.');
  if (action === 'create-admin') {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Dati non validi.');
    const field = (name: string) => (typeof body[name] === 'string' ? body[name].trim() : '');
    const first = field('first'),
      last = field('last'),
      email = field('email').toLowerCase();
    const password = field('password'),
      confirm = field('confirm');
    if (!first || !last || !email || !password || !confirm) return error('Compila tutti i campi.');
    if (!schoolEmailPart(first) || !schoolEmailPart(last))
      return error('Inserisci nome e cognome validi.');
    const expectedEmail = adminSchoolEmail(first, last);
    if (email !== expectedEmail) return error(`Usa la mail scolastica ${expectedEmail}.`);
    if (password.length < 8) return error('La password deve contenere almeno 8 caratteri.');
    if (password !== confirm) return error('Password non corrispondenti.');
    const record = hashPassword(password);
    const created = await run(
      "INSERT INTO users(email,salt,password_hash,first_name,last_name,class_code,role,roles) VALUES(?,?,?,?,?,'','admin','Narratore') ON CONFLICT(email) DO NOTHING",
      email,
      record.salt,
      record.hash,
      first,
      last,
    );
    if (!created.changes) return error('Mail già registrata.', 409);
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (action === 'dream-save') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const userId = Number(body.user_id);
    const id = body.id === undefined ? undefined : Number(body.id);
    const points = body.points === undefined ? 0 : body.points;
    const date = typeof body.date === 'string' ? body.date : '';
    const subject = typeof body.subject === 'string' ? body.subject : '';
    if (typeof points !== 'number' || ![0, 2, 4].includes(points))
      return error('I punti del sogno possono essere solo 0, +2 o +4.');
    if ((date && !isISODate(date)) || (points > 0 && !isISODate(date)))
      return error('Seleziona una data valida per i punti del sogno.');
    if (!text || text.length > 1000) return error('Inserisci un sogno da 1 a 1000 caratteri.');
    const student = Number.isSafeInteger(userId)
      ? await one<User>("SELECT * FROM users WHERE id=? AND role='student'", userId)
      : undefined;
    if (!student) return error('Seleziona uno studente valido.');
    const allowedSubjects = subjectsForClass(student.class_code);
    if (
      (subject && !allowedSubjects.includes(subject)) ||
      (points > 0 && allowedSubjects.length && !subject)
    )
      return error('Seleziona una materia valida per i punti del sogno.');
    if (id !== undefined) {
      if (!Number.isSafeInteger(id) || id <= 0) return error('Sogno non valido.');
      const result = await run(
        'UPDATE dreams SET text=?,user_id=?,points=?,date=?,subject=? WHERE id=?',
        text,
        userId,
        points,
        date,
        subject,
        id,
      );
      if (!result.changes) return error('Sogno non trovato.', 404);
      return NextResponse.json({
        ok: true,
        dream: { id, user_id: userId, text, points, date, subject },
      });
    }
    const result = await run(
      'INSERT INTO dreams(user_id,text,points,date,subject) VALUES(?,?,?,?,?)',
      userId,
      text,
      points,
      date,
      subject,
    );
    return NextResponse.json(
      {
        ok: true,
        dream: { id: Number(result.lastInsertRowid), user_id: userId, text, points, date, subject },
      },
      { status: 201 },
    );
  }
  if (action === 'dream-delete') {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) return error('Sogno non valido.');
    const result = await run('DELETE FROM dreams WHERE id=?', id);
    if (!result.changes) return error('Sogno non trovato.', 404);
    return NextResponse.json({ ok: true });
  }
  if (action === 'registry') {
    const date = String(body.date || '');
    const subject = String(body.subject || '');
    const rows = body.rows;
    if (!isISODate(date) || !Array.isArray(rows)) return error('Data o registro non validi.');
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') return error('Registro non valido.');
      const pirate = await one<User>(
        "SELECT * FROM users WHERE id=? AND role='student'",
        Number(raw.user_id),
      );
      if (!pirate) return error('Studente non valido.');
      const subjects = subjectsForClass(pirate.class_code);
      if ((subjects.length && !subjects.includes(subject)) || (!subjects.length && subject))
        return error('Seleziona una materia valida per la classe.');
    }
    try {
      await transaction(async () => {
        const mysteryCrews = new Set<number>();
        const imported = importedRegistry(await all<{ user_id: number; type: string; points: number }>(
          'SELECT user_id,type,points FROM point_events WHERE date=? AND subject=?', date, subject,
        ));
        for (const raw of rows) {
          const r = raw as Record<string, unknown>,
            id = Number(r.user_id);
          const pirate = await one<User>("SELECT * FROM users WHERE id=? AND role='student'", id);
          if (!pirate) continue;
          const presence = ['', 'P', 'A', 'A+'].includes(String(r.presence)) ? String(r.presence) : '';
          const importedOffset = r.imported_points_offset === undefined ? 0 : (imported[id]?.imported_points_offset || 0);
          const phone = String(r.phone) === '+' ? '+' : '';
          const bug = r.bug ? 1 : 0,
            anxiety = r.anxiety ? 1 : 0,
            mystery = r.mystery ? 1 : 0,
            weapon = ['', 'Poseidon', 'Pluton', 'Uranus'].includes(String(r.weapon || ''))
              ? String(r.weapon || '')
              : '';
          const multiverse = String(r.multiverse || '').slice(0, 1000),
            multiversePoints = [0, POINT_RULES.multiverse].includes(Number(r.multiverse_points))
              ? Number(r.multiverse_points)
              : 0;
          await run(
            'INSERT INTO daily(date,user_id,subject,presence,phone,bug,anxiety,mystery,weapon,multiverse,multiverse_points,imported_points_offset,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(date,user_id,subject) DO UPDATE SET presence=excluded.presence,phone=excluded.phone,bug=excluded.bug,anxiety=excluded.anxiety,mystery=excluded.mystery,weapon=excluded.weapon,multiverse=excluded.multiverse,multiverse_points=excluded.multiverse_points,imported_points_offset=excluded.imported_points_offset,updated_at=CURRENT_TIMESTAMP',
            date,
            id,
            subject,
            presence,
            phone,
            bug,
            anxiety,
            mystery,
            weapon,
            multiverse,
            multiversePoints,
            importedOffset,
          );
          if (mystery && pirate.crew_id) mysteryCrews.add(pirate.crew_id);
        }
        for (const crewId of mysteryCrews)
          await run(
            'UPDATE daily SET mystery=1 WHERE date=? AND subject=? AND user_id IN (SELECT id FROM users WHERE crew_id=?)',
            date,
            subject,
            crewId,
          );
      });
      return NextResponse.json({ ok: true });
    } catch {
      return error('Salvataggio non riuscito.', 500);
    }
  }
  if (action === 'grade') {
    const subject = String(body.subject || '');
    const pirate = await one<User>(
      "SELECT * FROM users WHERE id=? AND role='student'",
      Number(body.user_id),
    );
    const subjects = pirate ? subjectsForClass(pirate.class_code) : [];
    if ((subjects.length && !subjects.includes(subject)) || (!subjects.length && subject))
      return error('Seleziona una materia valida per la classe.');
    const id = Number(body.user_id),
      date = String(body.date || ''),
      type = String(body.type || ''),
      grade = Number(body.grade);
    if (
      !(await one("SELECT id FROM users WHERE id=? AND role='student'", id)) ||
      !isISODate(date) ||
      !['verifica', 'interrogazione', 'progetto'].includes(type) ||
      !Number.isFinite(grade) ||
      grade < 2 ||
      grade > 10
    )
      return error('Voto non valido.');
    const mult = GRADE_MULTIPLIERS[
      type as 'verifica' | 'interrogazione' | 'progetto'
    ];
    await run(
      'INSERT INTO grades(user_id,date,subject,type,grade,points) VALUES(?,?,?,?,?,?)',
      id,
      date,
      subject,
      type,
      grade,
      Math.round(grade * mult),
    );
    return NextResponse.json({ ok: true, points: Math.round(grade * mult) });
  }
  if (action === 'route') {
    const id = Number(body.id),
      name = String(body.name || '').trim(),
      start = String(body.start_date || ''),
      end = String(body.end_date || '');
    if (
      !(await one('SELECT id FROM routes WHERE id=?', id)) ||
      !name ||
      (start && !isISODate(start)) ||
      (end && !isISODate(end)) ||
      (start && end && start > end)
    )
      return error('Rotta o date non valide.');
    await run('UPDATE routes SET name=?,start_date=?,end_date=? WHERE id=?', name, start, end, id);
    return NextResponse.json({ ok: true });
  }
  if (action === 'role') {
    const id = Number(body.user_id),
      role = String(body.role || '').trim();
    if (!(await one('SELECT id FROM users WHERE id=?', id)) || !role)
      return error('Ruolo non valido.');
    await run('UPDATE users SET roles=? WHERE id=?', role, id);
    return NextResponse.json({ ok: true });
  }
  if (action === 'crew') {
    const id = Number(body.user_id),
      crewId = Number(body.crew_id);
    const pirate = await one<User>("SELECT * FROM users WHERE id=? AND role='student'", id);
    const target = await one<{ id: number; class_code: string }>(
      'SELECT id,class_code FROM crews WHERE id=?',
      crewId,
    );
    if (!pirate || !target || pirate.class_code !== target.class_code)
      return error('Pirata o ciurma non validi.');
    await run('UPDATE users SET crew_id=? WHERE id=?', crewId, id);
    return NextResponse.json({ ok: true });
  }
  if (action === 'mystery') {
    const id = Number(body.id),
      revealed = body.revealed ? 1 : 0;
    if (!(await one('SELECT id FROM mysteries WHERE id=?', id)))
      return error('Mistero non valido.');
    await run('UPDATE mysteries SET revealed=? WHERE id=?', revealed, id);
    return NextResponse.json({ ok: true });
  }
  if (action === 'mystery-create') {
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    if (title.length < 3 || title.length > 120) return error('Inserisci un titolo valido.');
    const result = await run(
      'INSERT INTO mysteries(title,description,clues) VALUES(?,?,?)',
      title,
      description.slice(0, 1000),
      '[false,false,false,false]',
    );
    return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
  }
  if (action === 'mystery-clue') {
    const id = Number(body.id),
      index = Number(body.index);
    const record = await one<{ clues: string }>('SELECT clues FROM mysteries WHERE id=?', id);
    if (!record || !Number.isInteger(index) || index < 0 || index > 3)
      return error('Indizio non valido.');
    const clues = JSON.parse(record.clues) as boolean[];
    clues[index] = !!body.found;
    await run('UPDATE mysteries SET clues=? WHERE id=?', JSON.stringify(clues), id);
    return NextResponse.json({ ok: true });
  }
  return error('Operazione sconosciuta.', 404);
}
