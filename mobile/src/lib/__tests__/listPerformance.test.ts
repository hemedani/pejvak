import { listPerformance } from "../listPerformance";

describe("listPerformance", () => {
  it("renders a screenful up front without mounting the whole list", () => {
    expect(listPerformance.initialNumToRender).toBe(8);
    expect(listPerformance.maxToRenderPerBatch).toBe(8);
  });

  it("keeps a window smaller than FlatList's default of 21", () => {
    expect(listPerformance.windowSize).toBeLessThan(21);
    expect(listPerformance.updateCellsBatchingPeriod).toBeGreaterThan(0);
  });
});
