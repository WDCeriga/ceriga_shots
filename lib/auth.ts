import type { NextAuthOptions } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { findUserRoleCached, verifyUser } from '@/lib/users'

const googleProviderConfigured =
  Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET)

export const authOptions: NextAuthOptions = {
  providers: [
    ...(googleProviderConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          }),
        ]
      : []),
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
          role: user.role,
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET ?? 'development-secret',
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id ?? token.sub
        token.email = user.email ?? token.email
        token.role = (user as any).role ?? 'free'
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = (token as any).id ?? token.sub
        session.user.id = userId
        session.user.email = token.email as string | undefined
        let resolvedRole = (token.role as string) ?? 'free'
        if (userId) {
          try {
            const dbRole = await findUserRoleCached(userId)
            if (dbRole) {
              resolvedRole = dbRole
              token.role = dbRole
            }
          } catch {
            // Keep token/session role fallback if DB read fails.
          }
        }
        session.user.role = resolvedRole
      }
      return session
    },
  },
}

