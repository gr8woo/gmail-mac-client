export type OutlookShortcutAction = "compose" | "reply" | "replyAll" | "forward" | "archive" | "delete" | "refresh";
export const outlookDeleteAccelerators: readonly string[] = [];

interface OutlookShortcutInput {
  type?: string;
  key?: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

const gmailShortcutKeys: Record<OutlookShortcutAction, string> = {
  compose: "c",
  reply: "r",
  replyAll: "a",
  forward: "f",
  archive: "e",
  delete: "#",
  refresh: ""
};

export function getOutlookShortcutAction(input: OutlookShortcutInput): OutlookShortcutAction | null {
  if (input.type !== "keyDown" || input.alt) {
    return null;
  }

  const key = input.key?.toLowerCase();
  const hasCommandModifier = Boolean(input.control || input.meta);

  if (!key) {
    return null;
  }

  if (key === "f5") {
    return "refresh";
  }

  if (!hasCommandModifier && !input.shift && (key === "backspace" || key === "delete")) {
    return "delete";
  }

  if (!hasCommandModifier) {
    return null;
  }

  if (input.shift) {
    if (key === "m") {
      return "compose";
    }

    if (key === "r") {
      return "replyAll";
    }

    if (key === "f") {
      return "forward";
    }

    return null;
  }

  if (key === "n") {
    return "compose";
  }

  if (key === "r") {
    return "reply";
  }

  if (key === "f" && input.control && !input.meta) {
    return "forward";
  }

  return null;
}

export function getGmailShortcutKey(action: OutlookShortcutAction): string {
  return gmailShortcutKeys[action];
}

export function createGmailActionScript(
  action: OutlookShortcutAction,
  options: { deleteKey?: string; inputKey?: string } = {}
): string {
  return `
(() => {
  const action = ${JSON.stringify(action)};
  const selectorsByAction = ${JSON.stringify(gmailActionSelectors)};
  const selectors = selectorsByAction[action] || [];
  const deleteKey = ${JSON.stringify(options.deleteKey ?? "")};
  const inputKey = ${JSON.stringify(options.inputKey ?? "")};
  const directSelectorsByAction = ${JSON.stringify(directGmailActionSelectors)};
  const directSelectors = directSelectorsByAction[action] || [];
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const canClick = (element) =>
    element &&
    isVisible(element) &&
    element.getAttribute("aria-disabled") !== "true" &&
    element.getAttribute("disabled") === null;
  const targetResult = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      status: "target",
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  };
  const isEditable = (element) => {
    if (!element) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    const contentEditable = element.getAttribute("contenteditable");
    return (
      element.isContentEditable ||
      contentEditable === "" ||
      contentEditable === "true" ||
      tagName === "input" ||
      tagName === "iframe" ||
      tagName === "textarea" ||
      element.getAttribute("role") === "textbox"
    );
  };
  const closestEditable = (node) => {
    let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;

    while (element) {
      if (isEditable(element)) {
        return element;
      }

      element = element.parentElement;
    }

    return null;
  };
  const getSelectionEditable = () => {
    const selection = document.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    return closestEditable(selection.anchorNode) || closestEditable(selection.focusNode);
  };
  const getActiveEditable = () =>
    isEditable(document.activeElement) ? document.activeElement : getSelectionEditable();
  const applyEditableDelete = (element) => {
    if (!isEditable(element)) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea") {
      if (element.readOnly || element.disabled) {
        return false;
      }

      const value = element.value || "";
      const start = element.selectionStart ?? value.length;
      const end = element.selectionEnd ?? start;
      let nextValue = value;
      let nextPosition = start;

      if (start !== end) {
        nextValue = value.slice(0, start) + value.slice(end);
      } else if (deleteKey === "Delete" && start < value.length) {
        nextValue = value.slice(0, start) + value.slice(start + 1);
      } else if (deleteKey !== "Delete" && start > 0) {
        nextValue = value.slice(0, start - 1) + value.slice(start);
        nextPosition = start - 1;
      }

      if (nextValue !== value) {
        element.value = nextValue;
        element.setSelectionRange(nextPosition, nextPosition);
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        return true;
      }

      return false;
    }

    return typeof document.execCommand === "function"
      ? document.execCommand(deleteKey === "Delete" ? "forwardDelete" : "delete")
      : false;
  };
  const applyEditableText = (element) => {
    if (!inputKey || inputKey.length !== 1 || !isEditable(element)) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea") {
      if (element.readOnly || element.disabled) {
        return false;
      }

      const value = element.value || "";
      const start = element.selectionStart ?? value.length;
      const end = element.selectionEnd ?? start;
      element.value = value.slice(0, start) + inputKey + value.slice(end);
      const nextPosition = start + inputKey.length;
      element.setSelectionRange(nextPosition, nextPosition);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: inputKey, inputType: "insertText" }));
      return true;
    }

    if (typeof document.execCommand !== "function") {
      return false;
    }

    document.execCommand("insertText", false, inputKey);
    return true;
  };
  const clickFirstMatch = (selectorList) => {
    for (const selector of selectorList) {
      const target = document.querySelector(selector);

      if (canClick(target)) {
        return targetResult(target);
      }
    }

    return null;
  };

  const activeEditable = getActiveEditable();

  if (action === "archive" && applyEditableText(activeEditable)) {
    return { status: "handled-editable" };
  }

  if (action === "delete" && activeEditable) {
    applyEditableDelete(activeEditable);
    return { status: "handled-editable" };
  }

  const directTarget = clickFirstMatch(directSelectors);
  if (directTarget) {
    return directTarget;
  }

  for (const selector of selectors) {
    const elements = [...document.querySelectorAll(selector)];
    const target = elements.find(canClick);

    if (target) {
      return targetResult(target);
    }
  }

  return { status: "not-found" };
})()
`;
}

export function createGmailShortcutGuardScript(action: OutlookShortcutAction): string {
  return `
(() => {
  const action = ${JSON.stringify(action)};
  const active = document.activeElement;
  const isEditable = (element) => {
    if (!element) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    const contentEditable = element.getAttribute("contenteditable");
    return (
      element.isContentEditable ||
      contentEditable === "" ||
      contentEditable === "true" ||
      tagName === "input" ||
      tagName === "iframe" ||
      tagName === "textarea" ||
      element.getAttribute("role") === "textbox"
    );
  };
  const closestEditable = (node) => {
    let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;

    while (element) {
      if (isEditable(element)) {
        return element;
      }

      element = element.parentElement;
    }

    return null;
  };
  const getSelectionEditable = () => {
    const selection = document.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    return closestEditable(selection.anchorNode) || closestEditable(selection.focusNode);
  };
  const getActiveEditable = () =>
    isEditable(document.activeElement) ? document.activeElement : getSelectionEditable();

  if (action !== "refresh" && getActiveEditable()) {
    return { status: "editing" };
  }

  return { status: "ready" };
})()
`;
}

export function createGmailShortcutDiagnosticsScript(): string {
  return `
(() => {
  const selectors = ${JSON.stringify(gmailActionSelectors.delete)};
  const active = document.activeElement;
  const read = (element) => {
    if (!element) {
      return null;
    }

    return {
      tagName: element.tagName,
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      dataTooltip: element.getAttribute("data-tooltip"),
      act: element.getAttribute("act"),
      id: element.id,
      className: String(element.className || "").slice(0, 160),
      text: String(element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160)
    };
  };
  const rect = (element) => {
    if (!element) {
      return null;
    }

    const box = element.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      top: box.top,
      left: box.left
    };
  };
  const matches = selectors.map((selector) => {
    const elements = [...document.querySelectorAll(selector)].slice(0, 5);
    return {
      selector,
      count: document.querySelectorAll(selector).length,
      first: read(elements[0]),
      firstRect: rect(elements[0])
    };
  });

  return {
    href: location.href,
    title: document.title,
    active: read(active),
    activeRect: rect(active),
    matches
  };
})()
`;
}

const gmailActionSelectors: Record<OutlookShortcutAction, string[]> = {
  compose: [
    '[role="button"][gh="cm"]',
    '[role="button"][aria-label*="Compose"]',
    '[role="button"][aria-label*="작성"]',
    '[role="button"][aria-label*="편지쓰기"]'
  ],
  reply: [
    '[role="button"][aria-label^="Reply"]',
    '[role="button"][aria-label*="Reply"]',
    '[role="button"][aria-label*="답장"]'
  ],
  replyAll: [
    '[role="button"][aria-label*="Reply all"]',
    '[role="button"][aria-label*="Reply to all"]',
    '[role="button"][aria-label*="전체 답장"]',
    '[role="button"][aria-label*="전체답장"]'
  ],
  forward: [
    '[role="button"][aria-label*="Forward"]',
    '[role="button"][aria-label*="전달"]'
  ],
  delete: [
    '[act="10"]',
    '[role="button"][act="10"]',
    '[role="button"][aria-label*="Delete"]',
    '[role="button"][data-tooltip*="Delete"]',
    '[role="button"][aria-label*="Trash"]',
    '[role="button"][data-tooltip*="Trash"]',
    '[role="button"][aria-label*="Move to trash"]',
    '[role="button"][data-tooltip*="Move to trash"]',
    '[role="button"][aria-label*="삭제"]',
    '[role="button"][data-tooltip*="삭제"]',
    '[role="button"][aria-label*="휴지통"]',
    '[role="button"][data-tooltip*="휴지통"]'
  ],
  archive: [
    '[act="7"]',
    '[role="button"][act="7"]',
    '[role="button"][aria-label*="Archive"]',
    '[role="button"][data-tooltip*="Archive"]',
    '[role="button"][aria-label*="보관"]',
    '[role="button"][data-tooltip*="보관"]'
  ],
  refresh: []
};

const directGmailActionSelectors: Partial<Record<OutlookShortcutAction, string[]>> = {
  archive: [
    '[act="7"]:not([aria-disabled="true"])',
    '[role="button"][act="7"]:not([aria-disabled="true"])',
    '[data-tooltip="Archive"]:not([aria-disabled="true"])',
    '[aria-label="Archive"]:not([aria-disabled="true"])',
    '[data-tooltip="보관처리"]:not([aria-disabled="true"])',
    '[aria-label="보관처리"]:not([aria-disabled="true"])',
    '[data-tooltip="보관"]:not([aria-disabled="true"])',
    '[aria-label="보관"]:not([aria-disabled="true"])'
  ],
  delete: [
    '[act="10"]:not([aria-disabled="true"])',
    '[role="button"][act="10"]:not([aria-disabled="true"])',
    '[data-tooltip="Delete"]:not([aria-disabled="true"])',
    '[aria-label="Delete"]:not([aria-disabled="true"])',
    '[data-tooltip="삭제"]:not([aria-disabled="true"])',
    '[aria-label="삭제"]:not([aria-disabled="true"])'
  ]
};
