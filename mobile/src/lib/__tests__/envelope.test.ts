import { isApiSuccess, type ApiEnvelope } from "@/lib/envelope";

describe("response envelope", () => {
  it("recognizes the { success: true, body } shape", () => {
    const envelope: ApiEnvelope<{ items: number[] }> = { success: true, body: { items: [1] } };
    expect(isApiSuccess(envelope)).toBe(true);
    if (isApiSuccess(envelope)) {
      expect(envelope.body.items).toEqual([1]);
    }
  });

  it("rejects failure envelopes", () => {
    const envelope: ApiEnvelope<unknown> = { success: false, message: "nope" };
    expect(isApiSuccess(envelope)).toBe(false);
  });
});
