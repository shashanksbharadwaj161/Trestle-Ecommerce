import { Container, EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <Container>
      <EmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist or you don't have access to it."
        action={{ href: "/products", label: "Browse the shop" }}
      />
    </Container>
  );
}
