import { ActivityCountRow } from '../services/activity-breakdown.service';
import {
  BREAKDOWN_PAGE_SIZE,
  BreakdownView,
  breakdownCreatesInLastSecond,
  breakdownGroupKey,
  breakdownRowFromEvent,
  breakdownRowKey,
  cardLabelFromEvent,
  noteBreakdownCreate,
  resetBreakdownCreates,
} from './breakdown-view';

function row(name: string, period: string, instanceId: string): ActivityCountRow {
  return {
    referenceId: name,
    game: 'D2',
    baseName: name,
    variantName: 'Standard',
    mode: 4,
    runs: 2,
    clears: 1,
    fails: 1,
    timeSeconds: 120,
    lastPlayed: period,
    lastPlayedInstanceId: instanceId,
  };
}

function groups() {
  const rows = Array.from({ length: 60 }, (_, index) => row(`Raid ${index}`, `2020-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`, String(index)));
  return [
    { type: 'raid', label: 'Raid', game: 'D2' as const, rows },
    { type: 'strike', label: 'Strike', game: 'D2' as const, rows: [row('Strike', '2021-02-02T00:00:00Z', 's1')] },
  ];
}

describe('breakdown view', () => {
  it('returns the same card and group arrays while the inputs are unchanged', () => {
    const view = new BreakdownView();
    const source = groups();
    const selected = new Set<string>();
    view.sync(source, selected, null);
    const cards = view.cards;
    const shown = view.groups;
    view.sync(source, selected, null);
    expect(view.cards).toBe(cards);
    expect(view.groups).toBe(shown);
  });

  it('uses stable track keys', () => {
    const group = groups()[0];
    expect(breakdownGroupKey(group)).toBe('D2|Raid');
    expect(breakdownRowKey(group.rows[0])).toBe('D2|Raid 0|Standard');
  });

  it('starts with the first group open and pages the rest', () => {
    const view = new BreakdownView();
    const source = groups();
    view.sync(source, new Set(), null);
    expect(view.visibleRows(source[0]).length).toBe(BREAKDOWN_PAGE_SIZE);
    expect(view.visibleRows(source[1]).length).toBe(0);
    view.showMore(source[0]);
    expect(view.visibleRows(source[0]).length).toBe(60);
    view.expandAll();
    expect(view.visibleRows(source[1]).length).toBe(1);
    expect(view.visibleRows(source[0]).length).toBe(60);
  });

  it('opens the selected card group and keeps the other groups closed', () => {
    const view = new BreakdownView();
    const source = groups();
    view.sync(source, new Set(['Strike']), null);
    expect(view.groups.length).toBe(1);
    expect(view.groups[0].label).toBe('Strike');
    expect(view.visibleRows(view.groups[0]).length).toBe(1);
  });

  it('reads the card and the PGCR row from one delegated click', () => {
    const rows = groups()[0].rows;
    const card = cardLabelFromEvent({
      target: { closest: (selector: string) => selector === '[data-card-label]' ? { getAttribute: () => 'Raid' } : null },
    } as unknown as { target: EventTarget | null });
    expect(card).toBe('Raid');

    const rowTarget = {
      closest: (selector: string) => {
        if (selector === '.breakdown-date-pgcr-link' || selector === '[data-row-key]') {
          return { getAttribute: () => breakdownRowKey(rows[3]), closest: () => rowTarget };
        }
        return null;
      },
    };
    expect(breakdownRowFromEvent({ target: rowTarget } as unknown as { target: EventTarget | null }, rows)?.lastPlayedInstanceId).toBe('3');

    const plain = { closest: () => null };
    expect(breakdownRowFromEvent({ target: plain } as unknown as { target: EventTarget | null }, rows)).toBeUndefined();
  });

  it('counts row and tile creation only when a node is built', () => {
    resetBreakdownCreates();
    expect(breakdownCreatesInLastSecond()).toBe(0);
    noteBreakdownCreate('row');
    noteBreakdownCreate('tile');
    expect(breakdownCreatesInLastSecond()).toBe(2);
    resetBreakdownCreates();
    expect(breakdownCreatesInLastSecond()).toBe(0);
  });
});
