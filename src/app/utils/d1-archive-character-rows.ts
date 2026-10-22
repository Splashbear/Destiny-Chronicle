import { convertLightActivityToHistory } from './activity-history-normalize';
import { PlayerActivitiesResponse } from '../core/data/archive-api.service';
import { StoredActivity } from '../services/activity-db.service';

/**
 * Archive rows for one D1 character. Empty periods and membershipType 0 stay.
 * Game is forced to D1 so a shared instance id cannot collapse into a D2 row.
 */
export function d1ArchiveRowsForCharacter(
  archiveData: PlayerActivitiesResponse | null,
  character: { membershipId: string; characterId: string }
): StoredActivity[] {
  const rows = archiveData?.activities ?? [];
  return rows
    .filter(
      (light) =>
        light?.instanceId != null &&
        String(light.instanceId) !== '' &&
        String(light.characterId) === String(character.characterId)
    )
    .map((light) => {
      const period =
        typeof light.period === 'string' && !Number.isNaN(Date.parse(light.period))
          ? light.period
          : '';
      const activity = convertLightActivityToHistory({ ...light, period, game: 'D1' });
      return {
        ...activity,
        membershipId: character.membershipId,
        characterId: character.characterId,
        instanceId: activity.activityDetails?.instanceId,
        mode: activity.activityDetails?.mode,
        game: 'D1' as const,
      };
    });
}
