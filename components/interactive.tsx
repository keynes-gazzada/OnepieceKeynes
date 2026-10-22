'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  Pause,
  Play,
  ShipWheel,
  Skull,
  Waves,
  Wind,
} from 'lucide-react';
import type { Crew } from '@/lib/db';
import { navigateAfterAuth } from '@/lib/auth-navigation';
import crewStyles from '@/app/home-crews.module.css';
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="logout-control">
      <button
        type="button"
        className="logout-button"
        title={busy ? 'Uscita in corso…' : 'Esci'}
        aria-label="Esci"
        aria-busy={busy}
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const response = await fetch('/api/auth/logout', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            });
            if (!response.ok) throw new Error('Uscita non riuscita. Riprova.');
            // Start a fresh document after changing the session cookie so shared
            // layouts and prefetched routes cannot retain the previous account.
            navigateAfterAuth('/');
          } catch {
            setError('Uscita non riuscita. Riprova.');
            setBusy(false);
          }
        }}
      >
        <LogOut size={18} />
      </button>
      {error ? (
        <p className="logout-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function CrewEmblem({
  flag = 'skull',
  name = '',
  size = 'regular',
}: {
  flag?: string;
  name?: string;
  size?: 'regular' | 'large';
}) {
  const image = flag.startsWith('/images/');
  const icon =
    flag === 'wave' ? (
      <Waves />
    ) : flag === 'wind' ? (
      <Wind />
    ) : flag === 'sun' ? (
      <ShipWheel />
    ) : (
      <Skull />
    );
  return (
    <div className={`crew-emblem ${size} ${image ? 'has-image' : ''}`}>
      {image ? (
        <Image
          src={flag}
          alt={name ? `Stemma della ciurma ${name}` : 'Stemma della ciurma'}
          fill
          sizes={size === 'large' ? '105px' : '49px'}
          className="crew-emblem-image"
        />
      ) : (
        <>
          {icon}
          <span className="emblem-cross">✦</span>
        </>
      )}
    </div>
  );
}
export function DreamCarousel({
  dreams,
}: {
  dreams: { text: string; first_name: string; last_name: string; class_code: string }[];
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (dreams.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setIndex(Math.floor(Math.random() * dreams.length));
    const timer = setInterval(
      () =>
        setIndex((i) => (i + 1 + Math.floor(Math.random() * (dreams.length - 1))) % dreams.length),
      7000,
    );
    return () => clearInterval(timer);
  }, [dreams.length]);
  if (!dreams.length) return null;
  const dream = dreams[index];
  return (
    <div className="dream-card">
      <div className="carousel-scene dream-scene" key={index}>
        <span className="quote-mark">“</span>
        <blockquote>“{dream.text}”</blockquote>
      </div>
      <div className="carousel-bottom">
        <span key={`author-${index}`}>
          {dream.first_name} {dream.last_name}, {dream.class_code}
        </span>
        <div className="carousel-controls">
          <button
            aria-label="Sogno precedente"
            onClick={() => setIndex((i) => (i - 1 + dreams.length) % dreams.length)}
          >
            <ChevronLeft size={20} />
          </button>
          <span>
            {String(index + 1).padStart(2, '0')} / {String(dreams.length).padStart(2, '0')}
          </span>
          <button
            aria-label="Sogno successivo"
            onClick={() => setIndex((i) => (i + 1) % dreams.length)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function CrewCarousel({ crews }: { crews: Crew[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) setPlaying(false);
    const update = () => setPlaying(!reducedMotion.matches);
    reducedMotion.addEventListener('change', update);
    return () => reducedMotion.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (crews.length < 2 || !playing || hovered || focused) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % crews.length), 6500);
    return () => clearTimeout(timer);
  }, [crews.length, index, playing, hovered, focused]);
  if (!crews.length) return <p className={crewStyles.empty}>Nessuna ciurma registrata.</p>;
  const crew = crews[index % crews.length];
  return (
    <div
      className={crewStyles.carousel}
      aria-roledescription="carosello"
      aria-label="Ciurme della scuola"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div aria-live={playing && !hovered && !focused ? 'off' : 'polite'} aria-atomic="true">
        <div className={crewStyles.slide} key={crew.id}>
          <div className={crewStyles.emblem}>
            <CrewEmblem flag={crew.flag} name={crew.name} size="large" />
          </div>
          <div className={crewStyles.details}>
            <h3 className={crewStyles.name}>{crew.name}</h3>
            <span className={crewStyles.classCode}>Classe {crew.class_code}</span>
          </div>
        </div>
      </div>
      {crews.length > 1 ? (
        <div className={crewStyles.controls}>
          <button
            type="button"
            aria-label={playing ? 'Pausa scorrimento ciurme' : 'Avvia scorrimento ciurme'}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span className={crewStyles.position}>
            {String((index % crews.length) + 1).padStart(2, '0')} /{' '}
            {String(crews.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            aria-label="Ciurma precedente"
            onClick={() => setIndex((i) => (i - 1 + crews.length) % crews.length)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label="Ciurma successiva"
            onClick={() => setIndex((i) => (i + 1) % crews.length)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
const NOT_STUDENT_ERROR = 'Non risulti nell’elenco degli studenti.';

export function AuthForm({
  mode,
  token,
}: {
  mode: 'login' | 'register' | 'create-admin' | 'forgot' | 'reset';
  token?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [forgotOpen, setForgotOpen] = useState(false);
  const registration = mode === 'register' || mode === 'create-admin';
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [student, setStudent] = useState<{
    email: string;
    first: string;
    last: string;
    classCode: string;
  } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const studentMatched = student?.email === registrationEmail.trim().toLowerCase();
  useEffect(() => {
    if (mode !== 'register') return;
    const email = registrationEmail.trim().toLowerCase();
    if (!email) {
      setLookingUp(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/auth/registration-student', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setLookupError(data.error || 'Verifica della mail non riuscita.');
          return;
        }
        setStudent(data.student);
      } catch {
        if (!controller.signal.aborted) setLookupError('Impossibile verificare la mail. Riprova.');
      } finally {
        if (!controller.signal.aborted) setLookingUp(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, registrationEmail]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'register' && (!studentMatched || lookingUp)) return;
    setError('');
    setSuccess('');
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    if (token) body.token = token;
    try {
      const res = await fetch(
        mode === 'create-admin' ? '/api/admin/create-admin' : `/api/auth/${mode}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Operazione non riuscita.');
      if (mode === 'create-admin') {
        setSuccess('Admin creato. Può accedere con la mail e la password impostate.');
        formElement.reset();
      } else if (mode === 'forgot') {
        setSuccess('Controlla la tua casella di posta. Il link è valido per un’ora.');
      } else if (mode === 'reset') {
        setSuccess('Password aggiornata. Ora puoi accedere.');
      } else {
        // Authentication changes the root layout as well as the destination page.
        navigateAfterAuth(data.role === 'admin' ? '/narratore' : '/profilo');
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita.');
    }
    setBusy(false);
  }
  return (
    <>
      <form className="auth-form" onSubmit={submit}>
        <fieldset disabled={!ready} style={{ display: 'contents' }}>
          {error &&
          !(
            mode === 'register' &&
            ['Password non corrispondenti.', 'Mail già registrata.', NOT_STUDENT_ERROR].includes(
              error,
            )
          ) ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="form-success" role="status">
              {success}
            </p>
          ) : null}
          {mode !== 'reset' ? (
            <label>
              Mail
              <input
                name="email"
                value={mode === 'register' ? registrationEmail : undefined}
                onChange={
                  mode === 'register'
                    ? (e) => {
                        setRegistrationEmail(e.target.value);
                        setStudent(null);
                        setLookupError('');
                        setError('');
                        setLookingUp(Boolean(e.target.value.trim()));
                      }
                    : undefined
                }
                disabled={busy}
                type="email"
                placeholder={
                  mode === 'create-admin'
                    ? 'nome.cognome@isiskeynes.it'
                    : mode === 'register'
                      ? 's-cognome.nome@isiskeynes.it'
                      : 'nome@scuola.it'
                }
                autoComplete="email"
                autoCapitalize="none"
                required
              />
              {mode === 'register' ? (
                <small>
                  Inserisci la mail scolastica: nome, cognome e classe saranno compilati
                  automaticamente.
                </small>
              ) : null}
              {mode === 'create-admin' ? (
                <small>Usa nome.cognome@isiskeynes.it, corrispondente ai dati inseriti.</small>
              ) : null}
            </label>
          ) : null}
          {mode === 'register' && lookingUp ? (
            <p role="status">Verifico la mail nell’elenco studenti…</p>
          ) : null}
          {mode === 'register' && lookupError ? (
            <p className="form-error" role="alert">
              {lookupError}
            </p>
          ) : null}
          {mode === 'register' && error === 'Mail già registrata.' ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {registration ? (
            <div className="form-grid">
              <label>
                Cognome
                <input
                  name="last"
                  autoComplete="family-name"
                  required
                  readOnly={mode === 'register'}
                  value={mode === 'register' ? student?.last || '' : undefined}
                  placeholder={mode === 'register' ? 'Compilato dalla mail' : undefined}
                />
              </label>
              <label>
                Nome
                <input
                  name="first"
                  autoComplete="given-name"
                  required
                  readOnly={mode === 'register'}
                  value={mode === 'register' ? student?.first || '' : undefined}
                  placeholder={mode === 'register' ? 'Compilato dalla mail' : undefined}
                />
              </label>
            </div>
          ) : null}
          {mode === 'register' ? (
            <label>
              Classe
              <input
                name="classCode"
                readOnly
                value={student?.classCode || ''}
                placeholder="3CI"
                required
                pattern="[0-9][A-Za-z]{1,3}"
                autoCapitalize="characters"
              />
            </label>
          ) : null}
          {mode === 'login' ? (
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
          ) : null}
          {registration || mode === 'reset' ? (
            <>
              <label>
                Nuova password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label>
                Conferma password
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              {mode === 'register' && error === 'Password non corrispondenti.' ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
          {mode === 'login' ? (
            <p className="form-aside">
              Hai dimenticato la{' '}
              <button type="button" onClick={() => setForgotOpen(true)}>
                password?
              </button>
            </p>
          ) : null}
          <button
            className="button navy full"
            disabled={busy || (mode === 'register' && (!studentMatched || lookingUp))}
            type="submit"
          >
            {busy
              ? 'Attendi…'
              : {
                  login: 'Accedi',
                  register: 'Registrati',
                  'create-admin': 'Crea admin',
                  forgot: 'Invia mail',
                  reset: 'Imposta password',
                }[mode]}
            <ArrowRight size={18} />
          </button>
          {mode === 'login' ? (
            <p className="form-switch">
              Non hai un account? <Link href="/registrati">Registrati</Link>
            </p>
          ) : null}
          {mode === 'register' ? (
            <p className="form-switch">
              Hai già un account? <Link href="/accedi">Accedi</Link>
            </p>
          ) : null}
        </fieldset>
      </form>
      {mode === 'register' && error === NOT_STUDENT_ERROR ? (
        <Modal title="Registrazione non consentita" onClose={() => setError('')}>
          <p>
            La mail non corrisponde a uno studente abilitato. Controlla la mail inserita oppure
            contatta il narratore.
          </p>
          <button className="button navy full" onClick={() => setError('')}>
            Chiudi
          </button>
        </Modal>
      ) : null}
      {forgotOpen ? (
        <Modal title="Recupero password" onClose={() => setForgotOpen(false)}>
          <p>Verrà inviata una mail per il cambio della password.</p>
          <AuthForm mode="forgot" />
        </Modal>
      ) : null}
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current
      ?.querySelector<HTMLElement>('button, input, select, textarea, a[href]')
      ?.focus();
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const items = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
          ) || [],
        );
        if (!items.length) return;
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    }
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
        <div className="modal-logo">
          <Image
            src="/images/logo-keynes.webp"
            alt="Logo J. M. Keynes"
            width={62}
            height={37}
            unoptimized
          />{' '}
          J. M. Keynes
        </div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
export function ChangePassword() {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)}>
        <KeyRound size={16} /> Cambio password <ArrowRight size={15} />
      </button>
      {open ? (
        <Modal title="Cambio password" onClose={() => setOpen(false)}>
          <form
            className="auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const body = Object.fromEntries(new FormData(e.currentTarget));
              const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              });
              const data = await res.json();
              setBusy(false);
              if (!res.ok) setError(data.error);
              else setDone(true);
            }}
          >
            {done ? (
              <p className="form-success">Password aggiornata.</p>
            ) : (
              <>
                <label>
                  Vecchia password
                  <input name="old" type="password" required />
                </label>
                <label>
                  Nuova password
                  <input name="password" type="password" minLength={8} required />
                </label>
                <label>
                  Conferma password
                  <input name="confirm" type="password" minLength={8} required />
                </label>
                {error ? <p className="form-error">{error}</p> : null}
                <button className="button navy" disabled={busy}>
                  Conferma
                </button>
              </>
            )}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
