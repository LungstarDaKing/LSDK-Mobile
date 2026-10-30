import { appendSpoken, commandOf, dictationError } from '../src/features/chat/dictation';

describe('dictation helpers', () => {
  it('recognises spoken commands only when they are the whole phrase', () => {
    expect(commandOf('Send.')).toBe('send');
    expect(commandOf('send the message')).toBe('send');
    expect(commandOf('never mind')).toBe('clear');
    expect(commandOf('Stop listening!')).toBe('stop');
    expect(commandOf('please send it to her')).toBeNull();
    expect(commandOf('hello')).toBeNull();
  });
  it('appends spoken words with one space', () => {
    expect(appendSpoken('', 'hello')).toBe('hello');
    expect(appendSpoken('hi', 'there')).toBe('hi there');
    expect(appendSpoken('hi ', 'there')).toBe('hi there');
    expect(appendSpoken('hi', '  ')).toBe('hi');
  });
  it('explains errors, ignoring quiet ones', () => {
    expect(dictationError('no-speech')).toBeNull();
    expect(dictationError('aborted')).toBeNull();
    expect(dictationError('not-allowed')).toMatch(/permission/);
    expect(dictationError('weird')).toMatch(/try again/i);
  });
});
