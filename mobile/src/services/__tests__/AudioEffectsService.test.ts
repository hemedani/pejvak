/**
 * The audio treatments' engine.
 *
 * What these cases protect is the *lifecycle*: an effect that is attached but
 * never released colours another app's audio, and a noise player that starts
 * while nothing is playing is a hiss with no source. Both are invisible in a
 * screenshot and obvious to an ear, so they are pinned here.
 *
 * Everything native is mocked — the module, the player, the filesystem — because
 * what is under test is the order of the calls, not the audio they produce.
 */

import AudioEnhancer from "../../../modules/audio-enhancer";
import { LocalDBService } from "@/services/LocalDBService";
import * as AudioEffectsService from "@/services/AudioEffectsService";
import { useAudioEffectsStore } from "@/store/audioEffectsStore";
import { roomToneAmplitude } from "@/lib/audioEffects";

jest.mock("../../../modules/audio-enhancer", () => ({
  __esModule: true,
  default: {
    attach: jest.fn(() => ({ available: true, reason: null, bands: 5, boost: true })),
    setEnabled: jest.fn(),
    setGains: jest.fn(),
    detach: jest.fn(),
  },
}));

jest.mock("expo-audio", () => {
  const player = {
    loop: false,
    volume: 1,
    playing: false,
    replace: jest.fn(),
    play: jest.fn(() => {
      player.playing = true;
    }),
    pause: jest.fn(() => {
      player.playing = false;
    }),
    release: jest.fn(),
  };
  return {
    __player: player,
    createAudioPlayer: jest.fn(() => player),
  };
});

jest.mock("expo-file-system", () => {
  class FakeFile {
    uri: string;
    exists = false;
    create = jest.fn();
    write = jest.fn();
    constructor(...parts: { uri?: string }[]) {
      this.uri = parts.map((part) => (typeof part === "string" ? part : part.uri)).join("/");
    }
  }
  return { File: FakeFile, Directory: class {}, Paths: { cache: { uri: "file:///cache" } } };
});

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getSetting: jest.fn(async () => null),
    setSetting: jest.fn(async () => undefined),
  },
}));

type NoisePlayer = {
  loop: boolean;
  volume: number;
  playing: boolean;
  replace: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
};

/** The mocked noise player, reached through the module the service imports. */
function noisePlayer(): NoisePlayer {
  return (jest.requireMock("expo-audio") as { __player: NoisePlayer }).__player;
}

const native = AudioEnhancer as unknown as {
  attach: jest.Mock;
  setEnabled: jest.Mock;
  setGains: jest.Mock;
  detach: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  native.attach.mockReturnValue({ available: true, reason: null, bands: 5, boost: true });
  noisePlayer().volume = 1;
  noisePlayer().loop = false;
  noisePlayer().playing = false;
  AudioEffectsService.__resetForTests();
});

