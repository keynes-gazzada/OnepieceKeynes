import 'server-only';
import { database as sqliteDatabase } from './sqlite-runtime';
import { dailyPoints } from './registry-core';
import { POINT_RULES } from './point-rules';
import { createSqlDatabase, type SqlValue } from './sql-database';
import type { User, Daily } from './registry-core';
export type { User, Crew, Route, Daily, Grade, PointEvent, Mystery } from './registry-core';
export { hashPassword, verifyPassword, sha, dailyPoints } from './registry-core';

const adapter = createSqlDatabase(() => sqliteDatabase());
export const transaction = adapter.transaction;
export function database() {
  return adapter.database;
}
export async function all<T>(sql: string, ...params: SqlValue[]): Promise<T[]> {
  return (await database()
    .prepare(sql)
    .all(...params)) as T[];
}
export async function one<T>(sql: string, ...params: SqlValue[]): Promise<T | undefined> {
  return (await database()
    .prepare(sql)
    .get(...params)) as T | undefined;
}
export async function run(sql: string, ...params: SqlValue[]) {
  return database()
    .prepare(sql)
    .run(...params);
}
export async function userById(id: number) {
  return one<User>(
    'SELECT id,email,first_name,last_name,class_code,role,crew_id,roles,last_password_change FROM users WHERE id=?',
    id,
  );
}

async function scoreInRange(userId: number, start?: string, end?: string) {
  let filter = ' WHERE user_id=?';
  const values: SqlValue[] = [userId];
  if (start && end) {
    filter += ' AND date BETWEEN ? AND ?';
    values.push(start, end);
  }
  const grades = await one<{ s: number }>(
    'SELECT COALESCE(SUM(points),0) s FROM grades' + filter,
    ...values,
  );
  const imported = await one<{ s: number }>(
    'SELECT COALESCE(SUM(points),0) s FROM point_events' + filter,
    ...values,
  );
  const daily = await all<Daily>('SELECT * FROM daily' + filter, ...values);
  const dreams = await one<{ s: number }>(
    'SELECT COALESCE(SUM(points),0) s FROM dreams' + filter,
    ...values,
  );
  return (
    (grades?.s || 0) +
    (imported?.s || 0) +
    (dreams?.s || 0) +
    daily.reduce((sum, row) => sum + dailyPoints(row), 0)
  );
}
export async function scoreFor(userId: number) {
  return scoreInRange(userId);
}

async function rankedUsers(cls?: string, start?: string, end?: string) {
  const conditions: string[] = [];
  const values: SqlValue[] = [];
  if (start && end) {
    conditions.push('date BETWEEN ? AND ?');
    values.push(start, end);
  }
  const filter = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const scored = await all<User & { score: number }>(
    `
    WITH grade_totals AS (SELECT user_id,SUM(points) points FROM grades${filter} GROUP BY user_id),
    event_totals AS (SELECT user_id,SUM(points) points FROM point_events${filter} GROUP BY user_id),
    dream_totals AS (SELECT user_id,SUM(points) points FROM dreams${filter} GROUP BY user_id),
    daily_totals AS (SELECT user_id,SUM(
      CASE presence WHEN 'A' THEN ${POINT_RULES.absence} WHEN 'A+' THEN ${POINT_RULES.absencePlus} ELSE 0 END +
      CASE phone WHEN '+' THEN ${POINT_RULES.phone} ELSE 0 END +
      bug * ${POINT_RULES.bug} + CASE WHEN anxiety<>0 THEN ${POINT_RULES.anxiety} ELSE 0 END +
      CASE WHEN mystery<>0 THEN ${POINT_RULES.mystery} ELSE 0 END + multiverse_points + fruit_points - imported_points_offset
    ) points FROM daily${filter} GROUP BY user_id)
    SELECT u.id,u.email,u.first_name,u.last_name,u.class_code,u.role,u.crew_id,u.roles,u.last_password_change,
      COALESCE(g.points,0)+COALESCE(e.points,0)+COALESCE(d.points,0)+COALESCE(s.points,0) score
    FROM users u LEFT JOIN grade_totals g ON g.user_id=u.id
    LEFT JOIN event_totals e ON e.user_id=u.id LEFT JOIN daily_totals d ON d.user_id=u.id
    LEFT JOIN dream_totals s ON s.user_id=u.id
    WHERE u.role='student' ${cls ? 'AND u.class_code=?' : ''} ORDER BY u.id
  `,
    ...values,
    ...values,
    ...values,
    ...values,
    ...(cls ? [cls] : []),
  );
  return scored
    .sort((a, b) => b.score - a.score)
    .map((user, index) => ({ ...user, score: Number(user.score), position: index + 1 }));
}
export async function leaderboard(cls?: string) {
  return rankedUsers(cls);
}
export async function leaderboardForRange(cls: string, start: string, end: string) {
  return rankedUsers(cls, start, end);
}
