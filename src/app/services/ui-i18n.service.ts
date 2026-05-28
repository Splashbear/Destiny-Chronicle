import { Injectable } from '@angular/core';
import { LocaleService } from './locale.service';

type UiLocale = 'en' | 'fr' | 'es' | 'de' | 'pt-br' | 'ja' | 'zh-chs';

const MESSAGES: Record<UiLocale, Record<string, string>> = {
  en: {
    'tab.activities': 'Activities',
    'tab.firsts': 'Guardian Firsts',
    'tab.titles': 'Titles',
    'tab.breakdown': 'Activity Breakdown',
    'firsts.pantheonEvents': 'Pantheon Events',
    'breakdown.activity': 'Activity',
    'breakdown.variant': 'Variant',
    'breakdown.game': 'Game',
    'breakdown.lastPlayed': 'Last played',
    'breakdown.runsClearsTime': 'Runs / Clears / Time',
    'activities.collapseAllYears': 'Collapse all years',
    'activities.expandAllYears': 'Expand all years',
    'activities.show': 'Show',
    'activities.hide': 'Hide',
    'activities.expand': 'Expand',
    'activities.collapse': 'Collapse',
    'pgcr.title': 'Activity report',
    'pgcr.loading': 'Loading fireteam…',
    'pgcr.error': 'Could not load activity report.',
    'pgcr.errorRetry': 'Failed to load PGCR. Try again or open the full report.',
    'pgcr.noPlayers': 'No player data in this report.',
    'pgcr.close': 'Close',
    'pgcr.full': 'Full PGCR ↗',
    'pgcr.ctrlHint': 'Ctrl+click for full PGCR',
    'common.close': 'Close'
  },
  fr: {
    'tab.activities': 'Activités',
    'tab.firsts': 'Premières fois',
    'tab.titles': 'Titres',
    'tab.breakdown': 'Répartition',
    'breakdown.activity': 'Activité',
    'breakdown.variant': 'Variante',
    'breakdown.game': 'Jeu',
    'breakdown.lastPlayed': 'Dernière partie',
    'breakdown.runsClearsTime': 'Parties / Réussites / Temps',
    'activities.collapseAllYears': 'Replier toutes les années',
    'activities.expandAllYears': 'Déplier toutes les années',
    'activities.show': 'Afficher',
    'activities.hide': 'Masquer',
    'activities.expand': 'Déplier',
    'activities.collapse': 'Replier',
    'pgcr.title': 'Rapport d\'activité',
    'pgcr.loading': 'Chargement de l\'escouade…',
    'pgcr.error': 'Impossible de charger le rapport.',
    'pgcr.errorRetry': 'Échec du chargement. Réessayez ou ouvrez le rapport complet.',
    'pgcr.noPlayers': 'Aucune donnée joueur dans ce rapport.',
    'pgcr.close': 'Fermer',
    'pgcr.full': 'PGCR complet ↗',
    'pgcr.ctrlHint': 'Ctrl+clic pour le PGCR complet',
    'common.close': 'Fermer'
  },
  es: {
    'tab.activities': 'Actividades',
    'tab.firsts': 'Primeras veces',
    'tab.titles': 'Títulos',
    'tab.breakdown': 'Desglose',
    'breakdown.activity': 'Actividad',
    'breakdown.variant': 'Variante',
    'breakdown.game': 'Juego',
    'breakdown.lastPlayed': 'Última partida',
    'breakdown.runsClearsTime': 'Partidas / Victorias / Tiempo',
    'activities.collapseAllYears': 'Contraer todos los años',
    'activities.expandAllYears': 'Expandir todos los años',
    'activities.show': 'Mostrar',
    'activities.hide': 'Ocultar',
    'activities.expand': 'Expandir',
    'activities.collapse': 'Contraer',
    'pgcr.title': 'Informe de actividad',
    'pgcr.loading': 'Cargando equipo…',
    'pgcr.error': 'No se pudo cargar el informe.',
    'pgcr.errorRetry': 'Error al cargar. Inténtalo de nuevo o abre el informe completo.',
    'pgcr.noPlayers': 'Sin datos de jugadores en este informe.',
    'pgcr.close': 'Cerrar',
    'pgcr.full': 'PGCR completo ↗',
    'pgcr.ctrlHint': 'Ctrl+clic para PGCR completo',
    'common.close': 'Cerrar'
  },
  de: {
    'tab.activities': 'Aktivitäten',
    'tab.firsts': 'Erste Male',
    'tab.titles': 'Titel',
    'tab.breakdown': 'Übersicht',
    'breakdown.activity': 'Aktivität',
    'breakdown.variant': 'Variante',
    'breakdown.game': 'Spiel',
    'breakdown.lastPlayed': 'Zuletzt gespielt',
    'breakdown.runsClearsTime': 'Läufe / Siege / Zeit',
    'activities.collapseAllYears': 'Alle Jahre einklappen',
    'activities.expandAllYears': 'Alle Jahre ausklappen',
    'activities.show': 'Anzeigen',
    'activities.hide': 'Ausblenden',
    'activities.expand': 'Ausklappen',
    'activities.collapse': 'Einklappen',
    'pgcr.title': 'Aktivitätsbericht',
    'pgcr.loading': 'Trupp wird geladen…',
    'pgcr.error': 'Bericht konnte nicht geladen werden.',
    'pgcr.errorRetry': 'Laden fehlgeschlagen. Erneut versuchen oder vollständigen Bericht öffnen.',
    'pgcr.noPlayers': 'Keine Spielerdaten in diesem Bericht.',
    'pgcr.close': 'Schließen',
    'pgcr.full': 'Vollständiger PGCR ↗',
    'pgcr.ctrlHint': 'Strg+Klick für vollständigen PGCR',
    'common.close': 'Schließen'
  },
  'pt-br': {
    'tab.activities': 'Atividades',
    'tab.firsts': 'Primeiras vezes',
    'tab.titles': 'Títulos',
    'tab.breakdown': 'Resumo',
    'breakdown.activity': 'Atividade',
    'breakdown.variant': 'Variante',
    'breakdown.game': 'Jogo',
    'breakdown.lastPlayed': 'Última partida',
    'breakdown.runsClearsTime': 'Partidas / Vitórias / Tempo',
    'activities.collapseAllYears': 'Recolher todos os anos',
    'activities.expandAllYears': 'Expandir todos os anos',
    'activities.show': 'Mostrar',
    'activities.hide': 'Ocultar',
    'activities.expand': 'Expandir',
    'activities.collapse': 'Recolher',
    'pgcr.title': 'Relatório de atividade',
    'pgcr.loading': 'Carregando equipe…',
    'pgcr.error': 'Não foi possível carregar o relatório.',
    'pgcr.errorRetry': 'Falha ao carregar. Tente novamente ou abra o relatório completo.',
    'pgcr.noPlayers': 'Sem dados de jogadores neste relatório.',
    'pgcr.close': 'Fechar',
    'pgcr.full': 'PGCR completo ↗',
    'pgcr.ctrlHint': 'Ctrl+clique para PGCR completo',
    'common.close': 'Fechar'
  },
  ja: {
    'tab.activities': 'アクティビティ',
    'tab.firsts': '初クリア',
    'tab.titles': '称号',
    'tab.breakdown': '内訳',
    'breakdown.activity': 'アクティビティ',
    'breakdown.variant': 'バリアント',
    'breakdown.game': 'ゲーム',
    'breakdown.lastPlayed': '最終プレイ',
    'breakdown.runsClearsTime': '回数 / クリア / 時間',
    'activities.collapseAllYears': '全年を折りたたむ',
    'activities.expandAllYears': '全年を展開',
    'activities.show': '表示',
    'activities.hide': '非表示',
    'activities.expand': '展開',
    'activities.collapse': '折りたたむ',
    'pgcr.title': 'アクティビティレポート',
    'pgcr.loading': 'メンバーを読み込み中…',
    'pgcr.error': 'レポートを読み込めませんでした。',
    'pgcr.errorRetry': '読み込みに失敗しました。再試行するか完全版を開いてください。',
    'pgcr.noPlayers': 'このレポートにプレイヤーデータがありません。',
    'pgcr.close': '閉じる',
    'pgcr.full': '完全な PGCR ↗',
    'pgcr.ctrlHint': 'Ctrl+クリックで完全な PGCR',
    'common.close': '閉じる'
  },
  'zh-chs': {
    'tab.activities': '活动',
    'tab.firsts': '守护者首次',
    'tab.titles': '称号',
    'tab.breakdown': '活动统计',
    'breakdown.activity': '活动',
    'breakdown.variant': '变体',
    'breakdown.game': '游戏',
    'breakdown.lastPlayed': '最近游玩',
    'breakdown.runsClearsTime': '次数 / 通关 / 时间',
    'activities.collapseAllYears': '折叠所有年份',
    'activities.expandAllYears': '展开所有年份',
    'activities.show': '显示',
    'activities.hide': '隐藏',
    'activities.expand': '展开',
    'activities.collapse': '折叠',
    'pgcr.title': '活动报告',
    'pgcr.loading': '正在加载小队…',
    'pgcr.error': '无法加载活动报告。',
    'pgcr.errorRetry': '加载失败。请重试或打开完整报告。',
    'pgcr.noPlayers': '此报告中没有玩家数据。',
    'pgcr.close': '关闭',
    'pgcr.full': '完整 PGCR ↗',
    'pgcr.ctrlHint': 'Ctrl+点击打开完整 PGCR',
    'common.close': '关闭'
  }
};

@Injectable({
  providedIn: 'root'
})
export class UiI18nService {
  constructor(private locale: LocaleService) {}

  t(key: string): string {
    const uiLocale = this.mapCultureToUi(this.locale.culture);
    return MESSAGES[uiLocale][key] ?? MESSAGES.en[key] ?? key;
  }

  private mapCultureToUi(culture: string): UiLocale {
    const c = culture.toLowerCase();
    if (c in MESSAGES) {
      return c as UiLocale;
    }
    if (c.startsWith('es')) return 'es';
    if (c.startsWith('zh')) return 'zh-chs';
    if (c.startsWith('pt')) return 'pt-br';
    if (c.startsWith('fr')) return 'fr';
    if (c.startsWith('de')) return 'de';
    if (c.startsWith('ja')) return 'ja';
    return 'en';
  }
}
