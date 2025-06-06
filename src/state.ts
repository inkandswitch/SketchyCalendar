import { DocHandle } from "@automerge/automerge-repo";
import { Point } from "geom/point";
import { Vec } from "geom/vec";
import Render, { fill, fillAndStroke, font, stroke } from "render";

import { Calendar, getEventsOnDay } from "calendar";

export type Id<T> = string & { __brand: T };

export type Stroke = {
  id: Id<Stroke>;
  cardId?: Id<Card>;
  pageId?: Id<Page>;
  points: Array<Point>;
  color: string;
  weight: number;
};

function arePointsNear(
  position: Point,
  points: Array<Point>,
  distance: number = 10
): boolean {
  for (const pt of points) {
    const dx = pt.x - position.x;
    const dy = pt.y - position.y;
    if (dx * dx + dy * dy < distance) {
      return true;
    }
  }
  return false;
}

export type TextElement = {
  position: Point;
  value: string;
};

export type TextElementReference = {
  cardInstanceId?: Id<CardInstance>;
  pageId?: Id<Page>;
  index: number;
};

export type Card = {
  id: Id<Card>;
  width: number;
  height: number;
  strokes: Array<Stroke>;
  textelements: Array<TextElement>;
  type: "Default" | "Calendar";
  props?: {
    calendarIds: Array<string>;
    date: Date;
  };
};

function cloneCard(card: Card): Card {
  const newCard = structuredClone(card);
  newCard.id = generateId<Card>();

  return newCard;
}

export type CardInstance = {
  id: Id<CardInstance>;
  cardId: Id<Card>;
  pageId: Id<Page>;
  linkToCardInstanceId?: Id<CardInstance>;
  x: number;
  y: number;
};

export type Page = {
  id: Id<Page>;
  strokes: Array<Stroke>;
  textelements: Array<TextElement>;
};

export type State = {
  title: string;
  cards: Record<Id<Card>, Card>;
  pages: Record<Id<Page>, Page>;
  cardInstances: Record<Id<CardInstance>, CardInstance>;
  pageOrder: Array<Id<Page>>;
};

function generateId<T>(): Id<T> {
  return `${Math.random().toString(36).substring(2, 15)}${Math.random()
    .toString(36)
    .substring(2, 15)}` as Id<T>;
}

export function getNewEmptyState(): State {
  const firstPageId = generateId<Page>();

  return {
    title: "Untitled Sketchy Calendar",
    cards: {},
    cardInstances: {},
    pages: {
      [firstPageId]: {
        id: firstPageId,
        strokes: [],
        textelements: [],
      },
    },
    pageOrder: [firstPageId],
  };
}

export default class StateManager {
  currentPage: Id<Page>;
  selectedCardInstance: Id<CardInstance> | null = null;
  stateDocHandle: DocHandle<State>;
  calendarDocHandle: DocHandle<Calendar>;

  constructor(
    docHandle: DocHandle<State>,
    calendarDocHandle: DocHandle<Calendar>
  ) {
    this.stateDocHandle = docHandle;
    this.calendarDocHandle = calendarDocHandle;
    this.currentPage = this.state.pageOrder[0];
  }

  get state(): State {
    return this.stateDocHandle.doc() as State;
  }

  update(callback: (state: State) => void) {
    this.stateDocHandle.change(callback);
  }

  gotoPage(pageId: Id<Page>) {
    // move selection between pages
    const selectedCardInstanceId = this.selectedCardInstance;
    if (selectedCardInstanceId) {
      this.update((state) => {
        const cardInstance = state.cardInstances[selectedCardInstanceId];
        cardInstance.pageId = pageId;
      });
    }

    this.currentPage = pageId;
  }

  gotoNextPage() {
    const currentIndex = this.state.pageOrder.indexOf(this.currentPage);
    const nextIndex = currentIndex + 1;
    let nextPageId = this.state.pageOrder[nextIndex];

    // create next page if needed
    if (!nextPageId) {
      const newPage = {
        id: generateId<Page>(),
        cardInstances: [],
        strokes: [],
        textelements: [],
      };

      this.update((state) => {
        state.pages[newPage.id] = newPage;
        state.pageOrder.push(newPage.id);
      });

      nextPageId = newPage.id;
    }

    this.gotoPage(nextPageId);
  }

