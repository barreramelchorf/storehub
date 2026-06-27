import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #6F4E37)',
        secondary: 'var(--color-secondary, #D4A574)',
      },
    },
  },
  plugins: [],
}
export default config
