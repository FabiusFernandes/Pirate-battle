import { useState } from 'react';
import type { HudState } from '@/game/engine/GameSession';

/**
 * Screen-edge feedback for the player's ship: a short red flash on every hit and a pulsing
 * vignette while health is low. Pure CSS animations, keyed by the hit counter; the arena
 * centre stays clear so the battle remains readable.
 */
export function DamageFeedback({ hud }: { hud: HudState }) {
  const [hits, setHits] = useState(0);
  const [lastHealth, setLastHealth] = useState(hud.health);

  // Derived-state update during render (React's documented pattern for reacting to prop changes).
  if (hud.health !== lastHealth) {
    if (hud.health < lastHealth) setHits((n) => n + 1);
    setLastHealth(hud.health);
  }

  const low = hud.status !== 'ended' && hud.health > 0 && hud.health <= hud.maxHealth * 0.3;

  return (
    <div className="damage-feedback" aria-hidden="true">
      {low && <div className="damage-feedback__low" data-testid="low-health" />}
      {hits > 0 && <div key={hits} className="damage-feedback__flash" data-testid="damage-flash" />}
    </div>
  );
}
