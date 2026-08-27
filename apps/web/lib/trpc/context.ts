import { auth } from "@job-hub/auth";

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });

  return {
    session,
    headers: opts.headers,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
