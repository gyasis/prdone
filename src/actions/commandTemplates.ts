// Pure function: given a Prd, return the tier-appropriate copy-pasteable
// Claude Code command list.
//
// Source of truth: data-model.md "Entity: ActionCommand"
// Read-only invariant (Constitution Principle II + FR-010): the command STRINGS
// reference state-mutating subcommands like `prd resolve`, but they are written
// to the user's clipboard for *manual* invocation. The extension itself never
// spawns these commands (FR-019 / SC-006).

import type { Prd, ActionCommand } from '../types';

export function actionCommandsFor(prd: Prd): ActionCommand[] {
  const cmds: ActionCommand[] = [
    { kind: 'open-file',    label: 'Open file',      command: `code "${prd.path}"` },
    { kind: 'checkout',     label: 'Checkout',       command: `/prd-checkout ${prd.id}` },
    { kind: 'log-note',     label: 'Log note',       command: `prd log ${prd.id} note "..."` },
    { kind: 'log-decision', label: 'Log decision',   command: `prd log ${prd.id} decision "..."` }
  ];

  if (prd.tier === 'scratch' && prd.status === 'ACTIVE') {
    cmds.push({
      kind: 'resolve',
      label: 'Resolve',
      command: `prd resolve ${prd.id} --reason "..."`
    });
  } else if (prd.tier === 'archive') {
    cmds.push({
      kind: 'graduate',
      label: 'Graduate',
      command: `prd graduate ${prd.id}`
    });
  }
  // tier === 'library' is terminal — no extra commands.

  return cmds;
}
