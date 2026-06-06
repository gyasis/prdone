// Spec 002 — unit tests for the companion icon row in tile renderers.
// The rendered HTML string is the contract: the kanban + sidebar both consume
// `renderCompanionIconRow(prd)` and produce DOM strings.
//
// We don't mount a DOM here — we assert on the rendered HTML string shape.
// That keeps tests fast (vitest unit) and avoids jsdom in the dependency tree.

import { describe, it, expect } from 'vitest';
import { renderCompanionIconRow } from '../../webview-frontend/tileGrid';
import type { Prd } from '../../src/types';

const basePrd: Prd = {
  id: 'sample_2026-05-22',
  title: 'Sample',
  path: '/home/u/dev/prd/scratch/sample_2026-05-22.md',
  tier: 'scratch',
  status: 'ACTIVE',
  age_days: 1,
  ephemeral: '',
  context: '',
  decisions: 0,
  subagents: 0,
  significance: null,
  tags: '',
  stale: false,
};

describe('renderCompanionIconRow', () => {
  describe('MD-only PRD (no companions)', () => {
    it('always emits the 📄 MD icon', () => {
      const html = renderCompanionIconRow(basePrd);
      expect(html).toContain('📄');
      expect(html).toContain('data-companion-type="md"');
      expect(html).toContain(`data-companion-path="${basePrd.path}"`);
    });

    it('does NOT emit 🌐 / 📕 / 📊 / 📓 icons when companions is absent', () => {
      const html = renderCompanionIconRow(basePrd);
      expect(html).not.toContain('🌐');
      expect(html).not.toContain('📕');
      expect(html).not.toContain('📊');
      expect(html).not.toContain('📓');
    });

    it('handles companions: null the same as undefined', () => {
      const html = renderCompanionIconRow({ ...basePrd, companions: null });
      expect(html).toContain('📄');
      expect(html).not.toContain('🌐');
    });
  });

  describe('PRD with HTML companion', () => {
    const prd: Prd = {
      ...basePrd,
      companions: { html: '/home/u/dev/prd/scratch/sample_2026-05-22.html' },
    };

    it('emits the 🌐 HTML icon when companions.html is present', () => {
      const html = renderCompanionIconRow(prd);
      expect(html).toContain('🌐');
      expect(html).toContain('data-companion-type="html"');
      expect(html).toContain('data-companion-path="/home/u/dev/prd/scratch/sample_2026-05-22.html"');
    });

    it('still includes the 📄 MD icon (MD never disappears)', () => {
      const html = renderCompanionIconRow(prd);
      expect(html).toContain('📄');
    });

    it('does not duplicate icons', () => {
      const html = renderCompanionIconRow(prd);
      const mdCount = (html.match(/📄/g) ?? []).length;
      const htmlCount = (html.match(/🌐/g) ?? []).length;
      expect(mdCount).toBe(1);
      expect(htmlCount).toBe(1);
    });

    it('includes the PRD title in the data attribute (used by WebviewPanel title)', () => {
      const html = renderCompanionIconRow(prd);
      expect(html).toContain(`data-companion-title="${prd.title}"`);
    });
  });

  describe('PRD with multiple companion types', () => {
    const prd: Prd = {
      ...basePrd,
      companions: {
        html: '/home/u/dev/prd/scratch/sample_2026-05-22.html',
        pdf:  '/home/u/dev/prd/scratch/sample_2026-05-22.pdf',
        pptx: '/home/u/dev/prd/scratch/sample_2026-05-22.pptx',
      },
    };

    it('emits icons in canonical order (md → html → pdf → pptx → ipynb)', () => {
      const html = renderCompanionIconRow(prd);
      const mdPos = html.indexOf('📄');
      const htmlPos = html.indexOf('🌐');
      const pdfPos = html.indexOf('📕');
      const pptxPos = html.indexOf('📊');
      expect(mdPos).toBeLessThan(htmlPos);
      expect(htmlPos).toBeLessThan(pdfPos);
      expect(pdfPos).toBeLessThan(pptxPos);
    });

    it('skips ipynb when not present (forward-compat: extra types OK)', () => {
      const html = renderCompanionIconRow(prd);
      expect(html).not.toContain('📓');
    });
  });

  describe('XSS / escaping safety', () => {
    it('escapes path and title in data attributes (no raw HTML injection)', () => {
      const prd: Prd = {
        ...basePrd,
        title: '<script>alert(1)</script>',
        path: '/safe/path.md',
        companions: { html: '/safe/path"><script>alert(2)</script>.html' },
      };
      const html = renderCompanionIconRow(prd);
      // Neither raw <script> sequence should escape the data-attribute context.
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<script>alert(2)</script>');
      // Escaped form must be present.
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('toolbar container structure', () => {
    it('wraps icons in a .companion-row container with proper ARIA', () => {
      const html = renderCompanionIconRow(basePrd);
      expect(html).toMatch(/<div class="companion-row" role="toolbar" aria-label="Companion artifacts">/);
      expect(html).toContain('</div>');
    });

    it('every icon is a <button type="button"> for keyboard + screen-reader nav', () => {
      const prd: Prd = {
        ...basePrd,
        companions: { html: '/home/u/dev/prd/scratch/sample_2026-05-22.html' },
      };
      const html = renderCompanionIconRow(prd);
      const buttonCount = (html.match(/<button type="button"/g) ?? []).length;
      expect(buttonCount).toBe(2); // MD + HTML
    });
  });
});
