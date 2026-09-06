import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { User } from "firebase/auth";
import type {
  OrganizationMemoryAnswer,
  PersonalMemoryAnswer,
  UserOrganizationEdge,
} from "../../shared/schemas";
import { useApiClient } from "../lib/use-api-client";
import { ApiError } from "../lib/api-client";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { InlineAlert } from "../components/ui/InlineAlert";
import { FormattedMessage } from "../components/ui/FormattedMessage";
import { usePageTitle } from "../shell/use-page-title";

const EXAMPLES = [
  "What have I been deciding lately?",
  "What themes keep coming up in my reflections?",
  "What should I carry into this week?",
];

type AskScope = "personal" | `team:${string}`;

type AskAnswer =
  | { scope: "personal"; result: PersonalMemoryAnswer }
  | { scope: "team"; organizationId: string; organizationName: string; result: OrganizationMemoryAnswer };

function newestFirst(a: UserOrganizationEdge, b: UserOrganizationEdge): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export function AskMePage() {
  const user = useOutletContext<User>();
  const api = useApiClient(user);
  const navigate = useNavigate();
  usePageTitle("Ask me · Cognaxis");

  const [query, setQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<AskScope>("personal");
  const [organizations, setOrganizations] = useState<UserOrganizationEdge[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [organizationLoadError, setOrganizationLoadError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [pending, setPending] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeOrganizations = useMemo(
    () => organizations
      .filter((edge) => edge.status === "active")
      .sort(newestFirst),
    [organizations],
  );
  const selectedOrganization = selectedScope === "personal"
    ? null
    : activeOrganizations.find((organization) => organization.orgId === selectedScope.slice("team:".length)) ?? null;
  const activeScope: AskScope = selectedOrganization ? selectedScope : "personal";

  useEffect(() => {
    let mounted = true;
    void api.listOrganizations()
      .then((result) => {
        if (!mounted) return;
        setOrganizations(result ?? []);
        setOrganizationLoadError(null);
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        // Personal Ask Me remains available when the optional team directory is unavailable.
        setOrganizationLoadError(
          reason instanceof ApiError ? reason.message : "Your teams could not be loaded right now.",
        );
      })
      .finally(() => {
        if (mounted) setOrganizationsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [api]);

  function changeScope(scope: AskScope) {
    setSelectedScope(scope);
    setAnswer(null);
    setError(null);
    setIndexMessage(null);
  }

  async function ask() {
    const trimmed = query.trim();
    if (!trimmed || pending || organizationsLoading) return;
    setPending(true);
    setAnswer(null);
    setError(null);
    setIndexMessage(null);
    try {
      if (selectedOrganization) {
        const result = await api.askOrganizationMemory(selectedOrganization.orgId, trimmed);
        setAnswer({
          scope: "team",
          organizationId: selectedOrganization.orgId,
          organizationName: selectedOrganization.organizationName,
          result,
        });
      } else {
        setAnswer({ scope: "personal", result: await api.askPersonalMemory(trimmed) });
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : selectedOrganization
            ? "This team memory could not be searched."
            : "Your personal memory could not be searched.",
      );
    } finally {
      setPending(false);
    }
  }

  async function refreshSavedMemory() {
    if (indexing || organizationsLoading) return;
    setIndexing(true);
    setError(null);
    setIndexMessage(null);
    try {
      const result = selectedOrganization
        ? await api.buildOrganizationMemoryIndex(selectedOrganization.orgId)
        : await api.buildPersonalMemoryIndex();
      const noun = selectedOrganization ? "recent shared capture" : "recent capture";
      const pluralNoun = selectedOrganization ? "recent shared captures" : "recent captures";
      setIndexMessage(
        result.failed > 0
          ? `${result.indexed} ${result.indexed === 1 ? noun : pluralNoun} refreshed; ${result.failed} could not be refreshed.`
          : `${result.indexed} ${result.indexed === 1 ? noun : pluralNoun} ${result.indexed === 1 ? "is" : "are"} ready to search.`,
      );
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : "Saved memory could not be refreshed.");
    } finally {
      setIndexing(false);
    }
  }

  const answerCitations = answer?.result.citations ?? [];
  const answerScopeLabel = answer?.scope === "team"
    ? answer.organizationName
    : "Personal · only you";

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-primary text-sm font-medium">Personal intelligence</p>
            <h1 className="font-display text-on-surface mt-1 text-3xl font-medium">Ask me</h1>
            <p className="text-on-surface-variant mt-2 max-w-2xl text-base">
              Ask one trusted memory space at a time. Cognaxis searches only the active reflections
              you are allowed to see and shows the sources used for its answer.
            </p>
          </div>
          <Button
            variant="outlined"
            size="compact"
            icon="refresh"
            loading={indexing}
            loadingLabel="Refreshing…"
            disabled={organizationsLoading}
            onClick={() => void refreshSavedMemory()}
            className="shrink-0 whitespace-nowrap self-start"
          >
            {selectedOrganization ? "Refresh team memory" : "Refresh saved memory"}
          </Button>
        </header>

        {organizationLoadError && (
          <div className="mt-4">
            <InlineAlert tone="warning" onDismiss={() => setOrganizationLoadError(null)}>
              {organizationLoadError} Personal memory is still available; team scopes will appear when the directory loads.
            </InlineAlert>
          </div>
        )}
        {indexMessage && (
          <div className="mt-4">
            <InlineAlert tone="success" onDismiss={() => setIndexMessage(null)}>{indexMessage}</InlineAlert>
          </div>
        )}

        <section
          className="border-outline-variant bg-surface-container-low mt-8 rounded-card border p-4 sm:p-6"
          aria-label="Ask about memory"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <label htmlFor="ask-scope" className="text-on-surface text-sm font-medium">
                Search in
              </label>
              <p className="text-on-surface-variant mt-1 text-xs">
                Personal and team memory are separate. A team answer cannot use another team’s reflections.
              </p>
            </div>
            <select
              id="ask-scope"
              aria-label="Memory scope"
              value={activeScope}
              disabled={organizationsLoading || pending}
              onChange={(event) => changeScope(event.target.value as AskScope)}
              className="border-outline-variant bg-surface text-on-surface focus-visible:outline-focus-ring min-h-11 w-full min-w-0 rounded-control border px-3 pr-10 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto sm:min-w-64"
            >
              <option value="personal">Personal · only you</option>
              {activeOrganizations.map((organization) => (
                <option key={organization.orgId} value={`team:${organization.orgId}`}>
                  {organization.organizationName} · team
                </option>
              ))}
            </select>
          </div>

          <div className="bg-surface-container-high mt-4 flex items-start gap-3 rounded-field px-3 py-3 text-sm">
            <span aria-hidden="true" className="text-primary mt-0.5">●</span>
            <p className="text-on-surface-variant min-w-0">
              {selectedOrganization
                ? <>Searching <span className="text-on-surface font-medium">{selectedOrganization.organizationName}</span>. Only active reflections shared in this team are eligible.</>
                : <>Searching <span className="text-on-surface font-medium">your personal memory</span>. Only your active private reflections are eligible.</>}
            </p>
          </div>

          <label htmlFor="memory-question" className="text-on-surface mt-5 block text-sm font-medium">
            What would you like to remember or understand?
          </label>
          <textarea
            id="memory-question"
            value={query}
            maxLength={500}
            rows={4}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void ask();
            }}
            placeholder={selectedOrganization ? "Ask about this team’s shared work…" : "Ask about patterns, decisions, themes, or next steps…"}
            disabled={pending || organizationsLoading}
            className="border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant focus-visible:outline-focus-ring mt-2 w-full resize-none rounded-field border px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" aria-label="Example questions">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuery(example)}
                  disabled={pending || organizationsLoading}
                  className="border-outline-variant text-on-surface-variant hover:bg-surface-container-high rounded-full border px-3 py-1.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {example}
                </button>
              ))}
            </div>
            <Button
              icon="send"
              loading={pending}
              loadingLabel="Thinking…"
              disabled={!query.trim() || organizationsLoading}
              onClick={() => void ask()}
              className="shrink-0 whitespace-nowrap"
            >
              Ask me
            </Button>
          </div>
          <p className="text-on-surface-variant mt-2 text-right text-xs">{query.length}/500 · ⌘/Ctrl + Enter</p>
        </section>

        {error && <div className="mt-4"><InlineAlert tone="error" onDismiss={() => setError(null)}>{error}</InlineAlert></div>}

        {answer && (
          <section
            className="border-outline-variant bg-surface-container-low mt-6 rounded-card border p-4 sm:p-6"
            aria-live="polite"
            aria-label="Memory answer"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-on-surface text-lg font-medium">Your answer</h2>
              <Chip icon={answer.scope === "team" ? "groups" : "lock"} tone="primary">{answerScopeLabel}</Chip>
            </div>
            <FormattedMessage content={answer.result.answer} className="text-on-surface mt-3 text-base leading-7" />
            {answerCitations.length > 0 ? (
              <div className="border-outline-variant mt-6 border-t pt-4">
                <p className="text-on-surface-variant text-xs font-medium uppercase tracking-wide">
                  {answer.scope === "team" ? "Based on this team’s reflections" : "Based on your reflections"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {answerCitations.map((citation) => (
                    <button
                      key={citation.sessionId}
                      type="button"
                      onClick={() => void navigate(
                        answer.scope === "team"
                          ? `/app/organizations/${encodeURIComponent(answer.organizationId)}?session=${encodeURIComponent(citation.sessionId)}`
                          : `/app/journal?session=${encodeURIComponent(citation.sessionId)}`,
                      )}
                    >
                      <Chip icon="description">
                        {citation.title} · {citation.date}
                      </Chip>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-on-surface-variant mt-6 text-sm">
                {answer.scope === "team"
                  ? "No active reflections in this team matched the question yet."
                  : "No active personal reflections matched the question yet. Keep capturing thoughts and try again."}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default AskMePage;
