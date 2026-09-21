import type { PageId } from "./model";
import { pages } from "./model";
export function ReferencePage({ id }: { id: Exclude<PageId, "form"> }) {
  return (
    <article className="reference-page">
      <p className="eyebrow">
        {id === "receipt"
          ? "Expenses / Receipt"
          : id === "policy"
            ? "Company handbook"
            : "Team workspace"}
      </p>
      <h1>{pages[id].title}</h1>
      <p className="lead">
        Fictional sample reference · Retained for this session
      </p>
      {id === "receipt" && (
        <>
          <h2>Rail travel receipt</h2>
          <dl>
            <dt>Journey</dt>
            <dd>Melbourne to Bendigo, return</dd>
            <dt>Purpose</dt>
            <dd>Client workshop</dd>
            <dt>Travel date</dt>
            <dd>18 September 2026</dd>
            <dt>Total paid</dt>
            <dd>AUD 24.00</dd>
            <dt>Reference</dt>
            <dd>SAMPLE-0921</dd>
          </dl>
          <p>
            This bundled receipt is a sample document. No file has been
            uploaded.
          </p>
        </>
      )}
      {id === "policy" && (
        <>
          <h2>Business travel</h2>
          <p>
            Use rail travel when practical. Attach a receipt and describe the
            business purpose when submitting a claim.
          </p>
          <h2>Before you submit</h2>
          <p>
            Check the journey, amount, and expense type against your receipt. A
            saved draft has not been submitted for reimbursement.
          </p>
          <p>This policy is fictional and applies only to this sample claim.</p>
        </>
      )}
      {id === "brief" && (
        <>
          <h2>A browser that helps us pick up the thread</h2>
          <p>
            We move between research, forms, and project documents all day. Our
            priority is returning to work without having to reconstruct what we
            were doing.
          </p>
          <h2>What we need to try</h2>
          <ul>
            <li>Keep related pages together across websites.</li>
            <li>Leave a next step before switching tasks.</li>
            <li>Understand whether an unfinished form is actually saved.</li>
          </ul>
          <p>Compare the sample approaches in Browser comparison.</p>
        </>
      )}
      {id === "comparison" && (
        <>
          <h2>Two approaches to evaluate</h2>
          <table>
            <thead>
              <tr>
                <th>Approach</th>
                <th>What we retain</th>
                <th>What to check</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Groups of tabs</td>
                <td>Page addresses</td>
                <td>Can we remember the next step?</td>
              </tr>
              <tr>
                <td>Tasks with notes</td>
                <td>Page context and intention</td>
                <td>Does it make resuming easier?</td>
              </tr>
            </tbody>
          </table>
          <p>
            These are fictional evaluation notes, not claims about commercial
            browsers.
          </p>
        </>
      )}
    </article>
  );
}