  gotoPrevPage() {
    const currentIndex = this.state.pageOrder.indexOf(this.currentPage);
    if (currentIndex == 0) {
      return;
    }

    const prevPageId = this.state.pageOrder[currentIndex - 1];

    this.gotoPage(prevPageId);
  }

  createNewCard(position: Point): CardInstance {
    const cardId = generateId<Card>();

    this.update((state) => {
      state.cards[cardId] = {
        id: cardId,
        width: 5,
        height: 5,
        strokes: [],
        textelements: [],
        type: "Default",
      };
    });

    return this.createCardInstance({
      cardId,
      position,
    });
  }

  updateCardSize(cardId: Id<Card>, width: number, height: number): void {
    this.update((state) => {
      state.cards[cardId].width = width;
      state.cards[cardId].height = height;
    });
  }

  getCard(cardId: Id<Card>): Card | undefined {
    return this.state.cards[cardId];
  }

  copyCard(cardId: Id<Card>): Id<Card> {
    const card = this.getCard(cardId)!;

    const newCard = cloneCard(card);
    const newCardId = newCard.id;

    this.update((state) => {
      state.cards[newCard.id] = newCard;
    });

    return newCardId;
  }

  updateCardDate(cardId: Id<Card>, date: Date): void {
    this.update((state) => {
      state.cards[cardId].props!.date = date;
    });
  }

  updateCardCalendar(
    cardId: Id<Card>,
    calendarId: string,
    active: boolean
  ): void {
    this.update((state) => {
      const card = state.cards[cardId];
      if (active) {
        card.props!.calendarIds.push(calendarId);
      } else {
        card.props!.calendarIds = card.props!.calendarIds.filter(
          (id) => id !== calendarId
        );
      }
    });
  }

  // Instances
  createNewCalendarCard(position: Point, calendarIds: string[]): CardInstance {
    const cardId = generateId<Card>();

    this.update((state) => {
      state.cards[cardId] = {
        id: cardId,
        width: 200,
        height: 750,
        strokes: [],
        textelements: [],
        type: "Calendar",
        props: {
          calendarIds,
          date: new Date(),
        },
      };
    });

    return this.createCardInstance({
      cardId,
      position,
    });
  }

  createCardInstance({
    cardId,
    position,
    linkToCardInstanceId,
  }: {
    cardId: Id<Card>;
    position: Point;
    linkToCardInstanceId?: Id<CardInstance>;
  }): CardInstance {
    const instanceId = generateId<CardInstance>();
    const instance: CardInstance = {
      id: instanceId,
      cardId,
      pageId: this.currentPage,
      x: position.x,
      y: position.y,
    };

    if (linkToCardInstanceId) {
      instance.linkToCardInstanceId = linkToCardInstanceId;
    }

    this.update((state) => {
      state.cardInstances[instanceId] = instance;
    });

    return instance;
  }

  moveCardInstance(instanceId: Id<CardInstance>, position: Point): void {
    this.update((state) => {
      const instance = state.cardInstances[instanceId];
      if (!instance) return;
      instance.x = position.x;
      instance.y = position.y;
    });
  }

  deleteCardInstance(instanceId: Id<CardInstance>): void {
    this.update((state) => {
      const instance = state.cardInstances[instanceId];
      if (!instance) return;
      delete state.cardInstances[instanceId];
    });
  }

  erase(position: Point): void {
    this.update((state) => {
      const instance = this.findCardInstanceAt(position);
      if (instance) {
        const card = state.cards[instance.cardId];
        card.strokes.forEach((stroke) => {
          let offset_points = stroke.points.map((p) => Vec.add(p, instance));
          if (arePointsNear(position, offset_points, 5)) {
            card.strokes.splice(card.strokes.indexOf(stroke), 1);
          }
        });
      } else {
        state.pages[this.currentPage].strokes.forEach((stroke) => {
          if (arePointsNear(position, stroke.points)) {
            state.pages[this.currentPage].strokes.splice(
              state.pages[this.currentPage].strokes.indexOf(stroke),
              1
            );
          }
        });
      }
    });
  }

  cardInstancesOnCurrentPage(): Array<CardInstance> {
    return Object.values(this.state.cardInstances).filter(
      (instance) => instance.pageId === this.currentPage
    );
  }

  getCardInstance(instanceId: Id<CardInstance>): CardInstance | null {
    return this.state.cardInstances[instanceId];
  }

