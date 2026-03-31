/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy aliases
        background: 'var(--background)',
        foreground: 'var(--foreground)',

        // Material Design 3 Tokens
        "primary": "#8a5100",
        "on-primary": "#ffffff",
        "primary-container": "#ff9900",
        "on-primary-container": "#653a00",
        "primary-fixed": "#ffdcbd",
        "primary-fixed-dim": "#ffb86f",
        "on-primary-fixed": "#2c1600",
        "on-primary-fixed-variant": "#693c00",

        "secondary": "#5b5f62",
        "on-secondary": "#ffffff",
        "secondary-container": "#dde0e4",
        "on-secondary-container": "#5f6366",
        "secondary-fixed": "#e0e3e6",
        "secondary-fixed-dim": "#c4c7ca",
        "on-secondary-fixed": "#181c1f",
        "on-secondary-fixed-variant": "#43474a",

        "tertiary": "#b91b22",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#ff938b",
        "on-tertiary-container": "#8d0010",
        "tertiary-fixed": "#ffdad6",
        "tertiary-fixed-dim": "#ffb3ad",
        "on-tertiary-fixed": "#410003",
        "on-tertiary-fixed-variant": "#930011",

        "error": "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",

        "surface": "#fbf9f8",
        "on-surface": "#1b1c1c",
        "surface-variant": "#e4e2e1",
        "on-surface-variant": "#554434",
        "surface-dim": "#dcd9d9",
        "surface-bright": "#fbf9f8",
        "surface-tint": "#8a5100",
        "surface-container": "#f0eded",
        "surface-container-low": "#f6f3f2",
        "surface-container-high": "#eae8e7",
        "surface-container-highest": "#e4e2e1",
        "surface-container-lowest": "#ffffff",

        "outline": "#887361",
        "outline-variant": "#dbc2ad",

        "inverse-surface": "#303030",
        "inverse-on-surface": "#f3f0f0",
        "inverse-primary": "#ffb86f",
      },
      fontFamily: {
        "headline": ["Inter", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"],
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "0.75rem",
        "xl": "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        "full": "9999px",
      },
    },
  },
  plugins: [],
}
