# Cloudflare Workers e D1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare il portale One Piece · J. M. Keynes da Next.js con SQLite locale a un'app vinext su Cloudflare Workers con D1, autenticazione applicativa e flussi attuali funzionanti.

**Architecture:** Conservare le pagine e le API esistenti, sostituire gli accessi `node:sqlite` con query D1 asincrone e migrazioni SQL, quindi eseguire il runtime Workers tramite l'integrazione Cloudflare ufficiale di vinext. Password e sessioni usano Web Crypto; il D1 remoto parte senza righe e senza dominio personalizzato. L'invio di email resta disabilitato finché non sarà disponibile un mittente verificato.

**Tech Stack:** Next.js 16.3.6 API surface, React 19, vinext e integrazione `@cloudflare/vite-plugin`, Cloudflare Workers, D1/SQLite, Wrangler, Web Crypto, Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-26-cloudflare-d1-migration-design.md`](../specs/2026-09-26-cloudflare-d1-migration-design.md)

## Global Constraints

- Usare D1 con binding `DB`; tutte le operazioni D1 dal Worker sono asincrone.
- Eseguire le route API sul runtime Workers di vinext; rimuovere `runtime = 'nodejs'` dalle route che oggi lo forzano.
- Non usare Supabase.
- Il database Cloudflare parte vuoto: non copiare utenti, credenziali, record demo o dati scolastici dal database SQLite locale.
- Conservare nomi delle tabelle, contratti API, ruoli e controlli same-origin esistenti.
- Derivare le password con PBKDF2-HMAC-SHA-256, salt casuale di 16 byte, 600.000 iterazioni e chiave di 256 bit.
- Workers Free limita il CPU time a 10 ms per richiesta; misurare PBKDF2 sul runtime Workerd e confrontare il tempo con questo limite prima del deploy. Non ridurre le 600.000 iterazioni già approvate senza chiedere una decisione; se il costo sfora il limite Free, chiedere se mantenere la protezione su Workers Paid o modificare i parametri.
- Archiviare soltanto l'hash SHA-256 dei token di sessione; il cookie è HttpOnly, Secure in produzione, SameSite=Lax, path `/`, scadenza 14 giorni.
- Non configurare DNS, dominio personalizzato o invio email senza un dominio mittente fornito e verificato.
- L'importazione Excel reale resta per una fase successiva al file dell'utente; in questa migrazione usare soltanto un workbook sintetico.
- Se vinext o ExcelJS non supportano una funzione necessaria nel runtime Workers, fermarsi e chiedere una decisione prima di cambiare framework o funzione.
- Leggere i documenti Next.js pertinenti in `node_modules/next/dist/docs/` prima di modificare codice Next.js.
- Lavorare sui file del portale senza includere nel commit le modifiche preesistenti dell'utente.

---

## Mappa dei file

- `vite.config.ts`, `wrangler.jsonc`, `package.json`: avvio, build, binding e deploy vinext/Workers.
- `.gitignore`: esclusione dello stato D1 locale, segreti `.dev.vars` e artefatti di build.
- `migrations/0001_initial.sql`: schema D1 iniziale, inclusi tutti i campi attuali e le tabelle di sessione/importazione.
- `migrations/0002_login_attempts.sql`: conteggio temporaneo dei tentativi di login senza conservare email o IP in chiaro.
- `worker-configuration.d.ts`: tipi `Env` generati da Wrangler; non editarli a mano.
- `tests/fixtures/excel-compat/worker.ts`, `tests/fixtures/excel-compat/wrangler.jsonc`: Worker minimo mantenuto come preflight di compatibilità ExcelJS.
- `lib/db.ts`: funzioni repository asincrone e tipi condivisi; nessuna dipendenza da `node:sqlite`, `node:fs` o `node:path`.
- `lib/passwords.ts`: derivazione/verifica PBKDF2 e hash SHA-256 via Web Crypto.
- `lib/auth.ts`: lettura cookie, lookup sessione D1, creazione/invalidazione sessione e pulizia scadenze.
- `lib/security.ts`: controlli di origine e piccoli helper che devono restare compatibili con Workers.
- `app/page.tsx`, `app/[slug]/page.tsx`: query server asincrone per homepage, profilo, rotte, punteggi e narratore.
- `app/api/auth/[action]/route.ts`: registrazione, login, logout, cambio password e risposte di recupero.
- `app/api/admin/[action]/route.ts`, `app/api/data/route.ts`: query D1 e scritture atomiche con `DB.batch()`.
- `scripts/seed-local.ts`: dati dimostrativi esclusivamente per il binding D1 locale/test.
- `scripts/bootstrap-admin.ts`: creazione interattiva e una tantum del narratore remoto, senza credenziali nel repository o negli argomenti shell.
- `tests/db.spec.ts`, `tests/auth-crypto.spec.ts`, `tests/api.spec.ts`, `tests/site.spec.ts`, `tests/excel-worker.spec.ts`: test d'integrazione Playwright su Workers locale con D1 isolato; `excel-worker.spec.ts` genera il workbook in memoria.
- `playwright.config.ts`, `Makefile`, `README.md`: avvio locale/test/deploy riproducibile e istruzioni operative.

## Task 1: Verificare compatibilità di vinext e dipendenze

**Files:**
- Leggere: skill upstream installata da `cloudflare/vinext` (non modificare il sorgente applicativo durante questo task).
- Create: `tests/fixtures/excel-compat/worker.ts`, `tests/fixtures/excel-compat/wrangler.jsonc`.
- Test/fixture: workbook sintetico generato in memoria, non un file `.xlsx` applicativo.

**Interfacce:**
- Consuma: progetto attuale, `AGENTS.md`, specifica approvata.
- Produce: una nota di compatibilità verificata su routing, metadata, `next/headers`, `next/navigation`, rendering dinamico, ExcelJS e API Node usate oggi.

- [ ] **Step 1: Leggere il skill ufficiale di vinext e le guide locali Next pertinenti.** Se il skill manca, installarlo con il comando previsto dal skill (`npx skills add cloudflare/vinext`) e leggere il suo `SKILL.md` prima di eseguire modifiche.
- [ ] **Step 2: Eseguire il controllo di compatibilità vinext.** Run: `npx vinext check`. Registrare i warning e gli errori, senza sopprimere le API incompatibili.
- [ ] **Step 3: Verificare la dipendenza ExcelJS sul runtime Worker.** Scrivere il Worker minimo qui sotto, configurarlo con `tests/fixtures/excel-compat/wrangler.jsonc` e avviarlo con `npx wrangler dev --config tests/fixtures/excel-compat/wrangler.jsonc --port 8791`. Run in a second terminal: `curl --fail http://127.0.0.1:8791/`; Expected JSON: `{"sheet":"Compat","value":"test@example.invalid"}`.