  findCardInstanceAt(position: Point): CardInstance | null {
    return (
      this.cardInstancesOnCurrentPage().find((instance) => {
        const card = this.state.cards[instance.cardId];
        return (
          position.x >= instance.x &&
          position.x <= instance.x + card.width &&
          position.y >= instance.y &&
          position.y <= instance.y + card.height
        );
      }) || null
    );
  }

  createNewStroke(
    position: Point,
    props: { color: string; weight: number }
  ): { stroke: Stroke; offset: Point } {
    const instance = this.findCardInstanceAt(position);

    if (instance) {
      const stroke = {
        id: generateId<Stroke>(),
        cardId: instance.cardId,
        points: [],
        color: props.color,
        weight: props.weight,
      };

      this.update((state) => {
        const card = state.cards[instance.cardId];
        card.strokes.push(stroke);
      });

      return { stroke, offset: instance };
    } else {
      console.log("createNewStroke on page", instance);

      const stroke = {
        id: generateId<Stroke>(),
        pageId: this.currentPage,
        points: [],
        color: props.color,
        weight: props.weight,
      };

      this.update((state) => {
        const page = state.pages[this.currentPage];
        page.strokes.push(stroke);
      });

      return { stroke, offset: { x: 0, y: 0 } };
    }
  }

  addPointToStroke(stroke: Stroke, point: Point): void {
    this.update((state) => {
      if (stroke.pageId) {
        const mutableStroke = state.pages[stroke.pageId].strokes.find(
          (s) => s.id === stroke.id
        );
        if (!mutableStroke) return;
        mutableStroke.points.push(point);
      } else if (stroke.cardId) {
        const mutableStroke = state.cards[stroke.cardId].strokes.find(
          (s) => s.id === stroke.id
        );
        if (!mutableStroke) return;
        mutableStroke.points.push(point);
      }
    });
  }

  createNewText(position: Point): TextElementReference {
    const text = {
      position,
      value: "",
    };

    const found = this.findCardInstanceAt(position);
    if (found) {
      text.position = Vec.sub(text.position, found);
      this.update((state) => {
        state.cards[found.cardId].textelements.push(text);
      });
      return {
        cardInstanceId: found.id,
        index: this.state.cards[found.cardId].textelements.length - 1,
      };
    } else {
      this.update((state) => {
        state.pages[this.currentPage].textelements.push(text);
      });
      return {
        pageId: this.currentPage,
        index: this.state.pages[this.currentPage].textelements.length - 1,
      };
    }
  }

  findTextElementAt(position: Point): TextElementReference | null {
    const elements = this.state.pages[this.currentPage].textelements;
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (Vec.dist(element.position, position) < 10) {
        return {
          pageId: this.currentPage,
          index: i,
        };
      }
    }

    const instances = this.cardInstancesOnCurrentPage();
    for (const instance of instances) {
      const card = this.getCard(instance.cardId)!;
      for (let i = 0; i < card.textelements.length; i++) {
        const element = card.textelements[i];
        const offset = Vec.add(element.position, instance);
        if (Vec.dist(offset, position) < 10) {
          return {
            cardInstanceId: instance.id,
            index: i,
          };
        }
      }
    }

