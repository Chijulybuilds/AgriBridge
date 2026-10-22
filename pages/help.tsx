import { useMemo, useState } from "react";

import AppLayout from "../components/layout/AppLayout";
import { TutorialButton } from "../components/help/Tutorial";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { HELP, HELP_GROUPS, type HelpTopic } from "../lib/help";
import { useRememberedRole } from "../lib/session";

/** Every word in AgriBridge explained in simple words, grouped by topic, with a search box. */
export default function Help() {
  const role = useRememberedRole("farmer");
  const [query, setQuery] = useState("");
  const topics = Object.entries(HELP) as [string, HelpTopic][];
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => topics.filter(([, t]) => !q || `${t.title} ${t.what} ${t.why} ${t.todo}`.toLowerCase().includes(q)),
    [topics, q],
  );

  return (
    <AppLayout role={role} title="Help" requireWallet={false}>
      <PageHeader
        eyebrow="Help"
        title="Every word explained"
        subtitle="What each thing in AgriBridge is, why it matters to you, and what to do, in simple words. You can also tap any small &quot;i&quot; in the app."
        actions={<TutorialButton />}
      />
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="help-search">Search for a word</label>
        <input
          id="help-search"
          className="input"
          type="search"
          placeholder="For example: advance"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="help-search"
        />
      </div>
      {shown.length === 0 ? (
        <Card>
          <EmptyState art="info" title={`Nothing matches "${query}"`}>Try a shorter word, or clear the search to see everything.</EmptyState>
        </Card>
      ) : (
        HELP_GROUPS.map((group) => {
          const inGroup = shown.filter(([, t]) => t.group === group);
          if (inGroup.length === 0) return null;
          return (
            <Card key={group} title={group}>
              <div className="help-list">
                {inGroup.map(([id, t]) => (
                  <article key={id} className="help-item" id={`help-${id}`} data-testid={`help-${id}`}>
                    <h3>{t.title}</h3>
                    <dl>
                      <dt>What it is</dt>
                      <dd>{t.what}</dd>
                      <dt>Why it matters</dt>
                      <dd>{t.why}</dd>
                      <dt>What to do</dt>
                      <dd>{t.todo}</dd>
                    </dl>
                  </article>
                ))}
              </div>
            </Card>
          );
        })
      )}
    </AppLayout>
  );
}
