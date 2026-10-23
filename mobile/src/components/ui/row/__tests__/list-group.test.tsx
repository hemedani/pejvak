import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { ListGroup } from "@/components/ui/row/list-group";
import { ListRow } from "@/components/ui/row/list-row";
import { listDividerInset } from "@/theme/tokens";

function row(key: string) {
  return (
    <ListRow
      key={key}
      testID={key}
      title={`Track ${key}`}
      leadingWidth={40}
      accessibilityLabel={`Play ${key}`}
      onPress={() => {}}
    />
  );
}

describe("ListGroup", () => {
  it("draws no divider against the card's top edge", async () => {
    await render(<ListGroup>{[row("a"), row("b"), row("c")]}</ListGroup>);

    expect(screen).toBeTruthy();
    const dividers = screen.getAllByTestId("list-row-divider");
    expect(dividers).toHaveLength(2);
  });

  it("treats a single row as the whole card, not as a middle row", async () => {
    await render(<ListGroup>{row("only")}</ListGroup>);

    expect(screen.queryByTestId("list-row-divider")).toBeNull();
  });

  it("starts the divider at the text, past the leading tile", async () => {
    await render(<ListGroup>{[row("a"), row("b")]}</ListGroup>);

    const divider = screen.getByTestId("list-row-divider");
    const style = StyleSheet.flatten(divider.props.style);
    expect(style.left).toBe(listDividerInset(40));
  });
});
