/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'SF Mono',
          'Menlo',
          'Monaco',
          'Courier New',
          'monospace',
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        'lg': 'var(--radius-lg)',      // 12px for cards
        'md': 'var(--radius-md)',      // 8px for buttons
        'sm': 'var(--radius-sm)',      // 6px for inputs
        'xl': 'var(--radius-xl)',      // 16px for large cards
      },
      spacing: {
        // 8px grid system for macOS
        '4.5': '1.125rem', // 18px
        '18': '4.5rem',    // 72px
        '88': '22rem',     // 352px
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'hsl(var(--foreground))',
            a: {
              color: 'hsl(var(--primary))',
              textDecoration: 'underline',
              fontWeight: '500',
            },
            strong: {
              color: 'hsl(var(--foreground))',
              fontWeight: '600',
            },
            h1: {
              color: 'hsl(var(--foreground))',
              fontWeight: '600',
              fontSize: '2em',
              marginTop: '0',
              marginBottom: '0.8em',
            },
            h2: {
              color: 'hsl(var(--foreground))',
              fontWeight: '600',
              fontSize: '1.5em',
              marginTop: '1.6em',
              marginBottom: '0.8em',
            },
            h3: {
              color: 'hsl(var(--foreground))',
              fontWeight: '600',
              fontSize: '1.25em',
              marginTop: '1.4em',
              marginBottom: '0.6em',
            },
            code: {
              color: 'hsl(var(--foreground))',
              backgroundColor: 'hsl(var(--muted))',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '400',
              fontSize: '0.875em',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
            pre: {
              backgroundColor: 'hsl(var(--muted))',
              color: 'hsl(var(--foreground))',
              padding: '1em',
              borderRadius: '0.5rem',
              overflowX: 'auto',
            },
            'pre code': {
              backgroundColor: 'transparent',
              padding: '0',
            },
            blockquote: {
              color: 'hsl(var(--muted-foreground))',
              borderLeftColor: 'hsl(var(--border))',
              borderLeftWidth: '4px',
              paddingLeft: '1em',
              fontStyle: 'normal',
            },
            hr: {
              borderColor: 'hsl(var(--border))',
              marginTop: '2em',
              marginBottom: '2em',
            },
            ul: {
              listStyleType: 'disc',
              paddingLeft: '1.5em',
            },
            ol: {
              listStyleType: 'decimal',
              paddingLeft: '1.5em',
            },
            li: {
              marginTop: '0.5em',
              marginBottom: '0.5em',
            },
            'ul > li': {
              paddingLeft: '0.25em',
            },
            'ol > li': {
              paddingLeft: '0.25em',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
