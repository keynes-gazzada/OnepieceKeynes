import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

test('existing daily rows survive migration and historic subject scores are combined', () => {
  const directory = mkdtempSync(join(tmpdir(), 'keynes-subject-migration-'));
  const path = join(directory, 'legacy.sqlite');
  const source = readFileSync(resolve('lib/db.ts'), 'utf8');
  const modulePath = join(directory, 'db.cjs');
  let legacy: DatabaseSync | undefined;
  try {
    legacy = new DatabaseSync(path);
    const usersSQL = source.match(/CREATE TABLE IF NOT EXISTS users .*?;/)![0];
    const dailySQL = source
      .match(/CREATE TABLE IF NOT EXISTS daily .*?;/)![0]
      .replace("subject TEXT NOT NULL DEFAULT '', ", '')
      .replace('UNIQUE(date,user_id,subject)', 'UNIQUE(date,user_id)');
    const crewsSQL = source.match(/CREATE TABLE IF NOT EXISTS crews .*?;/)![0];
    legacy.exec(crewsSQL + usersSQL + dailySQL);
    legacy.exec(`INSERT INTO users(id,email,salt,password_hash,first_name,last_name,class_code) VALUES(1,'migration@test.local','salt','hash','Mario','Test','3CI');
      CREATE TABLE dreams(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, text TEXT NOT NULL);
      INSERT INTO dreams(id,user_id,text) VALUES(5,1,'Sogno originale');
      INSERT INTO daily(id,date,user_id,presence,phone,bug,fruit_points,fruit_note,updated_at)
      VALUES(77,'2026-10-06',1,'A','',1,7,'Nota originale','2026-10-06 12:00:00');`);
    legacy.close();
    legacy = undefined;
    writeFileSync(
      modulePath,
      ts.transpileModule(
        source
          .replace("import 'server-only';", '')
          .replaceAll("'./registry-core'", "'./registry-core.cjs'")
          .replaceAll("'./point-rules'", "'./point-rules.cjs'"),
        {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        },
      ).outputText,
    );
    writeFileSync(
      join(directory, 'registry-core.cjs'),
      ts.transpileModule(
        readFileSync(resolve('lib/registry-core.ts'), 'utf8').replace(
          "'./point-rules'",
          "'./point-rules.cjs'",
        ),
        {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        },
      ).outputText,
    );
    writeFileSync(
      join(directory, 'point-rules.cjs'),
      ts.transpileModule(readFileSync(resolve('lib/point-rules.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    );
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `
      const assert = require('node:assert/strict');
      const path = process.argv[1];
      let mod = require(path);
      let db = mod.database();
      const before = mod.one('SELECT * FROM daily WHERE id=77');
      assert.deepEqual(mod.one('SELECT * FROM dreams WHERE id=5'), { id: 5, user_id: 1, text: 'Sogno originale', points: 0, date: '', subject: '' });
      assert.equal(before.subject, '');
      assert.equal(before.fruit_points, 7);
      assert.equal(before.fruit_note, 'Nota originale');
      assert.equal(before.updated_at, '2026-10-06 12:00:00');
      mod.run("INSERT INTO daily(date,user_id,subject,presence,phone) VALUES('2026-10-06',1,'TePi','P','+')");
      mod.run("INSERT INTO daily(date,user_id,subject,presence,phone) VALUES('2026-10-06',1,'SER','A','-')");
      mod.run("INSERT INTO grades(user_id,date,type,grade,points,subject) VALUES(1,'2026-10-06','verifica',8,160,'TePi')");
      mod.run("INSERT INTO point_events(user_id,date,type,points,source,source_row,subject) VALUES(1,'2026-10-06','Bug',10,'test',1,'SER')");
      assert.equal(mod.scoreFor(1), 177);


      assert.equal(mod.leaderboardForRange('3CI','2026-10-01','2026-10-31')[0].score,177);
      db.close();
      delete require.cache[require.resolve(path)];
      mod = require(path);
      assert.deepEqual(mod.one('SELECT * FROM daily WHERE id=77'), before);
      assert.equal(mod.all('SELECT * FROM daily').length, 3);
      mod.database().close();
      console.log('Migration verified');
    `,
        modulePath,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DATABASE_PATH: path,
          ADMIN_EMAIL: '',
          ADMIN_PASSWORD: '',
        },
      },
    );
    expect(output).toContain('Migration verified');
  } finally {
    legacy?.close();
    if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\keynes-subject-migration-'))
      throw new Error('Unexpected migration test directory');
    rmSync(directory, { recursive: true, force: true });
  }
});
