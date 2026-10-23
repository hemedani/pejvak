import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { CardRow } from "@/components/ui/card/card-row";
import { card as cardTokens, spacing } from "@/theme/tokens";

describe("CardRow", () => {
  it("draws no divider against the card's top edge", async () => {
    await render(<CardRow position="first" icon="cloudDone" label="Synced" />);

    expect(screen.queryByTestId("card-row-divider")).toBeNull();
  });

  it("starts the divider at the label, past the glyph badge", async () => {
    await render(<CardRow position="middle" icon="cloudDone" label="Synced" />);

    const divider = screen.getByTestId("card-row-divider");
    const style = StyleSheet.flatten(divider.props.style);
    expect(style.left).toBe(cardTokens.padding + cardTokens.badge + spacing.md);
  });

  it("aligns a flush row's divider to the card padding", async () => {
    await render(<CardRow position="last" flush label="Sign out" />);

    const divider = screen.getByTestId("card-row-divider");
    const style = StyleSheet.flatten(divider.props.style);
    expect(style.left).toBe(cardTokens.padding);
  });
});
