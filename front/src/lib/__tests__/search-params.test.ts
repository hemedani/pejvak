/**
 * Reading the query string.
 *
 * A URL is user input, and these two functions are where a hand-typed value
 * either becomes a usable number or a default. The distinction worth locking is
 * that `pageParam` is 1-based and `afterParam` is 0-based: page one and the first
 * hundred rows are both "the start", and one helper with a different default
 * would be the same function pretending to be two.
 */

import { describe, expect, it } from "vitest";

import { afterParam, firstParam, pageParam } from "../search-params";

describe("afterParam", () => {
  it("defaults a missing or unreadable cursor to the first page", () => {
    expect(afterParam(undefined)).toBe(0);
    expect(afterParam("")).toBe(0);
    // `skip: NaN` would be a validator failure the listener cannot act on.
    expect(afterParam("abc")).toBe(0);
    expect(afterParam("-4")).toBe(0);
  });

  it("reads a cursor, ignoring surrounding space", () => {
    expect(afterParam("12")).toBe(12);
    expect(afterParam(" 12 ")).toBe(12);
    expect(afterParam("0")).toBe(0);
  });

  it("takes the first value when a parameter repeats", () => {
    expect(afterParam(["30", "40"])).toBe(30);
  });

  it("is not a page number: zero is the first page, not the zeroth", () => {
    expect(afterParam(undefined)).toBe(0);
    expect(pageParam(undefined)).toBe(1);
  });
});

describe("pageParam", () => {
  it("defaults a missing or unreadable page to one", () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam("0")).toBe(1);
  });
});

describe("firstParam", () => {
  it("takes the first of a repeated parameter", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("only")).toBe("only");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
