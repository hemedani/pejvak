import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { LocalAnnotation, LocalTrack } from "@/lib/db/types";
import { AnnotationService } from "@/services/AnnotationService";
import { useTrackAnnotations } from "@/hooks/use-annotations";

jest.mock("@/services/AnnotationService", () => ({
  AnnotationService: {
    getTrackAnnotations: jest.fn(),
    createAnnotation: jest.fn(),
    updateAnnotation: jest.fn(),
    deleteAnnotation: jest.fn(),
  },
}));

const getTrackAnnotations = jest.mocked(AnnotationService.getTrackAnnotations);
const createAnnotation = jest.mocked(AnnotationService.createAnnotation);
const updateAnnotation = jest.mocked(AnnotationService.updateAnnotation);
const deleteAnnotation = jest.mocked(AnnotationService.deleteAnnotation);

const track: Pick<LocalTrack, "id" | "contentHash"> = {
  id: "track-1",
  contentHash: "hash-1",
};

function annotation(id: string): LocalAnnotation {
  return {
    id,
    serverId: null,
    trackId: "track-1",
    contentHash: "hash-1",
    positionSec: 5,
    text: id,
    tags: [],
    color: null,
    timesPlayedBefore: 0,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useTrackAnnotations", () => {
  it("loads annotations for the current track", async () => {
    getTrackAnnotations.mockResolvedValue([annotation("a1")]);

    const { result } = await renderHook(() => useTrackAnnotations("track-1"));

    await waitFor(() => expect(result.current.annotations).toHaveLength(1));
    expect(getTrackAnnotations).toHaveBeenCalledWith("track-1");
  });

  it("clears annotations when the track is missing", async () => {
    const { result } = await renderHook(() => useTrackAnnotations(null));

    await waitFor(() => expect(result.current.annotations).toHaveLength(0));
    expect(getTrackAnnotations).not.toHaveBeenCalled();
  });

  it("creates a note and refreshes the list", async () => {
    getTrackAnnotations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([annotation("a1")]);
    createAnnotation.mockResolvedValue(annotation("a1"));

    const { result } = await renderHook(() => useTrackAnnotations("track-1"));
    await waitFor(() => expect(getTrackAnnotations).toHaveBeenCalledTimes(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.create({ track, positionSec: 5, text: "note" });
    });

    expect(ok).toBe(true);
    expect(createAnnotation).toHaveBeenCalledWith({
      track,
      positionSec: 5,
      text: "note",
    });
    expect(result.current.annotations).toHaveLength(1);
  });

  it("surfaces a create error and reports failure", async () => {
    getTrackAnnotations.mockResolvedValue([]);
    createAnnotation.mockRejectedValue(new Error("Annotation text is required"));

    const { result } = await renderHook(() => useTrackAnnotations("track-1"));
    await waitFor(() => expect(getTrackAnnotations).toHaveBeenCalledTimes(1));

    let ok = true;
    await act(async () => {
      ok = await result.current.create({ track, positionSec: 5, text: "  " });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/text is required/i);
  });

  it("updates a note and refreshes the list", async () => {
    getTrackAnnotations
      .mockResolvedValueOnce([annotation("a1")])
      .mockResolvedValueOnce([{ ...annotation("a1"), text: "revised" }]);
    updateAnnotation.mockResolvedValue(undefined);

    const { result } = await renderHook(() => useTrackAnnotations("track-1"));
    await waitFor(() => expect(getTrackAnnotations).toHaveBeenCalledTimes(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.update({ annotation: annotation("a1"), text: "revised" });
    });

    expect(ok).toBe(true);
    expect(updateAnnotation).toHaveBeenCalledWith({
      annotation: annotation("a1"),
      text: "revised",
    });
    expect(result.current.annotations[0].text).toBe("revised");
  });

  it("removes a note and refreshes the list", async () => {
    getTrackAnnotations
      .mockResolvedValueOnce([annotation("a1")])
      .mockResolvedValueOnce([]);
    deleteAnnotation.mockResolvedValue(undefined);

    const { result } = await renderHook(() => useTrackAnnotations("track-1"));
    await waitFor(() => expect(getTrackAnnotations).toHaveBeenCalledTimes(1));

    let ok = false;
    await act(async () => {
      ok = await result.current.remove(annotation("a1"));
    });

    expect(ok).toBe(true);
    expect(deleteAnnotation).toHaveBeenCalledWith(annotation("a1"));
    expect(result.current.annotations).toHaveLength(0);
  });
});
