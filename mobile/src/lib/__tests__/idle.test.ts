import { runWhenIdle } from "@/lib/idle";

/**
 * The wrapper exists because `InteractionManager` and an idle callback do not
 * promise the same thing: the first always ran once its queue drained, the
 * second only runs when the runtime reports idle time. So the two things worth
 * pinning are that the timeout actually reaches the platform — that is what
 * keeps the work from being starved by a busy thread — and that cancelling
 * releases the handle the platform handed back, whatever shape it has.
 */
describe("runWhenIdle", () => {
  type Host = {
    requestIdleCallback?: unknown;
    cancelIdleCallback?: unknown;
  };
  const host = globalThis as unknown as Host;
  const original = {
    requestIdleCallback: host.requestIdleCallback,
    cancelIdleCallback: host.cancelIdleCallback,
  };

  afterEach(() => {
    host.requestIdleCallback = original.requestIdleCallback;
    host.cancelIdleCallback = original.cancelIdleCallback;
    jest.useRealTimers();
  });

  it("asks for an idle frame and forwards the deadline", async () => {
    const request = jest.fn(() => "opaque-handle");
    host.requestIdleCallback = request;
    host.cancelIdleCallback = jest.fn();

    const task = jest.fn();
    await runWhenIdle(task, 1500);

    expect(request).toHaveBeenCalledWith(expect.any(Function), { timeout: 1500 });
    expect(task).not.toHaveBeenCalled();
  });

  it("runs the task when the platform reports the idle period", async () => {
    let fire: (() => void) | null = null;
    host.requestIdleCallback = (callback: () => void) => {
      fire = callback;
      return 1;
    };
    host.cancelIdleCallback = jest.fn();

    const task = jest.fn();
    await runWhenIdle(task, 1000);
    expect(fire).not.toBeNull();

    (fire as unknown as () => void)();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancels the handle the platform gave back, not a copy of it", async () => {
    // The bridgeless implementation hands out an opaque id rather than a
    // number, so anything that assumes one would cancel nothing.
    const handle = { native: true };
    host.requestIdleCallback = jest.fn(() => handle);
    const cancel = jest.fn();
    host.cancelIdleCallback = cancel;

    const idle = await runWhenIdle(jest.fn(), 1000);
    idle.cancel();

    expect(cancel).toHaveBeenCalledWith(handle);
  });

  it("falls back to the deadline where there are no idle events", async () => {
    // Jest, and any runtime that has not installed React Native's timers.
    host.requestIdleCallback = undefined;
    host.cancelIdleCallback = undefined;
    jest.useFakeTimers();

    const task = jest.fn();
    const idle = await runWhenIdle(task, 400);

    expect(task).not.toHaveBeenCalled();
    jest.advanceTimersByTime(399);
    expect(task).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);

    idle.cancel();
  });
});
