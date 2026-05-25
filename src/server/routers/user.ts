import { createTRPCRouter, publicProcedure } from "@/server/trpc";
import { z } from "zod";

export const userRouter = createTRPCRouter({
  greeting: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return `Hello tRPC${input.name ? `, ${input.name}` : ""}`;
    }),

  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
    }),
});
