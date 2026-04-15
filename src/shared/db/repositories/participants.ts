import { db } from '../client';
import { participants } from '../schema';

/** Get all participant email→name mappings. Used by contact tiers UI. */
export function getAllParticipantNames(): Map<string, string | null> {
  const rows = db.select().from(participants).all();
  const map = new Map<string, string | null>();
  for (const p of rows) {
    map.set(p.email, p.name);
  }
  return map;
}
