"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { GroupDTO } from "@/lib/groups";
import {
  addGroupMember,
  claimGroupMember,
  createGroupBill,
  createQuickExpense,
  deletePayment,
  joinGroup,
  recordPayment,
  setSimplifyDebts,
} from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { Avatar, AvatarStack, personColor } from "@/components/Avatar";

type Group = GroupDTO;
type Member = Group["members"][number];

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };
  return { pending, error, run };
}

function ErrorNote({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-danger">{error}</p> : null;
}

function useMembers(group: Group) {
  const byId = new Map(group.members.map((m) => [m.id, m]));
  const me = group.viewer.memberId;
  const label = (id: string) => (id === me ? "You" : (byId.get(id)?.displayName ?? "Someone"));
  return { byId, me, label };
}

function Pill({ member, label }: { member?: Member; label: string }) {
  return (
    <span
      className={`inline-flex max-w-32 items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${
        member ? personColor(member.color) : "bg-surface-2"
      }`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function balanceText(cents: number, you: boolean) {
  if (cents > 0) return `${you ? "You're owed" : "Owed"} ${formatMoney(cents)}`;
  if (cents < 0) return `${you ? "You owe" : "Owes"} ${formatMoney(-cents)}`;
  return you ? "You're all settled up" : "Settled up";
}

// ---------- Join ----------

export function GroupJoinGate({ group }: { group: Group }) {
  const { pending, error, run } = useAction();
  const placeholders = group.members.filter((m) => m.isPlaceholder);
  return (
    <div className="card space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted">Shared expenses group</p>
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        <AvatarStack people={group.members} />
      </div>
      <p className="text-sm">Join to add bills, see balances and settle up. No account needed.</p>
      {placeholders.length > 0 && (
        <div>
          <span className="label">Are you one of these people?</span>
          <div className="grid gap-2">
            {placeholders.map((m) => (
              <button
                key={m.id}
                disabled={pending}
                onClick={() => run(() => claimGroupMember(group.shareToken, m.id))}
                className="btn btn-secondary justify-start"
              >
                <Avatar name={m.displayName} color={m.color} size="sm" />
                I&apos;m {m.displayName}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => joinGroup(group.shareToken, fd));
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="label">{placeholders.length ? "Or join with your name" : "Your name"}</span>
          <input name="name" required maxLength={60} placeholder="Your name" className="input" />
        </label>
        <button disabled={pending} className="btn btn-primary w-full">
          Join group
        </button>
      </form>
      <ErrorNote error={error} />
    </div>
  );
}

// ---------- Header ----------

export function GroupHeader({ group }: { group: Group }) {
  const mine = group.members.find((m) => m.id === group.viewer.memberId);
  const cents = mine?.balanceCents ?? 0;
  return (
    <div className="card space-y-5">
      <div>
        <p className="text-sm text-muted">Group</p>
        <h1 className="break-words text-2xl font-semibold">{group.name}</h1>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{cents > 0 ? "You're owed" : cents < 0 ? "You owe" : "Your balance"}</div>
          <div className={`money text-3xl font-semibold tracking-tight ${cents > 0 ? "text-accent" : ""}`}>
            {cents === 0 ? "Settled up" : formatMoney(Math.abs(cents))}
          </div>
        </div>
        <AvatarStack people={group.members} />
      </div>
    </div>
  );
}

// ---------- Settle up ----------

export function SettleUp({ group }: { group: Group }) {
  const { byId, label } = useMembers(group);
  const [custom, setCustom] = useState(false);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="section-title">Settle up</h2>
        <p className="text-sm text-muted">
          {group.simplifyDebts
            ? "Simplified to the fewest payments. You can change this in Settings."
            : "Everyone pays back the people they shared bills with. You can simplify this in Settings."}
        </p>
      </div>
      {group.transfers.length === 0 ? (
        <div className="card text-center text-sm text-muted">Everyone&apos;s settled up.</div>
      ) : (
        <ul className="card divide-y divide-line !p-0 overflow-hidden">
          {group.transfers.map((t) => (
            <TransferRow
              key={`${t.fromMemberId}-${t.toMemberId}`}
              group={group}
              from={byId.get(t.fromMemberId)}
              to={byId.get(t.toMemberId)}
              fromLabel={label(t.fromMemberId)}
              toLabel={label(t.toMemberId)}
              amountCents={t.amountCents}
            />
          ))}
        </ul>
      )}
      {custom ? (
        <CustomPayment group={group} onDone={() => setCustom(false)} />
      ) : (
        <button onClick={() => setCustom(true)} className="btn-quiet text-sm font-medium">
          Record a different payment
        </button>
      )}
    </section>
  );
}

function TransferRow({
  group,
  from,
  to,
  fromLabel,
  toLabel,
  amountCents,
}: {
  group: Group;
  from?: Member;
  to?: Member;
  fromLabel: string;
  toLabel: string;
  amountCents: number;
}) {
  const { pending, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2));
  const record = (value: string) =>
    run(() => recordPayment(group.shareToken, { fromMemberId: from!.id, toMemberId: to!.id, amount: value }), () =>
      setEditing(false),
    );
  return (
    <li className="space-y-2 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Pill member={from} label={fromLabel} />
        <span className="text-muted" aria-label="pays">
          →
        </span>
        <Pill member={to} label={toLabel} />
        <span className="money ml-auto font-semibold">{formatMoney(amountCents)}</span>
      </div>
      {editing ? (
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="Amount paid"
            className="input money !py-1.5"
          />
          <button disabled={pending} onClick={() => record(amount)} className="btn btn-primary shrink-0 !py-1.5">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="btn btn-secondary shrink-0 !py-1.5">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-3 text-sm">
          <button disabled={pending} onClick={() => record(amount)} className="font-medium text-accent">
            {pending ? "Recording…" : "Record payment"}
          </button>
          <button onClick={() => setEditing(true)} className="btn-quiet">
            Paid part of it?
          </button>
        </div>
      )}
      <ErrorNote error={error} />
    </li>
  );
}

function CustomPayment({ group, onDone }: { group: Group; onDone: () => void }) {
  const { pending, error, run } = useAction();
  const me = group.viewer.memberId ?? group.members[0]?.id ?? "";
  const [from, setFrom] = useState(me);
  const [to, setTo] = useState(group.members.find((m) => m.id !== me)?.id ?? "");
  const [amount, setAmount] = useState("");
  return (
    <div className="card space-y-3">
      <h3 className="font-medium">Record a payment</h3>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">From</span>
          <MemberSelect group={group} value={from} onChange={setFrom} />
        </label>
        <label>
          <span className="label">To</span>
          <MemberSelect group={group} value={to} onChange={setTo} />
        </label>
      </div>
      <label className="block">
        <span className="label">Amount</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="input money" />
      </label>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <button onClick={onDone} className="btn btn-secondary flex-1">
          Cancel
        </button>
        <button
          disabled={pending || !amount || from === to}
          onClick={() => run(() => recordPayment(group.shareToken, { fromMemberId: from, toMemberId: to, amount }), onDone)}
          className="btn btn-primary flex-1"
        >
          Record
        </button>
      </div>
    </div>
  );
}

function MemberSelect({ group, value, onChange }: { group: Group; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {group.members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.id === group.viewer.memberId ? `${m.displayName} (you)` : m.displayName}
        </option>
      ))}
    </select>
  );
}

// ---------- Add expenses ----------

export function GroupAddExpense({ group }: { group: Group }) {
  const [mode, setMode] = useState<"quick" | "itemized">("quick");
  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">Add an expense</h2>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
          {(
            [
              ["quick", "Quick"],
              ["itemized", "Itemized"],
            ] as const
          ).map(([m, text]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-lg px-3 py-1 transition-colors ${mode === m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {mode === "quick" ? <QuickExpenseForm group={group} /> : <ItemizedBillForm group={group} />}
    </section>
  );
}

function QuickExpenseForm({ group }: { group: Group }) {
  const { pending, error, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  const [paidBy, setPaidBy] = useState(group.viewer.memberId ?? "");
  // Track who's unticked (not who's ticked) so people added to the group later are included by default.
  const [excluded, setExcluded] = useState<string[]>([]);
  const split = group.members.map((m) => m.id).filter((id) => !excluded.includes(id));
  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => createQuickExpense(group.shareToken, fd), () => {
          form.current?.reset();
          setExcluded([]);
        });
      }}
      className="space-y-3"
    >
      <p className="text-sm text-muted">No receipt? Enter a total and split it evenly.</p>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label>
          <span className="label">What for</span>
          <input name="title" required maxLength={60} placeholder="Uber to the cabin" className="input" />
        </label>
        <label>
          <span className="label">Amount</span>
          <input name="amount" required inputMode="decimal" placeholder="0.00" className="input money" />
        </label>
      </div>
      <label className="block">
        <span className="label">Paid by</span>
        <input type="hidden" name="paidBy" value={paidBy} />
        <MemberSelect group={group} value={paidBy} onChange={setPaidBy} />
      </label>
      <div>
        <span className="label">Split evenly between</span>
        <div className="flex flex-wrap gap-2 p-1">
          {group.members.map((m) => {
            const on = split.includes(m.id);
            return (
              <label
                key={m.id}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition ${personColor(m.color)} ${
                  on ? "ring-2 ring-current ring-offset-2 ring-offset-surface" : "opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="split"
                  value={m.id}
                  checked={on}
                  onChange={() => setExcluded(on ? [...excluded, m.id] : excluded.filter((x) => x !== m.id))}
                  className="sr-only"
                />
                {on && <span aria-hidden>✓</span>}
                {m.id === group.viewer.memberId ? "Me" : m.displayName}
              </label>
            );
          })}
        </div>
      </div>
      <button disabled={pending || split.length === 0} className="btn btn-primary w-full">
        Add expense
      </button>
      <ErrorNote error={error} />
    </form>
  );
}

function ItemizedBillForm({ group }: { group: Group }) {
  const { pending, error, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => createGroupBill(group.shareToken, fd));
      }}
      className="space-y-3"
    >
      <p className="text-sm text-muted">
        A full receipt with items, tax and tip. Everyone in the group is added, and you&apos;re set as the payer (you can
        change that).
      </p>
      <label className="block">
        <span className="label">Name</span>
        <input name="title" required maxLength={60} placeholder="Dinner on Friday" className="input" />
      </label>
      <label className="block">
        <span className="label">Restaurant or store (optional)</span>
        <input name="merchant" maxLength={80} placeholder="Joe's Diner" className="input" />
      </label>
      <button disabled={pending} className="btn btn-primary w-full">
        {pending ? "Creating…" : "Create bill"}
      </button>
      <ErrorNote error={error} />
    </form>
  );
}

// ---------- Activity ----------

export function GroupActivity({ group }: { group: Group }) {
  const { byId, label } = useMembers(group);
  const { pending, error, run } = useAction();
  if (group.activity.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="section-title">Activity</h2>
        <div className="card text-center text-sm text-muted">No expenses yet. Add the first one above.</div>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="section-title">Activity</h2>
      <ErrorNote error={error} />
      <ul className="card divide-y divide-line !p-0 overflow-hidden">
        {group.activity.map((a) =>
          a.kind === "bill" ? (
            <li key={a.id}>
              <Link href={`/b/${a.shareToken}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.title}</div>
                  <div className="text-xs text-muted">
                    {new Date(a.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
                    {a.payerMemberId ? `${label(a.payerMemberId)} paid` : "No payer"}
                  </div>
                </div>
                <div className="money shrink-0 text-right">
                  <div className="font-semibold">{formatMoney(a.totalCents)}</div>
                  {a.yourShareCents !== null && (
                    <div className="text-xs text-muted">
                      {a.payerMemberId === group.viewer.memberId
                        ? "you paid"
                        : a.yourShareCents > 0
                          ? `your share ${formatMoney(a.yourShareCents)}`
                          : "not involved"}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ) : (
            <li key={a.id} className="flex items-center gap-2 px-4 py-3.5">
              <Pill member={byId.get(a.fromMemberId)} label={label(a.fromMemberId)} />
              <span className="text-sm text-muted">paid</span>
              <Pill member={byId.get(a.toMemberId)} label={label(a.toMemberId)} />
              <span className="money ml-auto font-semibold">{formatMoney(a.amountCents)}</span>
              <button disabled={pending} onClick={() => run(() => deletePayment(a.id))} className="btn-quiet text-xs">
                Undo
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

// ---------- Members, sharing, settings ----------

export function GroupMembers({ group }: { group: Group }) {
  const { pending, error, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title">Members</h2>
        <p className="text-sm text-muted">Anyone in the group can add bills and record payments.</p>
      </div>
      <ul className="divide-y divide-line">
        {group.members.map((m) => {
          const you = m.id === group.viewer.memberId;
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.displayName} color={m.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.displayName}
                  {you && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="text-xs text-muted">{m.isPlaceholder ? "Hasn't joined yet" : "Joined"}</span>
              </span>
              <span className={`money text-sm ${m.balanceCents > 0 ? "text-accent" : m.balanceCents < 0 ? "text-fg" : "text-muted"}`}>
                {balanceText(m.balanceCents, false)}
              </span>
            </li>
          );
        })}
      </ul>
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => addGroupMember(group.shareToken, fd), () => form.current?.reset());
        }}
        className="flex gap-2"
      >
        <input name="name" required maxLength={60} placeholder="Name" aria-label="New member's name" className="input" />
        <button disabled={pending} className="btn btn-secondary shrink-0">
          Add member
        </button>
      </form>
      <ErrorNote error={error} />
    </section>
  );
}

export function GroupShareCard({ group }: { group: Group }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/g/${group.shareToken}`;
  return (
    <div className="card space-y-3">
      <div>
        <h2 className="section-title">Invite people</h2>
        <p className="text-sm text-muted">Anyone with this link can join the group. No account needed.</p>
      </div>
      <div className="flex gap-2">
        <input readOnly value={url} aria-label="Group link" className="input money min-w-0 flex-1 bg-surface-2 text-sm" onFocus={(e) => e.target.select()} />
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="btn btn-secondary shrink-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function GroupSettings({ group }: { group: Group }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Flip the switch immediately; the server confirms in the background.
  const [simplify, setSimplify] = useOptimistic(group.simplifyDebts);
  const toggle = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      setSimplify(next);
      try {
        await setSimplifyDebts(group.shareToken, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };
  return (
    <section className="card space-y-3">
      <h2 className="section-title">Settings</h2>
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Simplify debts</span>
          <span className="block text-xs text-muted">
            Settle in the fewest payments, even if that means paying someone you didn&apos;t share a bill with. Turn off
            to pay back people directly.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={simplify}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-1 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-accent checked:before:translate-x-[18px]"
        />
      </label>
      <ErrorNote error={error} />
    </section>
  );
}
