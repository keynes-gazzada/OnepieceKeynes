import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { all, type Crew } from '@/lib/database';
import { CrewCarousel } from '@/components/interactive';
import styles from './home-crews.module.css';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const [user, crews] = await Promise.all([
    currentUser(),
    all<Crew>('SELECT * FROM crews ORDER BY class_code, name, id'),
  ]);
  return (
    <>
      <section className="hero">
        <Image
          src="/images/nave-scelta.png"
          alt="Una nave a vela attraversa il mare al tramonto"
          fill
          priority
          sizes="100vw"
          className="hero-art"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="hero-copy">
            <div className="hero-kicker">J. M. Keynes · Registro punti</div>
            <h1>
              <span>Il registro</span>
              <span>
                <em>Grand Line</em>
              </span>
              <span>della classe.</span>
            </h1>
            <p>Consulta i punti, i voti e la classifica del registro unico.</p>
            <div className="hero-actions">
              {user ? (
                <Link
                  className="button gold"
                  href={user.role === 'admin' ? '/narratore' : '/profilo'}
                >
                  {user.role === 'admin' ? 'Apri il registro' : 'Il tuo profilo'}{' '}
                  <ArrowRight size={18} />
                </Link>
              ) : (
                <Link className="button gold" href="/accedi">
                  Accedi al registro <ArrowRight size={18} />
                </Link>
              )}
              {user ? (
                <Link className="hero-secondary" href="/viaggio">
                  Apri la classifica
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      {user ? (
        <div className="welcome-strip">
          <div className="container">
            <span>Accesso come</span>
            <strong>
              {user.last_name} {user.first_name}
              {user.class_code ? ` · ${user.class_code}` : ''}
            </strong>
            <Link href={user.role === 'admin' ? '/narratore' : '/viaggio'}>
              {user.role === 'admin' ? 'Registro' : 'Classifica'} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      ) : null}
      <section className={styles.section} aria-labelledby="home-crews-title">
        <div className="container">
          <header className={styles.heading}>
            <h2 id="home-crews-title" className={styles.title}>
              Le ciurme
            </h2>
            <span className={styles.count}>
              {crews.length} {crews.length === 1 ? 'ciurma' : 'ciurme'}
            </span>
          </header>
          <CrewCarousel crews={crews} />
        </div>
      </section>
    </>
  );
}
