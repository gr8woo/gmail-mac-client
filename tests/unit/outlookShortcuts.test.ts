import { describe, expect, it } from "vitest";
import {
  createGmailActionScript,
  createGmailShortcutGuardScript,
  getOutlookShortcutAction,
  outlookDeleteAccelerators
} from "../../src/main/outlookShortcuts";

describe("getOutlookShortcutAction", () => {
  it("exports native accelerators for Outlook-style delete", () => {
    expect(outlookDeleteAccelerators).toEqual(["Backspace", "Delete"]);
  });

  it("maps Outlook compose shortcuts to Gmail compose", () => {
    expect(getOutlookShortcutAction({ type: "keyDown", key: "n", control: true })).toBe("compose");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "N", meta: true })).toBe("compose");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "M", control: true, shift: true })).toBe("compose");
  });

  it("maps Outlook reply shortcuts to Gmail reply actions", () => {
    expect(getOutlookShortcutAction({ type: "keyDown", key: "r", control: true })).toBe("reply");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "R", meta: true })).toBe("reply");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "R", control: true, shift: true })).toBe("replyAll");
  });

  it("maps Outlook forwarding shortcuts without stealing Mac search", () => {
    expect(getOutlookShortcutAction({ type: "keyDown", key: "f", control: true })).toBe("forward");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "F", control: true, shift: true })).toBe("forward");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "f", meta: true })).toBeNull();
  });

  it("maps Outlook delete keys to Gmail delete", () => {
    expect(getOutlookShortcutAction({ type: "keyDown", key: "Backspace" })).toBe("delete");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "Delete" })).toBe("delete");
  });

  it("maps Gmail archive key to archive", () => {
    expect(getOutlookShortcutAction({ type: "keyDown", key: "e" })).toBe("archive");
    expect(getOutlookShortcutAction({ type: "keyDown", key: "E" })).toBe("archive");
  });

  it("maps F5 to refresh", () => {
    expect(getOutlookShortcutAction({ type: "keyDown", key: "F5" })).toBe("refresh");
  });

  it("does not steal plain typing, search, or non-keydown events", () => {
    expect(getOutlookShortcutAction({ type: "keyDown", key: "n" })).toBeNull();
    expect(getOutlookShortcutAction({ type: "keyUp", key: "n", control: true })).toBeNull();
  });
});

describe("createGmailActionScript", () => {
  it("targets Gmail's internal archive toolbar button", () => {
    document.body.innerHTML = '<div role="button" act="7" aria-label="Archive"></div>';
    const archiveButton = document.querySelector("[act='7']") as HTMLElement;
    makeVisible(archiveButton);

    expect(eval(createGmailActionScript("archive"))).toEqual({
      status: "target",
      x: 12,
      y: 12
    });
  });

  it("preserves text editing for the archive key", () => {
    document.body.innerHTML = '<input value="archiv" />';
    const input = document.querySelector("input") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(6, 6);

    expect(eval(createGmailActionScript("archive", { inputKey: "e" }))).toEqual({
      status: "handled-editable"
    });
    expect(input.value).toBe("archive");
  });

  it("clicks Gmail's internal trash toolbar button when not editing", () => {
    document.body.innerHTML = `
      <div role="button" act="10" aria-label="Trash"></div>
    `;
    const trashButton = document.querySelector("[act='10']") as HTMLElement;
    makeVisible(trashButton);

    expect(eval(createGmailActionScript("delete"))).toEqual({
      status: "target",
      x: 12,
      y: 12
    });
  });

  it("preserves text editing even when Gmail's trash toolbar button is visible", () => {
    document.body.innerHTML = `
      <input value="focused search" />
      <div role="button" act="10" aria-label="Trash"></div>
    `;
    const input = document.querySelector("input") as HTMLInputElement;
    const trashButton = document.querySelector("[act='10']") as HTMLElement;
    makeVisible(trashButton);
    input.focus();
    input.setSelectionRange(14, 14);

    expect(eval(createGmailActionScript("delete", { deleteKey: "Backspace" }))).toEqual({
      status: "handled-editable"
    });
    expect(input.value).toBe("focused searc");
  });

  it("preserves contenteditable selection editing when Gmail's trash toolbar button is visible", () => {
    document.body.innerHTML = `
      <div id="editor" contenteditable="true">draft</div>
      <div role="button" act="10" aria-label="Trash"></div>
    `;
    const editor = document.querySelector("#editor") as HTMLElement;
    const trashButton = document.querySelector("[act='10']") as HTMLElement;
    makeVisible(trashButton);
    selectTextNodeOffset(editor, 5);

    expect(eval(createGmailActionScript("delete", { deleteKey: "Backspace" }))).toEqual({
      status: "handled-editable"
    });
  });

  it("preserves text editing when no Gmail trash button is visible", () => {
    document.body.innerHTML = '<input value="draft" />';
    const input = document.querySelector("input") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(5, 5);

    expect(eval(createGmailActionScript("delete", { deleteKey: "Backspace" }))).toEqual({
      status: "handled-editable"
    });
    expect(input.value).toBe("draf");
  });

  it("keeps a focused empty input from falling through to mail delete", () => {
    document.body.innerHTML = '<input value="" />';
    const input = document.querySelector("input") as HTMLInputElement;
    input.focus();

    expect(eval(createGmailActionScript("delete", { deleteKey: "Backspace" }))).toEqual({
      status: "handled-editable"
    });
  });
});

describe("createGmailShortcutGuardScript", () => {
  it("blocks mail actions while the user is editing text", () => {
    document.body.innerHTML = '<input value="draft" />';
    const input = document.querySelector("input") as HTMLInputElement;
    input.focus();

    expect(eval(createGmailShortcutGuardScript("archive"))).toEqual({ status: "editing" });
    expect(eval(createGmailShortcutGuardScript("reply"))).toEqual({ status: "editing" });
    expect(eval(createGmailShortcutGuardScript("delete"))).toEqual({ status: "editing" });
  });

  it("blocks mail actions while a contenteditable selection is active", () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">draft</div>';
    const editor = document.querySelector("#editor") as HTMLElement;
    selectTextNodeOffset(editor, 5);

    expect(eval(createGmailShortcutGuardScript("delete"))).toEqual({ status: "editing" });
  });

  it("blocks mail actions while focus is inside an iframe editor", () => {
    document.body.innerHTML = '<iframe title="compose body"></iframe>';
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    frame.focus();

    expect(eval(createGmailShortcutGuardScript("delete"))).toEqual({ status: "editing" });
  });

  it("allows refresh while the user is editing text", () => {
    document.body.innerHTML = '<input value="draft" />';
    const input = document.querySelector("input") as HTMLInputElement;
    input.focus();

    expect(eval(createGmailShortcutGuardScript("refresh"))).toEqual({ status: "ready" });
  });
});

function makeVisible(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      width: 24,
      height: 24,
      top: 0,
      left: 0,
      right: 24,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
}

function selectTextNodeOffset(element: HTMLElement, offset: number): void {
  const textNode = element.firstChild;
  if (!textNode) {
    throw new Error("Expected text node");
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}
