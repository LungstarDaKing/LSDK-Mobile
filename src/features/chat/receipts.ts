// "Seen" logic, identical to the web app: a message is seen by a person when their last_read_at >= message time.
// The server only returns reads when BOTH sides have read receipts switched on (get_room_reads).
import type { Message, Participant } from './api';

export type Reads = Map<string, Date>; // profileId -> last read time

export function readersOf(m: Pick<Message, 'created_at'>, participants: Participant[], me: string, reads: Reads): string[] {
  const t = new Date(m.created_at).getTime();
  return participants
    .filter((p) => p.profile_id !== me && (reads.get(p.profile_id)?.getTime() ?? -Infinity) >= t)
    .map((p) => p.profile_id);
}

/** Id of the LAST of my messages that someone has seen (only that one shows the "Seen" caption). */
export function lastSeenMessageId(messages: Message[], participants: Participant[], me: string, reads: Reads): string | null {
  let id: string | null = null;
  for (const m of messages) {
    if (m.sender_id === me && readersOf(m, participants, me, reads).length > 0) id = m.id;
  }
  return id;
}

export function seenCaption(isDirect: boolean, readerCount: number): string {
  return isDirect ? 'Seen' : `Seen by ${readerCount}`;
}
