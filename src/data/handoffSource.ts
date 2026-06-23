import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { extractProjectHint } from '../lib/resolveStartPath';

export interface HandoffDoc {
  path: string;
  filename: string;
  slug: string;
  title: string;
  focus: string;
  mtimeMs: number;
  /** When the handoff was captured — parsed from the filename `__YYYYMMDD-HHMMSS` stamp, falling back to mtime. */
  capturedMs: number;
  resumeCmd: string;
  prdId: string | null;
  /** Best-effort project directory parsed from the handoff body (Worktree line / first dev path). null when none. */
  projectHint: string | null;
  /** Recommended start root for this handoff, resolved from projectHint by the sidebar provider. null until/unless resolved. */
  startRoot: string | null;
}

export async function listHandoffs(): Promise<HandoffDoc[]> {
  const handoffDir = path.join(os.homedir(), 'handoff');

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(handoffDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const mdFiles = entries.filter(
    e => e.isFile() && e.name.endsWith('.md')
  );

  const docs = await Promise.all(
    mdFiles.map(async (e): Promise<HandoffDoc | null> => {
      const filePath = path.join(handoffDir, e.name);

      let stat: fs.Stats;
      let content: string;
      try {
        [stat, content] = await Promise.all([
          fs.promises.stat(filePath),
          fs.promises.readFile(filePath, 'utf8'),
        ]);
      } catch {
        return null;
      }

      const filename = e.name;
      const slug = filename.includes('__')
        ? filename.split('__')[0]
        : filename.replace(/\.md$/, '');

      const h1Match = content.match(/^#\s+(.+)$/m);
      let title = h1Match
        ? h1Match[1].replace(/^Handoff\s*[—–-]\s*/i, '').trim()
        : slug;

      let focus = '';
      const focusHeaderMatch = content.match(
        /^##\s+Next session should focus on.*/im
      );
      if (focusHeaderMatch) {
        const afterHeader = content.slice(
          content.indexOf(focusHeaderMatch[0]) + focusHeaderMatch[0].length
        );
        const lines = afterHeader.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            focus = trimmed.replace(/^\*+|^\*\*/, '').replace(/\*+$|\*\*$/, '').trim();
            if (focus.length > 200) {
              focus = focus.slice(0, 200) + '…';
            }
            break;
          }
        }
      }

      if (!focus) {
        const genMatch = content.match(/_Generated\s.*?_/m);
        if (genMatch) {
          const afterGen = content.slice(
            content.indexOf(genMatch[0]) + genMatch[0].length
          );
          const lines = afterGen.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('_')) {
              focus = trimmed.replace(/^\*+|^\*\*/, '').replace(/\*+$|\*\*$/, '').trim();
              if (focus.length > 200) {
                focus = focus.slice(0, 200) + '…';
              }
              break;
            }
          }
        }
      }

      // Strip inline markdown noise (**bold**, `code`, leading bullet) from the snippet.
      focus = focus.replace(/\*\*/g, '').replace(/`/g, '').replace(/^[-*]\s+/, '').trim();

      // The filename carries the capture time: <slug>__YYYYMMDD-HHMMSS.md
      const tsMatch = filename.match(/__(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
      const capturedMs = tsMatch
        ? new Date(+tsMatch[1], +tsMatch[2] - 1, +tsMatch[3], +tsMatch[4], +tsMatch[5], +tsMatch[6]).getTime()
        : stat.mtimeMs;

      return {
        path: filePath,
        filename,
        slug,
        title,
        focus,
        mtimeMs: stat.mtimeMs,
        capturedMs,
        resumeCmd: `read the handoff at ${filePath} and continue`,
        prdId: null,
        projectHint: extractProjectHint(content),
        startRoot: null,
      };
    })
  );

  return docs
    .filter((d): d is HandoffDoc => d !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function archiveHandoff(absPath: string): Promise<void> {
  const archiveDir = path.join(os.homedir(), 'handoff', 'archive');
  await fs.promises.mkdir(archiveDir, { recursive: true });

  const filename = path.basename(absPath);
  let destPath = path.join(archiveDir, filename);

  try {
    await fs.promises.access(destPath);
    const stat = await fs.promises.stat(absPath);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    destPath = path.join(archiveDir, `${base}_${Math.floor(stat.mtimeMs)}${ext}`);
  } catch {
    // Dest doesn't exist — no collision
  }

  await fs.promises.rename(absPath, destPath);
}
