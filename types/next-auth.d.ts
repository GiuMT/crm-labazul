import 'next-auth'

declare module 'next-auth' {
  interface User {
    role?: string
  }
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      role?: string
    }
  }
}
