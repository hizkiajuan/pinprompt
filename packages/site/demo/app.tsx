// Tallybook: a small React app for Pinprompt's screenshots (scripts/shots.ts). It is a dev build
// with real component names, and shadcn-style `data-slot` attributes, like a typical app.
import { createRoot } from "react-dom/client";

function Button(props: { children: string; variant?: "outline" | "ghost"; id?: string }) {
  return (
    <button data-slot="button" id={props.id} className={`button ${props.variant ?? "outline"}`}>
      {props.children}
    </button>
  );
}

function Card(props: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-slot="card" className={`card ${props.className ?? ""}`}>
      <h3>{props.title}</h3>
      <p className="muted">{props.description}</p>
      {props.children}
    </section>
  );
}

function PlanCard() {
  return (
    <Card
      title="Current plan"
      description="Pro trial, 9 days left. Up to 5 team members."
      className="plan"
    >
      <div className="price">
        $24<span> / month</span>
      </div>
      <div className="actions">
        <Button id="upgrade">Upgrade plan</Button>
        <Button variant="ghost">Cancel trial</Button>
      </div>
    </Card>
  );
}

const USAGE = [30, 45, 38, 60, 52, 70, 64, 82];

function UsageCard() {
  return (
    <Card title="Usage this month" description="1,284 of 2,000 invoices sent" className="usage">
      <div className="chart">
        {USAGE.map((height, index) => (
          <i
            key={index}
            className={index === USAGE.length - 1 ? "now" : ""}
            style={{ height: `${height}%` }}
          />
        ))}
        <i />
        <i />
      </div>
    </Card>
  );
}

const INVOICES = [
  { number: "INV-0043", date: "1 Nov 2026", amount: "$24.00", status: "Due" },
  { number: "INV-0042", date: "1 Oct 2026", amount: "$24.00", status: "Paid" },
  { number: "INV-0041", date: "1 Sep 2026", amount: "$24.00", status: "Paid" },
];

function InvoiceTable() {
  return (
    <Card title="Invoices" description="Sent on the first of each month" className="invoices">
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {INVOICES.map((invoice) => (
            <tr key={invoice.number}>
              <td>{invoice.number}</td>
              <td>{invoice.date}</td>
              <td>{invoice.amount}</td>
              <td>
                <span className={`status ${invoice.status.toLowerCase()}`}>{invoice.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function BillingPage() {
  return (
    <main>
      <p className="muted">Settings</p>
      <h1>Billing</h1>
      <div className="grid">
        <PlanCard />
        <UsageCard />
        <InvoiceTable />
      </div>
    </main>
  );
}

function SettingsLayout() {
  return (
    <div className="layout">
      <aside>
        <b>Tallybook</b>
        <nav>
          <span>Overview</span>
          <span>Invoices</span>
          <span>Customers</span>
          <span className="on">Settings</span>
        </nav>
      </aside>
      <BillingPage />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<SettingsLayout />);
