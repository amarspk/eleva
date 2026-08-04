import * as fs from 'fs';
import * as path from 'path';

/**
 * AUDIT-001 regression guard — the styling system must actually be wired.
 *
 * The platform shipped with 308 Tailwind class attributes across three apps but
 * NO CSS pipeline: no `tailwindcss` dependency, no `tailwind.config.js`, no
 * `postcss.config.js`, no stylesheet, and no `import './globals.css'`. Every
 * class attribute was an inert string and the production build emitted no
 * stylesheet at all, so the entire UI rendered unstyled.
 *
 * Unit tests could never catch that: they assert component behaviour, not the
 * build pipeline. These checks assert the pipeline itself, so the wiring cannot
 * silently regress (e.g. a dropped `content` glob, a removed CSS import, or a
 * stray dependency prune).
 */
const APP_ROOT = path.resolve(__dirname, '../..');

describe('AUDIT-001 — Tailwind pipeline is wired', () => {
  it('declares tailwindcss, postcss and autoprefixer as dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf-8'));
    const dev = pkg.devDependencies ?? {};

    expect(dev.tailwindcss).toBeDefined();
    expect(dev.postcss).toBeDefined();
    expect(dev.autoprefixer).toBeDefined();
  });

  it('ships a tailwind config whose content globs cover the source tree', () => {
    const configPath = path.join(APP_ROOT, 'tailwind.config.js');
    expect(fs.existsSync(configPath)).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(configPath);
    expect(Array.isArray(config.content)).toBe(true);
    // Without a glob that matches .tsx, JIT emits nothing for our markup.
    expect(config.content.some((g: string) => g.includes('src/**') && g.includes('tsx'))).toBe(
      true,
    );
  });

  it('ships a postcss config that runs the tailwind plugin', () => {
    const configPath = path.join(APP_ROOT, 'postcss.config.js');
    expect(fs.existsSync(configPath)).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(configPath);
    expect(Object.keys(config.plugins)).toEqual(expect.arrayContaining(['tailwindcss']));
  });

  it('ships a stylesheet containing the three tailwind layer directives', () => {
    const css = fs.readFileSync(path.join(APP_ROOT, 'src/app/globals.css'), 'utf-8');

    expect(css).toContain('@tailwind base');
    expect(css).toContain('@tailwind components');
    expect(css).toContain('@tailwind utilities');
  });

  it('imports the stylesheet from the root layout so it reaches the browser', () => {
    // A stylesheet that exists but is never imported produces the original
    // defect: config present, build green, page still unstyled.
    const layout = fs.readFileSync(path.join(APP_ROOT, 'src/app/layout.tsx'), 'utf-8');

    expect(layout).toMatch(/import\s+['"]\.\/globals\.css['"]/);
  });

  it('declares a mobile-first viewport (AUDIT-019)', () => {
    // This app is reached only by scanning a table QR code. Without the
    // viewport meta, mobile browsers assume a ~980px desktop viewport and
    // scale the page down, which makes responsive classes inert.
    const layout = fs.readFileSync(path.join(APP_ROOT, 'src/app/layout.tsx'), 'utf-8');

    expect(layout).toMatch(/export\s+const\s+viewport/);
    expect(layout).toContain('device-width');

    // Zoom must remain available: locking it fails WCAG 1.4.4. Assert against
    // the exported config only — a prose mention of `maximumScale` in a
    // comment explaining why it is omitted must not fail this check.
    const viewportBlock = layout.slice(layout.indexOf('export const viewport'));
    const configBody = viewportBlock.slice(0, viewportBlock.indexOf('}') + 1);
    expect(configBody).not.toContain('maximumScale');
    expect(configBody).not.toContain('userScalable');
  });
});
