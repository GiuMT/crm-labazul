// Protege as rotas do app. Sem sessao -> redireciona pra /login (pages.signIn do authOptions).
export { default } from 'next-auth/middleware'

export const config = {
  matcher: ['/pipeline/:path*', '/contatos/:path*', '/analytics/:path*'],
}