describe("the enhancer", () => {
  it("attaches, applies the whole curve, then switches on", () => {
    AudioEffectsService.setEnhancer({ bassDb: 6 });

    expect(native.attach).toHaveBeenCalledTimes(1);
    expect(native.setGains).toHaveBeenCalledWith(0, 6, 0);
    expect(native.setEnabled).toHaveBeenCalledWith(true);
    // Order matters: an effect enabled while still holding the previous curve
    // makes the first moment of audio wrong.
    expect(native.setGains.mock.invocationCallOrder[0]).toBeLessThan(
      native.setEnabled.mock.invocationCallOrder[0],
    );
    expect(useAudioEffectsStore.getState().enhancer).toEqual({
      enabled: true,
      boostDb: 0,
      bassDb: 6,
      trebleDb: 0,
    });
  });

  it("releases the effect when it is switched off, so the device gets its sound back", () => {
    AudioEffectsService.setEnhancer({ trebleDb: 4 });
    AudioEffectsService.setEnhancer({ enabled: false });

    expect(native.detach).toHaveBeenCalledTimes(1);
    expect(native.setEnabled).toHaveBeenLastCalledWith(true);
    expect(useAudioEffectsStore.getState().enhancer.enabled).toBe(false);
  });

  it("reports a device that refuses the output mix instead of throwing", () => {
    native.attach.mockReturnValue({ available: false, reason: "Effect not allowed", bands: 0, boost: false });

    expect(() => AudioEffectsService.setEnhancer({ bassDb: 3 })).not.toThrow();
    expect(native.setGains).not.toHaveBeenCalled();
    expect(useAudioEffectsStore.getState()).toMatchObject({
      enhancerAvailable: false,
      enhancerReason: "Effect not allowed",
    });
  });

  it("survives an attach that throws", () => {
    native.attach.mockImplementation(() => {
      throw new Error("boom");
    });

    AudioEffectsService.setEnhancer({ bassDb: 3 });

    expect(useAudioEffectsStore.getState()).toMatchObject({
      enhancerAvailable: false,
      enhancerReason: "boom",
    });
  });

  it("re-attaches on the next playback after a stop released it", () => {
    AudioEffectsService.setEnhancer({ boostDb: 4 });
    AudioEffectsService.release();
    expect(native.detach).toHaveBeenCalled();

    AudioEffectsService.syncPlayback(true);

    expect(native.attach).toHaveBeenCalledTimes(2);
    expect(native.setGains).toHaveBeenLastCalledWith(4, 0, 0);
  });
});

describe("the room tone", () => {
  it("loads and loops the noise file, but stays silent while nothing plays", () => {
    AudioEffectsService.setRoomTone(40);

    const player = noisePlayer();
    expect(player.replace).toHaveBeenCalledTimes(1);
    expect(player.loop).toBe(true);
    expect(player.volume).toBeCloseTo(roomToneAmplitude(40), 6);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("follows the transport", () => {
    AudioEffectsService.setRoomTone(40);
    const player = noisePlayer();

    AudioEffectsService.syncPlayback(true);
    expect(player.play).toHaveBeenCalledTimes(1);

    AudioEffectsService.syncPlayback(false);
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it("does not restart a player that is already running", () => {
    AudioEffectsService.setRoomTone(40);
    AudioEffectsService.syncPlayback(true);
    // A status tick repeats the same answer every second.
    AudioEffectsService.syncPlayback(true);

    expect(noisePlayer().play).toHaveBeenCalledTimes(1);
  });

  it("pauses at zero and gives the player back to memory", () => {
    AudioEffectsService.setRoomTone(40);
    AudioEffectsService.syncPlayback(true);
    const player = noisePlayer();

    AudioEffectsService.setRoomTone(0);
    expect(player.pause).toHaveBeenCalled();
    expect(useAudioEffectsStore.getState().roomTone).toBe(0);

    AudioEffectsService.release();
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it("reuses one player across level changes rather than rebuilding it", () => {
    AudioEffectsService.setRoomTone(20);
    AudioEffectsService.setRoomTone(60);

    expect(noisePlayer().replace).toHaveBeenCalledTimes(1);
    expect(noisePlayer().volume).toBeCloseTo(roomToneAmplitude(60), 6);
  });
});

describe("loading", () => {
  it("restores both device preferences", async () => {
    (LocalDBService.getSetting as jest.Mock).mockImplementation(async (key: string) =>
      key === "audioEnhancer"
        ? JSON.stringify({ enabled: true, boostDb: 3, bassDb: -2, trebleDb: 5 })
        : "35",
    );

    await AudioEffectsService.load();

    expect(useAudioEffectsStore.getState().enhancer).toEqual({
      enabled: true,
      boostDb: 3,
      bassDb: -2,
      trebleDb: 5,
    });
    expect(useAudioEffectsStore.getState().roomTone).toBe(35);
    // Reading a curve at launch must not attach it: that would colour audio
    // this app is not playing.
    expect(native.attach).not.toHaveBeenCalled();
  });
});
