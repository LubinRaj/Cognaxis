import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { FirestoreJournalRepository } from "../../src/server/data/firestore-journal-repository.js";

function storedMessage(role: "user" | "model", content: string, sequence: number) {
  return {
    role,
    content,
    sequence,
    createdBy: "user_alpha",
    scopeType: "personal",
    scopeId: "user_alpha",
    schemaVersion: 1,
    createdAt: Timestamp.fromMillis(sequence * 1_000),
  };
}

describe("Firestore journal ordering", () => {
  it("queries the newest messages and returns them in conversation order", async () => {
    const get = vi.fn().mockResolvedValue({
      docs: [
        { id: "new", data: () => storedMessage("model", "Newest", 30) },
        { id: "old", data: () => storedMessage("user", "Older", 7) },
      ],
    });
    const query = {
      orderBy: vi.fn(),
      limit: vi.fn(),
      get,
    };
    query.orderBy.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const session = { collection: vi.fn().mockReturnValue(query) };
    const firestore = { doc: vi.fn().mockReturnValue(session) } as unknown as Firestore;
    const repository = new FirestoreJournalRepository(firestore);

    const messages = await repository.listMessages("user_alpha", "session_alpha", 24);

    expect(query.orderBy).toHaveBeenCalledWith("sequence", "desc");
    expect(query.limit).toHaveBeenCalledWith(24);
    expect(messages.map((message) => message.id)).toEqual(["old", "new"]);
  });
});
