import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { currentUser } from '@/lib/auth';
import { ChevronDown, Github, Mail, MapPin } from 'lucide-react';
import { LogoutButton } from '@/components/interactive';
import { MotionEffects } from '@/components/motion-effects';
import { NavigationMenu } from '@/components/navigation-menu';
import { all } from '@/lib/database';
import { classSubjects, subjectLabel } from '@/lib/subjects';
import './fonts.css';
import './globals.css';
import './design-system.css';
import './grand-line.css';
import './motion.css';
import './navigation.css';
import './rules.css';
import './page-details.css';
import './powers.css';
export const metadata: Metadata = {
  title: { default: 'Keynes Grand Line · J. M. Keynes', template: '%s · Keynes Grand Line' },
  description: 'La Grand Line dei punti del J. M. Keynes: ciurme, taglie, rotte e sfide.',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const classes =
    user?.role === 'admin'
      ? [
          ...new Set([
            '3CI',
            '4CI',
            '5CI',
            ...(
              await all<{ class_code: string }>(
                "SELECT class_code FROM (SELECT class_code FROM routes UNION SELECT class_code FROM users) WHERE class_code<>'' ORDER BY class_code",
              )
            ).map((x) => x.class_code),
          ]),
        ].sort()
      : [];
  const links =
    user?.role === 'admin'
      ? [
          ['/', 'Home'],
          ['/narratore', 'Narratore'],
        ]
      : user
        ? [
            ['/', 'Home'],
            ['/profilo', 'Profilo'],
            ['/viaggio', 'Classifica'],
            ['/rotte', 'Grand Line'],
            ['/misteri', 'Misteri'],
            ['/regole', 'Regole'],
          ]
        : [
            ['/', 'Home'],
            ['/accedi', 'Accedi'],
            ['/registrati', 'Registrati'],
            ['/regole', 'Regole'],
          ];
  return (
    <html lang="it" data-scroll-behavior="smooth">
      <body>
        <MotionEffects />
        <nav className="topnav" aria-label="Navigazione principale">
          <div className="nav-inner">
            <Link className="nav-mark" href="/" aria-label="Keynes Grand Line, pagina iniziale">
              <Image
                src="/images/logo-keynes.webp"
                alt="J. M. Keynes"
                width={600}
                height={338}
                unoptimized
                className="nav-logo"
                priority
              />
            </Link>
            <NavigationMenu>
              <div className={`nav-links ${user?.role === 'admin' ? 'admin-nav-links' : ''}`}>
                {links.map(([href, label]) => (
                  <Link key={href} href={href}>
                    {label}
                  </Link>
                ))}
                {user?.role === 'admin' ? (
                  <details className="nav-classes">
                    <summary>
                      Classi <ChevronDown size={15} />
                    </summary>
                    <div className="nav-classes-panel">
                      <span className="nav-classes-kicker">Seleziona la classe</span>
                      {classes.map((cls) => (
                        <section className="nav-class-group" key={cls}>
                          <Link href={`/narratore?classe=${encodeURIComponent(cls)}`}>{cls}</Link>
                          <ul aria-label={`Materie ${cls}`}>
                            {(classSubjects[cls] || []).map((subject) => (
                              <li key={subject}>
                                <Link
                                  href={`/narratore?classe=${encodeURIComponent(cls)}&materia=${encodeURIComponent(subject)}`}
                                >
                                  {subjectLabel(subject)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
              {user ? (
                <div className="nav-user">
                  <span>
                    {user.first_name} {user.last_name}
                  </span>
                  <LogoutButton />
                </div>
              ) : null}
            </NavigationMenu>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <Link className="footer-logo" href="/" aria-label="ISIS J.M. Keynes, pagina iniziale">
              <Image
                src="/images/logo-keynes.webp"
                alt="ISIS J.M. Keynes"
                width={600}
                height={338}
                unoptimized
                sizes="180px"
              />
            </Link>
            <div className="footer-links">
              <a
                href="https://youtu.be/dQw4w9WgXcQ"
                target="_blank"
                rel="noreferrer"
                aria-label="Position"
              >
                <MapPin size={24} aria-hidden="true" />
              </a>
              <a
                href="https://github.com/keynes-gazzada"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <Github size={24} aria-hidden="true" />
              </a>
              <a href="mailto:puntikeynes@gmail.com" aria-label="Invia mail">
                <Mail size={24} aria-hidden="true" />
              </a>
            </div>
            <p>© 2026 ISIS J.M. Keynes Students. All rights reserved</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
