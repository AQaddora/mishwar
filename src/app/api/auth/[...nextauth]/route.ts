// Auth.js's own endpoints under /api/auth/* (sign-in, callback, session, sign-out).
// The configuration lives in src/lib/auth.ts.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
