import { createTRPCRouter, publicProcedure } from "@/server/trpc";
import { z } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const userRouter = createTRPCRouter({
  greeting: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return `Hello tRPC${input.name ? `, ${input.name}` : ""}`;
    }),

  getAll: publicProcedure.query(({ ctx }) => {
    return db.query.users.findMany({
      columns: {
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
      return db.query.users.findFirst({
        where: eq(users.id, input.id),
        columns: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
    }),
});