`tests/fixtures/excel-compat/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../../node_modules/wrangler/config-schema.json",
  "name": "sito-punti-excel-compat",
  "main": "./worker.ts",
  "compatibility_date": "2026-09-26",
  "compatibility_flags": ["nodejs_compat"]
}
```

```ts
import ExcelJS from 'exceljs';

export default {
  async fetch() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Compat');
    sheet.addRow(['email', 'classe']);
    sheet.addRow(['test@example.invalid', '3CI']);
    const bytes = await workbook.xlsx.writeBuffer();
    const readBack = new ExcelJS.Workbook();
    await readBack.xlsx.load(bytes as never);
    return Response.json({
      sheet: readBack.worksheets[0].name,
      value: readBack.worksheets[0].getRow(2).getCell(1).text,
    });
  },
};
```

- [ ] **Step 4: Applicare il gate della specifica.** Se il controllo fallisce su una funzione usata dal portale o sull'importatore necessario, fermare la migrazione a quel punto e riferire la precisa incompatibilità e la scelta richiesta; non sostituire il framework né rimuovere l'importatore autonomamente.

## Task 2: Configurare l'app vinext per Workers

**Files:**
- Create/Modify: `vite.config.ts`, `wrangler.jsonc` (generato/aggiornato tramite `vinext init --platform=cloudflare`, secondo il skill upstream letto nel Task 1).
- Modify: `package.json`, `package-lock.json`, `Makefile`, `README.md`, `.gitignore`.
- Generate: `worker-configuration.d.ts` tramite `wrangler types`.

**Interfacce:**
- Consuma: compatibilità positiva del Task 1.
- Produce: script ufficiali `dev:vinext`, `build:vinext`, `start:vinext` più Make targets `start`, `build`, `deploy`; binding D1 chiamato `DB`; tipi generati `Env` con proprietà `DB: D1Database`.

