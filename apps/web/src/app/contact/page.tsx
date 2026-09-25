import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentPage } from "@/components/content-page";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <ContentPage
      title="Contact us"
      current="/contact"
      intro={
        <>
          Send us a message and the team will reply by email.
          {email ? (
            <>
              {" "}
              You can also write to <a href={`mailto:${email}`} className="text-foreground underline underline-offset-4">{email}</a>.
            </>
          ) : null}
        </>
      }
    >
      <div className="not-prose">
        <Suspense>
          <ContactForm />
        </Suspense>
      </div>
    </ContentPage>
  );
}
