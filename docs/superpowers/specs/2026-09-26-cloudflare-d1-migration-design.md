# Migrazione Cloudflare Workers e D1 — sito-punti

**Stato:** bozza pronta per la revisione dell’utente

**Data:** 2026-09-26

**Progetto:** `/Users/massimiliano/Desktop/vibecoding/sito-punti`

## Obiettivo

Portare il portale scolastico esistente su Cloudflare Workers con un database D1, mantenendo interfaccia e funzioni attuali. D1 usa SQLite, ma le query dal Worker sono asincrone e passano da un binding. L’autenticazione deve funzionare sul runtime Workers senza Supabase. Il caricamento e la mappatura del file Excel restano alla fase successiva, quando l’utente fornirà il workbook.

## Stato attuale e vincoli verificati

- Il progetto usa Next.js 16.3.6, React 19 e `node:sqlite` tramite `DatabaseSync`.
- `lib/db.ts` contiene la persistenza e circa 55 chiamate ai helper sincroni nei componenti server e nelle route API.
- L’autenticazione corrente usa `scryptSync`, sessioni su SQLite e cookie HttpOnly.
- Recupero password usa Nodemailer/SMTP. L’account Cloudflare collegato non ha zone, Worker o D1; quindi non esiste un dominio mittente verificato per Cloudflare Email Sending.
- L’importatore `.xlsx` usa ExcelJS. La compatibilità con Workers va verificata; le regole specifiche del workbook non si inventano prima di riceverlo.
- Il database Cloudflare deve partire vuoto: non copiare gli account o i dati dimostrativi locali e non importare dati scolastici reali prima del file fornito dall’utente.

## Architettura scelta

### Next.js e runtime

Conservare l’albero `app/`, i componenti e l’interfaccia. Installare e seguire la skill upstream ufficiale di vinext, eseguire `vinext check` e verificare le funzioni usate dal progetto. Cloudflare raccomanda vinext per Next.js su Workers, ma lo dichiara in beta; se il controllo trova una incompatibilità che impedisce una funzione necessaria, fermarsi e chiedere una decisione prima di sostituire il framework o eliminare funzioni.

Configurare un percorso di sviluppo/build/deploy Workers affiancato a quello Next esistente durante la migrazione. Usare `wrangler.jsonc` e una data di compatibilità pari al giorno della configurazione. Abilitare log e trace Workers. Generare i tipi dei binding con Wrangler, senza duplicare manualmente i tipi `Env`.

### Database

Usare D1 come database SQLite gestito e binding `DB`. Spostare lo schema attuale in migrazioni SQL versionate e riscrivere il layer dati come repository asincrono basato su `prepare().bind().first()`, `all()`, `run()` e `batch()`.

Usare D1 locale persistente per sviluppo e test. Il D1 remoto parte senza righe; non collegarlo al file SQLite locale né a un database di produzione condiviso. Mantenere i nomi delle tabelle e i contratti dati correnti, così i componenti e le API conservano il comportamento del portale. Conservare l’importazione `.xlsx` se il controllo di compatibilità e una prova con un workbook sintetico confermano che ExcelJS funziona sul runtime Workers; altrimenti fermarsi e scegliere un parser compatibile prima di modificare la funzione.

### Autenticazione e autorizzazioni

Mantenere registrazione studenti, accesso, uscita, cambio password e ruoli studente/narratore. Implementare la derivazione password con Web Crypto `PBKDF2-HMAC-SHA-256`, salt casuale distinto di 16 byte, 600.000 iterazioni e chiave derivata di 256 bit. Conservare solo salt e hash. Applicare un limite ai tentativi di accesso per contenere l’abuso del costo di hashing.

Generare token di sessione imprevedibili con Web Crypto; conservare in D1 soltanto l’hash SHA-256 del token. Il cookie sarà `HttpOnly`, `Secure` in produzione, `SameSite=Lax`, limitato al percorso `/`, con scadenza di 14 giorni. Conservare i controlli same-origin e i controlli di ruolo sulle pagine e sulle API.

Creare il primo narratore con una procedura esplicita di bootstrap che riceve l’email e la password fuori dal codice versionato; niente credenziali demo sul database remoto.

Il recupero via email rimane esplicitamente non disponibile finché non esistono un dominio mittente verificato e il binding Cloudflare Email Sending. In seguito sostituire Nodemailer con il binding `send_email`; non mostrare un messaggio di successo quando l’invio non è configurato. Non creare una zona DNS né cambiare record senza il dominio scelto dall’utente.

La registrazione e le pagine pubbliche sul preview `workers.dev` saranno raggiungibili da Internet. I dati scolastici restano assenti da D1 fino all’import approvato; le route private richiedono sessione valida e i controlli di ruolo esistenti.

### Dati Excel

Non importare né generare dati fittizi per il database remoto. Mantenere lo schema e l’endpoint di importazione compatibili solo se la dipendenza passa il controllo Workers. Dopo la consegna del file, eseguire una fase separata di analisi e mappatura con test di anteprima e validazione prima di qualsiasi import effettivo.

## Distribuzione Cloudflare

Creare un database D1 e un Worker nuovi nell’account collegato, con nomi coerenti con il repository (`sito-punti-db` e `sito-punti`). Applicare le migrazioni al D1 remoto, poi distribuire la build validata su `workers.dev`, senza dominio personalizzato. Il database remoto resta senza account fino al bootstrap esplicito del narratore e senza dati scolastici fino all’import approvato. Non impostare domini o servizi email senza dominio fornito e verificato.

## Verifica e criteri di completamento

1. `vinext check` documenta compatibilità e incompatibilità effettive prima della conversione.
2. Typecheck, build vinext e `wrangler deploy --dry-run` passano; i tipi dei binding sono generati da Wrangler.
3. Le migrazioni applicano tutto lo schema in D1 locale e remoto; letture e scritture restano persistenti tra richieste.
4. Test API e browser coprono registrazione, accesso, sessione, uscita, ruoli, cambio password, pagine principali e operazioni amministrative.
5. L’importatore `.xlsx` è coperto da un test con un workbook sintetico se ExcelJS è compatibile; nessun file reale viene caricato durante questa migrazione.
6. Il Worker su `workers.dev` usa D1, non il file SQLite locale, non contiene credenziali demo e permette i flussi autenticati previsti.
7. Le risposte di recupero password dichiarano l’assenza di configurazione email finché il mittente Cloudflare non è pronto.

## Rischi e dipendenze

- vinext è beta e potrebbe non coprire tutte le API Next.js usate.
- D1 è asincrono: i punti di accesso sincroni devono essere convertiti fino alle pagine e alle route chiamanti.
- ExcelJS e Nodemailer sono dipendenze Node; Nodemailer va rimosso dal runtime Workers e ExcelJS va provato prima di conservarlo.
- L’invio email dipende da un dominio verificato non presente nell’account attuale.
- La mappatura e il caricamento dei dati reali dipendono dal workbook che l’utente invierà in seguito.

## Fonti

- [Cloudflare: Next.js su Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare: D1 Workers Binding API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare: Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [OWASP: Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
