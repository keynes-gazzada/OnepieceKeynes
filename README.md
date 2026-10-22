# OnepieceKeynes

Applicazione web sviluppata dagli studenti dell’ISIS J.M. Keynes per gestire punti, voti e classifiche di classe, con profili personali e un’esperienza ispirata a One Piece.

Portale scolastico realizzato con Next.js 16, React 19 e PostgreSQL su Supabase, con SQLite disponibile per lo sviluppo e i test. L'interfaccia segue le specifiche di `Specifiche.pdf` e usa il logo J. M. Keynes estratto dall'allegato.

La direzione visiva “One Piece edition” usa immagini ufficiali dei personaggi, senza il logo del franchise. Gli asset in `public/images/one-piece` provengono dalle schede ufficiali [Monkey D. Luffy](https://one-piece.com/character/luffy/index.html) e [Straw Hat Crew](https://one-piece.com/strawhatpirates/index.html); i relativi diritti appartengono a Eiichiro Oda/Shueisha e Toei Animation.

## Avvio

Richiede Node.js 24 o successivo. Con Supabase il server deve raggiungere il database PostgreSQL; con SQLite serve un disco scrivibile.

```bash
npm install
cp .env.example .env.local
make start
```

Apri `http://localhost:3000`.

## Hosting Cloudflare

Il sito è pubblicato su [sitopunti-keynes.one-piece-keynes.workers.dev](https://sitopunti-keynes.one-piece-keynes.workers.dev). Sono collegati anche `sitopuntikeynes.it` e `www.sitopuntikeynes.it`: il dominio richiede che Register.it deleghi i nameserver ad `amir.ns.cloudflare.com` e `paris.ns.cloudflare.com` e che Cloudflare completi l'attivazione.

Il Worker `sitopunti-keynes` usa vinext, l'adattamento Next.js raccomandato da Cloudflare. Il normale sviluppo con `npm run dev` rimane disponibile. Per aggiornare il sito:

```bash
npm run cloudflare:types
npm run typecheck
npm run deploy:vinext
```

`wrangler.jsonc` definisce account, domini, variabili pubbliche e binding Hyperdrive. Hyperdrive `keynes-registro-supabase` conserva le credenziali PostgreSQL sul servizio Cloudflare, verifica il certificato Supabase con `verify-full`, limita le connessioni di origine a 5 e disabilita la cache delle query. Il Worker apre connessioni per richiesta, mantenendo le transazioni su una sola connessione. Il codice SQLite è escluso dalla build Cloudflare; resta utilizzabile localmente e nei test.

La build non interroga il database. `dist/`, `.wrangler/`, `.dev.vars*` e `.env*` sono file locali ignorati; non caricarli manualmente in repository o archivi condivisi. Wrangler pubblica solo il codice del Worker e gli asset. Le credenziali SMTP, quando configurate, vanno aggiunte come Workers secrets; le variabili locali non vengono automaticamente caricate in produzione.

Le skill Cloudflare sono installate in `C:/Users/Admin/.agents/skills` e il server MCP autenticato è registrato nella configurazione Codex. Il deploy usa il Wrangler locale del progetto.

In sviluppo con SQLite vengono creati account e dati dimostrativi:

- Studente: `studentessa@demo.local` / `Demo1234!`
- Narratore: `narratore@demo.local` / `Demo1234!`

Il database SQLite locale è `.data/one-piece.sqlite` e non è versionato. Con `SUPABASE_DATABASE_URL` presente, il registro usa PostgreSQL sul progetto Supabase. Imposta `DATABASE_DRIVER=sqlite` per forzare il database locale o `DATABASE_DRIVER=postgres` per richiedere la connessione remota. `ADMIN_EMAIL` e `ADMIN_PASSWORD` inizializzano un database SQLite nuovo; la migrazione a Supabase conserva utenti e password esistenti. Configura `APP_URL` con l'URL pubblico. I dati dimostrativi vengono creati soltanto su SQLite fuori dalla modalità produzione.

## Funzioni

Ogni nuova giornata parte da **0 punti**, con presenza neutra e telefono non assegnato. I valori del registro sono: assenza −40, assenza+ −80, telefono +30, bug +50 per segnalazione, ansia −30, mistero +2000 e multiverso +80 per attività. Bug e Multiversi possono essere multipli nella stessa giornata. I voti assegnano voto × 200 per le verifiche, voto × 100 per i progetti. I punti numerici già importati dall'Excel restano invariati. **Totale giornata** mostra la data selezionata, comprese le modifiche da salvare; **Totale punti** mostra i punti già salvati e importati. Le intestazioni della tabella ordinano i valori in entrambe le direzioni.

Per applicare il telefono neutro come valore predefinito su Supabase, eseguire `node scripts/apply-daily-default-migration.mjs`. La migrazione cambia soltanto il valore predefinito, senza riscrivere i punti esistenti.

Il **Totale giornata** include anche i movimenti importati dall'Excel per la data selezionata, sommando tutte le materie. Questi punti si sommano alle voci del registro, ai voti e ai sogni, senza essere riscritti o duplicati quando si salva il registro.

Le voci importate Bug, Telefono, Assenza, Ansia, Mistero e Multiverso compilano anche i rispettivi controlli del registro. Nelle giornate con una lezione importata per la classe, la presenza è P salvo assenze A/A+ o altre presenze già salvate. P vale 0 punti. Le giornate senza dati hanno presenza e telefono vuoti. Il registro conserva una compensazione dei punti già importati, così salvare le voci precompilate non assegna nuovamente i punti; cambiarle aggiorna il saldo. Per aggiornare Supabase eseguire `node scripts/apply-imported-registry-migration.mjs` prima della pubblicazione.

Dal pannello Narratore, **Nuovo admin** apre il modulo di registrazione per i docenti: nome, cognome, email `nome.cognome@isiskeynes.it`, password e conferma, senza classe. La creazione è riservata agli admin già autenticati, non cambia la loro sessione e rifiuta email già registrate. Il nuovo docente accede dal normale modulo di login.

Il Narratore deve selezionare **TPSIT** o **SER** prima di compilare o salvare il registro. Non è disponibile un registro generale. È possibile compilare due registri distinti nella stessa data e per la stessa classe; ogni salvataggio modifica soltanto la materia selezionata. Anche il server rifiuta salvataggi senza materia. Le giornate già unificate e gli import Excel restano conservati nello storico e inclusi nei punti; le vecchie righe TePi sono accessibili come TPSIT. Non occorrono migrazioni del database. Taglie, profili e classifica restano unici e sommano tutte le lezioni, insieme a voti e sogni. Anche il **Totale giornata** comprende tutte le lezioni della data, incluse le modifiche da salvare nella materia aperta. I salvataggi ripetuti non duplicano i punti.

Le checkbox accanto alle intestazioni **Presenza** e **Telefono** applicano P e + a tutti gli studenti visibili, rispettando i filtri di classe e ciurma. Deselezionandole si azzera quella colonna. I Bug valgono 50 punti ciascuno; il numero di Multiversi nel dettaglio della giornata assegna 80 punti ciascuno. Le interrogazioni non sono più disponibili per nuovi voti; i punti già salvati restano nel saldo storico.

La **classifica** dell’admin parte da tutte le classi, ordinate per punti, e consente di scegliere una classe e poi filtrare per anno e rotta. Gli studenti vedono soltanto la propria classe. Nel pannello Narratore, il filtro anno consente di modificare tutte le rotte; i ruoli si possono salvare per ogni studente della classe anche senza selezionare una ciurma, usando nomi suggeriti o personalizzati. I misteri possono essere eliminati dopo conferma; i messaggi di creazione, indizi, rivelazione ed eliminazione appaiono sotto al riquadro dei misteri.

Negli Excel `Update` e `One Piece`, la vecchia colonna **Materia viene ignorata**. Gli import continuano ad alimentare lo storico e non sovrascrivono le lezioni TPSIT o SER. Le compensazioni dei punti importati restano nello storico, così i punti delle nuove lezioni si aggiungono integralmente. Nel dettaglio della taglia le lezioni della stessa giornata confluiscono in una sola voce, conservando il saldo esatto.

- Accesso, registrazione, sessioni, cambio password e recupero tramite mail SMTP configurabile.
- Home con sogni e ciurme a rotazione.
- Profilo con taglia, ciurma, armi ancestrali, dettaglio punti e storico rotte.
- Classifica filtrabile per anno e rotta, elenco rotte e isole, misteri, regole.
- Pannello Narratore con filtro data/classe/materia/ciurma, registri delle lezioni, voti, sogni, ruoli, rotte, misteri e assegnazione alle ciurme.

Il Multiverso appartiene al registro giornaliero e ai relativi punti. I sogni del Dream Log sono contenuti separati, gestiti dal Narratore nella colonna **Sogno** del registro: **Aggiungi** apre il modulo per lo studente, **Dettagli** permette di leggere, modificare ed eliminare le sue frasi. Ogni sogno può assegnare **+2, +4 oppure 0 punti**, associati alla data del registro aperto. Il salvataggio aggiorna subito il totale, la taglia e la classifica; modifica ed eliminazione aggiornano il punteggio senza duplicarlo. I sogni esistenti partono da 0 punti. Salvataggi del Multiverso e gestione dei sogni non si modificano reciprocamente. Senza frasi valide la sezione Dream Log della home rimane nascosta.

Per aggiornare un database Supabase esistente, eseguire `node scripts/apply-dream-points-migration.mjs` prima di pubblicare la versione con i punti sogno. Lo script applica la migrazione `202610060002_dream_points.sql` senza modificare le frasi esistenti.

- Importazione `.xlsx` per il registro `Punti.xlsx` (`Studenti` e `One Piece`) e per i fogli `Rotte`, `Ciurme`, `Taglie`, `Ruoli`, `Stagione 1`, `Stagione 2` e `Update`. Ogni riga è conservata nel database; studenti, ciurme e movimenti-punti vengono aggiornati in modo idempotente.

## Configurazione Supabase

I client Supabase sono in `utils/supabase/client.ts` (browser) e `utils/supabase/server.ts` (server). Il client server riceve il cookie store ottenuto con `await cookies()`. `proxy.ts`, convenzione di Next.js 16, verifica i token Supabase con `getClaims()` e conserva i cookie aggiornati. L'autorizzazione del registro rimane gestita da `lib/auth.ts`.

In `.env.local` configura `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, poi verifica URL e chiave con `npm run supabase:check`. Le variabili `NEXT_PUBLIC_` sono pubbliche: non usarle per password del database o chiavi segrete. Dopo una modifica a queste variabili, ricompila e riavvia il server in produzione.

Il registro legge e scrive PostgreSQL tramite `lib/database.ts` quando `SUPABASE_DATABASE_URL` è configurata. Copia la connection string da Supabase → Connect → Session pooler, sostituisci `[YOUR-PASSWORD]` e codifica i caratteri riservati della password nella URI. Le query avvengono sul server; il client pubblico non accede al registro. Le 12 tabelle sono nello schema privato `keynes`, con Row Level Security abilitata senza policy pubbliche. Gli account, gli hash delle password e le sessioni del registro vengono conservati: il login resta quello dell'applicazione.

La connessione TLS verifica il certificato con la CA Supabase inclusa in `supabase/certs/prod-ca-2021.crt`. Per usare un'altra CA imposta `SUPABASE_CA_CERT_PATH` e rendi il file disponibile sul server.

Per trasferire un registro SQLite a uno schema `keynes` vuoto:

```bash
npm run supabase:migrate
# Ferma il server prima del trasferimento, per evitare scritture durante la copia.
npm run supabase:migrate -- --apply
npm run supabase:check
npm run supabase:verify
npm run build
npm run start
```

Il primo comando controlla la connessione ed elenca i dati senza modificarli. `--apply` crea un backup in `.data/backups`, applica lo schema SQL, trasferisce le righe e ne verifica il contenuto prima di confermare la transazione. Rifiuta di sovrascrivere uno schema contenente dati. Il file SQLite originale viene conservato e non riceve le nuove scritture dopo il passaggio a Supabase. `supabase:verify` prova importazione Excel e scritture in una transazione che viene annullata al termine.

## Configurazione mail

In produzione il recupero password usa Resend via HTTPS, con `EMAIL_PROVIDER=resend`, `EMAIL_FROM=Keynes Grand Line <noreply@sitopuntikeynes.it>` e `APP_URL=https://sitopuntikeynes.it` già definiti in Wrangler. L'invio resta inattivo finché manca il secret `RESEND_API_KEY` o la verifica del dominio su Resend.

Per attivarlo:

1. Crea un account gratuito su [Resend](https://resend.com/signup) e aggiungi `sitopuntikeynes.it` in **Domains**, preferibilmente nella regione europea.
2. Aggiungi in Cloudflare DNS i record DKIM e SPF/MX mostrati da Resend, con proxy disattivato. Copia i valori effettivi forniti dal servizio; non sono universali. Per il solo invio non abilitare la ricezione e non modificare i record MX del dominio principale. Attendi lo stato **Verified**. Disabilita il click tracking per mantenere diretti i link di recupero password.
3. Crea una API key con permesso **Sending access**, limitata a quel dominio. Inseriscila in Cloudflare, Worker `sitopunti-keynes` → **Settings → Variables and Secrets**, come secret `RESEND_API_KEY`. Non inserirla in Git o in chat. In alternativa usa `npx wrangler secret put RESEND_API_KEY --config wrangler.jsonc` e incolla la chiave nel prompt protetto.
4. Esegui `npm run deploy:vinext` dopo le modifiche al codice/configurazione. Prova **Password dimenticata** con un account registrato di cui controlli la casella e verifica l'arrivo del link. Le simulazioni locali non provano la consegna reale.

Il link scade dopo un'ora, viene conservato nel database solo come hash e può essere usato una volta. Un invio fallito elimina il token appena creato; le richieste ripetute entro un minuto vengono limitate. Il sito dichiara l'invio solo dopo l'accettazione da parte del servizio email.

Dopo una registrazione studente riuscita, lo stesso servizio invia anche un'email di benvenuto con nome, classe e collegamento al profilo. L'invio viene eseguito con `after()` dopo la risposta, usa una chiave di idempotenza per studente e non include password o token di accesso. Un errore di consegna non annulla l'account né la sessione; viene registrato un messaggio generico nei log. Non vengono inviate email retroattive agli account esistenti.

Resta disponibile SMTP impostando `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` e `APP_URL`. Le credenziali SMTP devono essere Workers secrets. Senza la configurazione necessaria il sito mostra un messaggio esplicito e non dichiara inviata una mail. I DNS si gestiscono su Cloudflare; il dominio può rimanere registrato su Register.it.

## Importazione del registro

Il registro fornito può essere caricato dal pannello Narratore oppure da terminale con `npm run import:punti -- "percorso/Punti.xlsx"`. Entrambi usano il database configurato, Supabase o SQLite. I profili del foglio `Studenti` restano non registrati finché lo studente non attiva l'account inserendo la mail scolastica e scegliendo la password. Nome, cognome e classe vengono recuperati dall'elenco e sono di sola lettura; anche il server ricava i dati dall'elenco, ignorando dati personali eventualmente modificati nella richiesta. Chi non è nell'elenco non può registrarsi. È accettata soltanto la mail scolastica nel formato `s-cognome.nome@isiskeynes.it` (senza spazi nei nomi composti). Se l'importazione ha diviso male un cognome composto, la mail indica il confine fra cognome e nome: per esempio `s-calderonsegovia.michael@isiskeynes.it` recupera **Calderon Segovia / Michael**. Tutte le parole del nome completo devono corrispondere, senza abbreviazioni. All'attivazione i dati vengono corretti sul profilo esistente e lo studente conserva ciurma e storico punti già importati. Se la stessa mail normalizzata corrisponde a più studenti, occorre far correggere l'elenco al narratore.

I collegamenti YouTube, GitHub e mail presenti nel footer si configurano con `YOUTUBE_URL`, `GITHUB_URL` e `CONTACT_EMAIL`.

## Verifiche

```bash
npm run typecheck
npm run build
npx playwright install chromium
make test
```

`make test` avvia un server Next.js temporaneo e forza SQLite su un database separato dai dati locali, anche se `.env.local` contiene la connessione Supabase. `npm run supabase:verify` verifica separatamente il backend PostgreSQL con dati di prova che vengono annullati tramite rollback.
