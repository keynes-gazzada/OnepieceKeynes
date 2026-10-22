import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { dailyPoints as calculateDailyPoints } from './point-rules';

export type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  class_code: string;
  role: 'student' | 'admin';
  crew_id: number | null;
  roles: string;
  last_password_change: string;
};
export type Crew = { id: number; name: string; class_code: string; flag: string };
export type Route = {
  id: number;
  class_code: string;
  year: number;
  year_name: string;
  ordinal: number;
  name: string;
  start_date: string;
  end_date: string;
};
export type Daily = {
  id: number;
  subject: string;
  date: string;
  user_id: number;
  presence: string;
  phone: string;
  bug: number;
  anxiety: number;
  mystery: number;
  weapon: string;
  multiverse: string;
  multiverse_points: number;
  fruit_points: number;
  imported_points_offset?: number;
  fruit_note: string;
  updated_at: string;
};
export type Grade = {
  id: number;
  user_id: number;
  date: string;
  type: string;
  grade: number;
  points: number;
};
export type PointEvent = {
  id: number;
  user_id: number;
  date: string;
  route: number;
  type: string;
  points: number;
  grade: number | null;
  source: string;
  source_row: number;
};
export type Mystery = {
  id: number;
  title: string;
  description: string;
  revealed: number;
  clues: string;
};
export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function verifyPassword(password: string, salt: string, hash: string) {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function sha(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function dailyPoints(
  r: Pick<
    Daily,
    | 'presence'
    | 'phone'
    | 'bug'
    | 'anxiety'
    | 'mystery'
    | 'multiverse_points'
    | 'fruit_points'
    | 'imported_points_offset'
  >,
) {
  return calculateDailyPoints(r);
}
