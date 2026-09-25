import "./connection";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __trestlePrisma?: PrismaClient };

/** Singleton Prisma client (re-used across hot reloads and serverless invocations). */
export const prisma: PrismaClient =
  globalForPrisma.__trestlePrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__trestlePrisma = prisma;
