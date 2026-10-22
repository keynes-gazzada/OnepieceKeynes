import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import {
  all,
  database,
  hashPassword,
  one,
  run,
  transaction,
  type User,
  type Daily,
} from '@/lib/database';
import { adminSchoolEmail, schoolEmailPart } from '@/lib/school-email';
import { isISODate } from '@/lib/dates';
import { isSameOrigin } from '@/lib/security';
import { importPuntiWorkbook } from '@/lib/punti-import';
import { POINT_RULES, GRADE_MULTIPLIERS } from '@/lib/point-rules';
import { unifiedDaily } from '@/lib/unified-registry';
import { registrySubject } from '@/lib/registry-lessons';
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
      } catch {
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
          const updateDays: Daily[] = [];
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
              if (pirate && isISODate(date))
                updateDays.push({
                  id: index,
                  date,
                  user_id: pirate.id,
                  subject: '',
                  presence: val(obj, 'presenza') || 'P',
                  phone: val(obj, 'telefono') || '',
                  bug: Number(val(obj, 'bug') || 0),
                  anxiety: Number(val(obj, 'ansia') || 0),
                  mystery: Number(val(obj, 'mistero') || 0),
                  weapon: '',
                  multiverse: '',
                  multiverse_points: 0,
                  fruit_points: Number(val(obj, 'frutti', 'punti frutti') || 0),
                  fruit_note: val(obj, 'note'),
                  imported_points_offset: 0,
                  updated_at: '',
                });
            }
          }
          // Legacy imports replace only the general register. Named lessons
          // saved on the same date must remain untouched.
          for (const day of unifiedDaily(updateDays)) {
            const previous = unifiedDaily(
              await all<Daily>(
                "SELECT * FROM daily WHERE date=? AND user_id=? AND subject=''",
                day.date,
                day.user_id,
              ),
            )[0];
            await run(
              "DELETE FROM daily WHERE date=? AND user_id=? AND subject=''",
              day.date,
              day.user_id,
            );
            await run(
              "INSERT INTO daily(date,user_id,subject,presence,phone,bug,anxiety,mystery,weapon,multiverse,multiverse_points,fruit_points,fruit_note,imported_points_offset) VALUES(?,?,'',?,?,?,?,?,?,?,?,?,?,?)",
              day.date,
              day.user_id,
              day.presence,
              day.phone,
              day.bug,
              day.anxiety,
              day.mystery,
              previous?.weapon || '',
              previous?.multiverse || '',
              previous?.multiverse_points || 0,
              day.fruit_points,
              day.fruit_note,
              day.imported_points_offset || 0,
            );
          }
          counts[sheet.name] = count;
        }
      });
    } catch {
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
    if (typeof points !== 'number' || ![0, 2, 4].includes(points))
      return error('I punti del sogno possono essere solo 0, +2 o +4.');
    if ((date && !isISODate(date)) || (points > 0 && !isISODate(date)))
      return error('Seleziona una data valida per i punti del sogno.');
    if (!text || text.length > 1000) return error('Inserisci un sogno da 1 a 1000 caratteri.');
    const student = Number.isSafeInteger(userId)
      ? await one<User>("SELECT * FROM users WHERE id=? AND role='student'", userId)
      : undefined;
    if (!student) return error('Seleziona uno studente valido.');
    if (id !== undefined) {
      if (!Number.isSafeInteger(id) || id <= 0) return error('Sogno non valido.');
      const result = await run(
        "UPDATE dreams SET text=?,user_id=?,points=?,date=?,subject='' WHERE id=?",
        text,
        userId,
        points,
        date,
        id,
      );
      if (!result.changes) return error('Sogno non trovato.', 404);
      return NextResponse.json({
        ok: true,
        dream: { id, user_id: userId, text, points, date },
      });
    }
    const result = await run(
      'INSERT INTO dreams(user_id,text,points,date) VALUES(?,?,?,?)',
      userId,
      text,
      points,
      date,
    );
    return NextResponse.json(
      {
        ok: true,
        dream: { id: Number(result.lastInsertRowid), user_id: userId, text, points, date },
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
    const subject = registrySubject(body.subject);
    if (subject === null) return error('Materia non valida.');
    if (!subject) return error('Seleziona una materia prima di salvare il registro.');
    const legacySubject = subject === 'TPSIT' ? 'TePi' : subject;
    const rows = body.rows;
    if (!isISODate(date) || !Array.isArray(rows)) return error('Data o registro non validi.');
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') return error('Registro non valido.');
      const pirate = await one<User>(
        "SELECT * FROM users WHERE id=? AND role='student'",
        Number(raw.user_id),
      );
      if (!pirate) return error('Studente non valido.');
      const bug = Number(raw.bug || 0),
        multiverse = Number(raw.multiverse_points || 0);
      if (
        !Number.isSafeInteger(bug) ||
        bug < 0 ||
        bug > 1_000_000 ||
        !Number.isSafeInteger(multiverse) ||
        multiverse < 0 ||
        multiverse > 80_000_000 ||
        multiverse % POINT_RULES.multiverse !== 0
      )
        return error('Inserisci un numero intero valido di Bug e Multiversi.');
    }
    try {
      await transaction(async () => {
        const mysteryCrews = new Set<number>();
        for (const raw of rows) {
          const r = raw as Record<string, unknown>,
            id = Number(r.user_id);
          const pirate = await one<User>("SELECT * FROM users WHERE id=? AND role='student'", id);
          if (!pirate) continue;
          const presence = ['', 'P', 'A', 'A+'].includes(String(r.presence))
            ? String(r.presence)
            : '';
          const previous = unifiedDaily(
            await all<Daily>(
              'SELECT * FROM daily WHERE date=? AND user_id=? AND subject IN (?,?)',
              date,
              id,
              subject,
              legacySubject,
            ),
          )[0];
          const importedOffset = previous?.imported_points_offset ?? 0;
          const phone = String(r.phone) === '+' ? '+' : '';
          const bug = Number(r.bug || 0),
            anxiety = r.anxiety ? 1 : 0,
            mystery = r.mystery ? 1 : 0,
            weapon = String(r.weapon || '')
              .split(', ')
              .every((name) => ['', 'Poseidon', 'Pluton', 'Uranus'].includes(name))
              ? String(r.weapon || '')
              : '';
          const multiverse = String(r.multiverse || '').slice(0, 10000),
            multiversePoints = Number(r.multiverse_points || 0);
          await run(
            'DELETE FROM daily WHERE date=? AND user_id=? AND subject IN (?,?)',
            date,
            id,
            subject,
            legacySubject,
          );
          await run(
            'INSERT INTO daily(date,user_id,subject,presence,phone,bug,anxiety,mystery,weapon,multiverse,multiverse_points,imported_points_offset,fruit_points,fruit_note,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
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
            previous?.fruit_points || 0,
            previous?.fruit_note || '',
          );
          if (mystery && pirate.crew_id) mysteryCrews.add(pirate.crew_id);
        }
        for (const crewId of mysteryCrews)
          await run(
            'UPDATE daily SET mystery=1 WHERE date=? AND subject IN (?,?) AND user_id IN (SELECT id FROM users WHERE crew_id=?)',
            date,
            subject,
            legacySubject,
            crewId,
          );
      });
      return NextResponse.json({ ok: true });
    } catch {
      return error('Salvataggio non riuscito.', 500);
    }
  }
  if (action === 'grade') {
    const id = Number(body.user_id),
      date = String(body.date || ''),
      type = String(body.type || ''),
      grade = Number(body.grade);
    if (
      !(await one("SELECT id FROM users WHERE id=? AND role='student'", id)) ||
      !isISODate(date) ||
      !['verifica', 'progetto'].includes(type) ||
      !Number.isFinite(grade) ||
      grade < 2 ||
      grade > 10
    )
      return error('Voto non valido.');
    const mult = GRADE_MULTIPLIERS[type as 'verifica' | 'progetto'];
    await run(
      'INSERT INTO grades(user_id,date,type,grade,points) VALUES(?,?,?,?,?)',
      id,
      date,
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
    if (
      !(await one("SELECT id FROM users WHERE id=? AND role='student'", id)) ||
      !role ||
      role.length > 120
    )
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
  if (action === 'mystery-delete') {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) return error('Mistero non valido.');
    const result = await run('DELETE FROM mysteries WHERE id=?', id);
    if (!result.changes) return error('Mistero non trovato.', 404);
    return NextResponse.json({ ok: true });
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
