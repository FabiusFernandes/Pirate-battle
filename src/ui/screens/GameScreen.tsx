import { useCallback, useEffect, useRef, useState } from 'react';
import { gameAssetLoader } from '@/game/assets/GameAssets';
import { playerOptions } from '@/game/config/playerOptions';
import type { MatchResult } from '@/game/engine/GameSession';
import { useStore } from '@/lib/store';
import { MenuButton } from '../components/MenuButton';
import { Panel } from '../components/Panel';
import { Battle } from '../game/Battle';

interface GameScreenProps {
  onExit: () => void;
  onPlayAgain: () => void;
  onMatchEnd: (result: MatchResult) => void;
}

export function GameScreen({ onExit, onPlayAgain, onMatchEnd }: GameScreenProps) {
  const assetState = useStore(gameAssetLoader.state);
  // Snapshot of the options when this screen (= this match) starts.
  const [options] = useState(() => playerOptions.getSnapshot());
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    // Errors are reflected in the loader state; nothing else to do here.
    gameAssetLoader.load().catch(() => undefined);
  }, []);

  const retry = useCallback(() => {
    setRuntimeError(null);
    gameAssetLoader.retry().catch(() => undefined);
  }, []);

  const onRuntimeError = useCallback((error: Error) => {
    console.error('[game] failed to start', error);
    setRuntimeError('The game could not start on this device.');
  }, []);

  if (assetState.status === 'ready' && !runtimeError) {
    return (
      <main className="screen screen--game" aria-labelledby="battle-title">
        <h1 id="battle-title" className="visually-hidden">
          Battle
        </h1>
        <Battle
          assets={assetState.assets}
          options={options}
          onExit={onExit}
          onPlayAgain={onPlayAgain}
          onMatchEnd={onMatchEnd}
          onFailure={onRuntimeError}
        />
      </main>
    );
  }

  const errorMessage = runtimeError ?? (assetState.status === 'error' ? assetState.message : null);

  return (
    <main className="screen screen--menu" aria-label="Loading battle">
      <Panel className="loading-panel">
        {errorMessage ? (
          <LoadError message={errorMessage} onRetry={retry} onExit={onExit} />
        ) : (
          <LoadProgress progress={assetState.status === 'loading' ? assetState.progress : 0} />
        )}
      </Panel>
    </main>
  );
}

function LoadProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="loading" data-testid="asset-loading">
      <h2 className="panel-title">Preparing the fleet</h2>
      <div
        className="progress"
        role="progressbar"
        aria-label="Loading game assets"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress__fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <p className="loading__percent" aria-hidden="true">
        {percent}%
      </p>
    </div>
  );
}

function LoadError({ message, onRetry, onExit }: { message: string; onRetry: () => void; onExit: () => void }) {
  const retryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <div className="loading" data-testid="asset-error">
      <h2 className="panel-title">Stormy waters</h2>
      <p className="loading__error" role="alert">
        {message}
      </p>
      <div className="stack">
        <MenuButton ref={retryRef} onClick={onRetry} data-testid="asset-retry">
          Try again
        </MenuButton>
        <MenuButton onClick={onExit}>Main menu</MenuButton>
      </div>
    </div>
  );
}
