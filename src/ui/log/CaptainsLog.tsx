import { useEffect, useRef, type KeyboardEvent } from 'react';
import { MenuButton } from '../components/MenuButton';
import { Panel } from '../components/Panel';
import { HistoryTab } from './HistoryTab';
import { RankingTab } from './RankingTab';

export type LogTab = 'ranking' | 'history';

const TABS: readonly { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match history' },
];

interface CaptainsLogProps {
  tab: LogTab;
  onTabChange: (tab: LogTab) => void;
  onBack: () => void;
  onOpenNetwork: () => void;
}

/**
 * Ranking and Match History, as WAI-ARIA tabs (arrow keys move between tabs). Only the
 * selected tab is mounted, so showing a tab again always triggers a fresh fetch.
 */
export function CaptainsLog({ tab, onTabChange, onBack, onOpenNetwork }: CaptainsLogProps) {
  const tabRefs = useRef<Partial<Record<LogTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    tabRefs.current[tab]?.focus();
    // Only on mount: later tab changes move focus through the keyboard handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    const index = TABS.findIndex((t) => t.id === tab);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next];
    if (!target) return;
    onTabChange(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <main className="screen screen--menu" aria-labelledby="log-title">
      <Panel size="wide" className="log-panel">
        <h1 id="log-title" className="panel-title">
          Captain&apos;s Log
        </h1>
        <div className="log-tabs" role="tablist" aria-label="Captain's Log" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <MenuButton
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              variant="secondary"
              size="small"
              role="tab"
              id={`log-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`log-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => {
                onTabChange(t.id);
              }}
              data-testid={`log-tab-${t.id}`}
            >
              {t.label}
            </MenuButton>
          ))}
        </div>
        <div role="tabpanel" id={`log-panel-${tab}`} aria-labelledby={`log-tab-${tab}`} className="log-tabpanel">
          {tab === 'ranking' ? <RankingTab /> : <HistoryTab />}
        </div>
        <div className="log-footer">
          <MenuButton onClick={onBack} data-testid="log-back">
            Main menu
          </MenuButton>
          <button type="button" className="link-button" onClick={onOpenNetwork} data-testid="open-network">
            Mock API scenarios
          </button>
        </div>
      </Panel>
    </main>
  );
}
