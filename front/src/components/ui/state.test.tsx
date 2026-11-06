// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ActFailure } from "@/lib/result";

import { ErrorState, Skeleton, StateWrapper, surfaceState } from "./state";

afterEach(cleanup);

const offline: ActFailure = { kind: "offline", message: "fetch failed" };
const server: ActFailure = { kind: "server", message: "boom" };

describe("Skeleton", () => {
  it("uses the shimmer utility instead of an opacity pulse", () => {
    const { container } = render(<Skeleton className="h-8" />);
    expect(container.firstElementChild?.className).toContain("skeleton");
    expect(container.firstElementChild?.className).not.toContain("animate-pulse");
  });
});

describe("surfaceState", () => {
  it("is ready when the read succeeded and returned rows", () => {
    expect(surfaceState({})).toEqual({ status: "ready" });
    expect(surfaceState({ loading: false, empty: null })).toEqual({ status: "ready" });
  });

  it("puts a failure ahead of loading — a failed read has stopped loading", () => {
    expect(surfaceState({ failure: server, loading: true })).toMatchObject({ status: "error" });
    expect(surfaceState({ failure: offline, loading: true })).toMatchObject({ status: "offline" });
  });

  it("puts loading ahead of empty — a list still resolving is not empty yet", () => {
    const state = surfaceState({
      loading: true,
      empty: { title: "Nothing yet", description: "Add something." },
    });
    expect(state.status).toBe("loading");
  });

  it("separates a lost connection from a server error", () => {
    expect(surfaceState({ failure: offline }).status).toBe("offline");
    expect(surfaceState({ failure: server }).status).toBe("error");
  });

  it("carries the empty copy the caller supplied, and nothing it invented", () => {
    const state = surfaceState({
      empty: { title: "No playlists", description: "Make one to group tracks." },
    });
    expect(state).toEqual({
      status: "empty",
      empty: { title: "No playlists", description: "Make one to group tracks." },
    });
  });
});

describe("StateWrapper", () => {
  it("renders the surface only when it is ready", () => {
    render(
      <StateWrapper state={{ status: "ready" }}>
        <p>rows</p>
      </StateWrapper>,
    );
    expect(screen.getByText("rows")).toBeTruthy();
  });

  it("renders a skeleton while loading and never the children", () => {
    render(
      <StateWrapper state={{ status: "loading" }}>
        <p>rows</p>
      </StateWrapper>,
    );
    expect(screen.queryByText("rows")).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });

  it("renders the empty state's own words", () => {
    render(
      <StateWrapper
        state={{
          status: "empty",
          empty: { title: "No playlists", description: "Make one to group tracks." },
        }}
      >
        <p>rows</p>
      </StateWrapper>,
    );
    expect(screen.getByText("No playlists")).toBeTruthy();
    expect(screen.queryByText("rows")).toBeNull();
  });

  it("announces an error, and a lost connection as a status rather than an alarm", () => {
    const { unmount } = render(
      <StateWrapper state={{ status: "error", failure: server }}>
        <p>rows</p>
      </StateWrapper>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    unmount();

    render(
      <StateWrapper state={{ status: "offline", failure: offline }}>
        <p>rows</p>
      </StateWrapper>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("No connection")).toBeTruthy();
  });

  it("gives a lost connection the warning treatment even when ErrorState is called directly", () => {
    // The shell layout calls `ErrorState` with whatever `getMe` returned; a lost
    // connection must not be dressed as a broken section.
    render(<ErrorState failure={offline} retryHref="/library" />);
    expect(screen.getByText("No connection")).toBeTruthy();
    expect(screen.queryByText("This section could not load")).toBeNull();
  });
});
