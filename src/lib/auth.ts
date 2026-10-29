// Auth.js (next-auth v5) with the Prisma adapter and database sessions. Google is the only
// provider, and it is registered only when both keys are set, so QA and local work run with
// no Google project at all. The session callback hands the app the user's id, role and phone
// and never the session token. Server only.
import { randomBytes } from "node:crypto";
import NextAuth, { type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/role";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role | null; phone: string | null } & DefaultSession["user"];
  }
}

const qaMode = process.env.QA_MODE === "1";

// The startup warning for QA mode is in src/instrumentation.ts.
if (qaMode) {
  // QA starts with no secrets. A random per-process secret means QA sessions die on
  // restart, which is fine. Set on process.env so every copy of this module shares it.
  if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = randomBytes(32).toString("hex");
}

// Google is the only way in, and only when both keys are set (QA runs without them).
export const googleEnabled: boolean = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const providers: Provider[] = googleEnabled
  ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  basePath: "/api/auth",
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    // Build the session by hand: the incoming one also carries the database row, including
    // sessionToken, which must never reach /api/auth/session.
    session({ session, user }) {
      const u = user as typeof user & { role: Role | null; phone: string | null };
      return {
        expires: session.expires,
        user: { id: u.id, name: u.name, email: u.email, image: u.image, role: u.role, phone: u.phone },
      };
    },
  },
});
