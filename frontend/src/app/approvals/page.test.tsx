import { describe, expect, it, vi } from "vitest";

const mockPermanentRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  permanentRedirect: mockPermanentRedirect,
  usePathname: () => "/approvals",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("/approvals redirect", () => {
  it("redirects to /inbox?tab=approvals", async () => {
    const { default: ApprovalsRedirect } = await import("./page");
    try {
      ApprovalsRedirect();
    } catch {
      // permanentRedirect throws in Next.js test env
    }
    expect(mockPermanentRedirect).toHaveBeenCalledWith(
      "/inbox?tab=approvals",
    );
  });
});
