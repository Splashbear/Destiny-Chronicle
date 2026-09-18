import { Injectable } from '@angular/core';
import { StoredActivity } from './activity-db.service';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { TitleItem } from './title.service';
import { TimezoneService } from './timezone.service';
import { DestinyManifestService } from './destiny-manifest.service';

export interface ArchiveHtmlReportData {
  displayName: string;
  membershipId: string;
  membershipType: number;
  game: 'D1' | 'D2';
  platform: string;
  generatedAt: string;
  timezone: string;
  activities: StoredActivity[];
  firsts: ActivityFirstCompletion[];
  titles: TitleItem[];
  summary: {
    totalActivities: number;
    totalTime: number;
    totalSeals: number;
    firstEverDate?: string;
    firstEverActivity?: string;
  };
  iconMap: Map<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ArchiveHtmlReportService {
  constructor(
    private timezoneService: TimezoneService,
    private manifest: DestinyManifestService
  ) {}

  generateHtmlReport(data: ArchiveHtmlReportData[]): string {
    const now = new Date().toISOString();
    const tz = this.timezoneService.getUserTimezone();

    const accountSections = data.map(account => this.generateAccountSection(account)).join('\n');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Destiny Chronicle Archive Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #0a0e27 0%, #1a1e3a 100%);
            color: #e2e8f0;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: linear-gradient(135deg, #1e2a47 0%, #2d3a5c 100%);
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            border: 1px solid rgba(148, 163, 184, 0.2);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        .header h1 {
            color: #f5c542;
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }
        .header .meta {
            color: #94a3b8;
            font-size: 0.95em;
        }
        .account-section {
            background: rgba(30, 42, 71, 0.6);
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            border: 1px solid rgba(148, 163, 184, 0.2);
        }
        .account-header {
            border-bottom: 2px solid #f5c542;
            padding-bottom: 15px;
            margin-bottom: 25px;
        }
        .account-header h2 {
            color: #f5c542;
            font-size: 1.8em;
            margin-bottom: 5px;
        }
        .account-header .platform {
            color: #94a3b8;
            font-size: 0.9em;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: rgba(15, 23, 42, 0.6);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.15);
        }
        .summary-card .label {
            color: #94a3b8;
            font-size: 0.85em;
            margin-bottom: 5px;
        }
        .summary-card .value {
            color: #f5c542;
            font-size: 1.8em;
            font-weight: bold;
        }
        .section {
            margin-bottom: 35px;
        }
        .section h3 {
            color: #a78bfa;
            font-size: 1.4em;
            margin-bottom: 15px;
            border-bottom: 1px solid rgba(167, 139, 250, 0.3);
            padding-bottom: 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: rgba(15, 23, 42, 0.4);
            border-radius: 8px;
            overflow: hidden;
        }
        thead {
            background: rgba(30, 42, 71, 0.8);
        }
        th {
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #cbd5e1;
            border-bottom: 2px solid rgba(148, 163, 184, 0.2);
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }
        tr:hover {
            background: rgba(255, 255, 255, 0.03);
        }
        .highlight {
            color: #f5c542;
        }
        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .badge-raid {
            background: rgba(168, 85, 247, 0.3);
            color: #c4b5fd;
        }
        .badge-dungeon {
            background: rgba(59, 130, 246, 0.3);
            color: #93c5fd;
        }
        .badge-pvp {
            background: rgba(239, 68, 68, 0.3);
            color: #fca5a5;
        }
        .badge-completed {
            background: rgba(34, 197, 94, 0.3);
            color: #86efac;
        }
        .badge-failed {
            background: rgba(239, 68, 68, 0.3);
            color: #fca5a5;
        }
        .icon {
            width: 24px;
            height: 24px;
            vertical-align: middle;
            margin-right: 8px;
            border-radius: 4px;
        }
        .footer {
            text-align: center;
            color: #64748b;
            font-size: 0.9em;
            margin-top: 40px;
            padding: 20px;
        }
        @media print {
            body {
                background: white;
                color: black;
            }
            .account-section {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎮 Destiny Chronicle Archive Report</h1>
            <div class="meta">
                <div>Generated: ${now}</div>
                <div>Timezone: ${tz}</div>
            </div>
        </div>

        ${accountSections}

        <div class="footer">
            <p>Generated by Destiny Chronicle</p>
            <p>This is an offline archive report. For the full interactive experience, visit the live app.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateAccountSection(account: ArchiveHtmlReportData): string {
    const totalTimeFormatted = this.formatTime(account.summary.totalTime);
    const completedSeals = account.titles.filter(t => t.completed).length;

    return `
        <div class="account-section">
            <div class="account-header">
                <h2>${this.escapeHtml(account.displayName)}</h2>
                <div class="platform">${account.game} · ${account.platform} · ${account.membershipId}</div>
            </div>

            <div class="summary-grid">
                <div class="summary-card">
                    <div class="label">Total Activities</div>
                    <div class="value">${account.summary.totalActivities.toLocaleString()}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Total Time</div>
                    <div class="value">${totalTimeFormatted}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Seals/Titles</div>
                    <div class="value">${completedSeals}</div>
                </div>
                ${account.summary.firstEverActivity ? `
                <div class="summary-card">
                    <div class="label">First Ever Activity</div>
                    <div class="value" style="font-size: 1.2em;">${this.escapeHtml(account.summary.firstEverActivity)}</div>
                    <div class="label">${account.summary.firstEverDate}</div>
                </div>
                ` : ''}
            </div>

            ${this.generateHighlights(account)}
            ${this.generateFirstsTable(account)}
            ${this.generateTitlesTable(account)}
            ${this.generateActivitiesSummaryTable(account)}
        </div>`;
  }

  private generateHighlights(account: ArchiveHtmlReportData): string {
    const highlights: string[] = [];

    // Top activity types
    const activityTypeCounts = new Map<string, number>();
    for (const activity of account.activities) {
      const type = this.manifest.getActivityType(activity.activityDetails?.referenceId, activity.activityDetails?.mode) || 'Unknown';
      activityTypeCounts.set(type, (activityTypeCounts.get(type) || 0) + 1);
    }
    const topTypes = Array.from(activityTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type} (${count})`)
      .join(', ');

    if (topTypes) {
      highlights.push(`Most played activities: ${topTypes}`);
    }

    // Guardian Firsts count
    if (account.firsts.length > 0) {
      const raidFirsts = account.firsts.filter(f => f.type === 'raid').length;
      const dungeonFirsts = account.firsts.filter(f => f.type === 'dungeon').length;
      if (raidFirsts > 0) highlights.push(`${raidFirsts} raid first completions`);
      if (dungeonFirsts > 0) highlights.push(`${dungeonFirsts} dungeon first completions`);
    }

    // Gilded titles
    const gildedTitles = account.titles.filter(t => t.isGilded).length;
    if (gildedTitles > 0) {
      highlights.push(`${gildedTitles} gilded ${gildedTitles === 1 ? 'title' : 'titles'}`);
    }

    return highlights.length > 0 ? `
        <div class="section">
            <h3>📊 Highlights</h3>
            <ul style="padding-left: 25px; color: #cbd5e1;">
                ${highlights.map(h => `<li>${this.escapeHtml(h)}</li>`).join('')}
            </ul>
        </div>` : '';
  }

  private generateFirstsTable(account: ArchiveHtmlReportData): string {
    if (account.firsts.length === 0) {
      return '';
    }

    const rows = account.firsts
      .sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime())
      .slice(0, 50) // Limit to 50 most recent
      .map(first => {
        const name = this.manifest.getActivityName(first.referenceId, first.game === 'D1') || first.name || 'Unknown';
        const type = first.type || 'activity';
        const date = new Date(first.completionDate).toLocaleDateString();
        const badges: string[] = [];
        
        if (first.isSoloFlawless) badges.push('<span class="badge badge-completed">Solo Flawless</span>');
        else if (first.isSolo) badges.push('<span class="badge badge-completed">Solo</span>');
        
        return `
          <tr>
            <td>${date}</td>
            <td>${this.escapeHtml(name)}</td>
            <td><span class="badge badge-${type}">${type}</span></td>
            <td>${badges.join(' ')}</td>
          </tr>`;
      }).join('');

    return `
        <div class="section">
            <h3>🏆 Guardian Firsts (Top 50)</h3>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Activity</th>
                        <th>Type</th>
                        <th>Achievement</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>`;
  }

  private generateTitlesTable(account: ArchiveHtmlReportData): string {
    if (account.titles.length === 0) {
      return '';
    }

    const completed = account.titles.filter(t => t.completed);
    if (completed.length === 0) {
      return '';
    }

    const rows = completed.map(title => {
      const badges: string[] = [];
      if (title.isGilded) badges.push(`<span class="badge badge-completed">Gilded ${title.timesGilded || 1}x</span>`);
      if (title.legacy) badges.push('<span class="badge">Legacy</span>');
      
      return `
          <tr>
            <td>${this.escapeHtml(title.name)}</td>
            <td>${badges.join(' ')}</td>
          </tr>`;
    }).join('');

    return `
        <div class="section">
            <h3>🎖️ Titles & Seals (${completed.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>`;
  }

  private generateActivitiesSummaryTable(account: ArchiveHtmlReportData): string {
    // Group activities by type and name
    const activityGroups = new Map<string, {
      name: string;
      type: string;
      count: number;
      completedCount: number;
      totalTime: number;
      lastPlayed: string;
    }>();

    for (const activity of account.activities) {
      const name = this.manifest.getActivityName(activity.activityDetails?.referenceId, activity.game === 'D1') || 'Unknown';
      const type = this.manifest.getActivityType(activity.activityDetails?.referenceId, activity.activityDetails?.mode) || 'Unknown';
      const key = `${name}|${type}`;
      
      const existing = activityGroups.get(key) || {
        name,
        type,
        count: 0,
        completedCount: 0,
        totalTime: 0,
        lastPlayed: activity.period
      };

      existing.count++;
      const completed = (activity as any).values?.completed?.basic?.value;
      if (completed === 1) existing.completedCount++;
      
      const timeSeconds = (activity as any).values?.timePlayedSeconds?.basic?.value || 0;
      existing.totalTime += timeSeconds;
      
      if (new Date(activity.period) > new Date(existing.lastPlayed)) {
        existing.lastPlayed = activity.period;
      }

      activityGroups.set(key, existing);
    }

    const sortedGroups = Array.from(activityGroups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 100); // Top 100

    const rows = sortedGroups.map(group => {
      const clearRate = group.count > 0 ? ((group.completedCount / group.count) * 100).toFixed(1) : '0.0';
      return `
          <tr>
            <td>${this.escapeHtml(group.name)}</td>
            <td><span class="badge">${this.escapeHtml(group.type)}</span></td>
            <td class="highlight">${group.count}</td>
            <td>${group.completedCount}</td>
            <td>${clearRate}%</td>
            <td>${this.formatTime(group.totalTime)}</td>
            <td>${new Date(group.lastPlayed).toLocaleDateString()}</td>
          </tr>`;
    }).join('');

    return `
        <div class="section">
            <h3>📋 Activity Summary (Top 100)</h3>
            <table>
                <thead>
                    <tr>
                        <th>Activity</th>
                        <th>Type</th>
                        <th>Runs</th>
                        <th>Clears</th>
                        <th>Clear %</th>
                        <th>Time</th>
                        <th>Last Played</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>`;
  }

  private formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '0h 0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
