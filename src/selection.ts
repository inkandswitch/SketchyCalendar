import { Point } from "geom/point";
import { Vec } from "geom/vec";
import Render, { dashedStroke, fill, fillAndStroke, stroke } from "render";
import StateManager, { Card, TextElementReference } from "state";
import TextInput from "textinput";

const OPTIONS = ["copy", "transclude", "delete"];

export default class Selection {
  state_manager: StateManager;
  text_input: TextInput;
  showProperty: boolean = false;

  constructor(state_manager: StateManager, text_input: TextInput) {
    this.state_manager = state_manager;
    this.text_input = text_input;
    this.state_manager.selectedCardInstance = null;
  }

  clear(): void {
    this.state_manager.selectedCardInstance = null;
    this.showProperty = false;
  }

  active(): boolean {
    return this.state_manager.selectedCardInstance !== null;
  }

  selectText(ref: TextElementReference) {
    this.text_input.open(ref);
  }

  selectAtPosition(position: Point) {
    // Find text elements first
    const found_text = this.state_manager.findTextElementAt(position);
    if (found_text) {
      this.selectText(found_text);
      return;
    }

    const found = this.state_manager.findCardInstanceAt(position);
    if (found) {
      this.state_manager.selectedCardInstance = found.id;
    } else {
      this.state_manager.selectedCardInstance = null;
    }
  }

  click({ x, y }: Point): boolean {
    if (!this.active()) return false;
    const inst = this.state_manager.getCardInstance(
      this.state_manager.selectedCardInstance!
    )!;

    if (
      x < inst.x ||
      x > inst.x + (OPTIONS.length + 1) * 40 ||
      y < inst.y - 50 ||
      y > inst.y - 50 + 40
    ) {
      return false;
    }

    const option = OPTIONS[Math.floor((x - inst.x) / 40)];

    console.log(option);
    if (option === "copy") {
      const cardCopyId = this.state_manager.copyCard(inst.cardId);
      console.log("copy", cardCopyId);
      const newCardInstance = this.state_manager.createCardInstance({
        cardId: cardCopyId,
        position: Vec.add(inst, { x: 20, y: 20 }),
      });
      this.state_manager.selectedCardInstance = newCardInstance.id;
    } else if (option === "transclude") {
      const newCardInstance = this.state_manager.createCardInstance({
        cardId: inst.cardId,
        position: Vec.add(inst, { x: 20, y: 20 }),
        linkToCardInstanceId: inst.id,
      });
      this.state_manager.selectedCardInstance = newCardInstance.id;
    } else if (option === "delete") {
      this.state_manager.deleteCardInstance(
        this.state_manager.selectedCardInstance!
      );
      this.state_manager.selectedCardInstance = null;
    } else if (option === undefined) {
      // Clicked on property button
      console.log("property");
      this.showProperty = true;

      show_calendarModal(
        this.state_manager.getCard(inst.cardId)!,
        this.state_manager
      );
    }

    return true;
  }

  drag(delta: Vec) {
    const instance = this.state_manager.getCardInstance(
      this.state_manager.selectedCardInstance!
    );
    if (instance) {
      const newPos = Vec.add(instance, delta);
      this.state_manager.moveCardInstance(instance.id, newPos);
    }
  }

  render(r: Render) {
    // Selected Card
    if (this.active()) {
      const inst = this.state_manager.getCardInstance(
        this.state_manager.selectedCardInstance!
      )!;

      // Draw the selection box
      const card = this.state_manager.getCard(inst.cardId)!;
      r.round_rect(
        inst.x - 4,
        inst.y - 4,
        card.width + 8,
        card.height + 8,
        4,
        dashedStroke("blue", 1, [10, 10])
      );

      // Draw selection the menu
      const p = Vec.add(inst, { x: 0, y: -50 });
      r.round_rect(
        p.x + 2,
        p.y + 2,
        (OPTIONS.length + 1) * 40,
        40,
        3,
        fill("#0001")
      );
      r.round_rect(
        p.x,
        p.y,

        (OPTIONS.length + 1) * 40,
        40,
        3,
        fillAndStroke("#FFF", "#0002", 1)
      );

      // Actions
      for (let i = 0; i < OPTIONS.length; i++) {
        r.image("./img/" + OPTIONS[i] + ".png", {
          x: p.x + i * 40,
          y: p.y,
        });
      }

      // Dividing line
      r.line(
        p.x + OPTIONS.length * 40,
        p.y,
        p.x + OPTIONS.length * 40,
        p.y + 40,
        stroke("#0002", 1)
      );

      r.image("./img/calendar.png", {
        x: p.x + OPTIONS.length * 40,
        y: p.y,
      });
    }
  }
}

function show_calendarModal(card: Card, state_manager: StateManager) {
  const wrapper = document.createElement("div");
  wrapper.className = "calendar-modal";
  document.body.appendChild(wrapper);
  function close() {
    wrapper.remove();
  }

  const datepicker = document.createElement("input");
  datepicker.type = "date";
  datepicker.value = card.props!.date.toISOString().split("T")[0];
  datepicker.oninput = () => {
    state_manager.updateCardDate(card.id, new Date(datepicker.value));
  };

  wrapper.appendChild(datepicker);

  const { calendars } = state_manager.calendarDocHandle.doc();
  Object.values(calendars).forEach((calendar) => {
    const line = document.createElement("hr");
    wrapper.appendChild(line);

    // Checkboxes for each calendar
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked =
      card.props!.calendarIds.findIndex((id) => id === calendar.id) !== -1;
    checkbox.onchange = () => {
      state_manager.updateCardCalendar(card.id, calendar.id!, checkbox.checked);
    };
    wrapper.appendChild(checkbox);

    const label = document.createElement("label");
    label.innerText = calendar.summary!;
    wrapper.appendChild(label);
  });

  const line = document.createElement("hr");
  wrapper.appendChild(line);
  // Close button
  const closeButton = document.createElement("button");
  closeButton.innerText = "Close";
  closeButton.onclick = close;
  wrapper.appendChild(closeButton);
}
