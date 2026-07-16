import { describe, expect, it } from "vitest";
import { formatResendFailureTrace } from "@/lib/resend-error-message";

describe("formatResendFailureTrace", () => {
  it("traduit l’erreur domaine non autorisé", () => {
    const msg = formatResendFailureTrace(
      "This API key is not authorized to send emails from notifications.fr"
    );
    expect(msg).toContain("adresse d’expédition n’est pas autorisée");
    expect(msg).toContain("notifications.fr");
  });
});
