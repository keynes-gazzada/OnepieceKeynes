import {existsSync,readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {createSqlDatabase} from '../lib/sql-database.ts';
import {importPuntiWorkbook} from '../lib/punti-import.ts';
import {normalizeSubject} from '../lib/subjects.ts';
if(existsSync('.env.local')) process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply');
process.env.DATABASE_DRIVER=apply?'postgres':'sqlite';
process.env.DATABASE_RUNTIME=apply?'node':'node';
const workbook=new ExcelJS.Workbook();
await workbook.xlsx.readFile('outputs/init-20261009/Init-corretto.xlsx');
const expected={};
const roster=workbook.getWorksheet('Studenti');
const expectedCrews=new Set();
let expectedStudents=0;
roster.eachRow((row,n)=>{if(n>1&&row.getCell(3).text.trim()){expectedStudents++;expectedCrews.add(`${row.getCell(1).text}|${row.getCell(4).text.trim().toLowerCase()}`);}});
let records=0;
workbook.getWorksheet('One Piece').eachRow((row,n)=>{
  if(n===1||!row.getCell(4).text.trim()) return;
  const group=`${row.getCell(3).text}|${normalizeSubject(row.getCell(3).text,row.getCell(8).text)}`;
  expected[group]??={count:0,points:0};
  expected[group].count++; expected[group].points+=Number(row.getCell(6).value); records++;
});
const sqlite=apply?undefined:new DatabaseSync(':memory:');
sqlite?.exec('PRAGMA foreign_keys=ON');
if(sqlite){
  const schema=readFileSync('lib/db.ts','utf8').match(/database\.exec\(`([\s\S]*?)`\);/)[1];
  sqlite.exec(schema);
}
const adapter=createSqlDatabase(()=>sqlite);
try{
  let admins;
  if(apply){
    admins=await adapter.database.prepare("SELECT id,email,password_hash FROM users WHERE role='admin' ORDER BY id").all();
    const students=await adapter.database.prepare("SELECT COUNT(*) AS n FROM users WHERE role='student'").get();
    const movements=await adapter.database.prepare('SELECT COUNT(*) AS n FROM point_events').get();
    if(!admins.length||Number(students.n)!==0||Number(movements.n)!==0) throw new Error('Target is not the empty registry: import aborted.');
    await mkdir('.data/backups',{recursive:true});
    const tables=['crews','users','sessions','reset_tokens','routes','islands','daily','grades','point_events','dreams','mysteries','imported_rows'];
    const snapshot={};
    for(const table of tables) snapshot[table]=await adapter.database.prepare(`SELECT * FROM ${table}`).all();
    await writeFile(`.data/backups/before-init-${Date.now()}.json`,JSON.stringify(snapshot),{flag:'wx',mode:0o600});
  }
  const result=await adapter.database.transaction(async()=>{
    const imported=await importPuntiWorkbook(adapter.database,workbook,'Punti.xlsx');
    const groups=await adapter.database.prepare('SELECT u.class_code,e.subject,COUNT(*) AS n,SUM(e.points) AS points FROM point_events e JOIN users u ON u.id=e.user_id GROUP BY u.class_code,e.subject').all();
    if(imported.students!==expectedStudents||imported.crews!==expectedCrews.size||imported.events!==records||imported.skippedEvents!==0) throw new Error(`Import count mismatch: ${JSON.stringify({imported,expectedStudents,expectedCrews:expectedCrews.size,records})}`);
    if(groups.length!==Object.keys(expected).length) throw new Error('Group mismatch.');
    for(const group of groups){
      const exp=expected[`${group.class_code}|${group.subject}`];
      if(!exp||Number(group.n)!==exp.count||Math.abs(Number(group.points)-exp.points)>1e-6) throw new Error('Subject total mismatch.');
    }
    if(apply){
      const after=await adapter.database.prepare("SELECT id,email,password_hash FROM users WHERE role='admin' ORDER BY id").all();
      if(JSON.stringify(after)!==JSON.stringify(admins)) throw new Error('Administrator preservation failed.');
    }
    console.log(JSON.stringify({target:apply?'production':'local rehearsal',imported,subjectGroups:groups,verified:true}));
    return imported;
  });
}finally{await adapter.close();sqlite?.close();}
