/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  darkMode: 'class',
  future: {
    removeDeprecatedGapUtilities: true,
    purgeLayersByDefault: true,
  },
  theme: {
    extend: {
      colors: {
        destiny: {
          primary: '#f5f5f5',
          secondary: '#4c4c4c',
          accent: '#7b1fa2',
          // Game-specific colors
          d1: {
            DEFAULT: '#f44336',
            light: '#ff7961',
            dark: '#ba000d',
          },
          d2: {
            DEFAULT: '#2196f3',
            light: '#6ec6ff',
            dark: '#0069c0',
          },
          // Activity type colors
          raid: '#ffd700',
          strike: '#4caf50',
          crucible: '#f44336',
          gambit: '#4caf50',
          dungeon: '#9c27b0',
        },
      },
      fontFamily: {
        destiny: ['Neue Haas Grotesk', 'sans-serif'],
      },
      spacing: {
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
      },
      borderRadius: {
        'destiny': '0.5rem',
      },
    },
  },
  plugins: [],
} 