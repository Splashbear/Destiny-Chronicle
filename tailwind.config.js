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
        // Modern Destiny-inspired color palette
        destiny: {
          // Base background colors (dark theme inspired by community sites)
          bg: {
            primary: '#0a0a0f',     // Deep space dark
            secondary: '#151520',   // Card backgrounds
            tertiary: '#1e1e2e',    // Elevated surfaces
            modal: '#242438',       // Modal backgrounds
          },
          // Surface colors for cards and components
          surface: {
            100: '#1a1a2e',        // Lightest surface
            200: '#16213e',        // Medium surface  
            300: '#0f1729',        // Dark surface
            400: '#0c1018',        // Darkest surface
          },
          // Text colors
          text: {
            primary: '#e4e4e7',     // Primary text (near white)
            secondary: '#a1a1aa',   // Secondary text (medium gray)
            muted: '#71717a',       // Muted text (dark gray)
            inverse: '#18181b',     // Dark text for light backgrounds
          },
          // Border colors
          border: {
            primary: '#27272a',     // Primary borders
            secondary: '#3f3f46',   // Lighter borders
            accent: '#6366f1',      // Accent borders
          },
          // Game-specific colors (enhanced)
          d1: {
            DEFAULT: '#e11d48',     // Destiny 1 red
            light: '#f87171',       // Lighter red
            dark: '#991b1b',        // Darker red
            bg: '#1e1114',          // D1 background tint
          },
          d2: {
            DEFAULT: '#2563eb',     // Destiny 2 blue
            light: '#60a5fa',       // Lighter blue
            dark: '#1d4ed8',        // Darker blue
            bg: '#0f172a',          // D2 background tint
          },
          // Activity type colors (inspired by in-game UI)
          raid: {
            DEFAULT: '#f59e0b',     // Golden yellow
            light: '#fbbf24',       // Lighter gold
            dark: '#d97706',        // Darker gold
            bg: '#1c1917',          // Raid background tint
          },
          strike: {
            DEFAULT: '#10b981',     // Strike green
            light: '#34d399',       // Lighter green
            dark: '#059669',        // Darker green
            bg: '#0f1b14',          // Strike background tint
          },
          crucible: {
            DEFAULT: '#ef4444',     // Crucible red
            light: '#f87171',       // Lighter red
            dark: '#dc2626',        // Darker red
            bg: '#1e1114',          // Crucible background tint
          },
          gambit: {
            DEFAULT: '#22c55e',     // Gambit green
            light: '#4ade80',       // Lighter green
            dark: '#16a34a',        // Darker green
            bg: '#0f1b14',          // Gambit background tint
          },
          dungeon: {
            DEFAULT: '#8b5cf6',     // Dungeon purple
            light: '#a78bfa',       // Lighter purple
            dark: '#7c3aed',        // Darker purple
            bg: '#1e1b2e',          // Dungeon background tint
          },
          nightfall: {
            DEFAULT: '#f97316',     // Nightfall orange
            light: '#fb923c',       // Lighter orange
            dark: '#ea580c',        // Darker orange
            bg: '#1c1710',          // Nightfall background tint
          },
          // Accent colors for UI elements
          accent: {
            primary: '#f5c542',
            secondary: '#f0e6c8',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444',
            info: '#60a5fa',
          },
          // Gradient stops for modern effects
          gradient: {
            from: '#1e1b4b',        // Deep purple
            via: '#312e81',         // Medium purple
            to: '#1e3a8a',          // Deep blue
          },
        },
        // Legacy colors (maintain compatibility)
        'd2-gold':  '#f0e6c8',
        'd2-slate': '#1d1f23',
        'd2-red':   '#c42b1c',
        'd2-blue':  '#2e6db4',
        'd1-silver': '#b1b5b9',
      },
      fontFamily: {
        destiny: ['"Helvetica Neue"', 'Helvetica', 'Arial', '"Segoe UI"', 'system-ui', 'sans-serif'],
        'd2-headline': ['"Helvetica Neue"', 'Helvetica', 'Arial', '"Segoe UI"', 'sans-serif'],
        'd2-body': ['"Helvetica Neue"', 'Helvetica', 'Arial', '"Segoe UI"', 'sans-serif'],
        mono: ['"SF Mono"', 'Consolas', '"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        // Enhanced typography scale
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
      },
      spacing: {
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
        '128': '32rem',
      },
      borderRadius: {
        'destiny': '0.75rem',
        'destiny-sm': '0.5rem',
        'destiny-lg': '1rem',
        'destiny-xl': '1.5rem',
      },
      boxShadow: {
        // Enhanced shadow system for depth
        'destiny-sm': '0 2px 4px 0 rgba(0, 0, 0, 0.3)',
        'destiny': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'destiny-md': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
        'destiny-lg': '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
        'destiny-xl': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        'destiny-2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        'destiny-inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)',
        'glow-sm': '0 0 5px rgba(245, 197, 66, 0.45)',
        'glow': '0 0 10px rgba(245, 197, 66, 0.5)',
        'glow-lg': '0 0 20px rgba(245, 197, 66, 0.4)',
      },
      backgroundImage: {
        // Gradient backgrounds inspired by Destiny UI
        'destiny-gradient': 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)',
        'destiny-gradient-dark': 'linear-gradient(160deg, #0c0a14 0%, #0a0f1c 50%, #0f1419 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(30, 27, 75, 0.3) 0%, rgba(49, 46, 129, 0.2) 50%, rgba(30, 58, 138, 0.3) 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
      },
      backdropBlur: {
        'destiny': '12px',
      },
      animation: {
        // Smooth animations for modern feel
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(245, 197, 66, 0.45)' },
          '100%': { boxShadow: '0 0 20px rgba(245, 197, 66, 0.75)' },
        },
        loaderScan: {
          to: { strokeDashoffset: '-128', transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
} 