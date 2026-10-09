import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import { importPuntiWorkbook } from '../lib/punti-import.ts';
import { existsSync } from 'node:fs';
import { createSqlDatabase } from '../lib/sql-database.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const workbookPath = resolve(
  process.argv[2] || 'D:/GFX/Clients/SitoPunti - (School)/Assets/Punti.xlsx',
);
const databasePath = resolve(process.env.DATABASE_PATH || '.data/one-piece.sqlite');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(workbookPath);

let sqlite;
const adapter = createSqlDatabase(() => {
  if (!sqlite) {
    sqlite = new DatabaseSync(databasePath, { timeout: 5000 });
    sqlite.exec('PRAGMA foreign_keys = ON;');
  }
  return sqlite;
});

try {
  const result = await importPuntiWorkbook(adapter.database, workbook, 'Punti.xlsx', true);
  console.log(
    `Importazione completata: ${result.students} studenti, ${result.crews} ciurme, ${result.events} movimenti, ${result.skippedEvents} righe saltate.`,
  );
} finally {
  sqlite?.close();
  await adapter.close();
}
