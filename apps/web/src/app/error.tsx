"use client";
import { useEffect } from "react";
import { Container, ErrorState } from "@/components/states";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container>
      <ErrorState
        title="We couldn't load this page"
        message={
          error.digest
            ? `The server hit an error (ref ${error.digest}). Check that the database and chain RPCs are reachable.`
            : error.message
        }
        retry={reset}
      />
    </Container>
  );
}