- [ ] **Step 1: Installare le dipendenze e generare la configurazione ufficiale.** Eseguire `npx vinext init --platform=cloudflare` come descritto dal skill upstream e mantenere disponibili gli script esistenti finché `dev:vinext` è verificato.
- [ ] **Step 2: Configurare Worker name `sito-punti`, binding `DB`, `nodejs_compat` solo se richiesto da una dipendenza verificata e una `compatibility_date` uguale alla data effettiva di configurazione.** Aggiungere a `.gitignore` `.wrangler/`, `.dev.vars*`, `/dist/` e `.vinext/`. Non inserire token, password o credenziali nel JSONC.

Per poter usare D1 in locale prima che esista il database remoto, configurare inizialmente il binding con un ID locale sentinella e impedire a `make deploy` di usarlo:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "sito-punti-db", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "migrations" }
]
```

- [ ] **Step 3: Aggiungere il guard deploy e gli script vinext.** `make deploy` deve rifiutare il sentinel con messaggio esplicito; gli script `dev:vinext` e `build:vinext` sono generati da vinext init. Run: `npm run build:vinext`; Expected: build Worker completata e output compatibile con Wrangler.
- [ ] **Step 4: Verificare lo sviluppo locale nel runtime Worker.** Run: `npm run dev:vinext`; Expected: l'app si avvia e rende la homepage tramite l'integrazione Workers ufficiale.
- [ ] **Step 5: Generare i tipi e verificare il binding.** Run: `npx wrangler types`; poi `npx tsc --noEmit`. Expected: `Env.DB` è disponibile senza dichiarazioni duplicate o errori TypeScript.

## Task 3: Creare migrazioni D1 e fixture locale esplicita

**Files:**
- Create: `migrations/0001_initial.sql`, `migrations/0002_login_attempts.sql`, `scripts/seed-local.ts`.
- Modify: `package.json`, `playwright.config.ts`.
- Test: `tests/db.spec.ts`.

**Interfacce:**
- Consuma: binding `Env.DB` del Task 2.
- Produce: `npm run db:migrate:local`, `npm run db:seed:local` e un binding D1 locale isolato dalla produzione.

- [ ] **Step 1: Scrivere test di schema e isolamento.** Verificare che le tabelle `crews`, `users`, `sessions`, `reset_tokens`, `login_attempts`, `routes`, `islands`, `daily`, `grades`, `dreams`, `mysteries` e `imported_rows` esistano dopo la migrazione; verificare inoltre che la migrazione da sola lasci `SELECT COUNT(*) FROM users` uguale a `0`.

Per la parte di persistenza, `tests/db.spec.ts` deve usare il server configurato in `playwright.config.ts`:

```ts
import { expect, test } from '@playwright/test';

test('D1 keeps a registered account available to a later request', async ({ request }) => {
  const email = `d1-${Date.now()}@example.invalid`;
  const input = { email, password: 'synthetic-test-password', confirm: 'synthetic-test-password', first: 'Ada', last: 'Lovelace', classCode: '3CI' };
  expect((await request.post('/api/auth/register', { data: input })).status()).toBe(200);
  expect((await request.post('/api/auth/logout')).status()).toBe(200);
  expect((await request.post('/api/auth/login', { data: { email, password: input.password } })).status()).toBe(200);
});
```
- [ ] **Step 2: Verificare il fallimento prima della migrazione.** Run: `npx wrangler d1 execute sito-punti-db --local --command "SELECT name FROM sqlite_master WHERE type = 'table'"`; Expected: database locale non ancora inizializzato o tabelle assenti.
- [ ] **Step 3: Trasferire lo schema SQLite attuale in SQL versionato.** In `0001_initial.sql`, includere i tre campi daily (`multiverse_points`, `fruit_points`, `fruit_note`), chiavi esterne e vincoli `UNIQUE`; non includere `INSERT` demo o l'admin automatico. In `0002_login_attempts.sql`, creare la tabella con chiave hash, numero tentativi, inizio finestra e blocco fino; nessun IP o email in chiaro.

```sql
-- migrations/0002_login_attempts.sql
CREATE TABLE login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);

