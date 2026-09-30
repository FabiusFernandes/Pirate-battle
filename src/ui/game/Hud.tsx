import type { HudState } from '@/game/engine/GameSession';
import { uiImageUrl } from '@/game/assets/manifest';
import { RoundButton } from '../components/RoundButton';
import { formatClock } from '../format';

interface HudProps {
  hud: HudState;
  onPause: () => void;
}

/** Health fill area inside `health_frame` (ui_sheet.json `fill_rect`, 256 × 48 logical). */
const FILL = { x: 30, w: 196, frame: 256 } as const;

/**
 * Heads-up display drawn by React on top of the canvas. It re-renders only when the session
 * publishes a new HUD snapshot (health / score change, or once per second for the timer).
 * The graphic part is hidden from assistive technology; `MatchStatus` provides the same
 * information semantically.
 */
export function Hud({ hud, onPause }: HudProps) {
  const fraction = hud.maxHealth > 0 ? hud.health / hud.maxHealth : 0;
  const rightInset = ((FILL.frame - FILL.x - FILL.w * fraction) / FILL.frame) * 100;
  const fillImage = fraction > 0.6 ? 'health_fill_green' : fraction > 0.3 ? 'health_fill_amber' : 'health_fill_red';
  const lowTime = hud.remaining <= 10 && hud.status !== 'ended';

  return (
    <>
      <div className="hud" aria-hidden="true">
        <div className="hud__health" data-testid="hud-health">
          <img className="hud__heart" src={uiImageUrl('hud/icon_heart.png')} alt="" />
          <div className="hud__bar">
            <img src={uiImageUrl('hud/health_frame.png')} alt="" />
            <img
              className="hud__bar-fill"
              src={uiImageUrl(`hud/${fillImage}.png`)}
              alt=""
              style={{ clipPath: `inset(0 ${rightInset}% 0 0)` }}
            />
            <span className="hud__bar-text">
              {hud.health} / {hud.maxHealth}
            </span>
          </div>
        </div>

        <div className="hud__right">
          <div className="hud__counter" data-testid="hud-score">
            <img src={uiImageUrl('hud/icon_score.png')} alt="" />
            <span>{hud.score}</span>
          </div>
          <div className={`hud__counter${lowTime ? ' hud__counter--warning' : ''}`} data-testid="hud-time">
            <img src={uiImageUrl('hud/icon_time.png')} alt="" />
            <span>{formatClock(hud.remaining)}</span>
          </div>
        </div>
      </div>
      <div className="hud__pause">
        <RoundButton icon="icon_pause" label="Pause" onClick={onPause} disabled={hud.status !== 'running'} data-testid="hud-pause" />
      </div>
    </>
  );
}
