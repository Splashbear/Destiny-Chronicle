import { ActivityHistory } from '../models/activity-history.model';
import { resolveActivityDisplayName, ActivityNameLookup } from './resolve-activity-name';
import { formatActivityPgcrTitle, formatUnknownActivityTitle } from './activity-pgcr-title';
import { mapRetiredDirectorToReferenceId } from './retired-director-reference-map';

describe('retired director → reference map', () => {
  it('maps Savathûn Ordeal Adept director to referenceId', () => {
    expect(mapRetiredDirectorToReferenceId(1114928259)).toBe('3849697856');
    expect(mapRetiredDirectorToReferenceId('1114928259')).toBe('3849697856');
  });

  it('returns null for unknown hashes', () => {
    expect(mapRetiredDirectorToReferenceId(1)).toBeNull();
  });
});

describe('formatActivityPgcrTitle', () => {
  it('joins description and name', () => {
    expect(
      formatActivityPgcrTitle({
        displayProperties: {
          description: "Savathûn's Song",
          name: 'Nightfall: The Ordeal: Adept',
        },
      })
    ).toBe("Savathûn's Song - Nightfall: The Ordeal: Adept");
  });

  it('returns name alone when description missing', () => {
    expect(formatActivityPgcrTitle({ displayProperties: { name: 'Last Wish' } })).toBe(
      'Last Wish'
    );
  });
});

describe('formatUnknownActivityTitle', () => {
  it('includes mode label and UTC month year', () => {
    expect(formatUnknownActivityTitle(46, '2019-10-29T12:00:00Z')).toBe(
      'Unknown activity (Scored Nightfall Strikes, Oct 2019)'
    );
  });
});

function activity(partial: {
  referenceId?: string;
  directorActivityHash?: string | number;
  mode?: number;
  period?: string;
  name?: string;
}): ActivityHistory {
  const details: any = {
    referenceId: partial.referenceId ?? '',
    instanceId: '5024199266',
    mode: partial.mode ?? 46,
  };
  if (partial.directorActivityHash != null) {
    details.directorActivityHash = partial.directorActivityHash;
  }
  const row: ActivityHistory & { name?: string } = {
    period: partial.period ?? '2019-10-29T12:00:00Z',
    activityDetails: details,
    values: {},
  };
  if (partial.name) row.name = partial.name;
  return row;
}

describe('resolveActivityDisplayName', () => {
  const ordealDef = {
    displayProperties: {
      description: "Savathûn's Song",
      name: 'Nightfall: The Ordeal: Adept',
    },
  };

  it('uses live director/reference name when def exists', () => {
    const lookup: ActivityNameLookup = {
      getName: (id) => (String(id) === '999' ? 'Lake of Shadows' : 'Unknown Activity'),
      hasDef: (id) => String(id) === '999',
    };
    expect(
      resolveActivityDisplayName(
        activity({ referenceId: '999', mode: 46 }),
        false,
        lookup
      )
    ).toBe('Lake of Shadows');
  });

  it('maps retired director hash to PGCR-style title via referenceId', () => {
    const lookup: ActivityNameLookup = {
      getName: (id) =>
        String(id) === '3849697856' ? 'Nightfall: The Ordeal: Adept' : 'Unknown Activity',
      hasDef: (id) => String(id) === '3849697856',
      getDef: (id) => (String(id) === '3849697856' ? ordealDef : null),
    };
    const title = resolveActivityDisplayName(
      activity({
        referenceId: '1114928259',
        directorActivityHash: 1114928259,
        mode: 46,
        period: '2019-10-29T12:00:00Z',
      }),
      false,
      lookup
    );
    expect(title).toBe("Savathûn's Song - Nightfall: The Ordeal: Adept");
  });

  it('falls back to Unknown activity (mode, month year) when both hashes miss', () => {
    const lookup: ActivityNameLookup = {
      getName: () => 'Unknown Activity',
      hasDef: () => false,
      getDef: () => null,
    };
    expect(
      resolveActivityDisplayName(
        activity({
          referenceId: '999999999',
          mode: 46,
          period: '2019-10-29T12:00:00Z',
        }),
        false,
        lookup
      )
    ).toBe('Unknown activity (Scored Nightfall Strikes, Oct 2019)');
  });

  it('keeps instance id on the activity (no drop)', () => {
    const a = activity({ referenceId: '1114928259' });
    expect(a.activityDetails.instanceId).toBe('5024199266');
  });

  it('accepts legacy getName callback', () => {
    expect(
      resolveActivityDisplayName(activity({ referenceId: '1' }), false, () => 'Legacy Name')
    ).toBe('Legacy Name');
  });
});
