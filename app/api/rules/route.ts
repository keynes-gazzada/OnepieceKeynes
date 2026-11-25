import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { run } from '@/lib/database';
import { isSameOrigin } from '@/lib/security';
import { rulesSheetPrefix, validRule } from '@/lib/rules-content';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  if ((await currentUser())?.role !== 'admin' || !isSameOrigin(request))
    return NextResponse.json({ error: 'Accesso riservato al Narratore.' }, { status: 403 });
  let rule: unknown;
  try {
    rule = await request.json();
  } catch {
    return NextResponse.json({ error: 'Dati non validi.' }, { status: 400 });
  }
  if (!validRule(rule))
    return NextResponse.json(
      { error: 'Controlla titolo, descrizione e indirizzo HTTPS dell’immagine.' },
      { status: 400 },
    );
  await run(
    'INSERT INTO imported_rows(sheet,data) VALUES(?,?)',
    rulesSheetPrefix + rule.id,
    JSON.stringify(rule),
  );
  return NextResponse.json({ ok: true });
}
