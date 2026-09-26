import { describe, expect, it } from "vitest";
import { Prisma } from "@trestle/db";
import { errorRef, errorResponse } from "../src/server/http";

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test", meta });

describe("API error responses", () => {
  it("maps database outages to 503 with Retry-After instead of a generic 500", async () => {
    for (const code of ["P1001", "P2024"]) {
      const res = errorResponse(prismaError(code));
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      expect((await res.json()).error.code).toBe("unavailable");
    }
  });

  it("keeps unexpected failures as 500 with a non-sensitive reference (incl. Postgres SQLSTATE)", async () => {
    const res = errorResponse(
      prismaError("P2010", { code: "42P01", message: "relation does not exist" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.ref).toBe("PrismaClientKnownRequestError:P2010:42P01");
    expect(JSON.stringify(body)).not.toContain("relation does not exist");
    expect(errorRef(new Error("secret detail"))).toBe("Error");
  });
});
