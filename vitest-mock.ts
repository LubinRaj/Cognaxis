import { vi } from 'vitest';
vi.mock("firebase-admin/firestore", () => {
  return {
    getFirestore: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ status: "active" }) }),
          set: async () => {},
          update: async () => {},
        })
      })
    }),
    FieldValue: {
      serverTimestamp: () => new Date(),
    }
  };
});
