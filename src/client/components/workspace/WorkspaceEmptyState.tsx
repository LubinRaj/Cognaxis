import type { OperationStatus } from "../../workspace/use-workspace-controller";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

type FirstUseProps = {
  onCreate: () => void;
  createStatus: OperationStatus;
};

export function WorkspaceFirstUse({ onCreate, createStatus }: FirstUseProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
      <EmptyState
        icon="chat_bubble"
        title="Start your first reflection"
        description="Think out loud with Gemini in a private conversation, and keep the summary that comes out of it."
        actions={
          <Button
            icon="add"
            onClick={onCreate}
            loading={createStatus === "pending"}
            loadingLabel="Starting…"
          >
            New reflection
          </Button>
        }
      >
        <ul className="text-on-surface-variant mx-auto flex max-w-sm flex-col gap-1.5 text-sm">
          <li>“Help me think through a difficult decision.”</li>
          <li>“Reflect on what I learned today.”</li>
          <li>“Turn these notes into clear next steps.”</li>
        </ul>
      </EmptyState>
    </div>
  );
}

export function EmptyReflection({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
      <EmptyState
        icon="edit_document"
        title={title}
        description="Write the first thing on your mind, or choose a starting point below the composer."
      />
    </div>
  );
}
