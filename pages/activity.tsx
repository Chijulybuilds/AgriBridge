import AppLayout from "../components/layout/AppLayout";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { useActivity } from "../hooks/useActivity";
import { activeChain } from "../lib/wagmi";
import { useRememberedRole } from "../lib/session";

/**
 * Everything that happened on AgriBridge, newest first, each line linked to the
 * transaction that did it, so anyone can check the record on the blockchain.
 */
export default function Activity() {
  const role = useRememberedRole("farmer");
  const { data, isLoading, error } = useActivity();
  const explorer = activeChain.blockExplorers?.default.url;

  return (
    <AppLayout role={role} title="Activity" requireWallet={false}>
      <PageHeader title="Activity" subtitle="Every delivery, advance, sale and price change, read straight from the blockchain." />
      <Card testId="activity">
        {isLoading ? (
          <EmptyState>Reading the blockchain…</EmptyState>
        ) : error ? (
          <EmptyState>Couldn&apos;t read the activity: {(error as Error).message}</EmptyState>
        ) : !data || data.length === 0 ? (
          <EmptyState>Nothing has happened yet.</EmptyState>
        ) : (
          <table className="table">
            <tbody>
              {data.map((item) => (
                <tr key={item.key}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {item.timestamp ? new Date(item.timestamp * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                  </td>
                  <td>{item.text}</td>
                  <td>
                    {explorer ? (
                      <a className="link" href={`${explorer}/tx/${item.txHash}`} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppLayout>
  );
}