-- excerpts from migrations/0001_initial.sql
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE daily (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  presence TEXT NOT NULL DEFAULT 'P',
  phone TEXT NOT NULL DEFAULT '+',
  bug INTEGER NOT NULL DEFAULT 0,
  anxiety INTEGER NOT NULL DEFAULT 0,
  mystery INTEGER NOT NULL DEFAULT 0,
  weapon TEXT NOT NULL DEFAULT '',
  multiverse TEXT NOT NULL DEFAULT '',
  multiverse_points INTEGER NOT NULL DEFAULT 0,
  fruit_points INTEGER NOT NULL DEFAULT 0,
  fruit_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, user_id)
);
```

- [ ] **Step 4: Spostare i record di navigazione e gli utenti dimostrativi in `seed-local.ts`.** Creare un narratore di test e gli studenti utilizzati da Playwright con password hash PBKDF2; usare ID iniziali stabili (narratore `1`, primo studente `2`) solo nel D1 locale. Implementare il seed come script Node: creare una directory temporanea con `mkdtemp(join(tmpdir(), 'sito-punti-seed-'))`, scrivere il SQL e invocare `execFile('wrangler', ['d1', 'execute', 'sito-punti-db', '--local', '--file', sqlPath])`; rimuovere il file in `finally` e non esporre un'opzione remota.
- [ ] **Step 5: Collegare Playwright al D1 locale e usare seed esplicito.** Aggiornare `webServer` in `playwright.config.ts` per avviare `dev:vinext` con lo stato persistente Wrangler predefinito `.wrangler/state`; non usare più `DATABASE_PATH`. Creare email di test con un suffisso univoco per evitare collisioni e non cancellare l'intero database durante i test.
- [ ] **Step 6: Rieseguire controlli schema, seed e isolamento.** Run: `npm run db:migrate:local`, `npm run db:seed:local`, poi `npx wrangler d1 execute sito-punti-db --local --command 'SELECT COUNT(*) AS n FROM users'`; Expected: tabelle create; il seed locale crea le sole fixture documentate; nessun file SQLite legacy viene letto.

## Task 4: Implementare repository D1 asincroni

**Files:**
- Modify: `lib/db.ts`.
- Create: `tests/db.spec.ts` (se non creato dal Task 3).
- Test: `tests/db.spec.ts`, `tests/api.spec.ts`.

**Interfacce:**
- Consuma: `Env.DB` e schema migrato.
- Produce:
  - `all<T>(sql: string, ...params: D1Value[]): Promise<T[]>`
  - `one<T>(sql: string, ...params: D1Value[]): Promise<T | undefined>`
  - `run(sql: string, ...params: D1Value[]): Promise<{ changes: number; lastInsertRowid: number }>`
  - `batch(statements: D1PreparedStatement[]): Promise<D1Result[]>`
  - `createUser(input: { email: string; password: string; first: string; last: string; classCode: string; role?: 'admin' | 'student'; crewId?: number; roles?: string }): Promise<number>`
  - funzioni di dominio asincrone `userById`, `scoreFor`, `leaderboard`, `leaderboardForRange`; `dailyPoints` resta sincrona e pura.

- [ ] **Step 1: Scrivere test d'integrazione contro il D1 locale.** In `tests/db.spec.ts`, creare utente via API, fare logout, ripetere login in una richiesta successiva e verificare che la sessione e l'account persistano. Nei test UI coprire punteggio e classifica con fixture locali.
- [ ] **Step 2: Eseguire i test e controllare che falliscano prima del repository D1.** Run: `npx playwright test tests/db.spec.ts`; Expected: FAIL contro l'app attuale perché il Worker/D1 non è ancora collegato.
- [ ] **Step 3: Implementare accesso tramite `import { env } from 'cloudflare:workers'` e `env.DB.prepare(sql).bind(...params)`.** `all` legge `result.results`, `one` usa `first`, `run` converte `meta.changes` e `meta.last_row_id` nei nomi del contratto. Eliminare singleton, `DatabaseSync`, `mkdirSync`, path locale e PRAGMA di runtime.

```ts
import { env } from 'cloudflare:workers';

