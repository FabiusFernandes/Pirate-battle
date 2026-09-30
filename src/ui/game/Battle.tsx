import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GameAssets } from '@/game/assets/GameAssets';
import { DEFAULT_PLAYER_OPTIONS, createMatchConfig, type PlayerOptions } from '@/game/config/gameConfig';
import { MANUAL_CLOCK, e2eConfigOverrides, e2eSeed, registerE2ESession } from '@/game/debug/e2eBridge';
import { GameHost } from '@/game/engine/GameHost';
import { GameSession, type MatchResult } from '@/game/engine/GameSession';
import { useStore } from '@/lib/store';
import { KeyLegend } from '../components/ControlsHelp';
import { usePortraitLock } from '../usePortraitLock';
import { DamageFeedback } from './DamageFeedback';
import { Hud } from './Hud';
import { MatchStatus } from './MatchStatus';
import { PauseDialog } from './PauseDialog';
import { ResultDialog } from './ResultDialog';
import { TouchControls } from './TouchControls';

interface BattleProps {
  assets: GameAssets;
  options?: PlayerOptions;
  onExit: () => void;
  onPlayAgain: () => void;
  /** Called as soon as the match ends (before the result dialog appears). */
  onMatchEnd?: (result: MatchResult) => void;
  onFailure: (error: Error) => void;
}

/** Lets the final explosion play before the result dialog covers the arena. */
const RESULT_DELAY_MS = 900;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

function createSession(options: PlayerOptions): GameSession {
  // The config snapshot is taken here, once per match: later option changes only affect new matches.
  const config = createMatchConfig(options, e2eConfigOverrides());
  return new GameSession({ config, seed: e2eSeed() ?? randomSeed(), matchId: crypto.randomUUID() });
}

/**
 * One match on screen. The session (pure state, no side effects on construction) is created
 * once per mount; the PixiJS host and all listeners live inside effects so they are
 * released on unmount — including Strict Mode's simulated unmount.
 */
export function Battle({ assets, options = DEFAULT_PLAYER_OPTIONS, onExit, onPlayAgain, onMatchEnd, onFailure }: BattleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [session] = useState(() => createSession(options));
  const [result, setResult] = useState<MatchResult | null>(null);
  const hud = useStore(session.hud);
  const portrait = usePortraitLock();

  const reportFailure = useEffectEvent((error: Error) => {
    onFailure(error);
  });
  const reportEnd = useEffectEvent((r: MatchResult) => {
    onMatchEnd?.(r);
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const host = new GameHost({ container, assets, session, manualClock: MANUAL_CLOCK });
    const unregister = registerE2ESession(session, host);
    host.start().catch((error: unknown) => {
      if (host.isDestroyed) return;
      reportFailure(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      unregister();
      host.destroy();
      session.detach();
    };
  }, [assets, session]);

  // Persist the result immediately; show the dialog once the final explosion has played.
  useEffect(() => {
    let timer = 0;
    const unsubscribe = session.result.subscribe(() => {
      const r = session.result.getSnapshot();
      if (!r) return;
      reportEnd(r);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      timer = window.setTimeout(
        () => {
          setResult(r);
        },
        reduced ? 0 : RESULT_DELAY_MS,
      );
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [session]);

  // Portrait phones cannot show the arena at a usable size: pause and ask to rotate.
  useEffect(() => {
    if (portrait) session.pause('orientation');
  }, [portrait, session]);

  const pause = useCallback(() => {
    session.pause('manual');
  }, [session]);
  const resume = useCallback(() => {
    session.resume();
  }, [session]);

  return (
    <>
      <div ref={containerRef} className="game-stage" data-testid="game-stage" />
      <DamageFeedback hud={hud} />
      <Hud hud={hud} onPause={pause} />
      <MatchStatus hud={hud} />
      <TouchControls input={session.input} disabled={hud.status !== 'running'} />
      <KeyLegend />
      {portrait && (
        <div className="rotate-overlay" role="alert" data-testid="rotate-overlay">
          <p>Rotate your device to landscape to keep sailing.</p>
        </div>
      )}
      {!portrait && hud.status === 'paused' && hud.pauseReason && (
        <PauseDialog reason={hud.pauseReason} onResume={resume} onExit={onExit} />
      )}
      {result && !portrait && <ResultDialog result={result} onPlayAgain={onPlayAgain} onExit={onExit} />}
    </>
  );
}
