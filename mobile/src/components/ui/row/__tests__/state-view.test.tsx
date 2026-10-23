import { render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import {
  EmptyState,
  InlineNotice,
  SkeletonRows,
} from "@/components/ui/row/state-view";

describe("EmptyState", () => {
  it("says what is missing and offers one next step", async () => {
    await render(
      <EmptyState
        title="No tracks yet"
        message="Add audio from this device to start listening."
        action={
          <Pressable accessibilityLabel="Add audio">
            <Text>Add audio</Text>
          </Pressable>
        }
      />,
    );

    expect(screen.getByText("No tracks yet")).toBeTruthy();
    expect(screen.getByText("Add audio from this device to start listening.")).toBeTruthy();
    expect(screen.getByLabelText("Add audio")).toBeTruthy();
  });
});

describe("InlineNotice", () => {
  it("is quiet by default", async () => {
    await render(<InlineNotice title="Showing what is on this device" />);

    const notice = screen.getByText("Showing what is on this device");
    expect(notice).toBeTruthy();
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  it("announces a one-off confirmation politely", async () => {
    await render(
      <InlineNotice testID="notice" title="Playlist created" announce />,
    );

    expect(screen.getByTestId("notice").props.accessibilityLiveRegion).toBe("polite");
  });

  it("speaks an error as an error", async () => {
    await render(
      <InlineNotice title="Could not reach the source" tone="danger" />,
    );

    expect(screen.getByText("Could not reach the source")).toBeTruthy();
  });
});

describe("SkeletonRows", () => {
  it("describes itself as loading without moving", async () => {
    await render(<SkeletonRows count={3} />);

    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });
});
