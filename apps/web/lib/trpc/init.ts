import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPCContext } from "./context";

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/**
 * Protected procedure middleware:
 * Enforces that the request has an active Better Auth session.
 * Injects non-null session and user into procedure context.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  }

  return next({
    ctx: {
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});
