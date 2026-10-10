import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import type {
  FileSnapshot,
} from "../src/checkpoint/file-change.js";

import {
  applyUndo,
  createUndoNote,
  findConflicts,
  findNewConflicts,
  planUndo,
  unannouncedUndos,
  type UndoPlan,
} from "../src/checkpoint/undo.js";

import type {
  SessionEntry,
} from "../src/session/session-store.js";


let root: string | undefined;


afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});


function text(content: string | null): FileSnapshot {
  return content === null ? null : { encoding: "utf8", content };
}


function userEntry(id: string, content: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "",
    message: { role: "user", content, timestamp: 1 },
  };
}


function changeEntry(
  id: string,
  taskEntryId: string,
  path: string,
  before: string | null,
  after: string | null,
): SessionEntry {
  return {
    type: "file_change",
    id,
    parentId: null,
    timestamp: "",
    taskEntryId,
    toolCallId: `call-${id}`,
    path,
    before: text(before),
    after: text(after),
  };
}


describe("planUndo", () => {
  it("plans the latest task not yet undone, merging each file's first before and last after", () => {
    const entries: SessionEntry[] = [
      userEntry("t1", "任务一"),
      changeEntry("c1", "t1", "a.txt", "v0", "v1"),
      userEntry("t2", "任务二"),
      changeEntry("c2", "t2", "a.txt", "v1", "v2"),
      changeEntry("c3", "t2", "new.txt", null, "n1"),
      changeEntry("c4", "t2", "a.txt", "v2", "v3"),
      userEntry("t3", "只读的任务"),
    ];

    expect(planUndo(entries)).toEqual({
      taskEntryId: "t2",
      taskText: "任务二",
      files: [
        { path: "a.txt", before: text("v1"), after: text("v3") },
        { path: "new.txt", before: null, after: text("n1") },
      ],
    });

    entries.push({
      type: "undo", id: "u1", parentId: null, timestamp: "",
      taskEntryId: "t2", files: ["a.txt", "new.txt"],
    });

    expect(planUndo(entries)?.taskEntryId).toBe("t1");

    entries.push({
      type: "undo", id: "u2", parentId: null, timestamp: "",
      taskEntryId: "t1", files: ["a.txt"],
    });

    expect(planUndo(entries)).toBeUndefined();
  });
});


describe("findNewConflicts", () => {
  it("reports only conflicts that appeared during confirmation", async () => {
    root = await mkdtemp(join(tmpdir(), "agent-undo-"));
    const dir = root;
    await writeFile(join(dir, "a.txt"), "v3");
    await writeFile(join(dir, "b.txt"), "user edit");
    const plan: UndoPlan = {
      taskEntryId: "t1",
      taskText: "任务一",
      files: [
        { path: "a.txt", before: text("v1"), after: text("v3") },
        { path: "b.txt", before: text("b0"), after: text("b1") },
      ],
    };
    const shown = new Set(await findConflicts(dir, plan));
    expect([...shown]).toEqual(["b.txt"]);
    expect(await findNewConflicts(dir, plan, shown)).toEqual([]);

    await writeFile(join(dir, "a.txt"), "edited meanwhile");
    await writeFile(join(dir, "b.txt"), "user edit 2");
    expect(await findNewConflicts(dir, plan, shown)).toEqual(["a.txt"]);
  });
});

describe("findConflicts / applyUndo", () => {
  it("restores files to before the task, deletes files it created, and reports files changed afterwards", async () => {
    root = await mkdtemp(join(tmpdir(), "agent-undo-"));
    const dir = root;
    const binary = Buffer.from([0xff, 0x00, 0xfe]);

    await writeFile(join(dir, "a.txt"), "v3", "utf8");
    await writeFile(join(dir, "new.txt"), "n1-edited-by-user", "utf8");
    await writeFile(join(dir, "bin.dat"), "text now", "utf8");

    const plan: UndoPlan = {
      taskEntryId: "t2",
      taskText: "任务二",
      files: [
        { path: "a.txt", before: text("v1"), after: text("v3") },
        { path: "new.txt", before: null, after: text("n1") },
        {
          path: "bin.dat",
          before: { encoding: "base64", content: binary.toString("base64") },
          after: text("text now"),
        },
      ],
    };

    // new.txt 在任务之后被改过
    expect(await findConflicts(dir, plan)).toEqual(["new.txt"]);

    expect(await applyUndo(dir, plan)).toEqual([]);

    expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("v1");
    await expect(stat(join(dir, "new.txt"))).rejects.toThrow();
    expect((await readFile(join(dir, "bin.dat"))).equals(binary)).toBe(true);
  });
});

describe("unannouncedUndos / createUndoNote", () => {
  it("announces undos made after the last message, and only once", () => {
    const entries: SessionEntry[] = [
      userEntry("t1", "任务一"),
      changeEntry("c1", "t1", "a.txt", "v0", "v1"),
      userEntry("t2", "任务二"),
      changeEntry("c2", "t2", "b.txt", null, "b1"),
      {
        type: "undo", id: "u1", parentId: null, timestamp: "",
        taskEntryId: "t2", files: ["b.txt"],
      },
      {
        type: "undo", id: "u2", parentId: null, timestamp: "",
        taskEntryId: "t1", files: ["a.txt"],
      },
    ];

    const undos = unannouncedUndos(entries);

    expect(undos).toEqual([
      { taskText: "任务二", files: ["b.txt"] },
      { taskText: "任务一", files: ["a.txt"] },
    ]);

    const note = createUndoNote(undos);

    expect(note?.role).toBe("user");
    expect(note?.content).toContain("任务二");
    expect(note?.content).toContain("b.txt");
    expect(note?.content).toContain("a.txt");

    // 说明作为消息写进会话之后，就不再重复
    entries.push(
      userEntry("n1", "[Note from the harness] ..."),
      userEntry("t3", "任务三"),
    );

    expect(unannouncedUndos(entries)).toEqual([]);
    expect(createUndoNote([])).toBeUndefined();
  });
});
