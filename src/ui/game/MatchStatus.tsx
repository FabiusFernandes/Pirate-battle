import { useEffect, useRef, useState } from 'react';
import type { HudState } from '@/game/engine/GameSession';
import { formatDurationLong } from '../format';

/**
 * Semantic mirror of the HUD for assistive technology. The definition list is always
 * readable; the live region only announces meaningful moments (score changes, low health,
 * pause, time milestones) instead of every tick.
 */
export function MatchStatus({ hud }: { hud: HudState }) {
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef(hud);

  useEffect(() => {
    const prev = previous.current;
    previous.current = hud;
    let message: string | null = null;
    if (hud.status === 'paused' && prev.status !== 'paused') message = 'Game paused.';
    else if (hud.status === 'running' && prev.status === 'paused') message = 'Game resumed.';
    else if (hud.score > prev.score) message = `Enemy sunk. Score ${hud.score}.`;
    else if (hud.health < prev.health && hud.health > 0 && hud.health <= hud.maxHealth * 0.3 && prev.health > hud.maxHealth * 0.3)
      message = `Health low: ${hud.health}.`;
    else if (hud.remaining !== prev.remaining && [60, 30, 10].includes(hud.remaining))
      message = `${formatDurationLong(hud.remaining)} left.`;
    if (message) setAnnouncement(message);
  }, [hud]);

  return (
    <section className="visually-hidden" aria-label="Match status" data-testid="match-status">
      <dl>
        <dt>Health</dt>
        <dd data-testid="status-health">
          {hud.health} of {hud.maxHealth}
        </dd>
        <dt>Score</dt>
        <dd data-testid="status-score">{hud.score}</dd>
        <dt>Time left</dt>
        <dd data-testid="status-time">{formatDurationLong(hud.remaining)}</dd>
        <dt>State</dt>
        <dd data-testid="status-state">{hud.status}</dd>
      </dl>
      <p role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
