import type { NextAuthOptions } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { verifyUser } from '@/lib/users'

export const authOptions: NextAuthOptions = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null
        const user = await verifyUser(credentials.email, credentials.password)
        if (!user) return null
        return {
          id: user.id,
          email: user.email,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET ?? 'development-secret',
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id ?? token.sub
        token.email = user.email ?? token.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token as any).id ?? token.sub
        session.user.email = token.email as string | undefined
      }
      return session
    },
  },
}

