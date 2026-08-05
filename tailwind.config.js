/** @type {import('tailwindcss').Config} */

// Every palette colour resolves through a CSS variable holding an "R G B"
// triple, so flipping `.dark` on <html> repaints the whole app (see index.css)
// without any `dark:` variants sprinkled through the components.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`

const ramp = (prefix, shades) =>
  Object.fromEntries(shades.map((s) => [s, v(`--c-${prefix}-${s}`)]))

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: v('--c-white'),
        // Always #fff, regardless of theme (whiteboard canvas, print-like surfaces).
        'pure-white': '#ffffff',
        slate: ramp('slate', SHADES),
        // Confident, calm blue accent. White / light neutrals elsewhere.
        brand: ramp('brand', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        amber: ramp('amber', SHADES),
        rose: ramp('rose', SHADES),
        sky: ramp('sky', SHADES),
        emerald: ramp('emerald', SHADES)
      },
      boxShadow: {
        soft: '0 1px 3px rgb(var(--c-shadow) / 0.06), 0 1px 2px rgb(var(--c-shadow) / 0.04)',
        lift: '0 12px 28px rgb(var(--c-shadow-brand) / 0.18), 0 4px 8px rgb(var(--c-shadow) / 0.08)'
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: []
}
