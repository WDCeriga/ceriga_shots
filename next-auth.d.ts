import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string | null
      name?: string | null
      email?: string | null
      image?: string | null
      role?: string | null
      emailVerified?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    emailVerified?: boolean
  }
}

