import { CONTROL_HINTS } from '@/game/input/keyboard';

/** Control reference table (keyboard and touch), used on the menu and in the help dialog. */
export function ControlsHelp() {
  return (
    <table className="controls-table">
      <caption className="visually-hidden">Controls</caption>
      <thead>
        <tr>
          <th scope="col">Action</th>
          <th scope="col">Keyboard</th>
          <th scope="col">Touch</th>
        </tr>
      </thead>
      <tbody>
        {CONTROL_HINTS.map((hint) => (
          <tr key={hint.action}>
            <th scope="row">{hint.action}</th>
            <td>
              <kbd>{hint.keys}</kbd>
            </td>
            <td>{hint.touch}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Compact one-line key legend shown during a match on keyboard/mouse devices. */
export function KeyLegend() {
  return (
    <p className="key-legend" data-testid="key-legend">
      <span>
        <kbd>W</kbd> sail
      </span>
      <span>
        <kbd>A</kbd>
        <kbd>D</kbd> turn
      </span>
      <span>
        <kbd>Space</kbd> front
      </span>
      <span>
        <kbd>Q</kbd>
        <kbd>E</kbd> broadsides
      </span>
      <span>
        <kbd>Esc</kbd> pause
      </span>
    </p>
  );
}
