'use client';
import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { RuleContent } from '@/lib/rules-content';

export function RuleChapter({
  initial,
  admin,
  children,
  onDeleted,
}: {
  initial: RuleContent;
  admin: boolean;
  children?: ReactNode;
  onDeleted?: () => void;
}) {
  const [rule, setRule] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(value: RuleContent) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setRule(value);
      setEditing(false);
      if (value.deleted) onDeleted?.();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id={rule.id} className="rules-chapter">
      {editing ? (
        <form
          className="rule-editor"
          onSubmit={(event) => {
            event.preventDefault();
            save(draft);
          }}
        >
          <label>
            Titolo
            <input
              value={draft.title}
              maxLength={150}
              required
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label>
            Descrizione
            <textarea
              rows={6}
              maxLength={10000}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          <label>
            Indirizzo immagine (HTTPS o percorso del sito)
            <input
              value={draft.image}
              maxLength={2000}
              onChange={(event) => setDraft({ ...draft, image: event.target.value })}
            />
          </label>
          <div className="management-actions">
            <button className="button navy small" disabled={busy}>
              Salva regola
            </button>
            <button
              type="button"
              className="button outline small"
              disabled={busy}
              onClick={() => {
                setDraft(rule);
                setEditing(false);
              }}
            >
              Annulla
            </button>
          </div>
        </form>
      ) : (
        <>
          <h2>{rule.title}</h2>
          {rule.image ? <img className="rules-chapter-image" src={rule.image} alt="" /> : null}
          <p className="rule-description">{rule.description}</p>
          {children}
          {admin ? (
            <div className="management-actions">
              <button
                type="button"
                className="button outline small"
                onClick={() => setEditing(true)}
              >
                Modifica regola
              </button>
              {onDeleted ? (
                <button
                  type="button"
                  className="button outline small"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Eliminare questa regola?'))
                      save({ ...rule, deleted: true });
                  }}
                >
                  Elimina regola
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

export function AdditionalRules({ initial, admin }: { initial: RuleContent[]; admin: boolean }) {
  const [rules, setRules] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      {rules.map((rule) => (
        <RuleChapter
          key={rule.id}
          initial={rule}
          admin={admin}
          onDeleted={() => setRules((current) => current.filter((item) => item.id !== rule.id))}
        />
      ))}
      {admin ? (
        adding ? (
          <form
            className="rule-editor"
            onSubmit={async (event) => {
              event.preventDefault();
              setError('');
              const rule = { id: `regola-${crypto.randomUUID()}`, title, description, image };
              try {
                const response = await fetch('/api/rules', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(rule),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                setRules((current) => [...current, rule]);
                setTitle('');
                setDescription('');
                setImage('');
                setAdding(false);
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            <h2>Nuova regola</h2>
            <label>
              Titolo
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={150}
              />
            </label>
            <label>
              Descrizione
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={10000}
              />
            </label>
            <label>
              Indirizzo immagine
              <input value={image} onChange={(event) => setImage(event.target.value)} />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="management-actions">
              <button className="button navy small">Aggiungi regola</button>
              <button
                className="button outline small"
                type="button"
                onClick={() => setAdding(false)}
              >
                Annulla
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="button outline" onClick={() => setAdding(true)}>
            <Plus size={16} /> Nuova regola
          </button>
        )
      ) : null}
    </>
  );
}
