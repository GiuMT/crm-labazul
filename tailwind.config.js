/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta da marca LabAzul (documentada no CLAUDE.md do cliente)
        marca: {
          // Azul institucional — sidebar, gradiente do login, fundos escuros
          azul: '#071747',
          'azul-800': '#0B2160',
          'azul-700': '#12307D',
          'azul-600': '#1A41A8',
          // Azul primário — botões, CTAs, links
          primario: '#2052E9',
          'primario-600': '#1A44C4',
          'primario-100': '#E4EBFE',
          // Ciano de destaque — item ativo, badges, ícones, realces
          ciano: '#30E2FF',
          'ciano-600': '#16D3F5',
          'ciano-100': '#DFFAFF',

          // Apelidos de compatibilidade: o código veio do CRM do Abel, onde a cor
          // de destaque se chamava "laranja". Enquanto os componentes não forem
          // todos migrados para `primario`/`ciano`, estes apontam para as cores
          // certas da LabAzul — assim nada renderiza sem estilo no meio do caminho.
          laranja: '#2052E9',
          'laranja-600': '#1A44C4',
          'laranja-100': '#E4EBFE',
        },
        // Semânticas de pipeline
        ganho: '#16A34A',
        perda: '#DC2626',
      },
      fontFamily: {
        // EXO é a fonte da marca (títulos, botões, interface)
        sans: ['Exo', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