export async function one<T>(sql: string, ...params: D1Value[]): Promise<T | undefined> {
  return (await env.DB.prepare(sql).bind(...params).first<T>()) ?? undefined;
}
```

- [ ] **Step 4: Convertire i calcoli di dominio in `Promise` senza cambiare il risultato JSON/UI.** Attendere ogni query a monte e mantenere i pareggi classifica stabili secondo il comportamento attuale.
- [ ] **Step 5: Rieseguire test d'integrazione e typecheck.** Run: `npx playwright test tests/db.spec.ts && npx tsc --noEmit`; Expected: PASS.

## Task 5: Portare password, sessioni e bootstrap narratore su Web Crypto

**Files:**
- Create: `lib/passwords.ts`, `scripts/bootstrap-admin.ts`, `tests/auth-crypto.spec.ts`.
- Modify: `lib/auth.ts`, `lib/db.ts`, `package.json`.
- Test: `tests/auth-crypto.spec.ts`, `tests/db.spec.ts`.

**Interfacce:**
- Consuma: repository D1 asincroni del Task 4.
- Produce:
  - `hashPassword(password: string): Promise<{ salt: string; hash: string }>`
  - `verifyPassword(password: string, salt: string, hash: string): Promise<boolean>`
  - `sha256Hex(value: string): Promise<string>`
  - `currentUser(): Promise<User | null>`, `createSession(userId: number): Promise<void>`, `clearSession(): Promise<void>`.

- [ ] **Step 1: Scrivere test auth attraverso le route.** In `tests/auth-crypto.spec.ts`, verificare password valida/invalida via login, registrazione dello stesso indirizzo con conflitto, cookie HttpOnly/SameSite/path/max-age, logout, poi nuovo login. Dopo un login, ispezionare `sessions` con una query D1 locale e verificare che `token_hash` sia l'hash esadecimale del cookie, non il token grezzo.
- [ ] **Step 2: Eseguire i test per osservare il fallimento.** Run: `npx playwright test tests/auth-crypto.spec.ts`; Expected: FAIL prima della nuova implementazione Worker.
- [ ] **Step 3: Implementare PBKDF2 con `crypto.subtle.importKey`/`deriveBits`, SHA-256 e salt da `crypto.getRandomValues`.** Usare 600.000 iterazioni e 256 bit esatti, confrontare gli hash senza uscita anticipata.

```ts
const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, key, 256,
  );
  return { salt: toHex(salt), hash: toHex(new Uint8Array(bits)) };
}
```

- [ ] **Step 3a: Misurare il costo della derivazione in Workerd prima di abilitare il login remoto.** Eseguire 20 derivazioni di test sul runtime locale, scartare le prime 2, registrare mediana e massimo in una nota di compatibilità senza password o hash. Confrontare con i 10 ms CPU per richiesta del piano Free. Se il massimo è pari/superiore a 10 ms, non distribuire auth su Free e chiedere se mantenere PBKDF2 600.000 con piano Workers Paid o autorizzare parametri più bassi. La stima Workerd non sostituisce il controllo dei consumi dopo il primo login remoto.

- [ ] **Step 4: Rendere le operazioni di sessione asincrone.** Generare il token con Web Crypto, conservare in D1 solo `sha256Hex(token)`, impostare cookie HttpOnly/SameSite=Lax/path `/`/14 giorni e Secure quando l'ambiente è produzione; invalidare la sessione nel logout e pulire sessioni/reset token scaduti con statement parametrizzati.
- [ ] **Step 5: Implementare lo script bootstrap locale/remoto.** Accettare soltanto `--local` o `--remote`; chiedere email e password senza echo; validare input; derivare hash PBKDF2 con Web Crypto/Node Web Crypto. Scrivere SQL temporaneo con permessi `0600`, quindi eseguire con `execFile('wrangler', ['d1', 'execute', 'sito-punti-db', scope, '--file', sqlPath])` dove `scope` è esattamente `--local` oppure `--remote`; cancellare il file anche su errore e rifiutare il bootstrap se un admin esiste già. Nessuna password in argv, log, fixture o sorgente.
- [ ] **Step 6: Testare password/sessioni e rigetto di un secondo bootstrap sul D1 locale; quindi eseguire `npx playwright test tests/auth-crypto.spec.ts tests/db.spec.ts && npx tsc --noEmit`.** Expected: PASS. L'hash PBKDF2 deve essere verificato da un accesso riuscito dopo registrazione; un hash differente deve essere rifiutato.

## Task 6: Convertire route di autenticazione e pagine server

**Files:**
- Modify: `app/api/auth/[action]/route.ts`, `app/page.tsx`, `app/[slug]/page.tsx`, `lib/auth.ts`, `package.json`, `package-lock.json`.
- Test: `tests/api.spec.ts`, `tests/site.spec.ts`.

**Interfacce:**
- Consuma: helper D1 e Web Crypto dei Task 4-5.
- Produce: POST API `login`, `register`, `logout`, `change-password`, `forgot`, `reset`; pagine server con tutte le query DB attese.

- [ ] **Step 1: Scrivere test API per registrazione duplicata, login buono/cattivo, cookie di sessione, logout, cambio password, origine esterna e limite tentativi.** Le fixture devono essere create nel D1 di test; aggiornare i test che ora accedono a `@demo.local`.

```ts
import { expect, test } from '@playwright/test';

