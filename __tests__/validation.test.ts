import { cleanMessage, friendlyError, MAX_MESSAGE, UserError, validateLogin, validateRegister } from '@/lib/validation';

describe('validateRegister', () => {
  const ok = { email: 'a@b.co', username: 'king_01', password: 'longenough1' };
  it('accepts valid input', () => expect(validateRegister(ok)).toBeNull());
  it('rejects bad email', () => expect(validateRegister({ ...ok, email: 'nope' })).toMatch(/email/i));
  it('rejects short/odd usernames', () => {
    expect(validateRegister({ ...ok, username: 'ab' })).toMatch(/Username/);
    expect(validateRegister({ ...ok, username: 'has space' })).toMatch(/Username/);
    expect(validateRegister({ ...ok, username: 'x'.repeat(21) })).toMatch(/Username/);
  });
  it('requires 10+ char password', () => expect(validateRegister({ ...ok, password: '123456789' })).toMatch(/10/));
});

describe('validateLogin', () => {
  it('needs email and password', () => {
    expect(validateLogin({ email: '', password: 'x' })).not.toBeNull();
    expect(validateLogin({ email: 'a@b.co', password: '' })).not.toBeNull();
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toBeNull();
  });
});

describe('cleanMessage', () => {
  it('drops blank drafts', () => expect(cleanMessage('   \n ')).toBeNull());
  it('trims', () => expect(cleanMessage('  hi  ')).toBe('hi'));
  it('clamps to the database limit', () => expect(cleanMessage('x'.repeat(5000))!.length).toBe(MAX_MESSAGE));
});

describe('friendlyError', () => {
  it('hides raw backend text', () => expect(friendlyError({ message: 'select * from secret_table failed' })).toBe('Something went wrong. Please try again.'));
  it('maps login failures', () => expect(friendlyError({ message: 'Invalid login credentials' })).toBe('Wrong email or password.'));
  it('maps rate limits', () => expect(friendlyError({ message: 'email rate limit exceeded' })).toMatch(/Too many/));
});

import { escapeLike, validateGroupName, validateReportReason } from '@/lib/validation';
describe('phase 2 validation', () => {
  it('escapeLike escapes %, _ and backslash', () => expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d'));
  it('group names 1-60 after trim', () => {
    expect(validateGroupName('  ')).not.toBeNull();
    expect(validateGroupName('x'.repeat(60))).toBeNull();
    expect(validateGroupName('x'.repeat(61))).not.toBeNull();
  });
  it('report reasons 1-500', () => {
    expect(validateReportReason('')).not.toBeNull();
    expect(validateReportReason('spam')).toBeNull();
    expect(validateReportReason('x'.repeat(501))).not.toBeNull();
  });
  it('passes through deliberate server messages but hides internals', () => {
    expect(friendlyError({ message: 'Only room admins can do that' })).toBe('Only room admins can do that');
    expect(friendlyError({ message: 'Room is full (50 members)' })).toBe('Room is full (50 members)');
    expect(friendlyError({ message: 'permission denied for table room_reads' })).toBe("You don't have permission to do that.");
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "x"' })).toMatch(/already taken/);
    expect(friendlyError({ message: 'relation "x" does not exist at character 15' })).toBe('Something went wrong. Please try again.');
  });
});

describe('UserError', () => {
  it('is shown as written, while arbitrary errors stay generic', () => {
    expect(friendlyError(new UserError('That file is 25.0 MB. The limit is 20 MB.'))).toBe('That file is 25.0 MB. The limit is 20 MB.');
    expect(friendlyError(new Error('select * from secrets failed at line 3'))).toBe('Something went wrong. Please try again.');
  });
  it('passes the new status/nickname server messages through', () => {
    expect(friendlyError({ message: 'You can post at most 20 status updates per day.' })).toBe('You can post at most 20 status updates per day.');
    expect(friendlyError({ message: 'Nicknames are limited to 30 characters' })).toMatch(/30 characters/);
  });
});
