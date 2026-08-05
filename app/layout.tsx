import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CRM — LabAzul',
  description: 'CRM operacional de recuperação dos leads da Imersão Lab do Futuro',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* EXO é a fonte da marca LabAzul (CLAUDE.md do cliente) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Exo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