    return null;
  }

  getTextElementPosition(ref: TextElementReference): Point {
    if (ref.pageId) {
      const element = this.state.pages[ref.pageId].textelements[ref.index];
      return element.position;
    } else {
      const instance = this.state.cardInstances[ref.cardInstanceId!];
      const element = this.state.cards[instance.cardId].textelements[ref.index];
      return Vec.add(element.position, instance);
    }
  }

  getTextElementValue(ref: TextElementReference): string {
    if (ref.pageId) {
      const element = this.state.pages[ref.pageId].textelements[ref.index];
      return element.value;
    } else {
      const instance = this.state.cardInstances[ref.cardInstanceId!];
      const element = this.state.cards[instance.cardId].textelements[ref.index];
      return element.value;
    }
  }

  updateTextElement(ref: TextElementReference, value: string) {
    if (ref.pageId) {
      this.update((state) => {
        const element = state.pages[ref.pageId!].textelements[ref.index];
        element.value = value;
      });
    } else {
      this.update((state) => {
        const instance = state.cardInstances[ref.cardInstanceId!];
        const element = state.cards[instance.cardId].textelements[ref.index];
        element.value = value;
      });
    }
  }

  render(render: Render) {
    // Page number
    const currentPage = this.state.pages[this.currentPage];
    const pageNumber = this.state.pageOrder.indexOf(this.currentPage) + 1;

    render.text(
      pageNumber.toString(),
      render.width - 30,
      30,
      font("20px Arial", "gray")
    );

    // Strokes
    currentPage.strokes.forEach((s) => {
      render.poly(s.points, stroke(s.color, s.weight), false);
    });

    // Text Elements
    currentPage.textelements.forEach((s) => {
      render.text(
        s.value,
        s.position.x,
        s.position.y,
        font("18px Architects Daughter", "black")
      );
    });

    // Cards
    this.cardInstancesOnCurrentPage().forEach((instance) => {
      const card = this.state.cards[instance.cardId];

      render.round_rect(
        instance.x + 2,
        instance.y + 2,
        card.width,
        card.height,
        3,
        fill("#0001")
      );
      render.round_rect(
        instance.x,
        instance.y,
        card.width,
        card.height,
        3,
        fillAndStroke("#FFF", "#0002", 0.5)
      );

      if (instance.linkToCardInstanceId) {
        const linkedInstance = this.getCardInstance(
          instance.linkToCardInstanceId
        );

        if (linkedInstance) {
          render.image("./img/transclude-light.png", {
            x: instance.x + card.width - 40,
            y: instance.y,
          });
        }
      }

      if (card.type == "Calendar") {
        const { calendarIds, date: dateString } = card.props!;
        const date = new Date(dateString);

        // Draw calendar grid
        const headerHeight = 150;
        const calendarHeight = card.height - headerHeight;

        for (let i = 0; i < 13; i++) {
          const hour = i + 8;
          const offset = (calendarHeight / 13) * i + headerHeight;
          const y = instance.y + offset;
          render.text(`${hour}:00`, instance.x + 10, y + 15, fill("#AAA"));

          render.line(
            instance.x,
            y,
            instance.x + card.width,
            y,
            stroke("#AAA", 1)
          );
        }

        render.text(
          date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          instance.x + 10,
          instance.y + 30,
          font("18px Arial", "gray")
        );

        const isToday =
          card.props &&
          new Date(card.props.date).toDateString() == new Date().toDateString();

        if (isToday) {
          const offset =
            headerHeight + getTimeOffset(new Date(), 8, 21, 0, calendarHeight);

          render.line(
            instance.x,
            instance.y + offset,
            instance.x + card.width,
            instance.y + offset,
            stroke("#cc7474", 1)
          );
        }

        const events = getEventsOnDay(
          date,
          calendarIds,
          this.calendarDocHandle
        );
        for (const event of events) {
          const start = new Date(event.start!.dateTime!);
          const start_offset =
            headerHeight + getTimeOffset(start, 8, 21, 0, calendarHeight);
          const end = new Date(event.end!.dateTime!);
          const end_offset =
            headerHeight + getTimeOffset(end, 8, 21, 0, calendarHeight);
          render.round_rect(
            instance.x + 50,
            instance.y + start_offset,
            card.width - 50,
            end_offset - start_offset,
            3,
            fill("#00000011")
          );
          render.text(
            event.summary!,
            instance.x + 60,
            instance.y + start_offset + 15,
            fill("#AAA")
          );
        }
      }

      card.strokes.forEach((s) => {
        const offset_stroke = s.points.map((p) => Vec.add(p, instance));
        render.poly(offset_stroke, stroke(s.color, s.weight), false);
      });

      // Text Elements
      card.textelements.forEach((s) => {
        const offset = Vec.add(s.position, instance);
        render.text(
          s.value,
          offset.x,
          offset.y,
          font("18px Architects Daughter", "black")
        );
      });
    });
  }
}

function getTimeOffset(
  date: Date,
  startHour: number,
  endHour: number,
  offsetStart: number,
  offsetEnd: number
): number {
  const totalMinutesInRange = (endHour - startHour) * 60;
  const minutesSinceStart =
    (date.getHours() - startHour) * 60 + date.getMinutes();

  // Clamp minutesSinceStart between 0 and totalMinutesInRange
  const clampedMinutes = Math.max(
    0,
    Math.min(minutesSinceStart, totalMinutesInRange)
  );

  const ratio = clampedMinutes / totalMinutesInRange;
  const offset = offsetStart + ratio * (offsetEnd - offsetStart);

  return offset;
}
