import { Injectable } from '@angular/core';
import { compressToURL as compress, decompressFromURL as decompress } from '@amoutonbrady/lz-string';

/** Player identity carried in a #share= payload (new object shape or legacy tuple). */
export interface SharePlayerRef {
  displayName?: string;
  membershipId: string;
  membershipType: number;
  game: 'D1' | 'D2';
  platform?: string;
}

/** Normalized share restore payload for PlayerSearchComponent. */
export interface NormalizedShareState {
  date: string;
  players: SharePlayerRef[];
}

@Injectable({ providedIn: 'root' })
export class ShareService {
  /** Build share link fragment from given state */
  generateHash(state: any): string {
    const json = JSON.stringify(state);
    return compress(json); // url-safe & compressed
  }

  parseHash(hash: string): any | null {
    try {
      const json = decompress(hash);
      if (!json) return null;
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  buildLink(state: any): string {
    return `${location.origin}${location.pathname}#share=${this.generateHash(state)}`;
  }

  /**
   * Daily-view share payload. `d` is always YYYY-MM-DD (legacy links may still use M-D).
   * `p` is an array of player objects (legacy links may use [id, type, game] tuples).
   */
  buildDailyShareState(
    players: Array<{
      displayName?: string;
      membershipId: string;
      membershipType: number;
      game?: string;
      platform?: string;
    }>,
    selectedDate: string
  ): { d: string; p: SharePlayerRef[] } {
    return {
      d: selectedDate,
      p: players.map((p) => ({
        displayName: p.displayName || 'Unknown Player',
        membershipId: String(p.membershipId),
        membershipType: Number(p.membershipType) || 1,
        game: p.game === 'D1' ? 'D1' : 'D2',
        platform: p.platform || 'Unknown',
      })),
    };
  }

  /**
   * Turn a raw #share= payload into date + players for permalink-style load.
   * Supports new `{ d: "YYYY-MM-DD", p: [{...}] }` and legacy `{ d: "M-D", p: [[id,type,game]] }`.
   * Legacy month-day dates use the current calendar year.
   */
  normalizeShareState(raw: any): NormalizedShareState | null {
    if (!raw || typeof raw !== 'object') return null;
    const date = this.normalizeShareDate(raw.d ?? raw.date);
    const players = this.normalizeSharePlayers(raw.p ?? raw.players);
    if (!date || !players.length) return null;
    return { date, players };
  }

  private normalizeShareDate(d: unknown): string | null {
    const s = String(d ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split('-').map(Number);
      if (y >= 2014 && y <= 2030 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
        return s;
      }
      return null;
    }
    const md = s.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!md) return null;
    const month = Number(md[1]);
    const day = Number(md[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const year = new Date().getFullYear();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private normalizeSharePlayers(p: unknown): SharePlayerRef[] {
    if (!Array.isArray(p) || p.length === 0) return [];
    const out: SharePlayerRef[] = [];
    for (const entry of p) {
      if (Array.isArray(entry)) {
        const membershipId = String(entry[0] ?? '').trim();
        if (!membershipId) continue;
        out.push({
          membershipId,
          membershipType: Number(entry[1]) || 1,
          game: entry[2] === 'D1' ? 'D1' : 'D2',
          displayName: 'Unknown Player',
          platform: 'Unknown',
        });
        continue;
      }
      if (entry && typeof entry === 'object' && (entry as any).membershipId != null) {
        const e = entry as any;
        out.push({
          displayName: e.displayName || 'Unknown Player',
          membershipId: String(e.membershipId),
          membershipType: Number(e.membershipType) || 1,
          game: e.game === 'D1' ? 'D1' : 'D2',
          platform: e.platform || 'Unknown',
        });
      }
    }
    return out;
  }
}
