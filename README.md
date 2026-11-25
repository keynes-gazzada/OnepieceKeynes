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

Per provare la visualizzazione studente su questo computer, avvia `npm run dev:student-preview` e visita `http://127.0.0.1:3002/accedi`. L'account è `prova.studente@demo.local`, password `ProvaStudente2026!`. Il comando usa esclusivamente `.data/student-preview.sqlite`, con dati dimostrativi distinti da quelli reali; l'account non è attivo sul sito pubblicato.

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

Gli account e i dati dimostrativi sono disabilitati per impostazione predefinita, anche nello sviluppo locale. Solo gli ambienti di test che impostano esplicitamente `ENABLE_DEMO_DATA=true` li abilitano. Gli account demo preesistenti non possono autenticarsi e le loro sessioni non sono valide quando l’opzione è disabilitata. Configurare `ADMIN_EMAIL` e `ADMIN_PASSWORD` per inizializzare un Narratore reale su SQLite.

Il database SQLite locale è `.data/one-piece.sqlite` e non è versionato. Con `SUPABASE_DATABASE_URL` presente, il registro usa PostgreSQL sul progetto Supabase. Imposta `DATABASE_DRIVER=sqlite` per forzare il database locale o `DATABASE_DRIVER=postgres` per richiedere la connessione remota. `ADMIN_EMAIL` e `ADMIN_PASSWORD` inizializzano un database SQLite nuovo; la migrazione a Supabase conserva utenti e password esistenti. Configura `APP_URL` con l'URL pubblico. I dati dimostrativi si creano soltanto su SQLite con l’opzione esplicita abilitata.

## Funzioni

Il menu **Classifiche** è visibile solo dopo l'accesso. Il Narratore trova anche **Planning** dopo la voce Narratore. Per chi non è autenticato, **Accedi / Registrati** rimane a destra, anche sui telefoni. Le regole sono pubbliche; il Narratore può modificare titoli, descrizioni e indirizzi delle immagini e aggiungere nuovi capitoli.

Il Narratore seleziona classe, data e **TPSIT** o **SER** prima di compilare il registro. Ogni materia ha una lezione distinta, mentre taglia, classifica e totale della giornata sommano tutte le lezioni. Le nuove righe hanno presenza P e telefono + preselezionati; le checkbox nelle intestazioni applicano o azzerano questi valori solo per gli studenti visibili. Il registro mostra nome e stemma della ciurma. **Bug e Ansia sono contatori**: ogni episodio moltiplica il relativo punteggio, compresa la penalità dell’ansia.

Le modifiche alle celle del registro sono salvate automaticamente, con segnalazione degli errori e possibilità di riprovare. Le altre finestre di gestione usano i propri pulsanti di salvataggio. È possibile associare Pluton a un voto: i punti della prova vengono raddoppiati, e rimuovendo l'associazione tornano al valore originale. I Multiversi possono essere registrati individualmente con data e descrizione; ciascuno usa il valore configurato al momento dell'inserimento.

Nella colonna **Indizio** il Narratore sceglie descrizione, data e punti da assegnare a ciascuno: il movimento viene registrato per tutti i membri attuali della ciurma. Il documento indica i punti del mistero risolto, ma non specifica un valore per il singolo indizio, quindi il valore viene richiesto esplicitamente.

**Planning** contiene le tabelle modificabili Planning e Studenti e accetta il file con entrambi i fogli del modello ricevuto. Il foglio Planning aggiunge lezioni; il foglio Studenti aggiorna gli studenti, le classi, le ciurme e le relative schede nella pagina. I campi del foglio lasciati vuoti non cancellano le informazioni già presenti nella scheda. Per entrate e uscite si selezionano tipo, ora di lezione e orario; il valore originale del foglio viene conservato anche quando non è interpretabile come due orari.

