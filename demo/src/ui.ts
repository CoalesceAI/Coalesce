import blessed from 'blessed';

// ---------------------------------------------------------------------------
// Screen interface — typed surface for logging to the split-pane TUI
// ---------------------------------------------------------------------------

export interface Screen {
  left: { log: (...args: string[]) => void };
  right: { log: (...args: string[]) => void };
  render: () => void;
  destroy: () => void;
}

// ---------------------------------------------------------------------------
// createScreen — builds the split-pane blessed terminal UI
// ---------------------------------------------------------------------------

export function createScreen(): Screen {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Coalesce Demo',
    fullUnicode: true,
  });

  // Left pane: AgentMail interaction
  const left = blessed.log({
    parent: screen,
    label: ' AgentMail ',
    border: { type: 'line' },
    style: {
      border: { fg: 'yellow' },
      label: { fg: 'yellow', bold: true },
      scrollbar: { bg: 'yellow' },
    },
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ', track: { bg: 'grey' } },
    tags: true,
    mouse: true,
    keys: true,
    vi: false,
    padding: { left: 1, right: 1 },
  });

  // Right pane: Coalesce support conversation
  const right = blessed.log({
    parent: screen,
    label: ' Coalesce Support ',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      label: { fg: 'cyan', bold: true },
      scrollbar: { bg: 'cyan' },
    },
    top: 0,
    left: '50%',
    width: '50%',
    height: '100%',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ', track: { bg: 'grey' } },
    tags: true,
    mouse: true,
    keys: true,
    vi: false,
    padding: { left: 1, right: 1 },
  });

  // Keybindings to exit early
  screen.key(['q', 'escape', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.render();

  return {
    left: {
      log: (...args: string[]) => {
        left.log(args.join(' '));
        screen.render();
      },
    },
    right: {
      log: (...args: string[]) => {
        right.log(args.join(' '));
        screen.render();
      },
    },
    render: () => screen.render(),
    destroy: () => screen.destroy(),
  };
}
