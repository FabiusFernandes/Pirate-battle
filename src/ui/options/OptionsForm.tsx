import { useId, useState, type SyntheticEvent } from 'react';
import { DEFAULT_PLAYER_OPTIONS, SESSION_TIME_LIMITS, SPAWN_INTERVAL_LIMITS } from '@/game/config/gameConfig';
import { playerOptions, savePlayerOptions, toDraft, validateOptions, type OptionField, type OptionsDraft } from '@/game/config/playerOptions';
import { NAME_LIMITS, playerProfile, saveCaptainName, validateCaptainName } from '@/game/profile/playerProfile';
import { useStore } from '@/lib/store';
import { MenuButton } from '../components/MenuButton';
import { RoundButton } from '../components/RoundButton';

interface Limits {
  min: number;
  max: number;
  step: number;
}

interface StepperFieldProps {
  field: OptionField;
  label: string;
  hint: string;
  limits: Limits;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

function stepValue(raw: string, delta: number, limits: Limits): string {
  const current = Number(raw);
  const base = Number.isFinite(current) ? current : limits.min;
  // Snap to the step grid, then clamp to the documented limits.
  const snapped = limits.min + Math.round((base - limits.min) / limits.step) * limits.step;
  const next = Math.min(limits.max, Math.max(limits.min, snapped + delta * limits.step));
  return String(Math.round(next * 100) / 100);
}

function StepperField({ field, label, hint, limits, value, error, onChange }: StepperFieldProps) {
  const id = useId();
  const inputId = `${id}-${field}`;
  const numeric = Number(value);
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="stepper">
        <RoundButton
          icon="icon_minus"
          label={`Decrease ${label.toLowerCase()}`}
          onClick={() => {
            onChange(stepValue(value, -1, limits));
          }}
          disabled={Number.isFinite(numeric) && numeric <= limits.min}
          data-testid={`${field}-decrease`}
        />
        <div className="stepper__value">
          <input
            id={inputId}
            className="stepper__input"
            type="number"
            inputMode="decimal"
            min={limits.min}
            max={limits.max}
            step={limits.step}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
            data-testid={`${field}-input`}
          />
          <span className="stepper__unit" aria-hidden="true">
            s
          </span>
        </div>
        <RoundButton
          icon="icon_plus"
          label={`Increase ${label.toLowerCase()}`}
          onClick={() => {
            onChange(stepValue(value, 1, limits));
          }}
          disabled={Number.isFinite(numeric) && numeric >= limits.max}
          data-testid={`${field}-increase`}
        />
      </div>
      <p id={`${inputId}-hint`} className="field__hint">
        {hint}
      </p>
      {error && (
        <p id={`${inputId}-error`} className="field__error" role="alert" data-testid={`${field}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

interface OptionsFormProps {
  /** Shown under the title, e.g. that changes apply to the next battle. */
  note?: string;
}

/**
 * Edits a draft of the options; nothing is stored until the player saves a valid draft.
 * Saved values persist across refreshes and apply to the next match that starts.
 */
export function OptionsForm({ note }: OptionsFormProps) {
  const saved = useStore(playerOptions);
  const profile = useStore(playerProfile);
  const nameId = useId();
  const [draft, setDraft] = useState<OptionsDraft>(() => toDraft(saved));
  const [name, setName] = useState(profile.name);
  const [status, setStatus] = useState('');
  const validation = validateOptions(draft);
  const errors = validation.errors ?? {};
  const nameError = validateCaptainName(name);
  const unchanged =
    validation.options !== null &&
    validation.options.sessionTime === saved.sessionTime &&
    validation.options.spawnInterval === saved.spawnInterval &&
    name.trim() === profile.name;

  const update = (field: OptionField) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setStatus('');
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!validation.options || nameError) return;
    const ok = savePlayerOptions(validation.options) && saveCaptainName(name);
    setStatus(ok ? 'Options saved. They apply to your next battle.' : 'Options apply now, but could not be stored on this device.');
  };

  return (
    <form className="options-form" onSubmit={submit} noValidate aria-describedby={note ? 'options-note' : undefined}>
      {note && (
        <p id="options-note" className="dialog-hint">
          {note}
        </p>
      )}
      <div className="field field--wide">
        <label className="field__label" htmlFor={nameId}>
          Captain name
        </label>
        <input
          id={nameId}
          className="text-input"
          type="text"
          autoComplete="nickname"
          maxLength={NAME_LIMITS.max + 5}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setStatus('');
          }}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-hint ${nameId}-error` : `${nameId}-hint`}
          data-testid="captainName-input"
        />
        <p id={`${nameId}-hint`} className="field__hint">
          Shown in the ranking. {NAME_LIMITS.min}–{NAME_LIMITS.max} characters.
        </p>
        {nameError && (
          <p id={`${nameId}-error`} className="field__error" role="alert" data-testid="captainName-error">
            {nameError}
          </p>
        )}
      </div>
      <StepperField
        field="sessionTime"
        label="Game session time"
        hint={`${SESSION_TIME_LIMITS.min}–${SESSION_TIME_LIMITS.max} seconds, in steps of ${SESSION_TIME_LIMITS.step}.`}
        limits={SESSION_TIME_LIMITS}
        value={draft.sessionTime}
        error={errors.sessionTime}
        onChange={update('sessionTime')}
      />
      <StepperField
        field="spawnInterval"
        label="Enemy spawn time"
        hint={`${SPAWN_INTERVAL_LIMITS.min}–${SPAWN_INTERVAL_LIMITS.max} seconds between enemies, in steps of ${SPAWN_INTERVAL_LIMITS.step}.`}
        limits={SPAWN_INTERVAL_LIMITS}
        value={draft.spawnInterval}
        error={errors.spawnInterval}
        onChange={update('spawnInterval')}
      />
      <div className="options-form__actions">
        <MenuButton type="submit" disabled={!validation.options || nameError !== null || unchanged} data-testid="options-save">
          Save
        </MenuButton>
        <MenuButton
          variant="secondary"
          size="small"
          onClick={() => {
            setDraft(toDraft(DEFAULT_PLAYER_OPTIONS));
            setStatus('');
          }}
          data-testid="options-reset"
        >
          Defaults
        </MenuButton>
      </div>
      <p className="options-form__status" role="status" data-testid="options-status">
        {status}
      </p>
    </form>
  );
}