Se lo stesso studente viene riconosciuto senza ambiguità nella classe immediatamente successiva della stessa sezione, il passaggio conserva account, voti e punti. I casi non riconoscibili vengono segnalati. Nell’**importazione annuale** il Narratore carica l’elenco completo, controlla l’anteprima degli studenti di quinta assenti e conferma la rimozione dei loro account e dati collegati. L’elenco da eliminare viene verificato nuovamente prima del salvataggio; le importazioni ordinarie non rimuovono studenti. La pulizia non analizza testi liberi condivisi né backup esterni. Il download dalla sezione Upload del Narratore esporta i dati del registro in fogli di consultazione; non è un backup completo né un modello di importazione.

**Voti della classe** apre una finestra con data e tipologia comuni agli studenti visualizzati, nel loro ordine attuale. Tab passa da un voto al successivo; i campi vuoti vengono ignorati. La validazione dell’intero elenco precede il salvataggio in transazione. La finestra **Voti** dello studente mostra tutto lo storico e permette inserimento singolo, modifica di data/tipologia/voto ed eliminazione dopo conferma. I totali vengono aggiornati senza perdere le modifiche ancora da salvare nel registro.

Cliccando il **Totale punti** di uno studente si apre il dettaglio dei movimenti: voti, singole voci giornaliere, importazioni, rettifiche e punti storici. Nella stessa finestra il Narratore può aggiungere **punti extra**, specificando data, motivazione e quantità. Gli studenti accedono al proprio dettaglio dalla taglia del profilo e non possono leggere i movimenti degli altri utenti.

**Punteggi** permette di configurare le voci giornaliere e i moltiplicatori di verifiche e progetti. I valori predefiniti sono assenza −40, assenza+ −80, telefono +30, Bug +50 per episodio, Ansia −30 per episodio, Mistero +2000, Multiverso +80 per attività; verifiche ×200 e progetti ×100. Le regole pubbliche riflettono i valori salvati. Le modifiche ricalcolano le voci giornaliere anche storiche; voti, multiversi, frutti e movimenti importati o extra già assegnati conservano i punti memorizzati. Le impostazioni sono versionate nell’archivio JSON esistente (`imported_rows`, foglio riservato `__settings:point-rules`), senza richiedere nuove tabelle o migrazioni.

**Utenti** permette ricerca e filtri, modifica di nome/cognome/email/classe/ciurma/ruoli e cancellazione dopo conferma. La ciurma deve appartenere alla classe scelta. Eliminare un utente elimina anche le sue sessioni e i dati associati; non è possibile eliminare il proprio account. **Nuovo admin** crea un Narratore con la mail scolastica del docente senza cambiare la sessione di chi lo crea.

**Rotte** permette di aggiungere rotte con classe, anno, numero, nome e date, oltre a modificare nome e periodo delle rotte esistenti. Le combinazioni classe/anno/numero sono uniche. I ruoli possono essere personalizzati. L’occhietto nei **Misteri** alterna la visibilità di titolo e soluzione per gli studenti; indizi ed eliminazione restano disponibili.

La funzione **Sogno** è stata rimossa da home, registro e regole; gli endpoint di scrittura non sono più disponibili. Gli eventuali punti già assegnati restano nel saldo e nel dettaglio come “Punti storici”. Il Multiverso rimane una voce del registro.

Le classifiche degli admin comprendono tutte le classi e consentono filtri per classe, anno e rotta; gli studenti vedono solo la propria classe. Il profilo include taglia, ciurma con membri, armi ancestrali e storico rotte. I punti numerici importati sono conservati: l’importazione `.xlsx` supporta i fogli `Studenti`, `One Piece`, `Rotte`, `Ciurme`, `Taglie`, `Ruoli`, `Stagione 1`, `Stagione 2` e `Update`. La vecchia colonna Materia degli import non suddivide i movimenti né sovrascrive le lezioni TPSIT/SER. Le righe originali sono conservate e i movimenti vengono aggiornati in modo idempotente.

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
