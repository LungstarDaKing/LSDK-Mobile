// Mirrors the web app's rules (src/pages/auth.js) and the database constraints in supabase/schema.sql.
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 10;
export const MAX_MESSAGE = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validEmail = (v: string) => EMAIL_RE.test(v.trim());

export function validateRegister(f: { email: string; username: string; password: string }): string | null {
  if (!validEmail(f.email)) return 'Enter a valid email address.';
  if (!USERNAME_RE.test(f.username)) return 'Username must be 3-20 letters, numbers or underscores.';
  if (f.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return null;
}

export function validateLogin(f: { email: string; password: string }): string | null {
  if (!validEmail(f.email)) return 'Enter a valid email address.';
  if (!f.password) return 'Enter your password.';
  return null;
}

/** Trim and clamp a draft message to what the database allows (1-1000 chars after trimming). */
export function cleanMessage(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, MAX_MESSAGE);
}

export const MAX_GROUP_NAME = 60;
export const MAX_REPORT = 500;

export function validateGroupName(name: string): string | null {
  const n = name.trim();
  if (n.length < 1 || n.length > MAX_GROUP_NAME) return `Room name must be 1-${MAX_GROUP_NAME} characters`;
  return null;
}

export function validateReportReason(reason: string): string | null {
  const r = reason.trim();
  if (r.length < 1 || r.length > MAX_REPORT) return `Please describe the problem (max ${MAX_REPORT} characters)`;
  return null;
}

/** Escape LIKE wildcards so a search for "a_b" or "50%" matches literally. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

// Messages the database raises on purpose (RAISE EXCEPTION). They are written for end users, so show them as-is.
const SAFE_SERVER_MESSAGES = [
  'A room needs at least one admin', 'Direct chats cannot be left', 'Direct chats cannot have more members',
  'Choose someone else to chat with', 'Message not found', 'Messages must be 1 to 1000 characters.',
  'Nobody else can be added to your notes.', 'Only room admins can do that', 'Please describe the problem',
  'Room is full (50 members)', 'Room name must be 1-60 characters', 'That reaction is not available',
  'Too many members (max 50 including you)', 'Use "Leave room" to remove yourself', 'User not found',
  'You are no longer in this chat.', 'You are not in this chat.', 'You are not in this room',
  'You are sending messages too quickly. Please wait a moment.', 'You cannot report your own message',
  'Could not edit that message.', 'Could not delete that message.',
  // status updates + nicknames
  'You can post at most 20 status updates per day.', 'Upload not found. Please try again.', 'Status not found',
  'You cannot like your own status', 'You cannot comment on your own status', 'You cannot report your own status',
  'Comments must be 1-300 characters', 'Too many comments. Please wait a little.', 'Comment not found',
  'You can only nickname someone you share a chat with', 'Nicknames are limited to 30 characters', 'You cannot nickname yourself',
];

/** An error whose message was written for the end user (client-side validation). friendlyError shows it as-is. */
export class UserError extends Error {
  constructor(message: string) { super(message); this.name = 'UserError'; }
}

/** Turn backend errors into short human text; never expose raw SQL, stack traces or tokens. */
export function friendlyError(e: unknown): string {
  if (e instanceof UserError) return e.message;
  const m = (e as { message?: string } | null)?.message ?? '';
  const safe = SAFE_SERVER_MESSAGES.find((s) => m.includes(s));
  if (safe) return m.length <= 120 ? m : safe;
  if (/invalid login/i.test(m)) return 'Wrong email or password.';
  if (/not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox.';
  if (/row-level security|permission denied/i.test(m)) return "You don't have permission to do that.";
  if (/rate|too many|429/i.test(m)) return 'Too many attempts. Wait a moment and try again.';
  if (/network|fetch|failed to|load failed/i.test(m)) return 'Network problem. Check your connection and try again.';
  if (/duplicate|already/i.test(m)) return 'That username or email is already taken.';
  return 'Something went wrong. Please try again.';
}