const validStudent = {
  email: `student-${Date.now()}@example.invalid`, password: 'synthetic-test-password',
  confirm: 'synthetic-test-password', first: 'Ada', last: 'Lovelace', classCode: '3CI',
};
const register = await request.post('/api/auth/register', { data: validStudent });
expect(register.status()).toBe(200);
const duplicate = await request.post('/api/auth/register', { data: validStudent });
expect(duplicate.status()).toBe(409);
```

- [ ] **Step 2: Rendere D1 asincrono in ogni branch auth e togliere `runtime = 'nodejs'`.** Attendere tutte le letture, scritture e hash; usare la migrazione `0002_login_attempts` con chiave SHA-256 di email normalizzata e IP Cloudflare, massimo 5 errori in 15 minuti, cancellando il contatore su login riuscito.
- [ ] **Step 3: Rimuovere Nodemailer dal runtime e dalle dipendenze.** Eseguire `npm uninstall nodemailer @types/nodemailer` e `npm install` per allineare il lockfile. `forgot` risponde sempre `503` con “Il servizio mail non è ancora configurato. Contatta il narratore.” quando il binding email manca; non creare token in quel caso e non fingere di avere inviato una mail. Mantenere il branch `reset` solo per token validi creati da un futuro flusso email.
- [ ] **Step 4: Convertire `app/page.tsx` e `app/[slug]/page.tsx` in attesa esplicita di ogni repository asincrono.** Non spostare query in Client Components e non cambiare le guardie dei ruoli.
- [ ] **Step 5: Eseguire test auth/browser e typecheck.** Run: `npx playwright test tests/auth-crypto.spec.ts tests/db.spec.ts tests/api.spec.ts tests/site.spec.ts && npx tsc --noEmit`; Expected: tutti i test passano sul Worker locale con binding D1.

## Task 7: Convertire API amministrative e importazione

**Files:**
- Modify: `app/api/admin/[action]/route.ts`, `app/api/data/route.ts`.
- Test: `tests/api.spec.ts`, `tests/excel-worker.spec.ts`.

**Interfacce:**
- Consuma: query D1 asincrone, `batch`, helper di origine e ruoli.
- Produce: API admin con risposte esistenti, operazioni di registro/import atomiche e rifiuto esplicito dell'email non configurata.

- [ ] **Step 1: Aggiungere test prima della conversione.** Coprire GET dati consentita/vietata e data impossibile; voto valido/non valido; aggiornamento rotta, ciurma, ruolo, misteri/indizi; import `.xlsx` sintetico con foglio riconosciuto e rollback se una scrittura fallisce.
- [ ] **Step 2: Rendere tutte le query API asincrone e togliere `runtime = 'nodejs'`.** Mantenere i controlli `currentUser`, role admin e same-origin prima delle mutazioni.
- [ ] **Step 3: Sostituire `BEGIN/COMMIT/ROLLBACK` non supportati dal flusso applicativo con `DB.batch()` atomici.** Costruire e validare le statement prima del batch; per import/update preparare le letture di risoluzione prima delle scritture. Non eseguire importazioni remote di prova.
- [ ] **Step 4: Eseguire i test API/import con dati sintetici.** Run: `npx playwright test tests/api.spec.ts tests/excel-worker.spec.ts`; Expected: PASS. Se ExcelJS non carica il workbook nel Worker, fermarsi e chiedere decisione prima di sostituire il parser.

## Task 8: Verificare flussi UI, test e documentazione di sviluppo

**Files:**
- Modify: `tests/api.spec.ts`, `tests/site.spec.ts`, `playwright.config.ts`, `Makefile`, `README.md`, `package.json`.
- Test: suite Playwright completa sul binding D1 locale.

**Interfacce:**
- Consuma: Worker e tutte le API convertite.
- Produce: `make start`, `make test`, `make typecheck`, `make build`, `make deploy` con i comandi vinext/Wrangler correnti.

- [ ] **Step 1: Aggiornare fixture E2E.** Creare in D1 locale un narratore e studenti tramite lo stesso PBKDF2 di produzione; includere una classe, una rotta oltre Capodanno, un voto e un registro per coprire schermate già presenti.
- [ ] **Step 2: Verificare le pagine principali e ruoli.** Run: `npx playwright test tests/site.spec.ts`; Expected: homepage, login, profilo, rotte e area narratore visibili, studente respinto dall'area narratore.
- [ ] **Step 3: Verificare le API sul server Worker locale.** Run: `npx playwright test tests/api.spec.ts`; Expected: status, JSON e persistenza coerenti con i contratti attuali.
- [ ] **Step 4: Allineare Makefile/README agli script esistenti.** Documentare D1 locale, seed locale, bootstrap narratore interattivo, recupero password non disponibile, build/deploy; nessun comando di seed contiene `--remote`.
- [ ] **Step 5: Eseguire typecheck, test, build e dry run.** Run: `make typecheck`, `make test`, `make build`, `npx @vinext/cloudflare deploy --dry-run`; Expected: nessun errore e asset Worker generati.

## Task 9: Creare D1 remoto e distribuire su `workers.dev`

**Files:**
- Modify: `wrangler.jsonc` con ID generato del D1 (non credenziali).
- Operazioni remote: creare D1 `sito-punti-db`, applicare migrazioni remote, distribuire Worker `sito-punti`.

**Interfacce:**
- Consuma: build/dry-run verdi, account Cloudflare collegato e specifica approvata.
- Produce: URL `workers.dev`, binding `DB` remoto funzionante, migrazioni registrate e database remoto ancora privo di righe applicative.

- [ ] **Step 1: Verificare via Cloudflare MCP che il nome Worker e il D1 non esistano già nell'account collegato.** Usare `mcp__cloudflare__search` per risolvere l'endpoint OpenAPI del D1 list e Workers list, quindi `mcp__cloudflare__execute` in sola lettura; non mostrare token o credenziali.
- [ ] **Step 2: Creare il D1 remoto `sito-punti-db` tramite Cloudflare API MCP e collegarlo al binding `DB`.** Prima della scrittura, risolvere con `mcp__cloudflare__search` lo schema dell'endpoint create D1; usare `mcp__cloudflare__execute` con il nome esatto e account già collegato; salvare l'ID restituito in `wrangler.jsonc` e verificare che sia il nuovo database vuoto.
- [ ] **Step 3: Applicare esclusivamente le migrazioni di schema.** Run: `npx wrangler d1 migrations apply sito-punti-db --remote`; controllare che ci siano tabelle e zero righe in `users`, `daily`, `grades`, `imported_rows`.
- [ ] **Step 4: Distribuire il Worker.** Eseguire `npx @vinext/cloudflare deploy`; se la CLI Worker non è autenticata, usare il flusso OAuth Cloudflare già autorizzato nel thread. Non assegnare un dominio personalizzato e non creare DNS/email.
- [ ] **Step 5: Eseguire smoke test anonimi sull'URL `workers.dev`.** Verificare homepage, origin check, login senza account (rifiuto corretto), endpoint dati privato e messaggio `503` esplicito per recupero email non configurato. Non inserire dati scolastici reali.
- [ ] **Step 6: Lasciare il bootstrap narratore come operazione interattiva dell'operatore.** Non creare un admin con credenziali note o predefinite; documentare il comando `npm run bootstrap:admin -- --remote` che richiede la password senza echo. Non eseguire finché l'operatore non fornisce interattivamente le proprie credenziali.

## Revisione del piano contro la specifica

- Vinext, documenti Next locali e controllo di compatibilità: Task 1-2.
- D1 asincrono, migrazioni, binding e database remoto vuoto: Task 2-4 e Task 9.
- PBKDF2, sessioni hashate, cookie, login throttle, ruoli e bootstrap esplicito: Task 5-6 e Task 9.
- Importatore Excel, test sintetico e nessun file reale: Task 1 e Task 7.
- Nodemailer rimosso dal runtime ed email non configurata dichiarata: Task 6.
- Pagine, API, persistenza, test browser/API, build e dry run: Task 6-8.
- Deployment `workers.dev`, nessun dominio/email e nessun dato demo remoto: Task 9.

Controllo di completezza: i task elencano comandi e risultati attesi, e i nomi dei helper e i tipi D1 sono uniformi tra i task. I passi di deploy dipendono dalle versioni effettive generate dal skill ufficiale di vinext e Wrangler, come richiesto dal gate di compatibilità.
